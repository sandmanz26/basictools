import type { Project, Schedule } from '@/types'
import { repeatLabel } from '@/lib/billing'

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const compact = (d: string) => d.replace(/-/g, '')
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** First calendar date on/after `start` that matches the schedule (RFC 5545 needs DTSTART to be an actual occurrence). */
function firstDate(s: Schedule, occ: string | undefined): string {
  return occ ?? s.startDate
}

function rrule(s: Schedule): string {
  const until = s.endDate ? `;UNTIL=${compact(s.endDate)}` : ''
  switch (s.frequency) {
    case 'weekly': return `FREQ=WEEKLY;BYDAY=${DAYS[s.weekday ?? new Date(s.startDate + 'T00:00:00').getDay()]}${until}`
    case 'biweekly': return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${DAYS[s.weekday ?? new Date(s.startDate + 'T00:00:00').getDay()]}${until}`
    case 'monthly': return `FREQ=MONTHLY;BYMONTHDAY=${s.day === 0 ? -1 : s.day}${until}`
    case 'quarterly': return `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${s.day === 0 ? -1 : s.day}${until}`
    case 'yearly': return `FREQ=YEARLY${until}`
    default: return ''
  }
}

/**
 * Calendar file (.ics) with one repeating all-day event per active schedule and alarms
 * (on the day and N days before), so reminders reach Google / Outlook / Apple Calendar even when this app is closed.
 */
export function schedulesToIcs(list: Schedule[], projects: Project[], firstOccurrence: (s: Schedule) => string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HireFlow//Billing reminders//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Billing reminders']
  for (const s of list.filter((x) => x.active)) {
    const start = firstDate(s, firstOccurrence(s))
    if (!start) continue
    const project = projects.find((p) => p.id === s.projectId)?.name
    const verb = s.kind === 'receivable' ? 'Release invoice' : 'Pay bill'
    const summary = `${verb}: ${[s.party, s.title].filter(Boolean).join(' – ')}`
    const desc = [
      project && `Project: ${project}`, s.amount != null && `Amount: Rp ${s.amount.toLocaleString('id-ID')}`, s.pic && `PIC: ${s.pic}`,
      s.frequency !== 'once' && `Repeats: ${repeatLabel(s)}`, s.kind === 'receivable' && `Client pays within ${s.termDays} days`, s.notes,
    ].filter(Boolean).join('\n')
    const next = new Date(start + 'T00:00:00')
    next.setDate(next.getDate() + 1)
    const end = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`
    lines.push(
      'BEGIN:VEVENT', `UID:${s.id}@hireflow`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${end}`,
      ...(rrule(s) ? [`RRULE:${rrule(s)}`] : []), `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'TRIGGER:PT9H', 'END:VALARM', // 09:00 on the day
    )
    if (s.leadDays > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`In ${s.leadDays} days – ${summary}`)}`, `TRIGGER:-P${s.leadDays}DT15H`, 'END:VALARM') // 09:00, N days before
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadIcs(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}


