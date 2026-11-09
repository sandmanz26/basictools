import { and, count, desc, eq } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { scheduleEvents, schedules } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { listOf, offsetOf } from '../../lib/pagination.js'
import { idParam, okBody } from '../../lib/schemas.js'
import { guard } from '../../plugins/authz.js'
import { invoiceOut } from '../invoices/schemas.js'
import { createInvoiceFromSchedule, hydrate } from '../invoices/service.js'
import { occurrenceDates } from './billing.js'
import { eventOut, eventPatch, occurrenceParams, rangeQuery, scheduleCreate, scheduleListQuery, scheduleOut, scheduleUpdate } from './schemas.js'

export const scheduleRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const tags = ['schedules']
  const billing = guard('pm.invoice')

  const getRow = async (id: string) => {
    const [s] = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1)
    if (!s) throw notFound('Schedule')
    return s
  }

  app.get('/schedules', { onRequest: billing, schema: { tags, summary: 'List billing schedules (client invoices and vendor bills)', querystring: scheduleListQuery, response: { 200: listOf(scheduleOut) } } }, async (req) => {
    const { kind, projectId, active, page, pageSize } = req.query
    const where = and(kind ? eq(schedules.kind, kind) : undefined, projectId ? eq(schedules.projectId, projectId) : undefined, active ? eq(schedules.active, active === 'true') : undefined)
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(schedules).where(where)
    const data = await db.select().from(schedules).where(where).orderBy(desc(schedules.createdAt)).limit(pageSize).offset(offsetOf(req.query))
    return { data, meta: { page, pageSize, total } }
  })

  app.get('/schedules/:id', { onRequest: billing, schema: { tags, summary: 'Get a schedule', params: idParam, response: { 200: scheduleOut } } }, async (req) => getRow(req.params.id))

  app.post('/schedules', { onRequest: billing, schema: { tags, summary: 'Create a schedule', body: scheduleCreate, response: { 201: scheduleOut } } }, async (req, reply) => {
    const [row] = await db.insert(schedules).values(req.body).returning()
    if (!row) throw new Error('schedule insert failed')
    await audit(db, req, { action: 'schedule.create', entity: 'schedule', entityId: row.id })
    return reply.code(201).send(row)
  })

  app.patch('/schedules/:id', { onRequest: billing, schema: { tags, summary: 'Update a schedule', params: idParam, body: scheduleUpdate, response: { 200: scheduleOut } } }, async (req) => {
    const cur = await getRow(req.params.id)
    const [row] = Object.keys(req.body).length ? await db.update(schedules).set(req.body).where(eq(schedules.id, cur.id)).returning() : [cur]
    await audit(db, req, { action: 'schedule.update', entity: 'schedule', entityId: cur.id })
    return row ?? cur
  })

  app.delete('/schedules/:id', { onRequest: billing, schema: { tags, summary: 'Delete a schedule and its progress (invoices already created stay)', params: idParam, response: { 200: okBody } } }, async (req) => {
    const cur = await getRow(req.params.id)
    await db.delete(schedules).where(eq(schedules.id, cur.id))
    await audit(db, req, { action: 'schedule.delete', entity: 'schedule', entityId: cur.id })
    return { ok: true as const }
  })

  app.get('/schedules/:id/occurrences', { onRequest: billing, schema: { tags, summary: 'Dates the schedule falls on in a range, with their progress', params: idParam, querystring: rangeQuery, response: { 200: z.object({ data: z.array(z.object({ date: z.string(), event: eventOut.nullable() })) }) } } }, async (req) => {
    const s = await getRow(req.params.id)
    if (req.query.to < req.query.from) throw badRequest('"to" must not be before "from".')
    const events = await db.select().from(scheduleEvents).where(eq(scheduleEvents.scheduleId, s.id))
    const byDate = new Map(events.map((e) => [e.occurrenceDate, e]))
    return { data: occurrenceDates(s, req.query.from, req.query.to).map((date) => ({ date, event: byDate.get(date) ?? null })) }
  })

  app.put('/schedules/:id/occurrences/:date', { onRequest: billing, schema: { tags, summary: 'Record progress of one occurrence (released, paid, skipped)', params: occurrenceParams, body: eventPatch, response: { 200: eventOut } } }, async (req) => {
    const s = await getRow(req.params.id)
    const [row] = await db
      .insert(scheduleEvents)
      .values({ scheduleId: s.id, occurrenceDate: req.params.date, ...req.body })
      .onConflictDoUpdate({ target: [scheduleEvents.scheduleId, scheduleEvents.occurrenceDate], set: req.body })
      .returning()
    if (!row) throw new Error('event upsert failed')
    await audit(db, req, { action: 'schedule.event', entity: 'schedule', entityId: s.id, meta: { date: req.params.date, ...req.body } })
    return row
  })

  app.delete('/schedules/:id/occurrences/:date', { onRequest: billing, schema: { tags, summary: 'Reset the progress of one occurrence', params: occurrenceParams, response: { 200: okBody } } }, async (req) => {
    await getRow(req.params.id)
    await db.delete(scheduleEvents).where(and(eq(scheduleEvents.scheduleId, req.params.id), eq(scheduleEvents.occurrenceDate, req.params.date)))
    return { ok: true as const }
  })

  app.post('/schedules/:id/occurrences/:date/invoice', { onRequest: billing, schema: { tags, summary: 'Create (or return) the draft invoice for one occurrence of a receivable schedule', params: occurrenceParams, response: { 200: invoiceOut } } }, async (req) => {
    const inv = await createInvoiceFromSchedule(db, req.params.id, req.params.date)
    await audit(db, req, { action: 'invoice.create_from_schedule', entity: 'invoice', entityId: inv.id, meta: { scheduleId: req.params.id, date: req.params.date } })
    const [out] = await hydrate(db, [inv])
    if (!out) throw notFound('Invoice')
    return out
  })
}
