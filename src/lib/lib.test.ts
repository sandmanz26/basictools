import { describe, expect, it } from 'vitest'
import { parseDelimited, toCsv } from '@/lib/csv'
import { parseDate, parseSalary, parseTable } from '@/lib/importExport'
import { addDays, daysBetween, occurrenceDates, periodLabel } from '@/lib/billing'
import { canOpen, homeFor, requiredFor } from '@/lib/access'
import { findTalent } from '@/lib/talent'
import { DEFAULT_STAGES } from '@/lib/constants'
import type { Permission, Schedule, Talent } from '@/types'

const sched = (p: Partial<Schedule>): Schedule => ({
  id: 's', kind: 'receivable', projectId: 'p', party: 'X', title: 'T', amount: 1, frequency: 'monthly', day: 0, startDate: '2026-11-02',
  endDate: '', leadDays: 3, termDays: 14, pic: '', notes: '', active: true, ...p,
})

describe('csv', () => {
  it('detects semicolons, handles quotes and blank lines', () => {
    expect(parseDelimited('a;b\n"x;y";2\n\n')).toEqual([['a', 'b'], ['x;y', '2']])
  })
  it('neutralises spreadsheet formulas but keeps real numbers', () => {
    const out = toCsv([['=HYPERLINK("http://evil")', '+1', -5, 'ok']])
    expect(out).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(out).toContain("'+1")
    expect(out).toContain(',-5,')
  })
})

describe('import parsing', () => {
  it('reads salary ranges in several notations', () => {
    expect(parseSalary('16-20jt')).toEqual({ min: 16_000_000, max: 20_000_000 })
    expect(parseSalary('12.000.000')).toEqual({ min: 12_000_000, max: 12_000_000 })
    expect(parseSalary('abc')).toEqual({ min: null, max: null })
  })
  it('reads dd/mm/yyyy and ISO dates', () => {
    expect(parseDate('06/11/2026')).toBe('2026-11-06')
    expect(parseDate('2026-11-06T10:00')).toBe('2026-11-06')
  })
  it('maps interview columns from the project stages and skips rows without a name', () => {
    const t = parseTable([['Name', 'Email', 'HR Interview Schedule', 'HR Interview Result'], ['Ana', 'a@x.id', '06/11/2026', 'Pass'], ['', 'b@x.id', '', '']], DEFAULT_STAGES())
    expect(t.records).toHaveLength(1)
    expect(t.invalidRows).toBe(1)
    expect(t.records[0].rounds.hr).toMatchObject({ date: '2026-11-06', result: 'pass' })
  })
})

describe('billing schedules', () => {
  it('weekly lands on the chosen weekday', () => {
    const d = occurrenceDates(sched({ frequency: 'weekly', weekday: 1 }), '2026-11-01', '2026-11-30')
    expect(d).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })
  it('biweekly keeps its two-week rhythm when looking ahead', () => {
    const d = occurrenceDates(sched({ frequency: 'biweekly', weekday: 5 }), '2026-11-15', '2026-12-31')
    expect(d).toEqual(['2026-11-20', '2026-12-04', '2026-12-18'])
  })
  it('monthly end-of-month handles short months', () => {
    expect(occurrenceDates(sched({ day: 0, startDate: '2027-01-01' }), '2027-01-01', '2027-03-31')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })
  it('date helpers agree', () => {
    expect(addDays('2026-11-08', 7)).toBe('2026-11-15')
    expect(daysBetween('2026-11-01', '2026-11-08')).toBe(7)
    expect(periodLabel(sched({ frequency: 'quarterly' }), '2026-11-02')).toBe('Q4 2026')
  })
  it('respects the end date', () => {
    expect(occurrenceDates(sched({ endDate: '2026-12-31', startDate: '2026-11-01', day: 15 }), '2026-11-01', '2027-06-30')).toEqual(['2026-11-15', '2026-12-15'])
  })
})

describe('access rules', () => {
  const can = (...p: Permission[]) => (x: Permission) => p.includes(x)
  it('locks pages without the permission and picks a sensible landing page', () => {
    expect(canOpen(can('module.mkt'), '/pm/budget')).toBe(false)
    expect(canOpen(can('module.mkt'), '/mkt/email')).toBe(true)
    expect(homeFor(can('module.mkt'))).toBe('/mkt')
    expect(requiredFor('/pm/invoices/123')).toEqual(['pm.invoice'])
  })
})

describe('talent matching', () => {
  const pool: Talent[] = [
    { id: 't1', name: 'Rizky Maulana', email: 'Rizky@mail.com', phone: '+62 811-0000-101', source: '', skills: '', salaryMin: null, salaryMax: null, arrangement: 'Any', notes: '', createdAt: '' },
  ]
  it('matches by email ignoring case, then by phone digits', () => {
    expect(findTalent(pool, { name: 'x', email: 'rizky@MAIL.com', phone: '' })?.id).toBe('t1')
    expect(findTalent(pool, { name: 'x', email: '', phone: '0811 0000 101' })).toBeUndefined() // different digits (leading 62)
    expect(findTalent(pool, { name: 'y', email: '', phone: '62 811 0000 101' })?.id).toBe('t1')
    expect(findTalent(pool, { name: 'Someone Else', email: 'else@mail.com', phone: '' })).toBeUndefined()
  })
})
