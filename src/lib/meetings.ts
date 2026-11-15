import { localDay } from '@/lib/billing'
import type { Meeting } from '@/lib/microsoft'
import type { ProjectMeeting } from '@/types'
import { nanoid } from 'nanoid'

const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

/** Local date + time (yyyy-mm-dd, HH:mm) to a UTC ISO string for Outlook. */
export const toUtcIso = (date: string, time: string) => new Date(`${date}T${time || '09:00'}:00`).toISOString()

/** An Outlook event as a project meeting record (notes are filled in by the user afterwards). */
export function meetingFromOutlook(m: Meeting, projectId: string, by: string, now = Date.now()): ProjectMeeting {
  return {
    id: 'mt-' + nanoid(6), projectId, title: m.subject, date: localDay(m.start), startTime: hhmm(m.start), endTime: hhmm(m.end),
    attendees: [m.organizer, ...m.attendees].filter((a, i, all) => a.address && all.findIndex((b) => b.address === a.address) === i).map((a) => a.name || a.address),
    summary: '', decisions: '', location: m.location, joinUrl: m.joinUrl, outlookId: m.id,
    status: m.cancelled ? 'cancelled' : new Date(m.end).getTime() <= now ? 'held' : 'planned', createdBy: by, createdAt: new Date().toISOString(),
  }
}

/** "Meeting #n" for each non-cancelled meeting of a project, oldest = #1. */
export function meetingNumbers(list: ProjectMeeting[]): Record<string, number> {
  const live = list.filter((m) => m.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.createdAt.localeCompare(b.createdAt))
  return Object.fromEntries(live.map((m, i) => [m.id, i + 1]))
}

/** A planned meeting whose day has passed and that has no notes yet: someone should write them up. */
export const needsNotes = (m: ProjectMeeting, today: string) => m.status === 'planned' && m.date < today || (m.status === 'held' && !m.summary.trim() && !m.decisions.trim())
