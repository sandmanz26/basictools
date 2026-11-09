import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { billingProfile, invoices, projects, scheduleEvents } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { todayStr } from '../../lib/dates.js'
import { notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { idParam, okBody } from '../../lib/schemas.js'
import { guard } from '../../plugins/authz.js'
import { billingProfileSchema, draftDueBody, draftDueOut, invoiceCreate, invoiceListQuery, invoiceOut, invoiceUpdate, statusBody } from './schemas.js'
import { draftDueInvoices, hydrate, insertInvoice, replaceItems, setInvoiceStatus, syncScheduleEvent } from './service.js'

export const invoiceRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const tags = ['invoices']
  const billing = guard('pm.invoice')

  const getRow = async (id: string) => {
    const [r] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
    if (!r) throw notFound('Invoice')
    return r
  }
  const full = async (id: string) => {
    const [out] = await hydrate(db, [await getRow(id)])
    if (!out) throw notFound('Invoice')
    return out
  }

  app.get('/invoices', { onRequest: billing, schema: { tags, summary: 'List invoices (status=overdue means sent and past due)', querystring: invoiceListQuery, response: { 200: listOf(invoiceOut) } } }, async (req) => {
    const { projectId, status, q, page, pageSize } = req.query
    const today = todayStr()
    const statusCond =
      status === 'overdue' ? and(eq(invoices.status, 'sent'), sql`${invoices.dueDate} < ${today}`)
      : status === 'sent' ? and(eq(invoices.status, 'sent'), sql`${invoices.dueDate} >= ${today}`)
      : status ? eq(invoices.status, status) : undefined
    const where = and(
      projectId ? eq(invoices.projectId, projectId) : undefined,
      statusCond,
      q ? or(ilike(invoices.number, likePattern(q)), ilike(invoices.clientName, likePattern(q))) : undefined,
    )
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(invoices).where(where)
    const rows = await db.select().from(invoices).where(where).orderBy(desc(invoices.issueDate), desc(invoices.number)).limit(pageSize).offset(offsetOf(req.query))
    return { data: await hydrate(db, rows, today), meta: { page, pageSize, total } }
  })

  app.get('/invoices/:id', { onRequest: billing, schema: { tags, summary: 'Get an invoice', params: idParam, response: { 200: invoiceOut } } }, async (req) => full(req.params.id))

  app.post('/invoices', { onRequest: billing, schema: { tags, summary: 'Create a draft invoice', body: invoiceCreate, response: { 201: invoiceOut } } }, async (req, reply) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, req.body.projectId)).limit(1)
    if (!p) throw notFound('Project')
    const row = await insertInvoice(db, req.body)
    await audit(db, req, { action: 'invoice.create', entity: 'invoice', entityId: row.id, meta: { number: row.number } })
    return reply.code(201).send(await full(row.id))
  })

  app.patch('/invoices/:id', { onRequest: billing, schema: { tags, summary: 'Edit an invoice and optionally replace its lines', params: idParam, body: invoiceUpdate, response: { 200: invoiceOut } } }, async (req) => {
    const cur = await getRow(req.params.id)
    const { items, ...fields } = req.body
    await db.transaction(async (tx) => {
      const [row] = Object.keys(fields).length ? await tx.update(invoices).set(fields).where(eq(invoices.id, cur.id)).returning() : [cur]
      if (items) await replaceItems(tx, cur.id, items)
      // A renamed number must follow into the billing reminder.
      if (row) await syncScheduleEvent(tx, row)
    })
    await audit(db, req, { action: 'invoice.update', entity: 'invoice', entityId: cur.id })
    return full(cur.id)
  })

  app.post('/invoices/:id/status', { onRequest: billing, schema: { tags, summary: 'Mark an invoice draft, sent or paid; keeps the billing reminder in step', params: idParam, body: statusBody, response: { 200: invoiceOut } } }, async (req) => {
    const cur = await getRow(req.params.id)
    await setInvoiceStatus(db, cur, req.body.status)
    await audit(db, req, { action: `invoice.${req.body.status}`, entity: 'invoice', entityId: cur.id, meta: { number: cur.number, from: cur.status } })
    return full(cur.id)
  })

  app.delete('/invoices/:id', { onRequest: billing, schema: { tags, summary: 'Delete an invoice. Its recurring occurrence will not be drafted again', params: idParam, response: { 200: okBody } } }, async (req) => {
    const cur = await getRow(req.params.id)
    await db.transaction(async (tx) => {
      // "Deleted on purpose": the auto-drafter must not recreate it.
      await tx.update(scheduleEvents).set({ invoiceDeleted: true }).where(eq(scheduleEvents.invoiceId, cur.id))
      await tx.delete(invoices).where(eq(invoices.id, cur.id))
    })
    await audit(db, req, { action: 'invoice.delete', entity: 'invoice', entityId: cur.id, meta: { number: cur.number } })
    return { ok: true as const }
  })

  app.post('/invoices/draft-due', { onRequest: billing, schema: { tags, summary: 'Prepare drafts for every recurring invoice whose reminder window has started (idempotent)', body: draftDueBody, response: { 200: draftDueOut } } }, async (req) => {
    const drafted = await draftDueInvoices(db, req.body.today ?? todayStr())
    if (drafted) await audit(db, req, { action: 'invoice.draft_due', entity: 'invoice', meta: { drafted } })
    return { drafted }
  })

  // ---------- company details printed on the invoice ----------
  const profile = async () => {
    await db.insert(billingProfile).values({ id: 1 }).onConflictDoNothing()
    const [p] = await db.select().from(billingProfile).limit(1)
    if (!p) throw notFound('Billing profile')
    return p
  }
  app.get('/billing-profile', { onRequest: billing, schema: { tags, summary: 'Company details printed on invoices', response: { 200: billingProfileSchema } } }, async () => profile())
  app.put('/billing-profile', { onRequest: billing, schema: { tags, summary: 'Update company details printed on invoices', body: billingProfileSchema.partial(), response: { 200: billingProfileSchema } } }, async (req) => {
    await profile()
    if (Object.keys(req.body).length) await db.update(billingProfile).set(req.body).where(eq(billingProfile.id, 1))
    await audit(db, req, { action: 'billing_profile.update', entity: 'billing_profile', entityId: '1' })
    return profile()
  })
}
