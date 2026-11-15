import { useMemo, useState } from 'react'
import { ArrowDownUp, CalendarCheck, FileText, Flag, Megaphone, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import { fmtDate } from '@/lib/constants'
import { localToday } from '@/lib/billing'
import { meetingSummary, projectEvents, TONE_BG, type EventKind, type TimelineEvent } from '@/lib/timeline'
import { HealthBadge } from '@/components/pm/ui'

type Chip = 'meeting' | 'invoice' | 'milestone' | 'update'
const CHIPS: { id: Chip; label: string; icon: typeof Users }[] = [
  { id: 'meeting', label: 'Meetings', icon: Users },
  { id: 'invoice', label: 'Invoices', icon: FileText },
  { id: 'milestone', label: 'Milestones', icon: Flag },
  { id: 'update', label: 'Updates', icon: Megaphone },
]
const ICON: Record<EventKind, typeof Users> = { meeting: Users, invoice: FileText, milestone: Flag, update: Megaphone, project: CalendarCheck }
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthLabel = (d: string) => `${MONTH_LONG[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`

/** Text clipped to two lines with a toggle; short text shows as is. */
function Clamp({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 140 || text.split('\n').length > 2
  return (
    <div className="text-xs text-muted-foreground">
      {label && <span className="font-medium text-foreground">{label}: </span>}
      <span className={cn('break-words whitespace-pre-line', long && !open && 'line-clamp-2')}>{text}</span>
      {long && <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="ml-1 text-primary underline-offset-2 hover:underline focus-visible:underline">{open ? 'Show less' : 'Show more'}</button>}
    </div>
  )
}

function EventRow({ e, today }: { e: TimelineEvent; today: string }) {
  const Icon = ICON[e.kind]
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden />
      <span className={cn('relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full text-white', TONE_BG[e.tone])}><Icon className="size-3.5" /></span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{e.title}</span>
          {e.health && <HealthBadge health={e.health} />}
          <span className="text-xs text-muted-foreground">{fmtDate(e.date)}{e.time ? ` · ${e.time}` : ''}{e.date > today ? ' · upcoming' : ''}</span>
        </div>
        {e.attendees && <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Attended: </span>{e.attendees.join(', ')}</div>}
        {e.detail && <Clamp text={e.detail} label={e.kind === 'meeting' ? 'Discussed' : undefined} />}
        {e.decisions && <Clamp text={e.decisions} label="Decisions" />}
      </div>
    </li>
  )
}

export function ProjectActivity({ projectId }: { projectId: string }) {
  const project = useStore((s) => s.projects.find((p) => p.id === projectId))
  const milestones = useStore((s) => s.milestones)
  const updates = useStore((s) => s.updates)
  const meetings = useStore((s) => s.projectMeetings)
  const invoices = useStore((s) => s.invoices)
  const [newestFirst, setNewestFirst] = useState(true)
  const [off, setOff] = useState<Set<Chip>>(new Set())
  const today = localToday()

  const events = useMemo(
    () => (project ? projectEvents(projectId, { project, milestones, updates, meetings, invoices }, today) : []),
    [project, projectId, milestones, updates, meetings, invoices, today],
  )
  const sum = useMemo(() => meetingSummary(meetings, projectId, today), [meetings, projectId, today])
  const shown = useMemo(() => {
    const list = events.filter((e) => e.kind === 'project' || !off.has(e.kind as Chip))
    return newestFirst ? [...list].reverse() : list
  }, [events, off, newestFirst])
  const groups = useMemo(() => {
    const g: { month: string; items: TimelineEvent[] }[] = []
    for (const e of shown) {
      const m = monthLabel(e.date)
      if (g[g.length - 1]?.month === m) g[g.length - 1].items.push(e)
      else g.push({ month: m, items: [e] })
    }
    return g
  }, [shown])

  if (!project) return null
  const toggle = (c: Chip) => setOff((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n })

  return (
    <div className="space-y-3">
      <p className="text-sm" aria-live="polite">
        <b>{sum.held} {sum.held === 1 ? 'meeting' : 'meetings'} so far</b>
        {sum.held > 0 && <span className="text-muted-foreground"> · first {fmtDate(sum.first)}, latest {fmtDate(sum.last)}</span>}
        {sum.upcoming > 0 && <span className="text-muted-foreground"> · {sum.upcoming} planned{sum.next ? `, next ${fmtDate(sum.next)}` : ''}</span>}
        {sum.cancelled > 0 && <span className="text-muted-foreground"> · {sum.cancelled} cancelled</span>}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {CHIPS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={!off.has(id)} onClick={() => toggle(id)}
            className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring', off.has(id) ? 'text-muted-foreground line-through' : 'border-primary/40 bg-primary/10 text-foreground')}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
        <button type="button" onClick={() => setNewestFirst(!newestFirst)} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
          <ArrowDownUp className="size-3.5" />{newestFirst ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {groups.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing to show for this filter.</div>}
      {groups.map((g) => (
        <section key={g.month}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.month}</h3>
          <ol>{g.items.map((e) => <EventRow key={e.id} e={e} today={today} />)}</ol>
        </section>
      ))}
    </div>
  )
}
