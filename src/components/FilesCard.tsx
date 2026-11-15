import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { ExternalLink, FileText, FolderSearch, Link2, Loader2, Paperclip, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/NativeSelect'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card } from '@/components/pm/ui'
import { useCurrentUser, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { MAX_UPLOAD_BYTES, listFiles, uploadFile, type DriveFile } from '@/lib/sharepoint'
import { fmtSize, safeUrl } from '@/lib/files'
import { friendlyMsError } from '@/lib/microsoft'
import { fmtDate, today } from '@/lib/constants'
import type { FileCategory, FileRef } from '@/types'

export const FILE_CATEGORIES: { value: FileCategory; label: string }[] = [
  { value: 'nda', label: 'NDA' },
  { value: 'agreement', label: 'Agreement' },
  { value: 'sow', label: 'SOW' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'tax', label: 'Tax document' },
  { value: 'other', label: 'Other' },
]
const label = (c: string) => FILE_CATEGORIES.find((x) => x.value === c)?.label ?? c

interface Props {
  title?: string
  files: FileRef[]
  onChange: (files: FileRef[]) => void
  /** Categories offered in the picker. */
  categories: FileCategory[]
  /** Folder path under the SharePoint root, e.g. ['Project X', 'Contracts']. */
  folder: string[]
  canEdit: boolean
  hint?: string
  bare?: boolean // no Card wrapper (used inside dialogs)
}

/** Documents for a project / invoice / bill: upload to SharePoint (or OneDrive), attach one already there, or paste any link. */
export function FilesCard({ title = 'Files', files, onChange, categories, folder, canEdit, hint, bare }: Props) {
  const ms = useMicrosoft()
  const msConfig = useStore((s) => s.msConfig)
  const { user } = useCurrentUser()
  const input = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<FileCategory>(categories[0] ?? 'other')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState({ name: '', url: '' })
  const [picking, setPicking] = useState<DriveFile[] | null>(null)

  const add = (list: Omit<FileRef, 'id' | 'addedAt' | 'addedBy' | 'category'>[], cat = category) =>
    onChange([...files, ...list.map((f) => ({ ...f, id: nanoid(6), category: cat, addedAt: new Date().toISOString(), addedBy: user.name }))])

  const upload = async (picked: File[]) => {
    setError('')
    const done: Omit<FileRef, 'id' | 'addedAt' | 'addedBy' | 'category'>[] = []
    try {
      for (const f of picked) {
        setBusy(`Uploading ${f.name}…`)
        const r = await uploadFile(msConfig, f, folder, (pct) => setBusy(`Uploading ${f.name} ${pct}%`))
        done.push({ name: r.name, url: r.url, size: r.size, source: 'sharepoint' })
      }
    } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))) }
    if (done.length) add(done) // keep what did upload even if a later file failed
    setBusy('')
  }

  const browse = async () => {
    setError(''); setBusy('Looking in SharePoint…')
    try { setPicking(await listFiles(msConfig, folder)) } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))) }
    setBusy('')
  }

  const addLink = () => {
    const url = safeUrl(link.url)
    if (!url) { setError('That does not look like a web link. Paste the full address, e.g. https://…'); return }
    add([{ name: link.name.trim() || new URL(url).pathname.split('/').filter(Boolean).pop() || url, url, source: /sharepoint\.com|onedrive\.live\.com|1drv\.ms/i.test(url) ? 'sharepoint' : 'link' }])
    setLink({ name: '', url: '' }); setLinking(false); setError('')
  }

  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null
  const body = (
    <div className="space-y-3">
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {categories.length > 1 && <NativeSelect className="w-40" value={category} onChange={(v) => setCategory(v as FileCategory)} options={categories.map((c) => ({ value: c, label: label(c) }))} />}
          <input ref={input} type="file" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void upload(f) }} />
          <Button size="sm" disabled={!!blocked || !!busy} onClick={() => input.current?.click()}>{busy.startsWith('Uploading') ? <Loader2 className="animate-spin" /> : <Upload />} Upload to SharePoint</Button>
          <Button size="sm" variant="outline" disabled={!!blocked || !!busy} onClick={() => void browse()}><FolderSearch /> Pick from SharePoint</Button>
          <Button size="sm" variant="outline" onClick={() => setLinking((v) => !v)}><Link2 /> Add link</Button>
          {busy && <span aria-live="polite" className="text-xs text-muted-foreground">{busy}</span>}
        </div>
      )}
      {canEdit && blocked && (
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>{blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect Microsoft to upload to SharePoint.'}{' '}
            {blocked === 'signin' ? <button className="font-medium underline" onClick={ms.connect}>Connect now</button> : <Link to="/pm/settings" className="font-medium underline">Open settings</Link>}
            {' '}You can still add links.</span>
        </div>
      )}
      {linking && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-2">
          <Input className="h-8 w-44" placeholder="Name (optional)" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} />
          <Input className="h-8 min-w-56 flex-1" placeholder="https://contoso.sharepoint.com/…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
          <Button size="sm" disabled={!link.url.trim()} onClick={addLink}>Add</Button>
        </div>
      )}
      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

      {files.length === 0 ? <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No files yet.</div> : (
        <ul className="divide-y rounded-lg border">
          {files.map((f) => {
            const href = safeUrl(f.url)
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate font-medium hover:underline">{f.name}<ExternalLink className="size-3 shrink-0 text-muted-foreground" /></a> : <span className="font-medium">{f.name}</span>}
                  <div className="text-xs text-muted-foreground">{[f.source === 'sharepoint' ? 'SharePoint' : 'Link', f.size ? fmtSize(f.size) : '', `${f.addedBy || 'someone'} · ${fmtDate(f.addedAt.slice(0, 10) || today())}`].filter(Boolean).join(' · ')}</div>
                </div>
                {categories.length > 1 && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{label(f.category)}</span>}
                {canEdit && <Button variant="ghost" size="icon-xs" title="Remove from the list (the file stays in SharePoint)" onClick={() => onChange(files.filter((x) => x.id !== f.id))}><Trash2 className="text-destructive" /></Button>}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">Only the name and link are saved in HireFlow. Access follows SharePoint’s own permissions. Uploads up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB.</p>

      <Dialog open={!!picking} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Pick from SharePoint</DialogTitle><DialogDescription>Files in <code className="rounded bg-muted px-1">{[msConfig.sharepoint?.folder || 'HireFlow', ...folder].join(' / ')}</code></DialogDescription></DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {picking?.length === 0 && <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Nothing in that folder yet. Upload a file first, or add a link.</div>}
            {picking?.map((d) => {
              const used = files.some((f) => f.url === d.url)
              return (
                <div key={d.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm">
                  <Paperclip className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{fmtSize(d.size)}</span>
                  <Button size="xs" variant="outline" disabled={used} onClick={() => add([{ name: d.name, url: d.url, size: d.size, source: 'sharepoint' }])}>{used ? 'Added' : 'Attach'}</Button>
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
  return bare ? body : <Card title={<span className="flex items-center gap-2"><Paperclip className="size-4" /> {title}{files.length > 0 && <span className="font-normal text-muted-foreground">({files.length})</span>}</span>}>{body}</Card>
}
