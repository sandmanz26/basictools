import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/constants'
import { localToday } from '@/lib/billing'
import { curOf, fmtMoney } from '@/lib/money'
import { balanceDue, effectiveStatus, invoiceTotal, PHASES, statusStyle } from '@/lib/pm'
import { ganttBar, ganttScale, type GanttScale } from '@/lib/timeline'
import type { Invoice, Milestone, Project, ProjectMeeting, StatusDef } from '@/types'

const NAME_W = 'w-40 sm:w-52'

/** Month header with the gridlines drawn behind the rows. Shared with the invoice Gantt. */
export function GanttHeader({ scale, left }: { scale: GanttScale; left?: string }) {
  return (
    <div className="flex border-b bg-muted/40 text-[11px] text-muted-foreground">
      <div className={cn('sticky left-0 z-20 shrink-0 border-r bg-muted px-3 py-1.5 font-medium', left ?? NAME_W)}>{left ? '' : 'Project'}</div>
      <div className="relative h-7 flex-1" aria-hidden>
        {scale.ticks.map((t) => <span key={t.date} className="absolute top-1.5 border-l pl-1 whitespace-nowrap" style={{ left: `${t.pct}%` }}>{t.label}</span>)}
      </div>
    </div>
  )
}

export function GanttGrid({ scale, todayLabel = true }: { scale: GanttScale; todayLabel?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {scale.ticks.map((t) => <span key={t.date} className="absolute inset-y-0 border-l border-border/60" style={{ left: `${t.pct}%` }} />)}
      {scale.todayPct != null && (
        <span className="absolute inset-y-0 z-[5] border-l-2 border-red-500/80" style={{ left: `${scale.todayPct}%` }}>
          {todayLabel && <span className="absolute -top-0.5 left-1 hidden rounded bg-red-500 px-1 text-[9px] leading-tight font-medium text-white sm:block">Today</span>}
        </span>
      )}
    </div>
  )
}

interface Marker { id: string; date: string; shape: 'diamond' | 'dot' | 'square'; cls: string; tip: string }

const SHAPE: Record<Marker['shape'], string> = { diamond: 'size-2.5 rotate-45', dot: 'size-2.5 rounded-full', square: 'size-2.5 rounded-[2px]' }

function markersFor(projectId: string, a: { invoices: Invoice[]; meetings: ProjectMeeting[]; milestones: Milestone[] }, today: string): Marker[] {
  const out: Marker[] = []
  for (const m of a.milestones.filter((x) => x.projectId === projectId && x.date)) {
    const late = m.status === 'upcoming' && m.date < today
    out.push({ id: `m${m.id}`, date: m.date, shape: 'diamond', cls: m.status === 'done' ? 'bg-emerald-500' : m.status === 'missed' || late ? 'bg-red-500' : 'bg-violet-500', tip: `Milestone: ${m.title} · ${fmtDate(m.date)} · ${m.status === 'upcoming' && late ? 'late' : m.status}` })
  }
  for (const m of a.meetings.filter((x) => x.projectId === projectId && x.date && x.status !== 'cancelled')) {
    out.push({ id: `t${m.id}`, date: m.date, shape: 'dot', cls: 'bg-sky-600', tip: `Meeting: ${m.title} · ${fmtDate(m.date)}${m.startTime ? ` ${m.startTime}` : ''}` })
  }
  for (const i of a.invoices.filter((x) => x.projectId === projectId && x.dueDate && x.status !== 'draft')) {
    const st = effectiveStatus(i, today)
    out.push({ id: `i${i.id}`, date: i.dueDate, shape: 'square', cls: st === 'paid' ? 'bg-emerald-500' : st === 'overdue' ? 'bg-red-500' : 'bg-amber-500', tip: `Invoice ${i.number} due ${fmtDate(i.dueDate)} · ${fmtMoney(invoiceTotal(i), curOf(i))} · ${st === 'paid' ? 'paid' : `${fmtMoney(balanceDue(i), curOf(i))} to collect${st === 'overdue' ? ', overdue' : ''}`}` })
  }
  return out
}

interface Props {
  projects: Project[]
  invoices: Invoice[]
  meetings: ProjectMeeting[]
  milestones: Milestone[]
  statuses: StatusDef[]
  onOpen: (projectId: string) => void
}

export function ProjectGantt({ projects, invoices, meetings, milestones, statuses, onOpen }: Props) {
  const today = localToday()
  const scale = useMemo(() => ganttScale(projects.map((p) => ({ start: p.info.startDate, end: p.info.endDate })), today), [projects, today])

  if (projects.length === 0) return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No projects to show yet.</div>

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="min-w-[760px]">
          <GanttHeader scale={scale} />
          {projects.map((p) => {
            const bar = ganttBar(scale, p.info.startDate, p.info.endDate)
            const st = statusStyle(statuses, p.info.health)
            const phase = PHASES.find((x) => x.value === p.info.phase)?.label ?? ''
            const span = p.info.startDate || p.info.endDate ? `${p.info.startDate ? fmtDate(p.info.startDate) : '?'} to ${p.info.endDate ? fmtDate(p.info.endDate) : 'open end'}` : 'No dates set'
            const marks = markersFor(p.id, { invoices, meetings, milestones }, today).filter((m) => scale.inWindow(m.date))
            return (
              <div key={p.id} className="group flex border-b last:border-b-0 hover:bg-muted/30">
                <button type="button" onClick={() => onOpen(p.id)} aria-label={`Open ${p.name}. ${st.label}, ${phase}. ${span}`}
                  className={cn('sticky left-0 z-10 shrink-0 border-r bg-card px-3 py-2 text-left outline-none group-hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', NAME_W)}>
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.info.client || 'No client'}</div>
                </button>
                <div className="relative h-14 flex-1 cursor-pointer" onClick={() => onOpen(p.id)}>
                  <GanttGrid scale={scale} todayLabel={false} />
                  {bar.kind === 'none' && <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground italic">No dates set</span>}
                  {(bar.kind === 'bar' || bar.kind === 'open') && (
                    <div title={`${p.name}: ${span} · ${st.label} · ${phase}${bar.inverted ? ' (end is before start)' : ''}`}
                      className={cn('absolute top-2.5 flex h-5 items-center overflow-hidden rounded px-1.5 text-[10px] font-medium whitespace-nowrap text-white', st.dot, bar.kind === 'open' && '[mask-image:linear-gradient(to_right,black_70%,transparent)]', bar.inverted && 'ring-2 ring-red-500 ring-offset-1')}
                      style={{ left: `${bar.left}%`, width: `${bar.width}%` }}>
                      <span className="truncate drop-shadow-sm">{phase}</span>
                    </div>
                  )}
                  {bar.kind === 'dot' && <span title={`${p.name}: ends ${fmtDate(p.info.endDate)} (no start date)`} className={cn('absolute top-3 size-4 -translate-x-1/2 rounded-full ring-2 ring-card', st.dot)} style={{ left: `${bar.left}%` }} />}
                  {marks.map((m) => (
                    <span key={m.id} title={m.tip} aria-label={m.tip} className="absolute bottom-1.5 z-[6] flex -translate-x-1/2 items-center justify-center" style={{ left: `${scale.pct(m.date)}%` }}>
                      <span className={cn('ring-1 ring-card', SHAPE[m.shape], m.cls)} />
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <Legend statuses={statuses} />
    </div>
  )
}

function Legend({ statuses }: { statuses: StatusDef[] }) {
  const item = (shape: string, label: string) => <span key={label} className="inline-flex items-center gap-1.5"><span className={shape} />{label}</span>
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
      {statuses.map((s) => item(cn('h-2 w-4 rounded-sm', statusStyle(statuses, s.id).dot), s.label))}
      <span className="hidden h-3 border-l sm:inline" />
      {item('size-2.5 rotate-45 bg-violet-500', 'Milestone')}
      {item('size-2.5 rounded-full bg-sky-600', 'Meeting')}
      {item('size-2.5 rounded-[2px] bg-amber-500', 'Invoice due')}
      {item('size-2.5 rounded-[2px] bg-red-500', 'Overdue')}
      {item('size-2.5 rounded-[2px] bg-emerald-500', 'Paid')}
      {item('h-3 border-l-2 border-red-500', 'Today')}
    </div>
  )
}
