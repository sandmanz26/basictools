import { useState } from 'react'
import { nanoid } from 'nanoid'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { useStore } from '@/store'
import { DEFAULT_LEAD_COLUMNS, LEAD_BUILTIN_COLUMNS } from '@/lib/constants'
import type { FieldDef } from '@/types'

const TYPES = [{ value: 'text', label: 'Text' }, { value: 'number', label: 'Number' }, { value: 'date', label: 'Date' }, { value: 'select', label: 'Dropdown' }]

/** Choose which lead columns the list shows, in what order, and define your own fields. */
export function ColumnManager({ open, onOpenChange, canEdit }: { open: boolean; onOpenChange: (o: boolean) => void; canEdit: boolean }) {
  const { mktColumns, mktFields, setMktColumns, setMktFields, leads } = useStore()
  const [label, setLabel] = useState('')
  const [type, setType] = useState<FieldDef['type']>('text')

  const all = [...LEAD_BUILTIN_COLUMNS, ...mktFields.map((f) => ({ key: 'cf:' + f.id, label: f.label }))]
  const visible = mktColumns.filter((k) => all.some((c) => c.key === k))
  const hidden = all.filter((c) => !visible.includes(c.key))
  const labelOf = (k: string) => all.find((c) => c.key === k)?.label ?? k
  const field = (key: string) => mktFields.find((f) => 'cf:' + f.id === key)
  const move = (i: number, d: -1 | 1) => { const n = [...visible];[n[i], n[i + d]] = [n[i + d], n[i]]; setMktColumns(n) }
  const patchField = (id: string, p: Partial<FieldDef>) => setMktFields(mktFields.map((f) => (f.id === id ? { ...f, ...p } : f)))
  const addField = () => {
    const t = label.trim()
    if (!t) return
    const f: FieldDef = { id: nanoid(5), label: t, type, options: '' }
    setMktFields([...mktFields, f]); setMktColumns([...visible, 'cf:' + f.id]); setLabel(''); setType('text')
  }
  const removeField = (f: FieldDef) => {
    const used = leads.filter((l) => l.custom?.[f.id]).length
    if (confirm(`Delete field “${f.label}”?${used ? ` ${used} leads have a value in it; those values will be lost.` : ''}`)) setMktFields(mktFields.filter((x) => x.id !== f.id))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage columns</DialogTitle>
          <DialogDescription>Pick the columns shown in the list view and their order. Add your own fields for anything the defaults don’t cover. Hidden columns are still kept, exported and imported.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">Shown ({visible.length})</div>
          {visible.map((k, i) => {
            const f = field(k)
            return (
              <div key={k} className="space-y-1.5 rounded-lg border px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon-xs" disabled={!canEdit || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-xs" disabled={!canEdit || i === visible.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                  {f ? <Input disabled={!canEdit} className="h-7 flex-1" value={f.label} onChange={(e) => patchField(f.id, { label: e.target.value })} /> : <span className="flex-1 text-sm">{labelOf(k)}</span>}
                  {f && <NativeSelect disabled={!canEdit} value={f.type} onChange={(v) => patchField(f.id, { type: v as FieldDef['type'] })} options={TYPES} />}
                  <Button variant="outline" size="xs" disabled={!canEdit || visible.length <= 1} onClick={() => setMktColumns(visible.filter((x) => x !== k))}>Hide</Button>
                  {f && canEdit && <Button variant="ghost" size="icon-xs" onClick={() => removeField(f)}><Trash2 className="text-destructive" /></Button>}
                </div>
                {f?.type === 'select' && <Input disabled={!canEdit} className="h-7" placeholder="Options, comma separated (e.g. Hot, Warm, Cold)" value={f.options} onChange={(e) => patchField(f.id, { options: e.target.value })} />}
              </div>
            )
          })}
        </div>

        {hidden.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Hidden</div>
            <div className="flex flex-wrap gap-1.5">
              {hidden.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                  {c.label}
                  <button disabled={!canEdit} className="font-medium text-primary disabled:opacity-50" onClick={() => setMktColumns([...visible, c.key])}>Show</button>
                  {c.key.startsWith('cf:') && canEdit && <button title="Delete field" className="text-destructive" onClick={() => removeField(field(c.key)!)}><Trash2 className="size-3" /></button>}
                </span>
              ))}
            </div>
          </div>
        )}

        {canEdit && (
          <div className="space-y-1.5 border-t pt-3">
            <div className="text-xs font-medium text-muted-foreground">Add a custom field</div>
            <div className="flex gap-2">
              <Input className="h-8" placeholder="Field name, e.g. Industry" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addField()} />
              <NativeSelect value={type} onChange={(v) => setType(v as FieldDef['type'])} options={TYPES} />
              <Button disabled={!label.trim()} onClick={addField}><Plus /> Add</Button>
            </div>
          </div>
        )}

        <DialogFooter>
          {canEdit && <Button variant="ghost" onClick={() => setMktColumns(DEFAULT_LEAD_COLUMNS)}>Reset columns</Button>}
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
