import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectCell, TextCell } from '@/components/pipeline/cells'
import { Card, PageHeader, th, td, pageCls, usePm } from '@/components/pm/ui'
import { daysBetween, todayStr } from '@/lib/pm'
import { stageDot } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Milestone } from '@/types'

const MS_STATUS = [{ value: 'upcoming', label: 'Upcoming' }, { value: 'done', label: 'Done' }, { value: 'missed', label: 'Missed' }]
const MS_TONE: Record<Milestone['status'], string> = {
  upcoming: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  missed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

export default function PmTimeline() {
  const { s, project, info, tasks, milestones, canEdit } = usePm()
  const today = todayStr()
  const doneIds = new Set(project.pmStages.filter((x) => x.type === 'won').map((x) => x.id))
  const upd = (id: string, p: Partial<Milestone>) => s.pmUpdate('milestones', id, p)

  const dated = tasks.filter((t) => t.startDate && t.dueDate).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const dates = [info.startDate, info.endDate, ...milestones.map((m) => m.date), ...dated.flatMap((t) => [t.startDate, t.dueDate])].filter(Boolean).sort()
  const min = dates[0] ?? today
  const max = dates[dates.length - 1] ?? today
  const span = Math.max(1, daysBetween(min, max))
  const pct = (d: string) => (daysBetween(min, d) / span) * 100

  // month ticks
  const ticks: { label: string; left: number }[] = []
  const cur = new Date(min + 'T00:00:00')
  cur.setDate(1)
  while (cur.toISOString().slice(0, 10) <= max) {
    const iso = cur.toISOString().slice(0, 10)
    if (iso >= min) ticks.push({ label: cur.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), left: pct(iso) })
    cur.setMonth(cur.getMonth() + 1)
  }
  const todayLeft = today >= min && today <= max ? pct(today) : null

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader title="Timeline & milestones" desc="Milestones are the checkpoints the whole project (including hiring) works toward." />

        <Card title="Milestones" action={canEdit && <Button size="sm" variant="outline" onClick={() => s.pmAdd('milestones', { id: 'm-' + nanoid(5), projectId: project.id, title: 'New milestone', date: today, status: 'upcoming', owner: '', notes: '' })}><Plus /> Add milestone</Button>}>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead><tr><th className={th}>Milestone</th><th className={cn(th, 'w-36')}>Date</th><th className={cn(th, 'w-32')}>Status</th><th className={cn(th, 'w-40')}>Owner</th><th className={cn(th, 'w-24')}>Tasks</th><th className="w-10 border-b bg-muted" /></tr></thead>
              <tbody>
                {[...milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
                  const mt = tasks.filter((t) => t.milestoneId === m.id)
                  const d = mt.filter((t) => doneIds.has(t.stage)).length
                  return (
                    <tr key={m.id}>
                      <td className={td}><TextCell value={m.title} readOnly={!canEdit} className="font-medium" onCommit={(v) => upd(m.id, { title: v })} /></td>
                      <td className={td}><TextCell type="date" value={m.date} readOnly={!canEdit} onCommit={(v) => upd(m.id, { date: v })} /></td>
                      <td className={td}><SelectCell value={m.status} options={MS_STATUS} readOnly={!canEdit} tone={MS_TONE[m.status]} onChange={(v) => upd(m.id, { status: v as Milestone['status'] })} /></td>
                      <td className={td}><TextCell value={m.owner} readOnly={!canEdit} onCommit={(v) => upd(m.id, { owner: v })} /></td>
                      <td className={cn(td, 'px-2 text-xs text-muted-foreground')}>{d}/{mt.length}</td>
                      <td className="border-b p-0 text-center">{canEdit && <Button variant="ghost" size="icon-xs" onClick={() => s.pmDelete('milestones', m.id)}><Trash2 className="text-destructive" /></Button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Gantt view">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="flex">
                <div className="w-60 shrink-0" />
                <div className="relative h-7 flex-1 border-b">
                  {ticks.map((t) => <div key={t.label + t.left} className="absolute top-0 h-full border-l pl-1 text-[11px] text-muted-foreground" style={{ left: `${t.left}%` }}>{t.label}</div>)}
                </div>
              </div>
              <div className="relative">
                {[...milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
                  <div key={m.id} className="flex items-center border-b border-dashed">
                    <div className="w-60 shrink-0 truncate py-1.5 pr-2 text-sm font-medium">◆ {m.title}</div>
                    <div className="relative h-8 flex-1">
                      <div className={cn('absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45', m.status === 'done' ? 'bg-emerald-500' : m.status === 'missed' ? 'bg-red-500' : 'bg-sky-500')} style={{ left: `${pct(m.date)}%` }} title={`${m.title} · ${m.date}`} />
                    </div>
                  </div>
                ))}
                {dated.map((t) => {
                  const st = project.pmStages.find((x) => x.id === t.stage)
                  const isDone = doneIds.has(t.stage)
                  return (
                    <div key={t.id} className="flex items-center border-b border-dashed">
                      <div className="w-60 shrink-0 truncate py-1.5 pr-2 text-sm text-muted-foreground">{t.title}</div>
                      <div className="relative h-8 flex-1">
                        <div className={cn('absolute top-1/2 h-4 -translate-y-1/2 rounded', stageDot(st), isDone && 'opacity-50')} style={{ left: `${pct(t.startDate)}%`, width: `${Math.max(0.8, pct(t.dueDate) - pct(t.startDate))}%` }} title={`${t.title}: ${t.startDate} → ${t.dueDate}`} />
                      </div>
                    </div>
                  )
                })}
                {todayLeft != null && (
                  <div className="pointer-events-none absolute inset-y-0 flex" style={{ left: '15rem', right: 0 }}>
                    <div className="relative h-full w-full"><div className="absolute inset-y-0 w-px bg-red-500" style={{ left: `${todayLeft}%` }}><span className="absolute -top-0 left-1 rounded bg-red-500 px-1 text-[10px] text-white">Today</span></div></div>
                  </div>
                )}
              </div>
              {dated.length === 0 && milestones.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Add milestones, or give tasks a start and due date, to see them here.</p>}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
