import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invoices, scheduleEvents } from '../src/db/schema.js'
import { occurrenceDates, periodLabel } from '../src/modules/schedules/billing.js'
import { adminLogin, createEnv, json, userWithRole, type Session, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Session
let projectId: string

beforeAll(async () => {
  env = await createEnv()
  admin = await adminLogin(env)
  const p = await json<{ id: string }>(env, 'POST', '/projects', admin, {
    name: 'Client project',
    info: { client: 'PT Maju', stakeholders: [{ id: 's1', name: 'Anton', role: 'CS', influence: 'high', contact: 'anton@maju.id' }] },
  })
  projectId = p.body.id
})
afterAll(async () => { await env.close() })

type Inv = { id: string; number: string; status: string; effectiveStatus: string; subtotal: number; taxAmount: number; total: number; items: { description: string; qty: number; unitPrice: number }[]; clientEmail: string; clientName: string; period: string; dueDate: string; sentAt: string | null; paidAt: string | null }
type Sched = { id: string }

const newSchedule = async (over: Record<string, unknown> = {}) => {
  const r = await json<Sched>(env, 'POST', '/schedules', admin, {
    kind: 'receivable', projectId, party: 'PT Maju', title: 'Retainer', amount: 10_000_000, frequency: 'monthly', day: 25, startDate: '2026-09-25', termDays: 14, leadDays: 7, ...over,
  })
  expect(r.status).toBe(201)
  return r.body
}
const eventOf = async (scheduleId: string, date: string) => {
  const [e] = await env.db.select().from(scheduleEvents).where(eq(scheduleEvents.scheduleId, scheduleId))
  return e && e.occurrenceDate === date ? e : undefined
}

describe('calendar maths (port of src/lib/billing.ts)', () => {
  const base = { frequency: 'monthly' as const, day: 31, weekday: null, startDate: '2026-01-31', endDate: null, active: true }
  it('clamps day 31 to the end of short months', () => {
    expect(occurrenceDates(base, '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('supports last day of month (0), quarterly, weekly and biweekly', () => {
    expect(occurrenceDates({ ...base, day: 0 }, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28'])
    expect(occurrenceDates({ ...base, frequency: 'quarterly', day: 15, startDate: '2026-01-10' }, '2026-01-01', '2026-12-31')).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15'])
    expect(occurrenceDates({ ...base, frequency: 'weekly', weekday: 1, startDate: '2026-11-02' }, '2026-11-01', '2026-11-22')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16'])
    expect(occurrenceDates({ ...base, frequency: 'biweekly', weekday: 1, startDate: '2026-11-02' }, '2026-11-01', '2026-12-10')).toEqual(['2026-11-02', '2026-11-16', '2026-11-30'])
  })
  it('respects end date, once and inactive', () => {
    expect(occurrenceDates({ ...base, day: 1, startDate: '2026-01-01', endDate: '2026-02-15' }, '2026-01-01', '2026-12-31')).toEqual(['2026-01-01', '2026-02-01'])
    expect(occurrenceDates({ ...base, frequency: 'once', startDate: '2026-05-05' }, '2026-05-01', '2026-05-31')).toEqual(['2026-05-05'])
    expect(occurrenceDates({ ...base, active: false }, '2026-01-01', '2026-12-31')).toEqual([])
  })
  it('labels periods', () => {
    expect(periodLabel('monthly', '2026-11-25')).toBe('November 2026')
    expect(periodLabel('quarterly', '2026-11-25')).toBe('Q4 2026')
    expect(periodLabel('yearly', '2026-11-25')).toBe('2026')
  })
})

describe('invoices', () => {
  it('auto numbers INV-YYYY-NNN, counts across years and computes totals with rounding', async () => {
    const a = await json<Inv>(env, 'POST', '/invoices', admin, { projectId, clientName: 'PT Maju', issueDate: '2026-11-01', dueDate: '2026-11-15', taxPct: 11, items: [{ description: 'Dev', qty: 3, unitPrice: 1_234_567 }] })
    const b = await json<Inv>(env, 'POST', '/invoices', admin, { projectId, issueDate: '2027-01-02', dueDate: '2027-01-20', items: [] })
    expect(a.body.number).toMatch(/^INV-2026-\d{3}$/)
    const n = (x: string) => Number(x.slice(-3))
    expect(b.body.number.startsWith('INV-2027-')).toBe(true)
    expect(n(b.body.number)).toBe(n(a.body.number) + 1)
    expect(a.body.subtotal).toBe(3_703_701)
    expect(a.body.taxAmount).toBe(407_407) // 11% of 3,703,701 = 407,407.11
    expect(a.body.total).toBe(4_111_108)
    expect(a.body.status).toBe('draft')
  })

  it('rejects a duplicate manual number', async () => {
    const a = await json<Inv>(env, 'POST', '/invoices', admin, { projectId, issueDate: '2026-11-01', dueDate: '2026-11-15', number: 'CUSTOM-1', items: [] })
    expect(a.status).toBe(201)
    const dup = await json<{ error: { code: string } }>(env, 'POST', '/invoices', admin, { projectId, issueDate: '2026-11-01', dueDate: '2026-11-15', number: 'CUSTOM-1', items: [] })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('DUPLICATE_NUMBER')
  })

  it('stamps sent/paid, derives overdue and filters by it', async () => {
    const inv = await json<Inv>(env, 'POST', '/invoices', admin, { projectId, issueDate: '2020-01-01', dueDate: '2020-01-15', items: [{ description: 'x', qty: 1, unitPrice: 1000 }] })
    expect(inv.body.effectiveStatus).toBe('draft')
    const sent = await json<Inv>(env, 'POST', `/invoices/${inv.body.id}/status`, admin, { status: 'sent' })
    expect(sent.body).toMatchObject({ status: 'sent', effectiveStatus: 'overdue' })
    expect(sent.body.sentAt).toBeTruthy()
    const overdue = await json<{ data: Inv[] }>(env, 'GET', '/invoices?status=overdue', admin)
    expect(overdue.body.data.map((i) => i.id)).toContain(inv.body.id)
    const onlySent = await json<{ data: Inv[] }>(env, 'GET', '/invoices?status=sent', admin)
    expect(onlySent.body.data.map((i) => i.id)).not.toContain(inv.body.id)
    const paid = await json<Inv>(env, 'POST', `/invoices/${inv.body.id}/status`, admin, { status: 'paid' })
    expect(paid.body).toMatchObject({ status: 'paid', effectiveStatus: 'paid' })
    expect(paid.body.paidAt).toBeTruthy()
  })

  it('edits lines by replacing them', async () => {
    const inv = await json<Inv>(env, 'POST', '/invoices', admin, { projectId, issueDate: '2026-11-01', dueDate: '2026-11-15', items: [{ description: 'old', qty: 1, unitPrice: 10 }] })
    const up = await json<Inv>(env, 'PATCH', `/invoices/${inv.body.id}`, admin, { items: [{ description: 'new a', qty: 2, unitPrice: 100 }, { description: 'new b', qty: 1, unitPrice: 50 }] })
    expect(up.body.items.map((i) => i.description)).toEqual(['new a', 'new b'])
    expect(up.body.subtotal).toBe(250)
    expect(up.body.clientName).toBe('') // untouched fields stay
  })

  it('requires pm.invoice', async () => {
    const pm = await userWithRole(env, 'pm') // PM can edit PM data but cannot manage invoices
    expect((await json(env, 'GET', '/invoices', pm)).status).toBe(403)
    expect((await json(env, 'GET', '/schedules', pm)).status).toBe(403)
    const viewer = await userWithRole(env, 'viewer')
    expect((await json(env, 'POST', '/invoices', viewer, {})).status).toBe(403)
  })
})

describe('invoices from schedules', () => {
  it('creates one draft per occurrence from the schedule and project, and is idempotent', async () => {
    const s = await newSchedule({ template: { items: [{ id: 'a', description: 'Hosting', qty: 1, unitPrice: 6_000_000 }, { id: 'b', description: 'Support', qty: 2, unitPrice: 2_000_000 }], taxPct: 11, clientEmail: '', notes: 'Pay to BCA' } })
    const a = await json<Inv>(env, 'POST', `/schedules/${s.id}/occurrences/2026-11-25/invoice`, admin)
    const b = await json<Inv>(env, 'POST', `/schedules/${s.id}/occurrences/2026-11-25/invoice`, admin)
    expect(a.status).toBe(200)
    expect(b.body.id).toBe(a.body.id)
    expect(a.body).toMatchObject({ status: 'draft', clientName: 'PT Maju', clientEmail: 'anton@maju.id', period: 'November 2026', dueDate: '2026-12-09' })
    expect(a.body.items[0]?.description).toBe('Hosting (November 2026)')
    expect(a.body.items[1]?.description).toBe('Support')
    expect(a.body.subtotal).toBe(10_000_000)
    const rows = await env.db.select().from(invoices).where(eq(invoices.scheduleKey, `${s.id}:2026-11-25`))
    expect(rows).toHaveLength(1)
    const ev = await eventOf(s.id, '2026-11-25')
    expect(ev).toMatchObject({ invoiceId: a.body.id, invoiceNo: a.body.number, issuedAt: null, paidAt: null })
  })

  it('falls back to one line from the schedule title and amount', async () => {
    const s = await newSchedule({ title: 'Maintenance', amount: 5_000_000 })
    const inv = await json<Inv>(env, 'POST', `/schedules/${s.id}/occurrences/2026-10-25/invoice`, admin)
    expect(inv.body.items).toHaveLength(1)
    expect(inv.body.items[0]).toMatchObject({ description: 'Maintenance (October 2026)', unitPrice: 5_000_000 })
    expect(inv.body.taxAmount).toBe(550_000)
  })

  it('refuses dates the schedule does not fall on and payable schedules', async () => {
    const s = await newSchedule()
    expect((await json(env, 'POST', `/schedules/${s.id}/occurrences/2026-11-26/invoice`, admin)).status).toBe(400)
    const pay = await json<Sched>(env, 'POST', '/schedules', admin, { kind: 'payable', party: 'Vendor', title: 'Rent', startDate: '2026-11-01', day: 1 })
    expect((await json(env, 'POST', `/schedules/${pay.body.id}/occurrences/2026-11-01/invoice`, admin)).status).toBe(400)
    const noProject = await json(env, 'POST', '/schedules', admin, { kind: 'receivable', startDate: '2026-11-01' })
    expect(noProject.status).toBe(400)
  })

  it('keeps the schedule event in step: sending releases it, paying closes it', async () => {
    const s = await newSchedule({ day: 5, startDate: '2026-08-05' })
    const inv = await json<Inv>(env, 'POST', `/schedules/${s.id}/occurrences/2026-11-05/invoice`, admin)
    await json(env, 'POST', `/invoices/${inv.body.id}/status`, admin, { status: 'sent' })
    let ev = await eventOf(s.id, '2026-11-05')
    expect(ev?.issuedAt).toBeTruthy()
    expect(ev?.paidAt).toBeNull()
    await json(env, 'POST', `/invoices/${inv.body.id}/status`, admin, { status: 'paid' })
    ev = await eventOf(s.id, '2026-11-05')
    expect(ev?.paidAt).toBeTruthy()
    // renaming the number follows into the reminder
    await json(env, 'PATCH', `/invoices/${inv.body.id}`, admin, { number: 'INV-RENAMED-1' })
    expect((await eventOf(s.id, '2026-11-05'))?.invoiceNo).toBe('INV-RENAMED-1')
  })

  it('draft-due prepares drafts inside the reminder window, once, skipping released, skipped and deleted ones', async () => {
    const s = await newSchedule({ title: 'Auto', day: 10, startDate: '2026-06-10', leadDays: 7, amount: 1_000_000 })
    const today = '2026-12-05' // next occurrence 2026-12-10 is within 7 days; 2026-11-10 is older than the 7 day look back
    const r1 = await json<{ drafted: number }>(env, 'POST', '/invoices/draft-due', admin, { today })
    expect(r1.body.drafted).toBeGreaterThanOrEqual(1)
    const mine = await env.db.select().from(invoices).where(eq(invoices.scheduleKey, `${s.id}:2026-12-10`))
    expect(mine).toHaveLength(1)
    const r2 = await json<{ drafted: number }>(env, 'POST', '/invoices/draft-due', admin, { today })
    expect(r2.body.drafted).toBe(0) // idempotent

    // deleting on purpose: not drafted again
    await json(env, 'DELETE', `/invoices/${mine[0]?.id}`, admin)
    expect((await eventOf(s.id, '2026-12-10'))?.invoiceDeleted).toBe(true)
    expect((await json<{ drafted: number }>(env, 'POST', '/invoices/draft-due', admin, { today })).body.drafted).toBe(0)
    // ...but an explicit create still works and clears the flag
    const again = await json<Inv>(env, 'POST', `/schedules/${s.id}/occurrences/2026-12-10/invoice`, admin)
    expect(again.status).toBe(200)
    expect((await eventOf(s.id, '2026-12-10'))?.invoiceDeleted).toBe(false)

    // skipped occurrences are respected
    const s2 = await newSchedule({ title: 'Skipper', day: 12, startDate: '2026-06-12', leadDays: 7 })
    await json(env, 'PUT', `/schedules/${s2.id}/occurrences/2026-12-12`, admin, { skipped: true })
    await json(env, 'POST', '/invoices/draft-due', admin, { today })
    expect(await env.db.select().from(invoices).where(eq(invoices.scheduleKey, `${s2.id}:2026-12-12`))).toHaveLength(0)
  })

  it('occurrence listing shows progress', async () => {
    const s = await newSchedule({ day: 3, startDate: '2026-01-03' })
    await json(env, 'PUT', `/schedules/${s.id}/occurrences/2026-11-03`, admin, { paidAt: '2026-11-04', issuedAt: '2026-11-03' })
    const r = await json<{ data: { date: string; event: { paidAt: string } | null }[] }>(env, 'GET', `/schedules/${s.id}/occurrences?from=2026-10-01&to=2026-12-31`, admin)
    expect(r.body.data.map((d) => d.date)).toEqual(['2026-10-03', '2026-11-03', '2026-12-03'])
    expect(r.body.data[1]?.event?.paidAt).toBe('2026-11-04')
    expect(r.body.data[0]?.event).toBeNull()
  })
})

describe('billing profile', () => {
  it('reads and updates the singleton', async () => {
    const put = await json<{ company: string; bankName: string }>(env, 'PUT', '/billing-profile', admin, { company: 'PT Kami', bankName: 'BCA' })
    expect(put.body).toMatchObject({ company: 'PT Kami', bankName: 'BCA' })
    const got = await json<{ company: string }>(env, 'GET', '/billing-profile', admin)
    expect(got.body.company).toBe('PT Kami')
  })
})
