import { useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { CalendarDays, Clock, Columns3, Plus, Search, Table2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { NumberCell, SelectCell, TextCell } from '@/components/pipeline/cells'
import { PriorityBadge, th, td, usePm } from '@/components/pm/ui'
import { PRIORITY, todayStr } from '@/lib/pm'
import { fmtDate, stageDot, stageTone } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Priority, Task } from '@/types'

const prioOpts = (Object.keys(PRIORITY) as Priority[]).map((k) => ({ value: k, label: PRIORITY[k].label }))

export default function PmBoard() {
  const { s, project, tasks, milestones, members, canEdit } = usePm()
  const stages = project.pmStages
  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const today = todayStr()
  const doneIds = new Set(stages.filter((x) => x.type === 'won').map((x) => x.id))

  const assignees = useMemo(() => [...new Set([...members.map((m) => m.name), ...tasks.map((t) => t.assignee)].filter(Boolean))], [members, tasks])
  const rows = tasks.filter((t) =>
    (!q || `${t.title} ${t.labels} ${t.assignee}`.toLowerCase().includes(q.toLowerCase())) &&
    (!assignee || (assignee === '__none' ? !t.assignee : t.assignee === assignee)) &&
    (!priority || t.priority === priority))

  const upd = (id: string, p: Partial<Task>) => s.pmUpdate('tasks', id, p)
  const add = (stage?: string) => {
    const id = 'k-' + nanoid(6)
    s.pmAdd('tasks', { id, projectId: project.id, title: 'New task', description: '', stage: stage ?? stages[0]?.id ?? '', assignee: '', priority: 'medium', startDate: '', dueDate: '', estimateH: null, milestoneId: '', labels: '' })
    setOpenId(id)
  }
  const msTitle = (id: string) => milestones.find((m) => m.id === id)?.title
  const stageOpts = stages.map((x) => ({ value: x.id, label: x.label }))
  const open = tasks.find((t) => t.id === openId)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Work board</h1>
          <p className="text-sm text-muted-foreground">Delivery tasks for {project.name}. Uses the PM workflow, separate from the hiring pipeline.</p>
        </div>
        {canEdit && <Button onClick={() => add()}><Plus /> New task</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as 'board' | 'list')}>
          <TabsList>
            <TabsTrigger value="board"><Columns3 className="size-3.5" /> Board</TabsTrigger>
            <TabsTrigger value="list"><Table2 className="size-3.5" /> List</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 w-56 pl-8" placeholder="Search tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect value={assignee} onChange={setAssignee} options={[{ value: '', label: 'All assignees' }, { value: '__none', label: 'Unassigned' }, ...assignees.map((a) => ({ value: a, label: a }))]} />
        <NativeSelect value={priority} onChange={setPriority} options={[{ value: '', label: 'Any priority' }, ...prioOpts]} />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rows.length} of {tasks.length} tasks</span>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'board' ? (
          <div className="flex h-full gap-3 overflow-x-auto pb-2">
            {stages.map((st) => {
              const items = rows.filter((t) => t.stage === st.id)
              return (
                <div
                  key={st.id}
                  onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(st.id) } }}
                  onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; if (id && canEdit) upd(id, { stage: st.id }); setOver(null); setDragId(null) }}
                  className={cn('flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors', over === st.id && 'border-primary bg-primary/5')}
                >
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <span className={cn('size-2 rounded-full', stageDot(st))} />
                    <span className="text-sm font-semibold">{st.label}</span>
                    <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{items.length}</span>
                    {canEdit && <Button variant="ghost" size="icon-xs" onClick={() => add(st.id)}><Plus /></Button>}
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {items.map((t) => {
                      const late = t.dueDate && t.dueDate < today && !doneIds.has(t.stage)
                      return (
                        <div
                          key={t.id}
                          draggable={canEdit}
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); setDragId(t.id) }}
                          onDragEnd={() => { setDragId(null); setOver(null) }}
                          onClick={() => setOpenId(t.id)}
                          className={cn('cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-xs hover:shadow-md', canEdit && 'cursor-grab active:cursor-grabbing', dragId === t.id && 'opacity-40')}
                        >
                          <div className="font-medium">{t.title}</div>
                          {msTitle(t.milestoneId) && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">◆ {msTitle(t.milestoneId)}</div>}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <PriorityBadge priority={t.priority} />
                            {t.labels && t.labels.split(',').map((l) => <span key={l} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{l.trim()}</span>)}
                          </div>
                          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="truncate">{t.assignee || 'Unassigned'}</span>
                            {t.dueDate && <span className={cn('ml-auto flex items-center gap-1', late && 'font-medium text-red-600')}><CalendarDays className="size-3" /> {fmtDate(t.dueDate)}</span>}
                            {t.estimateH != null && <span className="flex items-center gap-1"><Clock className="size-3" /> {t.estimateH}h</span>}
                          </div>
                        </div>
                      )
                    })}
                    {items.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No tasks</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="h-full overflow-auto rounded-lg border bg-background">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={cn(th, 'w-80')}>Task</th><th className={cn(th, 'w-40')}>Stage</th><th className={cn(th, 'w-36')}>Assignee</th>
                  <th className={cn(th, 'w-28')}>Priority</th><th className={cn(th, 'w-32')}>Start</th><th className={cn(th, 'w-32')}>Due</th>
                  <th className={cn(th, 'w-20')}>Est. (h)</th><th className={cn(th, 'w-56')}>Milestone</th><th className="w-12 border-b bg-muted" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className={td}><TextCell value={t.title} readOnly={!canEdit} className="font-medium" onCommit={(v) => upd(t.id, { title: v })} /></td>
                    <td className={td}><SelectCell value={t.stage} options={stageOpts} readOnly={!canEdit} tone={stageTone(stages.find((x) => x.id === t.stage))} onChange={(v) => upd(t.id, { stage: v })} /></td>
                    <td className={td}><TextCell value={t.assignee} readOnly={!canEdit} placeholder="Unassigned" onCommit={(v) => upd(t.id, { assignee: v })} /></td>
                    <td className={td}><SelectCell value={t.priority} options={prioOpts} readOnly={!canEdit} tone={PRIORITY[t.priority].tone} onChange={(v) => upd(t.id, { priority: v as Priority })} /></td>
                    <td className={td}><TextCell type="date" value={t.startDate} readOnly={!canEdit} onCommit={(v) => upd(t.id, { startDate: v })} /></td>
                    <td className={td}><TextCell type="date" value={t.dueDate} readOnly={!canEdit} onCommit={(v) => upd(t.id, { dueDate: v })} /></td>
                    <td className={td}><NumberCell value={t.estimateH} readOnly={!canEdit} onCommit={(v) => upd(t.id, { estimateH: v })} /></td>
                    <td className={td}><SelectCell value={t.milestoneId} options={[{ value: '', label: '—' }, ...milestones.map((m) => ({ value: m.id, label: m.title }))]} readOnly={!canEdit} onChange={(v) => upd(t.id, { milestoneId: v })} /></td>
                    <td className="border-b p-0 text-center">{canEdit && <Button variant="ghost" size="icon-xs" onClick={() => confirm('Delete this task?') && s.pmDelete('tasks', t.id)}><Trash2 className="text-destructive" /></Button>}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">No tasks match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.title || 'Task'}</SheetTitle>
                <SheetDescription>{project.name}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Title</Label><Input disabled={!canEdit} value={open.title} onChange={(e) => upd(open.id, { title: e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Description</Label><Textarea disabled={!canEdit} rows={4} value={open.description} onChange={(e) => upd(open.id, { description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Stage</Label><NativeSelect disabled={!canEdit} className="w-full" value={open.stage} onChange={(v) => upd(open.id, { stage: v })} options={stageOpts} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Priority</Label><NativeSelect disabled={!canEdit} className="w-full" value={open.priority} onChange={(v) => upd(open.id, { priority: v as Priority })} options={prioOpts} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Assignee</Label><Input disabled={!canEdit} list="assignees" value={open.assignee} onChange={(e) => upd(open.id, { assignee: e.target.value })} /><datalist id="assignees">{assignees.map((a) => <option key={a} value={a} />)}</datalist></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Estimate (hours)</Label><Input disabled={!canEdit} type="number" value={open.estimateH ?? ''} onChange={(e) => upd(open.id, { estimateH: e.target.value ? Number(e.target.value) : null })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Start</Label><Input disabled={!canEdit} type="date" value={open.startDate} onChange={(e) => upd(open.id, { startDate: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Due</Label><Input disabled={!canEdit} type="date" value={open.dueDate} onChange={(e) => upd(open.id, { dueDate: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Milestone</Label><NativeSelect disabled={!canEdit} className="w-full" value={open.milestoneId} onChange={(v) => upd(open.id, { milestoneId: v })} options={[{ value: '', label: 'None' }, ...milestones.map((m) => ({ value: m.id, label: m.title }))]} /></div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Labels (comma separated)</Label><Input disabled={!canEdit} value={open.labels} onChange={(e) => upd(open.id, { labels: e.target.value })} /></div>
                {canEdit && <Button variant="outline" onClick={() => { s.pmDelete('tasks', open.id); setOpenId(null) }}><Trash2 className="text-destructive" /> Delete task</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
