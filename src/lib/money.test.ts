import { describe, expect, it } from 'vitest'
import { fmtMoney, fmtTotals, roundCur, sumBy } from '@/lib/money'
import { balanceDue, billedTotals, paidTotals, invoiceTax, invoiceTotal, isPartlyPaid, migratePhase, outstanding } from '@/lib/pm'
import { meetingNumbers, needsNotes } from '@/lib/meetings'
import { buildAgenda } from '@/lib/billing'
import type { Invoice, ProjectMeeting, Schedule } from '@/types'

const inv = (p: Partial<Invoice> = {}): Invoice => ({
  id: 'i1', projectId: 'p1', number: 'INV-1', clientName: 'C', clientEmail: '', issueDate: '2026-11-01', dueDate: '2026-11-15',
  items: [{ id: 'a', description: 'x', qty: 1, unitPrice: 1_000_000 }], taxPct: 11, status: 'sent', notes: '', sentAt: '', ...p,
})

describe('money', () => {
  it('formats each currency with its own decimals', () => {
    expect(fmtMoney(1500000, 'IDR')).toBe('Rp 1.500.000')
    expect(fmtMoney(1200.5, 'USD')).toBe('US$ 1,200.50')
    expect(fmtMoney(150000, 'JPY')).toBe('¥ 150,000')
  })
  it('rounds to the currency unit without drift', () => {
    expect(roundCur(0.1 + 0.2, 'USD')).toBe(0.3)
    expect(roundCur(10.4, 'JPY')).toBe(10)
  })
  it('never mixes currencies in a total', () => {
    const t = sumBy([inv(), inv({ currency: 'USD', items: [{ id: 'a', description: 'x', qty: 1, unitPrice: 100 }] })], (i) => i.currency ?? 'IDR', invoiceTotal)
    expect(t).toEqual({ IDR: 1_110_000, USD: 111 })
    expect(fmtTotals(t)).toBe('Rp 1.110.000 + US$ 111.00')
  })
})

describe('invoice payments', () => {
  it('counts withheld PPh toward the total, so a short payment can still close the invoice', () => {
    const total = invoiceTotal(inv()) // 1,110,000
    const paid = inv({ payments: [{ id: 'p', date: '2026-11-20', amount: total - 20_000, withheld: 20_000, note: '' }] })
    expect(balanceDue(paid)).toBe(0)
    expect(isPartlyPaid(paid)).toBe(false)
  })
  it('keeps a balance for partial payments and reports it as outstanding', () => {
    const part = inv({ payments: [{ id: 'p', date: '2026-11-20', amount: 500_000, withheld: 0, note: '' }] })
    expect(balanceDue(part)).toBe(610_000)
    expect(isPartlyPaid(part)).toBe(true)
    expect(outstanding([part])).toEqual({ IDR: 610_000 })
    expect(billedTotals([part, inv({ status: 'draft' })])).toEqual({ IDR: 1_110_000 })
  })
  it('rounds USD tax to cents', () => {
    expect(invoiceTax(inv({ currency: 'USD', taxPct: 11, items: [{ id: 'a', description: 'x', qty: 1, unitPrice: 33.33 }] }))).toBe(3.67)
  })
})

describe('legacy invoices', () => {
  it('treats an invoice marked paid before payments were tracked as fully settled', () => {
    const old = inv({ status: 'paid' })
    expect(balanceDue(old)).toBe(0)
    expect(paidTotals([old])).toEqual({ IDR: 1_110_000 })
    expect(outstanding([old])).toEqual({})
  })
})

describe('phases', () => {
  it('folds the old five phases into three', () => {
    expect(['initiation', 'planning', 'execution', 'monitoring', 'closing', 'ongoing', 'completed', 'weird'].map(migratePhase))
      .toEqual(['planning', 'planning', 'ongoing', 'ongoing', 'completed', 'ongoing', 'completed', 'planning'])
  })
})

describe('project meetings', () => {
  const m = (id: string, date: string, status: ProjectMeeting['status'] = 'held', summary = 'notes'): ProjectMeeting => ({
    id, projectId: 'p1', title: id, date, startTime: '10:00', endTime: '11:00', attendees: [], summary, decisions: '', location: '', joinUrl: '', outlookId: '', status, createdBy: '', createdAt: date,
  })
  it('numbers meetings oldest first and skips cancelled ones', () => {
    expect(meetingNumbers([m('c', '2026-10-03'), m('a', '2026-10-01'), m('x', '2026-10-02', 'cancelled'), m('b', '2026-10-02')])).toEqual({ a: 1, b: 2, c: 3 })
  })
  it('asks for notes on past planned or empty held meetings', () => {
    expect(needsNotes(m('a', '2026-10-01', 'planned'), '2026-11-01')).toBe(true)
    expect(needsNotes(m('a', '2026-12-01', 'planned'), '2026-11-01')).toBe(false)
    expect(needsNotes(m('a', '2026-10-01', 'held', ''), '2026-11-01')).toBe(true)
    expect(needsNotes(m('a', '2026-10-01', 'held'), '2026-11-01')).toBe(false)
  })
})

describe('billing agenda', () => {
  it('asks only for what is still owed on a part-paid invoice, in its currency', () => {
    const sch: Schedule = { id: 's1', kind: 'receivable', projectId: 'p1', party: 'C', title: 'Fee', amount: 1_110_000, frequency: 'once', day: 0, startDate: '2026-11-01', endDate: '', leadDays: 3, termDays: 14, pic: '', notes: '', active: true, currency: 'USD' }
    const invoice = inv({ id: 'i9', currency: 'USD', items: [{ id: 'a', description: 'x', qty: 1, unitPrice: 1000 }], taxPct: 0, payments: [{ id: 'p', date: '2026-11-10', amount: 400, withheld: 0, note: '' }] })
    const a = buildAgenda([sch], { 's1:2026-11-01': { issuedAt: '2026-11-01', invoiceNo: 'INV-1', paidAt: '', skipped: false, invoiceId: 'i9' } }, [], '2026-11-12', 60, [invoice])
    expect(a[0]).toMatchObject({ kind: 'collect', amount: 600, currency: 'USD' })
  })
})
