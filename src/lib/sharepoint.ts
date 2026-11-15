import type { MsConfig } from '@/types'
import { MS_FILES_SCOPES, friendlyMsError, token } from '@/lib/microsoft'

const G = 'https://graph.microsoft.com/v1.0'
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const SIMPLE_LIMIT = 4 * 1024 * 1024 // Graph's single-request upload limit
const CHUNK = 320 * 1024 * 10 // upload-session chunks must be a multiple of 320 KiB

export interface DriveFile { id: string; name: string; url: string; size: number; isFolder: boolean }

/** Strip characters SharePoint does not allow in a file or folder name. */
export const cleanName = (n: string) => n.replace(/[\\/:*?"<>|#%~&{}]+/g, '-').replace(/\s+/g, ' ').replace(/^\.+|[. ]+$/g, '').trim().slice(0, 120)
const pathOf = (cfg: MsConfig, sub: string[]) => [cfg.sharepoint?.folder || 'HireFlow', ...sub].map(cleanName).filter(Boolean).map(encodeURIComponent).join('/')

async function call(cfg: MsConfig, url: string, init: RequestInit = {}): Promise<Response> {
  const t = await token(cfg, MS_FILES_SCOPES)
  const res = await fetch(url.startsWith('http') ? url : G + url, { ...init, headers: { Authorization: `Bearer ${t}`, ...(init.headers as Record<string, string> | undefined) } })
  return res
}
async function fail(res: Response): Promise<never> {
  let msg = ''
  try { msg = (await res.json()).error?.message ?? '' } catch { /* ignore */ }
  throw new Error(friendlyMsError(`${res.status} ${msg}`))
}

const siteIds = new Map<string, string>()
/** `/me/drive` for the user's OneDrive, or `/sites/{id}/drive` for the configured SharePoint site. */
export async function driveBase(cfg: MsConfig): Promise<string> {
  const raw = cfg.sharepoint?.siteUrl?.trim()
  if (!raw) return '/me/drive'
  let u: URL
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw) } catch { throw new Error('The SharePoint site address is not a valid URL. Example: https://contoso.sharepoint.com/sites/Projects') }
  if (!/\.sharepoint\.com$/i.test(u.hostname)) throw new Error('The site address must be on sharepoint.com, for example https://contoso.sharepoint.com/sites/Projects')
  const key = u.hostname + u.pathname
  let id = siteIds.get(key)
  if (!id) {
    const path = u.pathname.replace(/\/+$/, '')
    const res = await call(cfg, `/sites/${u.hostname}:${path || '/'}?$select=id`)
    if (!res.ok) return fail(res)
    id = ((await res.json()) as { id: string }).id
    siteIds.set(key, id)
  }
  return `/sites/${id}/drive`
}

/** Check the site/folder can be reached and say where files will go. */
export async function testSharePoint(cfg: MsConfig): Promise<string> {
  const base = await driveBase(cfg)
  const res = await call(cfg, `${base}?$select=name,webUrl`)
  if (!res.ok) return fail(res)
  const d = (await res.json()) as { name?: string; webUrl?: string }
  return `${base === '/me/drive' ? 'OneDrive' : 'SharePoint library'} “${d.name ?? 'Documents'}”, folder “${cfg.sharepoint?.folder || 'HireFlow'}”`
}

/** Upload one file under <root folder>/<subfolders>/. Same-name files are kept (renamed), never overwritten. */
export async function uploadFile(cfg: MsConfig, file: File, sub: string[], onProgress?: (pct: number) => void): Promise<DriveFile> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`${file.name} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. Upload it in SharePoint directly and add the link instead.`)
  const base = await driveBase(cfg)
  const target = `${base}/root:/${pathOf(cfg, sub)}/${encodeURIComponent(cleanName(file.name) || 'file')}:`
  const conflict = '@microsoft.graph.conflictBehavior=rename'
  let item: { id: string; name: string; webUrl: string; size: number }
  if (file.size <= SIMPLE_LIMIT) {
    const res = await call(cfg, `${target}/content?${conflict}`, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
    if (!res.ok) return fail(res)
    item = await res.json()
  } else {
    const s = await call(cfg, `${target}/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) })
    if (!s.ok) return fail(s)
    const { uploadUrl } = (await s.json()) as { uploadUrl: string }
    let last: Response | null = null
    for (let start = 0; start < file.size; start += CHUNK) {
      const end = Math.min(start + CHUNK, file.size)
      // The upload URL is pre-authorised: sending the Graph token to it would be rejected.
      last = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end - 1}/${file.size}` }, body: file.slice(start, end) })
      if (!last.ok && last.status !== 202) return fail(last)
      onProgress?.(Math.round((end / file.size) * 100))
    }
    if (!last || !last.ok) throw new Error('The upload did not finish. Try again.')
    item = await last.json()
  }
  return { id: item.id, name: item.name, url: item.webUrl, size: item.size, isFolder: false }
}

/** Files already in a project's folder, so they can be attached without uploading again. */
export async function listFiles(cfg: MsConfig, sub: string[]): Promise<DriveFile[]> {
  const base = await driveBase(cfg)
  const res = await call(cfg, `${base}/root:/${pathOf(cfg, sub)}:/children?$select=id,name,webUrl,size,folder&$top=100`)
  if (res.status === 404) return []
  if (!res.ok) return fail(res)
  const data = (await res.json()) as { value: { id: string; name: string; webUrl: string; size?: number; folder?: unknown }[] }
  return data.value.map((x) => ({ id: x.id, name: x.name, url: x.webUrl, size: x.size ?? 0, isFolder: !!x.folder })).filter((x) => !x.isFolder)
}
