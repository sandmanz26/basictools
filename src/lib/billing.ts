import type { Project, Schedule, ScheduleEvent } from '@/types'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

/** Today in the user's own timezone (toISOString would be off by a day early morning in WIB). */
export const localToday = () => { const n = new Date(); return ymd(n.getFullYear(), n.getMonth(), n.getDate()) }
export const addDays = (d: string, n: number) => { const x = new Date(utc(d) + n * 864e5); return ymd(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) }
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 864e5)

export const FREQUENCY: Record<Schedule['frequency'], string> = { once: 'One time', monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly' }
export const dayLabel = (s: Schedule) => (s.frequency === 'once' ? '' : s.day === 0 ? 'end of month' : `day ${s.day}`)
export const repeatLabel = (s: Schedule) => (s.frequency === 'once' ? 'One time' : `${FREQUENCY[s.frequency]} · ${dayLabel(s)}`)
export const eventKey = (scheduleId: string, date: string) => `${scheduleId}:${date}`

/** Dates (yyyy-mm-dd) a schedule falls on within [from, to], inclusive. */
export function occurrenceDates(s: Schedule, from: string, to: string): string[] {
  if (!s.active || !s.startDate) return []
  const end = s.endDate && s.endDate < to ? s.endDate : to
  if (s.frequency === 'once') return s.startDate >= from && s.startDate <= end ? [s.startDate] : []
  const step = s.frequency === 'monthly' ? 1 : s.frequency === 'quarterly' ? 3 : 12
  let y = +s.startDate.slice(0, 4), m = +s.startDate.slice(5, 7) - 1
  const out: string[] = []
  for (let i = 0; i < 1200; i++) {
    const date = ymd(y, m, s.day === 0 ? dim(y, m) : Math.min(s.day, dim(y, m)))
    if (date > end) break
    if (date >= from && date >= s.startDate) out.push(date)
    m += step
    while (m > 11) { m -= 12; y++ }
  }
  return out
}

export type AgendaKind = 'release' | 'collect' | 'pay' | 'project_start' | 'project_end'
export type AgendaState = 'overdue' | 'today' | 'soon' | 'later'

export interface AgendaItem {
  key: string
  kind: AgendaKind
  date: string // the date the action is due
  state: AgendaState
  daysLeft: number // negative = days overdue
  title: string
  party: string
  projectId: string
  amount: number | null
  pic: string
  schedule?: Schedule
  scheduleDate?: string // occurrence date, for the event key
  event?: ScheduleEvent
}

export const KIND_META: Record<AgendaKind, { label: string; tone: string }> = {
  release: { label: 'Release invoice', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  collect: { label: 'Awaiting payment', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  pay: { label: 'Pay bill', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  project_start: { label: 'Project starts', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  project_end: { label: 'Project ends', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
}

const LOOKBACK = 45 // older unfinished items are ignored so a freshly entered old schedule doesn't flood the list

/** Everything that needs attention from `today` on, soonest first. */
export function buildAgenda(
  schedules: Schedule[], events: Record<string, ScheduleEvent>, projects: Project[], today: string, horizonDays = 60,
): AgendaItem[] {
  const out: AgendaItem[] = []
  const from = addDays(today, -LOOKBACK), to = addDays(today, horizonDays)
  const stateOf = (date: string, lead: number): { state: AgendaState; daysLeft: number } => {
    const daysLeft = daysBetween(today, date)
    return { daysLeft, state: daysLeft < 0 ? 'overdue' : daysLeft === 0 ? 'today' : daysLeft <= lead ? 'soon' : 'later' }
  }

  for (const s of schedules) {
    // Look back far enough that a collect date (issued + term) is still found
    for (const date of occurrenceDates(s, s.kind === 'receivable' ? addDays(from, -s.termDays - 31) : from, to)) {
      const key = eventKey(s.id, date)
      const ev = events[key]
      if (ev?.skipped) continue
      const base = { key, projectId: s.projectId, pic: s.pic, party: s.party, title: s.title, schedule: s, scheduleDate: date, event: ev }
      if (s.kind === 'payable') {
        if (ev?.paidAt || date < from) continue
        out.push({ ...base, kind: 'pay', date, amount: s.amount, ...stateOf(date, s.leadDays) })
      } else if (!ev?.issuedAt) {
        if (date < from) continue
        out.push({ ...base, kind: 'release', date, amount: s.amount, ...stateOf(date, s.leadDays) })
      } else if (!ev.paidAt) {
        const due = addDays(ev.issuedAt, s.termDays)
        if (due < from) continue
        out.push({ ...base, kind: 'collect', date: due, amount: s.amount, ...stateOf(due, 3) })
      }
    }
  }

  for (const p of projects) {
    if (p.status !== 'active') continue
    const info = p.info
    for (const [kind, date, label] of [['project_start', info.startDate, 'Project starts'], ['project_end', info.endDate, 'Project ends']] as const) {
      if (!date || date < today || date > addDays(today, 30)) continue
      out.push({ key: `${p.id}:${kind}`, kind, date, title: label, party: info.client, projectId: p.id, amount: null, pic: info.manager, ...stateOf(date, 7) })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** Items that should be on someone's radar right now. */
export const needsAction = (a: AgendaItem[]) => a.filter((x) => (x.state !== 'later') && x.kind !== 'project_start' && x.kind !== 'project_end')

export const nextOccurrence = (s: Schedule, today: string) => occurrenceDates(s, today, addDays(today, 800))[0] ?? ''
