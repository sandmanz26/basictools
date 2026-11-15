import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ACCEPT, MAX_ATTACH_BYTES, SHAREPOINT_HINT, totalSize, validateFiles } from '@/lib/attachments'
import { fmtSize } from '@/lib/files'
import { cn } from '@/lib/utils'

export interface PickerItem { id: string; name: string; size: number }

/**
 * Controlled attachment list. The parent decides where the bytes go (memory or IndexedDB):
 * it receives only files that passed the type and 3 MB checks, and removes by id.
 */
export function AttachmentPicker({ items, onAdd, onRemove, disabled, className }: {
  items: PickerItem[]
  onAdd: (files: File[]) => void | Promise<void>
  onRemove: (id: string) => void
  disabled?: boolean
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const used = totalSize(items)

  const pick = async (list: FileList | null) => {
    const files = list ? [...list] : []
    if (ref.current) ref.current.value = '' // allow picking the same file again
    if (!files.length) return
    const { ok, errors: errs } = validateFiles(files, used)
    setErrors(errs)
    if (ok.length) {
      try { await onAdd(ok) } catch { setErrors((e) => [...e, 'Could not store the file in this browser. Try a smaller file.']) }
    }
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={ref} type="file" aria-label="Attach files" tabIndex={-1} multiple accept={ACCEPT} className="sr-only" disabled={disabled} onChange={(e) => void pick(e.target.files)} />
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}><Paperclip /> Attach files</Button>
        <span className={cn('text-xs tabular-nums', used > MAX_ATTACH_BYTES * 0.9 ? 'font-medium text-amber-700' : 'text-muted-foreground')}>{fmtSize(used)} of {fmtSize(MAX_ATTACH_BYTES)} used</span>
      </div>
      {items.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-2.5 py-1 text-sm">
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{fmtSize(a.size)}</span>
              <Button type="button" variant="ghost" size="icon-xs" disabled={disabled} aria-label={`Remove ${a.name}`} onClick={() => { setErrors([]); onRemove(a.id) }}><X /></Button>
            </li>
          ))}
        </ul>
      )}
      <div aria-live="polite" role="status">
        {errors.map((e) => <p key={e} className="text-xs text-red-600">{e}</p>)}
      </div>
      <p className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint, PNG, JPG, ZIP, TXT or CSV. {SHAREPOINT_HINT}</p>
    </div>
  )
}
