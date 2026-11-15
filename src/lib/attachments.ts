import { nanoid } from 'nanoid'
import { getFile, putFile, deleteFile, fmtSize } from '@/lib/files'
import type { MailAttachment } from '@/lib/microsoft'
import type { AttachmentMeta } from '@/types'

/** Graph's sendMail takes ~4 MB of JSON and base64 adds a third, so keep the raw files under 3 MB per email. */
export const MAX_ATTACH_BYTES = 3 * 1024 * 1024
export const ALLOWED_EXT = ['pdf', 'docx', 'xlsx', 'pptx', 'png', 'jpg', 'jpeg', 'zip', 'txt', 'csv']
export const BLOCKED_EXT = ['exe', 'bat', 'js', 'vbs', 'scr', 'cmd', 'msi', 'com', 'ps1', 'jar', 'lnk', 'dll', 'hta', 'wsf']
export const ACCEPT = ALLOWED_EXT.map((e) => '.' + e).join(',')
export const SHAREPOINT_HINT = 'For larger files, upload to SharePoint or OneDrive and paste the link into the message instead.'

const MIME_OK = /^(application\/(pdf|zip|x-zip-compressed|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|csv)|image\/(png|jpeg)|text\/(plain|csv))$/

export const extOf = (name: string) => { const i = name.lastIndexOf('.'); return i < 0 ? '' : name.slice(i + 1).toLowerCase() }
export const totalSize = (items: { size: number }[]) => items.reduce((s, x) => s + x.size, 0)

/** Why this file may not be attached, or '' when it is fine. `used` is the bytes already attached. */
export function checkAttachment(file: { name: string; size: number; type: string }, used: number): string {
  const ext = extOf(file.name)
  if (BLOCKED_EXT.includes(ext)) return `“${file.name}” is a program file type (.${ext}) and can’t be attached.`
  if (!ALLOWED_EXT.includes(ext)) return `“${file.name}” can’t be attached. Allowed: PDF, Word, Excel, PowerPoint, PNG, JPG, ZIP, TXT, CSV.`
  // Browsers report '' or generic types for some files; only reject a MIME that is clearly something else.
  if (file.type && file.type !== 'application/octet-stream' && !MIME_OK.test(file.type)) return `“${file.name}” looks like a different kind of file than its name says.`
  if (file.size <= 0) return `“${file.name}” is empty.`
  if (used + file.size > MAX_ATTACH_BYTES) return `“${file.name}” (${fmtSize(file.size)}) would take the attachments over ${fmtSize(MAX_ATTACH_BYTES)}. ${SHAREPOINT_HINT}`
  return ''
}

/** Split picked files into accepted ones and error messages, counting each accepted file toward the limit. */
export function validateFiles(files: File[], used: number): { ok: File[]; errors: string[] } {
  const ok: File[] = [], errors: string[] = []
  let total = used
  for (const f of files) {
    const err = checkAttachment(f, total)
    if (err) errors.push(err); else { ok.push(f); total += f.size }
  }
  return { ok, errors }
}

export const attachKey = (id: string) => `att-${id}`

/** Store the bytes in IndexedDB and return the small metadata that may live in localStorage. */
export async function saveAttachments(files: File[]): Promise<AttachmentMeta[]> {
  const metas: AttachmentMeta[] = []
  try {
    for (const f of files) {
      const meta: AttachmentMeta = { id: nanoid(8), name: f.name, size: f.size, type: f.type || 'application/octet-stream' }
      await putFile(attachKey(meta.id), f)
      metas.push(meta)
    }
  } catch (e) {
    await Promise.all(metas.map(removeAttachment)) // don't leave half a set behind
    throw e
  }
  return metas
}

export async function removeAttachment(meta: AttachmentMeta): Promise<void> {
  try { await deleteFile(attachKey(meta.id)) } catch { /* nothing to clean */ }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(r.error)
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.readAsDataURL(blob)
  })
}

export async function filesToMail(files: File[]): Promise<MailAttachment[]> {
  return Promise.all(files.map(async (f) => ({ name: f.name, contentType: f.type || 'application/octet-stream', base64: await blobToBase64(f) })))
}

export class MissingAttachmentError extends Error {}

/** Read stored files back as mail attachments. Throws MissingAttachmentError naming the first file that is gone. */
export async function loadAttachments(metas: AttachmentMeta[] = []): Promise<MailAttachment[]> {
  const out: MailAttachment[] = []
  for (const m of metas) {
    let blob: Blob | undefined
    try { blob = await getFile(attachKey(m.id)) } catch { blob = undefined }
    if (!blob) throw new MissingAttachmentError(`Attachment “${m.name}” is no longer stored in this browser`)
    out.push({ name: m.name, contentType: m.type || 'application/octet-stream', base64: await blobToBase64(blob) })
  }
  return out
}
