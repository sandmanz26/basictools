import { describe, expect, it } from 'vitest'
import { countedMeetings, ganttBar, ganttScale, invoiceSteps, meetingSummary, projectEvents } from '@/lib/timeline'
import type { Invoice, Milestone, ProjectMeeting, StatusUpdate } from '@/types'

const TODAY = '2026-11-16'
const inv = (p: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', projectId: 'p', number: 'INV-1', clientName: 'C', clientEmail: 'c@x.com', issueDate: '2026-10-01', dueDate: '2026-10-15',
  items: [{ id: 'a', description: 'x', qty: 1, unitPrice: 1000 }] as Invoice['items'], taxPct: 10, status: 'sent', notes: '', sentAt: '', ...p,
})
const mtg = (p: Partial<ProjectMeeting>): ProjectMeeting => ({
  id: 'm', projectId: 'p', title: 'Sync', date: '2026-11-01', startTime: '', endTime: '', attendees: [], summary: '', decisions: '', location: '', joinUrl: '',
  outlookId: '', status: 'held', createdBy: '', createdAt: '2026-10-01T00:00:00Z', ...p,
})
const project = { id: 'p', name: 'P', info: { startDate: '2026-09-01', endDate: '2026-12-31' } as never }

describe('invoiceSteps', () => {
  it('draft: nothing happened yet', () => {
    const s = invoiceSteps(inv({ status: 'draft' }), TODAY)
    expect(s[0]).toMatchObject({ label: 'Draft created', state: 'current' })
    expect(s.at(-1)).toMatchObject({ label: 'Paid in full', state: 'upcoming' })
  })
  it('overdue with no payment shows days late', () => {
    const s = invoiceSteps(inv({ sentAt: '2026-10-02T03:00:00Z' }), TODAY)
    expect(s.find((x) => x.id === 'emailed')?.state).toBe('done')
    expect(s.find((x) => x.id === 'due')?.state).toBe('late')
    expect(s.at(-1)).toMatchObject({ state: 'late', label: 'Overdue by 32 days' })
  })
  it('partial payment with withholding keeps a balance', () => {
    const s = invoiceSteps(inv({ currency: 'USD', dueDate: '2026-12-01', payments: [{ id: 'p1', date: '2026-11-05', amount: 500, withheld: 20, note: '' }] }), TODAY)
    const pay = s.find((x) => x.id === 'pay-p1')!
    expect(pay.received).toBe('US$ 500.00')
    expect(pay.withheld).toBe('US$ 20.00')
    expect(pay.balance).toBe('US$ 580.00')
    expect(s.at(-1)).toMatchObject({ label: 'Partially paid', state: 'current', balance: 'US$ 580.00' })
  })
  it('paid in full, and payments come before the due date step when same day', () => {
    const s = invoiceSteps(inv({ status: 'paid', dueDate: '2026-10-15', payments: [{ id: 'p1', date: '2026-10-15', amount: 1100, withheld: 0, note: '' }] }), TODAY)
    expect(s.map((x) => x.id)).toEqual(['issued', 'pay-p1', 'due', 'result'])
    expect(s.at(-1)).toMatchObject({ label: 'Paid in full', state: 'done', date: '2026-10-15' })
    expect(s.find((x) => x.id === 'due')?.state).toBe('done')
  })
  it('missing currency is rupiah', () => {
    expect(invoiceSteps(inv(), TODAY)[0].detail).toBe('Total Rp 1.100')
  })
})

describe('projectEvents', () => {
  const milestones: Milestone[] = [{ id: 'ms', projectId: 'p', title: 'Beta', date: '2026-10-10', status: 'done', owner: 'A', notes: '' }, { id: 'o', projectId: 'other', title: 'X', date: '2026-10-10', status: 'done', owner: '', notes: '' }]
  const updates: StatusUpdate[] = [{ id: 'u', projectId: 'p', date: '2026-10-20', author: 'Bo', health: 'at_risk', summary: 'Late', highlights: '', blockers: '', nextSteps: '' }]
  it('is chronological, scoped to the project and numbers meetings without cancelled ones', () => {
    const meetings = [mtg({ id: 'b', date: '2026-11-10' }), mtg({ id: 'a', date: '2026-11-01' }), mtg({ id: 'x', date: '2026-11-05', status: 'cancelled' }), mtg({ id: 'f', date: '2026-11-30', status: 'planned' })]
    const ev = projectEvents('p', { project, milestones, updates, meetings, invoices: [inv({ sentAt: '2026-10-02T03:00:00Z', payments: [{ id: 'p1', date: '2026-10-20', amount: 400, withheld: 0, note: '' }] })] }, TODAY)
    expect([...ev].sort((a, b) => a.date.localeCompare(b.date))).toEqual(ev)
    expect(ev.some((e) => e.id === 'ms-o')).toBe(false)
    expect(ev.find((e) => e.id === 'mt-a')?.title).toBe('Meeting #1: Sync')
    expect(ev.find((e) => e.id === 'mt-b')?.title).toBe('Meeting #2: Sync')
    expect(ev.find((e) => e.id === 'mt-f')?.title).toBe('Meeting #3: Sync (planned)')
    expect(ev.find((e) => e.id === 'mt-x')?.title).toBe('Cancelled: Sync')
    expect(ev.find((e) => e.id === 'iv-i1-overdue')?.date).toBe('2026-10-15')
    expect(ev.find((e) => e.id === 'iv-i1-pay-p1')?.tone).toBe('good')
    expect(ev.find((e) => e.id === 'iv-i1-sent')?.kind).toBe('invoice')
  })
  it('skips drafts and blank dates; paid invoices emit a paid event instead of overdue', () => {
    const noDates = { ...project, info: { startDate: '', endDate: '' } as never }
    const ev = projectEvents('p', { project: noDates, milestones: [], updates: [], meetings: [], invoices: [inv({ status: 'draft' }), inv({ id: 'i2', status: 'paid', payments: [{ id: 'q', date: '2026-10-12', amount: 1100, withheld: 0, note: '' }] })] }, TODAY)
    expect(ev.map((e) => e.id)).toEqual(['iv-i2-issued', 'iv-i2-pay-q', 'iv-i2-paid'])
  })
})

describe('meetings', () => {
  it('counts held meetings so far', () => {
    const list = [mtg({ id: '1', date: '2026-11-01' }), mtg({ id: '2', date: '2026-11-10', status: 'planned' }), mtg({ id: '3', date: '2026-12-01', status: 'planned' }), mtg({ id: '4', status: 'cancelled' }), mtg({ id: '5', projectId: 'z' })]
    expect(countedMeetings(list, 'p')).toHaveLength(3)
    expect(meetingSummary(list, 'p', TODAY)).toEqual({ held: 2, upcoming: 1, cancelled: 1, first: '2026-11-01', last: '2026-11-10', next: '2026-12-01' })
  })
})

describe('ganttScale', () => {
  it('covers at least 3 months and maps dates to 0..100', () => {
    const s = ganttScale([{ start: '2026-11-10', end: '2026-11-20' }], TODAY)
    expect(s.days).toBeGreaterThanOrEqual(92)
    expect(s.pct(s.start)).toBe(0)
    expect(s.pct(s.end)).toBe(100)
    expect(s.pct('1999-01-01')).toBe(0)
    expect(s.ticks[0].date).toBe(s.start)
    expect(s.todayPct).not.toBeNull()
  })
  it('handles no data and ignores invalid dates', () => {
    const s = ganttScale([{ start: '', end: undefined }, { start: 'abc' }], TODAY)
    expect(s.inWindow(TODAY)).toBe(true)
  })
  it('caps a many-year window and thins the ticks', () => {
    const s = ganttScale([{ start: '2010-01-01', end: '2040-01-01' }], TODAY)
    expect(s.days).toBeLessThanOrEqual(5 * 366 + 62)
    expect(s.clipped).toBe(true)
    expect(s.ticks.length).toBeLessThanOrEqual(8)
    expect(ganttBar(s, '2010-01-01', '2040-01-01')).toMatchObject({ kind: 'bar', clippedStart: true, clippedEnd: true, left: 0, width: 100 })
  })
  it('bars: open-ended, dot, inverted, none', () => {
    const s = ganttScale([{ start: '2026-09-01', end: '2026-12-31' }], TODAY)
    expect(ganttBar(s, '2026-10-01', '').kind).toBe('open')
    expect(ganttBar(s, '', '2026-10-01').kind).toBe('dot')
    expect(ganttBar(s, '', '').kind).toBe('none')
    const inv2 = ganttBar(s, '2026-12-01', '2026-10-01')
    expect(inv2.inverted).toBe(true)
    expect(inv2.width).toBeGreaterThan(0)
  })
})
