import { addDays, daysBetween, localDay, localToday } from '@/lib/billing'
import { curOf, fmtMoney } from '@/lib/money'
import { balanceDue, effectiveStatus, invoiceTotal, lastPaymentDate, receivedTotal, withheldTotal } from '@/lib/pm'
import type { Invoice, Milestone, Project, ProjectMeeting, StatusUpdate } from '@/types'

// ---------- shared ----------

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'
/** Dot / bar background per tone (static strings so Tailwind keeps them). */
export const TONE_BG: Record<Tone, string> = {
  good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500', info: 'bg-sky-500', neutral: 'bg-slate-400',
}
/** Soft badge look per tone, light and dark. */
export const TONE_SOFT: Record<Tone, string> = {
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
}

const isDay = (d: string | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')
const localTime = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? undefined : `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const safeDay = (iso: string) => (Number.isNaN(new Date(iso).getTime()) ? '' : localDay(iso))
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

// ---------- project activity feed ----------

export type EventKind = 'project' | 'milestone' | 'update' | 'meeting' | 'invoice'

export interface TimelineEvent {
  id: string
  date: string // yyyy-mm-dd
  time?: string // HH:mm
  kind: EventKind
  title: string
  detail?: string
  tone: Tone
  link?: { type: EventKind; id: string }
  attendees?: string[]
  decisions?: string
  health?: string // status update: health id
}

export interface ProjectTimelineInput {
  project: Pick<Project, 'id' | 'name' | 'info'>
  milestones: Milestone[]
  updates: StatusUpdate[]
  meetings: ProjectMeeting[]
  invoices: Invoice[]
}

const byDate = (a: { date: string; time?: string }, b: { date: string; time?: string }) =>
  a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')

/** Meetings of one project that count (not cancelled), oldest first. Index + 1 is the "Meeting #n". */
export function countedMeetings(meetings: ProjectMeeting[], projectId: string): ProjectMeeting[] {
  return meetings
    .filter((m) => m.projectId === projectId && m.status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.createdAt.localeCompare(b.createdAt))
}

export interface MeetingSummary { held: number; upcoming: number; cancelled: number; first: string; last: string; next: string }

/** "N meetings so far": non-cancelled meetings that were held or whose date has come. */
export function meetingSummary(meetings: ProjectMeeting[], projectId: string, today = localToday()): MeetingSummary {
  const counted = countedMeetings(meetings, projectId)
  const isHeld = (m: ProjectMeeting) => m.status === 'held' || m.date <= today
  const held = counted.filter(isHeld)
  const upcoming = counted.filter((m) => !isHeld(m))
  return {
    held: held.length, upcoming: upcoming.length,
    cancelled: meetings.filter((m) => m.projectId === projectId && m.status === 'cancelled').length,
    first: held[0]?.date ?? '', last: held[held.length - 1]?.date ?? '', next: upcoming[0]?.date ?? '',
  }
}

const healthTone = (h: string): Tone => (h === 'on_track' ? 'good' : h === 'at_risk' ? 'warn' : h === 'off_track' ? 'bad' : h === 'done' ? 'info' : 'neutral')

export function projectEvents(projectId: string, input: ProjectTimelineInput, today = localToday()): TimelineEvent[] {
  const { project, milestones, updates, meetings, invoices } = input
  const out: TimelineEvent[] = []

  if (isDay(project.info.startDate)) out.push({ id: `pj-start`, date: project.info.startDate, kind: 'project', title: 'Project start', tone: 'info' })
  if (isDay(project.info.endDate)) out.push({ id: `pj-end`, date: project.info.endDate, kind: 'project', title: 'Planned end', tone: project.info.endDate <= today ? 'neutral' : 'info' })

  for (const m of milestones.filter((x) => x.projectId === projectId && isDay(x.date))) {
    const late = m.status === 'upcoming' && m.date < today
    out.push({
      id: `ms-${m.id}`, date: m.date, kind: 'milestone', tone: m.status === 'done' ? 'good' : m.status === 'missed' || late ? 'bad' : 'info',
      title: `Milestone ${m.status === 'done' ? 'reached' : m.status === 'missed' ? 'missed' : late ? 'late' : 'due'}: ${m.title}`,
      detail: [m.owner && `Owner: ${m.owner}`, m.notes].filter(Boolean).join('\n') || undefined, link: { type: 'milestone', id: m.id },
    })
  }

  for (const u of updates.filter((x) => x.projectId === projectId && isDay(x.date))) {
    out.push({
      id: `su-${u.id}`, date: u.date, kind: 'update', tone: healthTone(u.health), health: u.health, title: `Status update${u.author ? ` by ${u.author}` : ''}`,
      detail: u.summary || undefined, link: { type: 'update', id: u.id },
    })
  }

  const counted = countedMeetings(meetings, projectId)
  for (const m of meetings.filter((x) => x.projectId === projectId && isDay(x.date))) {
    const n = counted.indexOf(m) + 1
    const cancelled = m.status === 'cancelled'
    const upcoming = !cancelled && m.status !== 'held' && m.date > today
    out.push({
      id: `mt-${m.id}`, date: m.date, time: m.startTime || undefined, kind: 'meeting', tone: cancelled ? 'neutral' : upcoming ? 'info' : 'good',
      title: cancelled ? `Cancelled: ${m.title}` : `Meeting #${n}: ${m.title}${upcoming ? ' (planned)' : ''}`,
      detail: m.summary || undefined, decisions: m.decisions || undefined, attendees: m.attendees.length ? m.attendees : undefined,
      link: { type: 'meeting', id: m.id },
    })
  }

  for (const inv of invoices.filter((x) => x.projectId === projectId)) {
    const cur = curOf(inv)
    const total = fmtMoney(invoiceTotal(inv), cur)
    const link = { type: 'invoice' as const, id: inv.id }
    if (inv.status === 'draft') continue
    if (isDay(inv.issueDate)) out.push({ id: `iv-${inv.id}-issued`, date: inv.issueDate, kind: 'invoice', tone: 'info', title: `Invoice ${inv.number} issued`, detail: total, link })
    const sentDay = inv.sentAt ? safeDay(inv.sentAt) : ''
    if (sentDay) out.push({ id: `iv-${inv.id}-sent`, date: sentDay, time: localTime(inv.sentAt), kind: 'invoice', tone: 'info', title: `Invoice ${inv.number} emailed`, detail: inv.clientEmail || undefined, link })
    for (const p of inv.payments ?? []) {
      if (!isDay(p.date)) continue
      const tax = p.withheld > 0 ? ` (+ ${fmtMoney(p.withheld, cur)} tax withheld)` : ''
      out.push({ id: `iv-${inv.id}-pay-${p.id}`, date: p.date, kind: 'invoice', tone: 'good', title: `Invoice ${inv.number}: payment received`, detail: `${fmtMoney(p.amount, cur)}${tax}${p.note ? `\n${p.note}` : ''}`, link })
    }
    const paid = inv.status === 'paid' || (inv.payments?.length && balanceDue(inv) === 0)
    if (paid) out.push({ id: `iv-${inv.id}-paid`, date: lastPaymentDate(inv) || inv.dueDate || inv.issueDate, kind: 'invoice', tone: 'good', title: `Invoice ${inv.number} paid in full`, detail: total, link })
    else if (isDay(inv.dueDate)) {
      if (effectiveStatus(inv, today) === 'overdue') out.push({ id: `iv-${inv.id}-overdue`, date: inv.dueDate, kind: 'invoice', tone: 'bad', title: `Invoice ${inv.number} overdue since this date`, detail: `${plural(daysBetween(inv.dueDate, today), 'day')} late, ${fmtMoney(balanceDue(inv), cur)} still due`, link })
      else out.push({ id: `iv-${inv.id}-due`, date: inv.dueDate, kind: 'invoice', tone: 'neutral', title: `Invoice ${inv.number} due`, detail: `${fmtMoney(balanceDue(inv), cur)} to collect`, link })
    }
  }

  return out.map((e, i) => ({ e, i })).sort((a, b) => byDate(a.e, b.e) || a.i - b.i).map((x) => x.e)
}

// ---------- one invoice's lifecycle ----------

export type StepState = 'done' | 'current' | 'upcoming' | 'late'
export interface InvoiceStep {
  id: string
  label: string
  date: string // '' when unknown
  time?: string
  state: StepState
  detail?: string
  received?: string // formatted money that landed
  withheld?: string // formatted tax withheld (PPh)
  balance?: string // formatted balance still due after this step
}

export function invoiceSteps(inv: Invoice, today = localToday()): InvoiceStep[] {
  const cur = curOf(inv)
  const m = (n: number) => fmtMoney(n, cur)
  const total = invoiceTotal(inv)
  const draft = inv.status === 'draft'
  const balance = balanceDue(inv)
  const payments = [...(inv.payments ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const fullyPaid = !draft && (inv.status === 'paid' || (payments.length > 0 && balance === 0))
  const daysLate = !draft && !fullyPaid && isDay(inv.dueDate) && today > inv.dueDate ? daysBetween(inv.dueDate, today) : 0
  const steps: InvoiceStep[] = []

  steps.push({ id: 'issued', label: draft ? 'Draft created' : 'Issued', date: inv.issueDate, state: draft ? 'current' : 'done', detail: `Total ${m(total)}` })
  const sentDay = inv.sentAt ? safeDay(inv.sentAt) : ''
  if (sentDay) steps.push({ id: 'emailed', label: 'Emailed to client', date: sentDay, time: localTime(inv.sentAt), state: 'done', detail: inv.clientEmail || undefined })
  else if (draft) steps.push({ id: 'emailed', label: 'Not emailed yet', date: '', state: 'upcoming' })

  // Due date and payments in the order they happen; a payment on the due date comes first.
  type Mid = { date: string; rank: number; step: InvoiceStep }
  const mid: Mid[] = []
  if (isDay(inv.dueDate)) {
    const diff = daysBetween(today, inv.dueDate)
    mid.push({
      date: inv.dueDate, rank: 1,
      step: { id: 'due', label: 'Due date', date: inv.dueDate, state: fullyPaid ? 'done' : daysLate > 0 ? 'late' : 'upcoming', detail: fullyPaid || draft ? undefined : diff > 0 ? `In ${plural(diff, 'day')}` : diff === 0 ? 'Due today' : `${plural(-diff, 'day')} ago` },
    })
  }
  let running = total
  for (const p of payments) {
    running = Math.max(0, running - p.amount - p.withheld)
    mid.push({
      date: p.date, rank: 0,
      step: { id: `pay-${p.id}`, label: 'Payment received', date: p.date, state: 'done', received: m(p.amount), withheld: p.withheld > 0 ? m(p.withheld) : undefined, detail: p.note || undefined, balance: running > 0 ? m(running) : undefined },
    })
  }
  mid.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank)
  steps.push(...mid.map((x) => x.step))

  if (draft) steps.push({ id: 'result', label: 'Paid in full', date: '', state: 'upcoming' })
  else if (fullyPaid) steps.push({ id: 'result', label: 'Paid in full', date: lastPaymentDate(inv) || inv.dueDate, state: 'done', detail: payments.length ? `Received ${m(receivedTotal(inv))}${withheldTotal(inv) > 0 ? ` + ${m(withheldTotal(inv))} tax withheld` : ''}` : undefined })
  else {
    const partial = payments.length > 0
    steps.push({
      id: 'result', date: '', state: daysLate > 0 ? 'late' : 'current', balance: m(balance),
      label: daysLate > 0 ? `Overdue by ${plural(daysLate, 'day')}` : partial ? 'Partially paid' : 'Awaiting payment',
      detail: partial && daysLate > 0 ? 'Partially paid' : undefined,
    })
  }
  return steps
}

// ---------- gantt scale ----------

export interface GanttRow { start?: string; end?: string }
export interface GanttTick { date: string; label: string; pct: number }
export interface GanttScale {
  start: string
  end: string
  days: number
  ticks: GanttTick[]
  /** date -> 0..100 (clamped to the window) */
  pct: (date: string) => number
  inWindow: (date: string) => boolean
  todayPct: number | null
  clipped: boolean
}

const MIN_DAYS = 92
const MAX_DAYS = 5 * 366
const monthStart = (d: string) => `${d.slice(0, 7)}-01`
const nextMonth = (d: string) => { const y = +d.slice(0, 4), mo = +d.slice(5, 7); return mo === 12 ? `${y + 1}-01-01` : `${y}-${pad(mo + 1)}-01` }

export function ganttScale(rows: GanttRow[], today = localToday()): GanttScale {
  const dates = rows.flatMap((r) => [r.start, r.end]).filter(isDay).sort()
  let start: string, end: string, clipped = false
  if (dates.length === 0) { start = addDays(today, -30); end = addDays(today, 60) }
  else {
    const pad2 = Math.max(7, Math.round(daysBetween(dates[0], dates[dates.length - 1]) * 0.03))
    start = addDays(dates[0], -pad2); end = addDays(dates[dates.length - 1], pad2)
    if (daysBetween(start, end) > MAX_DAYS) {
      // Many years: keep a window around today when it is inside the data, else the start of it.
      clipped = true
      const from = today > start && today < end ? addDays(today, -365) : start
      start = from < start ? start : from
      end = addDays(start, MAX_DAYS)
    }
  }
  if (daysBetween(start, end) < MIN_DAYS) end = addDays(start, MIN_DAYS)
  // Snap to whole months so the header lines up.
  start = monthStart(start)
  end = nextMonth(monthStart(end))
  const days = Math.max(1, daysBetween(start, end))

  const span = days
  const step = span <= 400 ? 1 : span <= 1100 ? 3 : 12
  const ticks: GanttTick[] = []
  for (let d = start; d < end; ) {
    const mo = +d.slice(5, 7)
    if (step === 1 || (step === 3 && (mo - 1) % 3 === 0) || (step === 12 && mo === 1) || d === start) {
      ticks.push({ date: d, pct: (daysBetween(start, d) / days) * 100, label: step === 12 ? d.slice(0, 4) : `${MONTHS[mo - 1]}${mo === 1 || d === start ? ` ${d.slice(2, 4)}` : ''}` })
    }
    d = nextMonth(d)
  }
  const pct = (date: string) => Math.min(100, Math.max(0, (daysBetween(start, date) / days) * 100))
  const inWindow = (date: string) => isDay(date) && date >= start && date <= end
  return { start, end, days, ticks, pct, inWindow, todayPct: inWindow(today) ? pct(today) : null, clipped }
}

export interface GanttBar {
  kind: 'bar' | 'open' | 'dot' | 'none'
  left: number // %
  width: number // %, 0 for dots
  inverted: boolean // end was before start, the dates were swapped
  clippedStart: boolean
  clippedEnd: boolean
}

/** Where to draw a start..end span: bar, open-ended bar (no end), dot (no start) or nothing. */
export function ganttBar(scale: GanttScale, startIn?: string, endIn?: string): GanttBar {
  let start = isDay(startIn) ? startIn : '', end = isDay(endIn) ? endIn : ''
  const none: GanttBar = { kind: 'none', left: 0, width: 0, inverted: false, clippedStart: false, clippedEnd: false }
  if (!start && !end) return none
  let inverted = false
  if (start && end && end < start) { [start, end] = [end, start]; inverted = true }
  if (!start) return scale.inWindow(end) ? { ...none, kind: 'dot', left: scale.pct(end) } : none
  if (start > scale.end || (end && end < scale.start)) return none
  const left = scale.pct(start)
  if (!end) return { ...none, kind: 'open', left, width: 100 - left, clippedStart: start < scale.start }
  return { kind: 'bar', left, width: Math.max(0.6, scale.pct(end) - left), inverted, clippedStart: start < scale.start, clippedEnd: end > scale.end }
}
