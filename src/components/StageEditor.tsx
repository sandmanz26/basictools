import { useState } from 'react'
import { nanoid } from 'nanoid'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { cn } from '@/lib/utils'
import { STAGE_COLORS, stageDot } from '@/lib/constants'
import type { Stage, StageType } from '@/types'

const HR_TYPES = [
  { value: 'active', label: 'In progress' },
  { value: 'won', label: 'Won (hired)' },
  { value: 'lost', label: 'Lost (rejected)' },
]
const MKT_TYPES = [
  { value: 'active', label: 'In progress' },
  { value: 'won', label: 'Won (customer)' },
  { value: 'lost', label: 'Lost' },
]
const PM_TYPES = [
  { value: 'active', label: 'In progress' },
  { value: 'won', label: 'Done' },
]

/** Reorderable list of pipeline stages. `mode` decides which fields apply (HR hiring vs PM work board). */
export function StageEditor({
  stages, onChange, countIn, onRemove, mode, can, onReset, itemLabel,
}: {
  stages: Stage[]
  onChange: (stages: Stage[]) => void
  countIn: (stageId: string) => number
  onRemove: (stageId: string, moveTo: string) => void
  mode: 'hr' | 'pm' | 'mkt'
  can: boolean
  onReset?: () => void
  itemLabel: string // "candidates" / "tasks"
}) {
  const [del, setDel] = useState<{ stage: Stage; moveTo: string } | null>(null)
  const patch = (id: string, p: Partial<Stage>) => onChange(stages.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const move = (i: number, d: -1 | 1) => {
    const n = [...stages]
    ;[n[i], n[i + d]] = [n[i + d], n[i]]
    onChange(n)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
            <div className="flex flex-col">
              <Button variant="ghost" size="icon-xs" disabled={!can || i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-xs" disabled={!can || i === stages.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
            </div>
            <span className={cn('size-3 shrink-0 rounded-full', stageDot(s))} />
            <Input disabled={!can} className="h-8 w-44 font-medium" value={s.label} onChange={(e) => patch(s.id, { label: e.target.value })} />
            <NativeSelect disabled={!can} value={s.color} onChange={(v) => patch(s.id, { color: v })} options={Object.entries(STAGE_COLORS).map(([k, v]) => ({ value: k, label: v.label }))} />
            <NativeSelect disabled={!can} value={s.type} onChange={(v) => patch(s.id, { type: v as StageType })} options={mode === 'pm' ? PM_TYPES : mode === 'mkt' ? MKT_TYPES : HR_TYPES} />
            {mode === 'hr' && (
              <>
                <label className="flex items-center gap-1.5 text-sm"><Switch disabled={!can} checked={s.interview} onCheckedChange={(v) => patch(s.id, { interview: v })} /> Interview</label>
                <Input disabled={!can} className="h-8 min-w-48 flex-1" placeholder="Default next step" value={s.nextStep} onChange={(e) => patch(s.id, { nextStep: e.target.value })} />
              </>
            )}
            <span className="ml-auto w-20 text-right text-xs text-muted-foreground">{countIn(s.id)} {itemLabel}</span>
            {can && (
              <Button variant="ghost" size="icon-sm" disabled={stages.length <= 1}
                onClick={() => {
                  const others = stages.filter((x) => x.id !== s.id)
                  if (countIn(s.id) === 0) onRemove(s.id, others[0].id)
                  else setDel({ stage: s, moveTo: others[0].id })
                }}>
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {can && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onChange([...stages, { id: nanoid(5), label: 'New stage', color: 'teal', type: 'active', interview: false, nextStep: '' }])}><Plus /> Add stage</Button>
          {onReset && <Button variant="ghost" onClick={onReset}>Reset to default</Button>}
        </div>
      )}

      <Dialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete stage “{del?.stage.label}”?</DialogTitle>
            <DialogDescription>{del && countIn(del.stage.id)} {itemLabel} are in this stage. Choose where they should go.</DialogDescription>
          </DialogHeader>
          {del && <NativeSelect className="w-full" value={del.moveTo} onChange={(v) => setDel({ ...del, moveTo: v })} options={stages.filter((x) => x.id !== del.stage.id).map((x) => ({ value: x.id, label: x.label }))} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (del) onRemove(del.stage.id, del.moveTo); setDel(null) }}>Delete & move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
