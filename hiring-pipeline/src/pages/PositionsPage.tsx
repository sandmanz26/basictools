import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect } from '@/components/NativeSelect'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import { ARRANGEMENTS, LEVELS } from '@/lib/constants'
import type { Position, TestQuestion } from '@/types'

const statusTone = { open: 'bg-emerald-100 text-emerald-700', draft: 'bg-muted text-muted-foreground', closed: 'bg-red-100 text-red-700' }

export default function PositionsPage() {
  const { positions, candidates, activeProjectId, addPosition, updatePosition, deletePosition, upsertQuestion, deleteQuestion } = useStore()
  const can = useCan()
  const list = positions.filter((p) => p.projectId === activeProjectId)
  const [sel, setSel] = useState<string | null>(null)
  const pos: Position | undefined = list.find((p) => p.id === sel) ?? list[0]
  const canJd = can('positions.edit')
  const canTest = can('tests.edit')
  const count = (id: string) => candidates.filter((c) => c.positionId === id).length

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between p-4 pb-2">
          <h1 className="font-semibold">Positions</h1>
          {canJd && <Button size="sm" variant="outline" onClick={() => setSel(addPosition(activeProjectId))}><Plus /> New</Button>}
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {list.map((p) => (
            <button key={p.id} onClick={() => setSel(p.id)} className={cn('w-full rounded-lg px-3 py-2 text-left hover:bg-muted', pos?.id === p.id && 'bg-muted')}>
              <div className="flex items-center gap-2 text-sm font-medium">{p.title}
                <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium', statusTone[p.status])}>{p.status}</span></div>
              <div className="text-xs text-muted-foreground">{p.level} · {count(p.id)} candidates · {p.questions.length} questions</div>
            </button>
          ))}
          {list.length === 0 && <div className="p-4 text-sm text-muted-foreground">No positions yet.</div>}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {!pos ? null : (
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex items-start gap-3">
              <Input disabled={!canJd} value={pos.title} onChange={(e) => updatePosition(pos.id, { title: e.target.value })} className="h-10 border-0 px-0 text-xl font-semibold shadow-none focus-visible:ring-0" />
              {canJd && <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this position?')) { deletePosition(pos.id); setSel(null) } }}><Trash2 className="text-destructive" /></Button>}
            </div>
            {!canJd && !canTest && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role has read-only access here.</div>}
            <Tabs defaultValue="jd">
              <TabsList>
                <TabsTrigger value="jd">Job description</TabsTrigger>
                <TabsTrigger value="tests">Test questions ({pos.questions.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="jd" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-1"><Label>Department</Label><Input disabled={!canJd} value={pos.department} onChange={(e) => updatePosition(pos.id, { department: e.target.value })} /></div>
                  <div className="space-y-1"><Label>Level</Label><NativeSelect disabled={!canJd} className="w-full" value={pos.level} onChange={(v) => updatePosition(pos.id, { level: v })} options={LEVELS.map((l) => ({ value: l, label: l }))} /></div>
                  <div className="space-y-1"><Label>Status</Label><NativeSelect disabled={!canJd} className="w-full" value={pos.status} onChange={(v) => updatePosition(pos.id, { status: v as Position['status'] })} options={['draft', 'open', 'closed'].map((l) => ({ value: l, label: l }))} /></div>
                  <div className="space-y-1"><Label>Headcount</Label><Input disabled={!canJd} type="number" value={pos.headcount} onChange={(e) => updatePosition(pos.id, { headcount: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>Working arrangement</Label><NativeSelect disabled={!canJd} className="w-full" value={pos.arrangement} onChange={(v) => updatePosition(pos.id, { arrangement: v as Position['arrangement'] })} options={ARRANGEMENTS.map((l) => ({ value: l, label: l }))} /></div>
                  {can('salary.view') && (
                    <>
                      <div className="space-y-1"><Label>Salary min (IDR)</Label><Input disabled={!canJd} type="number" value={pos.salaryMin ?? ''} onChange={(e) => updatePosition(pos.id, { salaryMin: e.target.value ? Number(e.target.value) : null })} /></div>
                      <div className="space-y-1"><Label>Salary max (IDR)</Label><Input disabled={!canJd} type="number" value={pos.salaryMax ?? ''} onChange={(e) => updatePosition(pos.id, { salaryMax: e.target.value ? Number(e.target.value) : null })} /></div>
                    </>
                  )}
                </div>
                <div className="space-y-1"><Label>Description</Label><Textarea disabled={!canJd} rows={5} value={pos.description} onChange={(e) => updatePosition(pos.id, { description: e.target.value })} /></div>
                <div className="space-y-1"><Label>Requirements</Label><Textarea disabled={!canJd} rows={7} value={pos.requirements} onChange={(e) => updatePosition(pos.id, { requirements: e.target.value })} /></div>
              </TabsContent>
              <TabsContent value="tests" className="space-y-3 pt-4">
                {pos.questions.map((q, i) => (
                  <QuestionCard key={q.id} index={i + 1} q={q} disabled={!canTest} onChange={(nq) => upsertQuestion(pos.id, nq)} onDelete={() => deleteQuestion(pos.id, q.id)} />
                ))}
                {pos.questions.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No test questions yet.</div>}
                {canTest && (
                  <Button variant="outline" onClick={() => upsertQuestion(pos.id, { id: nanoid(6), text: '', type: 'essay', weight: 10, answerKey: '' })}><Plus /> Add question</Button>
                )}
                {pos.questions.length > 0 && <div className="text-xs text-muted-foreground">Total weight: {pos.questions.reduce((a, q) => a + q.weight, 0)} (pass mark in the table is 65)</div>}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
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
        <Input disabled={disabled} type="number" className="h-8 w-20" value={q.weight} onChange={(e) => onChange({ ...q, weight: Number(e.target.value) })} />
        {!disabled && <Button variant="ghost" size="icon-sm" onClick={onDelete}><Trash2 className="text-destructive" /></Button>}
      </div>
      <Textarea disabled={disabled} rows={2} placeholder="Question" value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
      <Textarea disabled={disabled} rows={2} placeholder="Answer key / what a good answer covers" value={q.answerKey} onChange={(e) => onChange({ ...q, answerKey: e.target.value })} className="bg-muted/40" />
    </div>
  )
}
