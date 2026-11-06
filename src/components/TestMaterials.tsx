import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { Download, ExternalLink, FileText, Link2, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/store'
import { MAX_PDF_BYTES, deleteFile, fmtSize, getFile, putFile, safeUrl } from '@/lib/files'
import { today } from '@/lib/constants'
import type { Position } from '@/types'

/** PDF test papers (bytes in IndexedDB) and external form links for one position. */
export function TestMaterials({ pos, canEdit }: { pos: Position; canEdit: boolean }) {
  const updatePosition = useStore((s) => s.updatePosition)
  const files = pos.testFiles ?? []
  const links = pos.formLinks ?? []
  const [err, setErr] = useState('')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [linkErr, setLinkErr] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const upload = async (list: FileList | null) => {
    setErr('')
    const added = []
    for (const f of Array.from(list ?? [])) {
      const head = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer())
      if (!head.startsWith('%PDF')) { setErr(`“${f.name}” is not a PDF.`); continue }
      if (f.size > MAX_PDF_BYTES) { setErr(`“${f.name}” is larger than ${fmtSize(MAX_PDF_BYTES)}.`); continue }
      const id = nanoid(8)
      try { await putFile(id, f) } catch { setErr('Could not save the file in this browser (storage may be full or blocked).'); continue }
      added.push({ id, name: f.name, size: f.size, uploadedAt: today() })
    }
    if (added.length) updatePosition(pos.id, { testFiles: [...files, ...added] })
  }
  const open = async (id: string, name: string, download: boolean) => {
    const blob = await getFile(id)
    if (!blob) return setErr('This file is no longer in this browser (it is stored per device). Upload it again.')
    const href = URL.createObjectURL(blob)
    if (download) { const a = document.createElement('a'); a.href = href; a.download = name; a.click() } else window.open(href, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
  }
  const remove = async (id: string, name: string) => {
    if (!confirm(`Remove “${name}”?`)) return
    await deleteFile(id).catch(() => {})
    updatePosition(pos.id, { testFiles: files.filter((f) => f.id !== id) })
  }
  const addLink = () => {
    const safe = safeUrl(url)
    if (!safe) return setLinkErr('Enter a valid http(s) link.')
    setLinkErr('')
    updatePosition(pos.id, { formLinks: [...links, { id: nanoid(6), label: label.trim() || new URL(safe).hostname, url: safe }] })
    setLabel(''); setUrl('')
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Test papers (PDF)</h3>
          {canEdit && (
            <>
              <input ref={ref} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => ref.current?.click()}><Upload /> Upload PDF</Button>
            </>
          )}
        </div>
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-xs text-muted-foreground">{fmtSize(f.size)} · {f.uploadedAt}</span>
            <Button variant="ghost" size="icon-xs" title="Open" onClick={() => void open(f.id, f.name, false)}><ExternalLink /></Button>
            <Button variant="ghost" size="icon-xs" title="Download" onClick={() => void open(f.id, f.name, true)}><Download /></Button>
            {canEdit && <Button variant="ghost" size="icon-xs" title="Remove" onClick={() => void remove(f.id, f.name)}><Trash2 className="text-destructive" /></Button>}
          </div>
        ))}
        {files.length === 0 && <div className="text-sm text-muted-foreground">No PDF uploaded. Up to {fmtSize(MAX_PDF_BYTES)} each.</div>}
        {err && <div className="text-sm text-red-600">{err}</div>}
        <p className="text-xs text-muted-foreground">Files are stored in this browser only (no server yet), so they won’t appear on other devices.</p>
      </section>

      <section className="space-y-2 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">Form links</h3>
        <p className="text-xs text-muted-foreground">Use these when you collect candidate data or test answers in another form (Microsoft Forms, Google Forms, Typeform…).</p>
        {links.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{l.label}</span>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-muted-foreground underline">{l.url}</a>
            <Button variant="ghost" size="xs" onClick={() => void navigator.clipboard?.writeText(l.url)}>Copy</Button>
            {canEdit && <Button variant="ghost" size="icon-xs" title="Remove" onClick={() => updatePosition(pos.id, { formLinks: links.filter((x) => x.id !== l.id) })}><Trash2 className="text-destructive" /></Button>}
          </div>
        ))}
        {links.length === 0 && <div className="text-sm text-muted-foreground">No links yet.</div>}
        {canEdit && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Input className="h-8 w-44" placeholder="Label, e.g. Candidate form" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input className="h-8 min-w-56 flex-1" placeholder="https://forms.office.com/…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
            <Button size="sm" disabled={!url.trim()} onClick={addLink}><Plus /> Add link</Button>
          </div>
        )}
        {linkErr && <div className="text-sm text-red-600">{linkErr}</div>}
      </section>
    </div>
  )
}
