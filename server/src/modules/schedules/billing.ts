// Server port of the calendar maths in the frontend src/lib/billing.ts.
import type { Frequency } from './schemas.js'

export interface ScheduleDates {
  frequency: Frequency
  day: number
  weekday: number | null
  startDate: string
  endDate: string | null
  active: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-based
const dim = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const utc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))

export const addDays = (d: string, n: number) => {
  const x = new Date(utc(d) + n * 864e5)
  return ymd(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate())
}
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 864e5)
const weekdayOf = (s: ScheduleDates) => s.weekday ?? new Date(utc(s.startDate)).getUTCDay()

/** Dates (yyyy-mm-dd) a schedule falls on within [from, to], inclusive. */
export function occurrenceDates(s: ScheduleDates, from: string, to: string): string[] {
  if (!s.active || !s.startDate) return []
  const end = s.endDate && s.endDate < to ? s.endDate : to
  if (s.frequency === 'once') return s.startDate >= from && s.startDate <= end ? [s.startDate] : []
  if (s.frequency === 'weekly' || s.frequency === 'biweekly') {
    const step = s.frequency === 'weekly' ? 7 : 14
    let d = addDays(s.startDate, (weekdayOf(s) - new Date(utc(s.startDate)).getUTCDay() + 7) % 7)
    if (d < from) d = addDays(d, Math.floor(daysBetween(d, from) / step) * step)
    const out: string[] = []
    for (let i = 0; i < 3000 && d <= end; i++, d = addDays(d, step)) if (d >= from) out.push(d)
    return out
  }
  const step = s.frequency === 'monthly' ? 1 : s.frequency === 'quarterly' ? 3 : 12
  let y = +s.startDate.slice(0, 4)
  let m = +s.startDate.slice(5, 7) - 1
  const out: string[] = []
  for (let i = 0; i < 1200; i++) {
    const date = ymd(y, m, s.day === 0 ? dim(y, m) : Math.min(s.day, dim(y, m)))
    if (date > end) break
    if (date >= from && date >= s.startDate) out.push(date)
    m += step
    while (m > 11) {
      m -= 12
      y++
    }
  }
  return out
}

/** Human label for the period an occurrence covers, printed on recurring invoices. */
export function periodLabel(frequency: Frequency, date: string): string {
  const d = new Date(utc(date))
  const month = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (frequency === 'monthly') return month
  if (frequency === 'quarterly') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
  if (frequency === 'yearly') return String(d.getUTCFullYear())
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const end = new Date(utc(addDays(date, frequency === 'weekly' ? 6 : 13)))
    const f = (x: Date) => x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    return `${f(d)} – ${f(end)} ${end.getUTCFullYear()}`
  }
  return ''
}
