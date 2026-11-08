import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/NumberInput'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect } from '@/components/NativeSelect'
import { TestMaterials } from '@/components/TestMaterials'
import { RichEditor } from '@/components/RichEditor'
import { SaveBar } from '@/components/SaveBar'
import { useDraft } from '@/lib/useDraft'
import { deleteFile } from '@/lib/files'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import { ARRANGEMENTS, LEVELS } from '@/lib/constants'
import type { Position, TestQuestion } from '@/types'

const statusTone = { open: 'bg-emerald-100 text-emerald-700', draft: 'bg-muted text-muted-foreground', closed: 'bg-red-100 text-red-700' }

export default function PositionsPage() {
  const { positions, candidates, activeProjectId, addPosition } = useStore()
  const can = useCan()
  const list = positions.filter((p) => p.projectId === activeProjectId)
  const [sel, setSel] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const pos: Position | undefined = list.find((p) => p.id === sel) ?? list[0]
  const canJd = can('positions.edit')
  const count = (id: string) => candidates.filter((c) => c.positionId === id).length
  const go = (id: string) => {
    if (id === pos?.id) return
    if (dirty && !confirm('You have unsaved changes on this position. Discard them?')) return
    setDirty(false); setSel(id)
  }

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between p-4 pb-2">
          <h1 className="font-semibold">Positions</h1>
          {canJd && <Button size="sm" variant="outline" onClick={() => { if (dirty && !confirm('Discard unsaved changes?')) return; setDirty(false); setSel(addPosition(activeProjectId)) }}><Plus /> New</Button>}
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => go(p.id)} className={cn('w-full rounded-lg px-3 py-2 text-left hover:bg-muted', pos?.id === p.id && 'bg-muted')}>
              <div className="flex items-center gap-2 text-sm font-medium">{p.title}
                <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium', statusTone[p.status])}>{p.status}</span></div>
              <div className="text-xs text-muted-foreground">{p.level} · {count(p.id)} candidates · {p.questions.length} questions</div>
            </button>
          ))}
          {list.length === 0 && <div className="p-4 text-sm text-muted-foreground">No positions yet.</div>}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto px-6 pt-6">
        {pos && <PositionEditor key={pos.id} pos={pos} onDirty={setDirty} onDeleted={() => { setDirty(false); setSel(null) }} />}
      </div>
    </div>
  )
}

/** Edits a copy of the position; the store only changes when "Save changes" is pressed. */
function PositionEditor({ pos, onDirty, onDeleted }: { pos: Position; onDirty: (d: boolean) => void; onDeleted: () => void }) {
  const { updatePosition, deletePosition } = useStore()
  const can = useCan()
  const canJd = can('positions.edit')
  const canTest = can('tests.edit')
  const d = useDraft<Position>(pos, pos.id, ({ testFiles: _f, formLinks: _l, ...rest }) => updatePosition(pos.id, rest))
  const p = d.draft
  useEffect(() => { onDirty(d.dirty) }, [d.dirty, onDirty])
  // A saved change for a field we can't edit must not be overwritten by our stale copy.
  const setQ = (questions: TestQuestion[]) => d.set({ questions })

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <Input disabled={!canJd} value={p.title} onChange={(e) => d.set({ title: e.target.value })} className="h-10 border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0" />
        {canJd && <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this position?')) { (pos.testFiles ?? []).forEach((f) => void deleteFile(f.id).catch(() => {})); deletePosition(pos.id); onDeleted() } }}><Trash2 className="text-destructive" /></Button>}
      </div>
      {!canJd && !canTest && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role has read-only access here.</div>}
      <Tabs defaultValue="jd">
        <TabsList>
          <TabsTrigger value="jd">Job description</TabsTrigger>
          <TabsTrigger value="tests">Test questions ({p.questions.length})</TabsTrigger>
          <TabsTrigger value="materials">PDF & form links ({(pos.testFiles?.length ?? 0) + (pos.formLinks?.length ?? 0)})</TabsTrigger>
        </TabsList>
        <TabsContent value="jd" className="space-y-4 pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1"><Label>Department</Label><Input disabled={!canJd} value={p.department} onChange={(e) => d.set({ department: e.target.value })} /></div>
            <div className="space-y-1"><Label>Level</Label><NativeSelect disabled={!canJd} className="w-full" value={p.level} onChange={(v) => d.set({ level: v })} options={LEVELS.map((l) => ({ value: l, label: l }))} /></div>
            <div className="space-y-1"><Label>Status</Label><NativeSelect disabled={!canJd} className="w-full" value={p.status} onChange={(v) => d.set({ status: v as Position['status'] })} options={['draft', 'open', 'closed'].map((l) => ({ value: l, label: l }))} /></div>
            <div className="space-y-1"><Label>Headcount</Label><NumberInput disabled={!canJd} value={p.headcount} onValueChange={(v) => d.set({ headcount: v ?? 0 })} /></div>
            <div className="space-y-1"><Label>Working arrangement</Label><NativeSelect disabled={!canJd} className="w-full" value={p.arrangement} onChange={(v) => d.set({ arrangement: v as Position['arrangement'] })} options={ARRANGEMENTS.map((l) => ({ value: l, label: l }))} /></div>
            {can('salary.view') && (
              <>
                <div className="space-y-1"><Label>Salary min (IDR)</Label><NumberInput disabled={!canJd} value={p.salaryMin} onValueChange={(v) => d.set({ salaryMin: v })} /></div>
                <div className="space-y-1"><Label>Salary max (IDR)</Label><NumberInput disabled={!canJd} value={p.salaryMax} onValueChange={(v) => d.set({ salaryMax: v })} /></div>
              </>
            )}
          </div>
          <div className="space-y-1"><Label>Description</Label><RichEditor disabled={!canJd} value={p.description} onChange={(html) => d.set({ description: html })} placeholder="What will this person do?" minHeight="9rem" /></div>
          <div className="space-y-1"><Label>Requirements</Label><RichEditor disabled={!canJd} value={p.requirements} onChange={(html) => d.set({ requirements: html })} placeholder="Skills, experience, nice-to-haves…" minHeight="11rem" /></div>
        </TabsContent>
        <TabsContent value="tests" className="space-y-3 pt-4">
          {p.questions.map((q, i) => (
            <QuestionCard key={q.id} index={i + 1} q={q} disabled={!canTest} onChange={(nq) => setQ(p.questions.map((x) => (x.id === q.id ? nq : x)))} onDelete={() => setQ(p.questions.filter((x) => x.id !== q.id))} />
          ))}
          {p.questions.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No test questions yet.</div>}
          {canTest && <Button variant="outline" onClick={() => setQ([...p.questions, { id: nanoid(6), text: '', type: 'essay', weight: 10, answerKey: '' }])}><Plus /> Add question</Button>}
          {p.questions.length > 0 && <div className="text-xs text-muted-foreground">Total weight: {p.questions.reduce((a, q) => a + q.weight, 0)} (pass mark in the table is 65)</div>}
        </TabsContent>
        <TabsContent value="materials" className="space-y-2 pt-4">
          <p className="text-xs text-muted-foreground">Files and links on this tab are saved as soon as you add or remove them.</p>
          <TestMaterials pos={pos} canEdit={canTest} />
        </TabsContent>
      </Tabs>
      <SaveBar dirty={d.dirty} onSave={d.save} onDiscard={d.discard} />
    </div>
  )
}

function QuestionCard({ q, index, onChange, onDelete, disabled }: { q: TestQuestion; index: number; onChange: (q: TestQuestion) => void; onDelete: () => void; disabled: boolean }) {
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">Q{index}</span>
        <NativeSelect disabled={disabled} value={q.type} onChange={(v) => onChange({ ...q, type: v as TestQuestion['type'] })} options={[{ value: 'essay', label: 'Essay' }, { value: 'multiple_choice', label: 'Multiple choice' }, { value: 'coding', label: 'Coding' }, { value: 'case_study', label: 'Case study' }]} />
        <Label className="ml-auto text-xs text-muted-foreground">Weight</Label>
        <NumberInput disabled={disabled} className="h-8 w-20" value={q.weight} onValueChange={(v) => onChange({ ...q, weight: v ?? 0 })} />
        {!disabled && <Button variant="ghost" size="icon-sm" onClick={onDelete}><Trash2 className="text-destructive" /></Button>}
      </div>
      <Textarea disabled={disabled} rows={2} placeholder="Question" value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
      <Textarea disabled={disabled} rows={2} placeholder="Answer key / what a good answer covers" value={q.answerKey} onChange={(e) => onChange({ ...q, answerKey: e.target.value })} className="bg-muted/40" />
    </div>
  )
}
