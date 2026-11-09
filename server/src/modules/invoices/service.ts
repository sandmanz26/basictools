import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '../../db/client.js'
import { billingProfile, invoiceItems, invoices, projects, scheduleEvents, schedules } from '../../db/schema.js'
import { addDays as addDaysStr, isoNow, todayStr } from '../../lib/dates.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { occurrenceDates, periodLabel } from '../schedules/billing.js'

export type InvoiceRow = typeof invoices.$inferSelect
export type ItemInput = { id?: string; description: string; qty: number; unitPrice: number; ref?: string }

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/** Next free number like INV-2026-004. Counts every invoice so numbers never repeat. */
export async function nextInvoiceNumber(dbx: DbOrTx, issueDate: string): Promise<string> {
  const [row] = await dbx.select({ max: sql<number>`coalesce(max((substring(${invoices.number} from '(\\d+)$'))::int), 0)::int` }).from(invoices)
  return `INV-${issueDate.slice(0, 4)}-${String((row?.max ?? 0) + 1).padStart(3, '0')}`
}

/** Compute totals the same way the PDF does: tax on the subtotal, rounded to whole rupiah. */
export function totals(items: { qty: number; unitPrice: number }[], taxPct: number) {
  const subtotal = items.reduce((s, i) => s + Math.round(i.qty * i.unitPrice), 0)
  const taxAmount = Math.round((subtotal * taxPct) / 100)
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

export const effectiveStatus = (status: InvoiceRow['status'], dueDate: string, today = todayStr()) =>
  status === 'sent' && dueDate < today ? ('overdue' as const) : status

export async function hydrate(db: DbOrTx, rows: InvoiceRow[], today = todayStr()) {
  const items = rows.length ? await db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, rows.map((r) => r.id))).orderBy(invoiceItems.sort) : []
  return rows.map((r) => {
    const its = items.filter((i) => i.invoiceId === r.id).map((i) => ({ id: i.id, description: i.description, qty: i.qty, unitPrice: i.unitPrice, ref: i.ref }))
    return { ...r, effectiveStatus: effectiveStatus(r.status, r.dueDate, today), items: its, ...totals(its, r.taxPct) }
  })
}

const toItemRows = (invoiceId: string, items: ItemInput[]) =>
  items.map((it, i) => ({ invoiceId, description: it.description, qty: it.qty, unitPrice: it.unitPrice, ref: it.ref ?? null, sort: i }))

interface NewInvoice {
  projectId: string
  number?: string
  clientName: string
  clientEmail: string
  issueDate: string
  dueDate: string
  taxPct: number
  notes: string
  period: string
  scheduleKey?: string
  items: ItemInput[]
}

/** Insert an invoice with its lines, retrying when a concurrent request took the same auto number. */
export async function insertInvoice(db: Db, input: NewInvoice): Promise<InvoiceRow> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const number = input.number ?? (await nextInvoiceNumber(tx, input.issueDate))
        const { items, number: _n, ...rest } = input
        const [row] = await tx.insert(invoices).values({ ...rest, number, scheduleKey: input.scheduleKey ?? null }).returning()
        if (!row) throw new Error('invoice insert failed')
        if (items.length) await tx.insert(invoiceItems).values(toItemRows(row.id, items))
        return row
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      if (input.number) throw conflict(`Invoice number ${input.number} is already used.`, 'DUPLICATE_NUMBER')
      if (input.scheduleKey) {
        const [existing] = await db.select().from(invoices).where(eq(invoices.scheduleKey, input.scheduleKey)).limit(1)
        if (existing) return existing
      }
      if (attempt >= 4) throw err
    }
  }
}

export async function replaceItems(tx: DbOrTx, invoiceId: string, items: ItemInput[]) {
  await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))
  if (items.length) await tx.insert(invoiceItems).values(toItemRows(invoiceId, items))
}

/** Sending releases the billing reminder, paying closes it (store.updateInvoice). Call after every invoice change. */
export async function syncScheduleEvent(tx: DbOrTx, inv: InvoiceRow): Promise<void> {
  if (!inv.scheduleKey) return
  const at = inv.scheduleKey.lastIndexOf(':')
  const scheduleId = inv.scheduleKey.slice(0, at)
  const date = inv.scheduleKey.slice(at + 1)
  const [sch] = await tx.select({ id: schedules.id }).from(schedules).where(eq(schedules.id, scheduleId)).limit(1)
  if (!sch) return
  const [ev] = await tx.select().from(scheduleEvents).where(and(eq(scheduleEvents.scheduleId, scheduleId), eq(scheduleEvents.occurrenceDate, date))).limit(1)
  const cur = ev ?? { issuedAt: null, paidAt: null, invoiceNo: '' }
  const sentNow = inv.status !== 'draft' && !cur.issuedAt
  const paidNow = inv.status === 'paid' && !cur.paidAt
  if (ev && !sentNow && !paidNow && ev.invoiceNo === inv.number && ev.invoiceId === inv.id) return
  const issuedAt = cur.issuedAt ?? (inv.status !== 'draft' ? (inv.sentAt ? inv.sentAt.slice(0, 10) : inv.issueDate) : null)
  const paidAt = inv.status === 'paid' ? (cur.paidAt ?? todayStr()) : cur.paidAt
  await tx
    .insert(scheduleEvents)
    .values({ scheduleId, occurrenceDate: date, invoiceId: inv.id, invoiceNo: inv.number, issuedAt, paidAt, invoiceDeleted: false })
    .onConflictDoUpdate({
      target: [scheduleEvents.scheduleId, scheduleEvents.occurrenceDate],
      set: { invoiceId: inv.id, invoiceNo: inv.number, issuedAt, paidAt, invoiceDeleted: false },
    })
}

/** Move an invoice between draft / sent / paid, stamping the timestamps and syncing the reminder. */
export async function setInvoiceStatus(db: Db, inv: InvoiceRow, status: InvoiceRow['status']): Promise<InvoiceRow> {
  return db.transaction(async (tx) => {
    const now = isoNow()
    const patch: Partial<InvoiceRow> = { status }
    if (status !== 'draft' && !inv.sentAt) patch.sentAt = now
    if (status === 'paid' && !inv.paidAt) patch.paidAt = now
    if (status !== 'paid') patch.paidAt = null
    const [row] = await tx.update(invoices).set(patch).where(eq(invoices.id, inv.id)).returning()
    if (!row) throw notFound('Invoice')
    await syncScheduleEvent(tx, row)
    return row
  })
}

/** One recurring occurrence becomes one draft invoice, filled from the schedule and its project. Idempotent per occurrence. */
export async function createInvoiceFromSchedule(db: Db, scheduleId: string, date: string): Promise<InvoiceRow> {
  const [sch] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1)
  if (!sch) throw notFound('Schedule')
  if (sch.kind !== 'receivable' || !sch.projectId) throw badRequest('Only receivable schedules linked to a project can create invoices.')
  if (!occurrenceDates({ ...sch, active: true }, date, date).includes(date)) throw badRequest('The schedule does not fall on that date.')
  const [project] = await db.select().from(projects).where(eq(projects.id, sch.projectId)).limit(1)
  if (!project) throw notFound('Project')

  const key = `${sch.id}:${date}`
  const [existing] = await db.select().from(invoices).where(eq(invoices.scheduleKey, key)).limit(1)
  if (existing) return existing

  const [profile] = await db.select({ paymentNote: billingProfile.paymentNote }).from(billingProfile).limit(1)
  const t = sch.template
  const period = periodLabel(sch.frequency, date)
  const base: ItemInput[] = t?.items.length ? t.items : [{ description: sch.title || 'Services', qty: 1, unitPrice: sch.amount ?? 0 }]
  const items = base.map((it, i) => ({ description: i === 0 && period ? `${it.description} (${period})` : it.description, qty: it.qty, unitPrice: it.unitPrice, ref: it.ref }))
  const inv = await insertInvoice(db, {
    projectId: project.id,
    clientName: sch.party || project.info.client,
    clientEmail: t?.clientEmail || project.info.stakeholders.find((x) => x.contact.includes('@'))?.contact || '',
    issueDate: date,
    dueDate: addDaysStr(date, sch.termDays),
    taxPct: t?.taxPct ?? 11,
    notes: t?.notes || profile?.paymentNote || '',
    period,
    scheduleKey: key,
    items,
  })
  await db
    .insert(scheduleEvents)
    .values({ scheduleId: sch.id, occurrenceDate: date, invoiceId: inv.id, invoiceNo: inv.number, invoiceDeleted: false })
    .onConflictDoUpdate({ target: [scheduleEvents.scheduleId, scheduleEvents.occurrenceDate], set: { invoiceId: inv.id, invoiceNo: inv.number, invoiceDeleted: false } })
  return inv
}

/** Prepare the draft for every receivable whose reminder window has started. Safe to run any number of times. */
export async function draftDueInvoices(db: Db, today: string): Promise<number> {
  const list = await db.select().from(schedules).where(and(eq(schedules.active, true), eq(schedules.kind, 'receivable'), eq(schedules.autoDraft, true)))
  let n = 0
  for (const sch of list) {
    if (!sch.projectId) continue
    for (const date of occurrenceDates(sch, addDaysStr(today, -7), addDaysStr(today, sch.leadDays))) {
      const [ev] = await db.select().from(scheduleEvents).where(and(eq(scheduleEvents.scheduleId, sch.id), eq(scheduleEvents.occurrenceDate, date))).limit(1)
      if (ev?.skipped || ev?.issuedAt || ev?.invoiceDeleted) continue
      const [exists] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.scheduleKey, `${sch.id}:${date}`)).limit(1)
      if (exists) continue
      await createInvoiceFromSchedule(db, sch.id, date)
      n++
    }
  }
  return n
}
