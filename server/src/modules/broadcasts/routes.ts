import { and, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { broadcastRecipients, broadcasts, emailSuppressions, leads, sentEmails } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { emailField, idParam, isoTs, okBody, patchOf } from '../../lib/schemas.js'
import { auth, guard } from '../../plugins/authz.js'
import { todayStr } from '../../lib/dates.js'
import { fillMerge, MERGE_FIELDS, renderBroadcast } from './render.js'
import { audienceFilters, countsFor, describeAudience, selectAudience } from './service.js'

const countsOut = z.object({ pending: z.number(), sending: z.number(), sent: z.number(), failed: z.number(), skipped: z.number(), cancelled: z.number(), total: z.number() })
const base = {
  name: z.string().trim().min(1).max(200),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(100_000),
  footer: z.boolean().default(true),
  filters: audienceFilters.default({}),
  /** Optional limits for this broadcast on top of the server-wide caps. 0 or null = no extra cap. */
  dailyCap: z.number().int().min(0).max(100_000).nullable().default(null),
  windowStart: z.number().int().min(0).max(23).nullable().default(null),
  windowEnd: z.number().int().min(1).max(24).nullable().default(null),
}
const checkWindow = (start: number | null | undefined, end: number | null | undefined) => {
  if ((start == null) !== (end == null)) throw badRequest('Set both windowStart and windowEnd, or neither.')
  if (start != null && end != null && start >= end) throw badRequest('windowEnd must be later than windowStart.')
}
const broadcastCreate = z.object(base)
const broadcastUpdate = patchOf(z.object(base))
const broadcastOut = z.object({
  id: z.uuid(),
  name: z.string(),
  subject: z.string(),
  body: z.string(),
  footer: z.boolean(),
  audience: z.string(),
  filters: audienceFilters,
  dailyCap: z.number().nullable(),
  windowStart: z.number().nullable(),
  windowEnd: z.number().nullable(),
  pausedReason: z.string(),
  resumeAt: isoTs.nullable(),
  status: z.enum(['draft', 'running', 'paused', 'done', 'cancelled']),
  counts: countsOut,
  startedAt: isoTs.nullable(),
  finishedAt: isoTs.nullable(),
  createdAt: isoTs,
  updatedAt: isoTs,
})
const recipientOut = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  status: z.enum(['pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled']),
  attempts: z.number(),
  nextAttemptAt: isoTs,
  sentAt: isoTs.nullable(),
  error: z.string(),
})
const recipientQuery = z.object({
  status: z.enum(['pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})
const listQuery = z.object({
  status: z.enum(['draft', 'running', 'paused', 'done', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})
const previewOut = z.object({
  eligible: z.number(),
  excluded: z.object({ noEmail: z.number(), invalidEmail: z.number(), unsubscribed: z.number(), suppressed: z.number(), duplicate: z.number() }),
  mergeFields: z.array(z.string()),
})
const throttleOut = z.object({ perMinute: z.number(), perDay: z.number(), windowStartHour: z.number(), windowEndHour: z.number(), tz: z.string() })
const detailOut = broadcastOut.extend({
  throttle: throttleOut,
  /** Rough time left at the per-minute cap, ignoring the daily cap and the send window. */
  minutesRemainingAtMinuteCap: z.number(),
  /** Days needed at the daily cap. */
  daysRemainingAtDailyCap: z.number(),
})

export const broadcastRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, config, mail } = app.ctx
  const tags = ['broadcasts']
  const read = guard('module.mkt')
  const send = guard('module.mkt', 'mkt.send')

  const getRow = async (id: string) => {
    const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1)
    if (!b) throw notFound('Broadcast')
    return b
  }
  const shape = async (rows: (typeof broadcasts.$inferSelect)[]) => {
    const counts = await countsFor(db, rows.map((r) => r.id))
    return rows.map((r) => ({ ...r, filters: r.filters as z.infer<typeof audienceFilters>, counts: counts.get(r.id) ?? { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, total: 0 } }))
  }
  const detail = async (id: string) => {
    const [b] = await shape([await getRow(id)])
    if (!b) throw notFound('Broadcast')
    const left = b.counts.pending + b.counts.sending
    return {
      ...b,
      throttle: { perMinute: config.BROADCAST_PER_MINUTE, perDay: config.BROADCAST_PER_DAY, windowStartHour: config.BROADCAST_WINDOW_START_HOUR, windowEndHour: config.BROADCAST_WINDOW_END_HOUR, tz: config.BROADCAST_TZ },
      minutesRemainingAtMinuteCap: Math.ceil(left / config.BROADCAST_PER_MINUTE),
      daysRemainingAtDailyCap: Math.ceil(left / config.BROADCAST_PER_DAY),
    }
  }

  app.get('/broadcasts', { onRequest: read, schema: { tags, summary: 'List broadcasts with delivery counts', querystring: listQuery, response: { 200: listOf(broadcastOut) } } }, async (req) => {
    const where = req.query.status ? eq(broadcasts.status, req.query.status) : undefined
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(broadcasts).where(where)
    const rows = await db.select().from(broadcasts).where(where).orderBy(desc(broadcasts.createdAt)).limit(req.query.pageSize).offset(offsetOf(req.query))
    return { data: await shape(rows), meta: { page: req.query.page, pageSize: req.query.pageSize, total } }
  })

  app.get('/broadcasts/:id', { onRequest: read, schema: { tags, summary: 'Broadcast with progress and throttle settings', params: idParam, response: { 200: detailOut } } }, async (req) => detail(req.params.id))

  app.get('/broadcasts/:id/recipients', { onRequest: read, schema: { tags, summary: 'Per recipient status and error', params: idParam, querystring: recipientQuery, response: { 200: listOf(recipientOut) } } }, async (req) => {
    await getRow(req.params.id)
    const { status, q, page, pageSize } = req.query
    const where = and(eq(broadcastRecipients.broadcastId, req.params.id), status ? eq(broadcastRecipients.status, status) : undefined, q ? ilike(broadcastRecipients.email, likePattern(q)) : undefined)
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(broadcastRecipients).where(where)
    const data = await db.select().from(broadcastRecipients).where(where).orderBy(broadcastRecipients.email).limit(pageSize).offset(offsetOf(req.query))
    return { data, meta: { page, pageSize, total } }
  })

  app.post('/broadcasts/audience-preview', { onRequest: read, schema: { tags, summary: 'Count who a filter would reach and why others are excluded', body: z.object({ filters: audienceFilters.default({}) }), response: { 200: previewOut } } }, async (req) => {
    const a = await selectAudience(db, req.body.filters)
    return { eligible: a.eligible.length, excluded: a.excluded, mergeFields: [...MERGE_FIELDS] }
  })

  app.post('/broadcasts', { onRequest: send, schema: { tags, summary: 'Create a draft broadcast', body: broadcastCreate, response: { 201: broadcastOut } } }, async (req, reply) => {
    checkWindow(req.body.windowStart, req.body.windowEnd)
    const [row] = await db.insert(broadcasts).values({ ...req.body, audience: describeAudience(req.body.filters), createdBy: auth(req).user.id }).returning()
    if (!row) throw new Error('broadcast insert failed')
    await audit(db, req, { action: 'broadcast.create', entity: 'broadcast', entityId: row.id })
    const [out] = await shape([row])
    if (!out) throw new Error('broadcast shape failed')
    return reply.code(201).send(out)
  })

  app.patch('/broadcasts/:id', { onRequest: send, schema: { tags, summary: 'Edit a draft broadcast', params: idParam, body: broadcastUpdate, response: { 200: broadcastOut } } }, async (req) => {
    const cur = await getRow(req.params.id)
    if (cur.status !== 'draft') throw conflict('Only drafts can be edited.', 'NOT_DRAFT')
    checkWindow(req.body.windowStart !== undefined ? req.body.windowStart : cur.windowStart, req.body.windowEnd !== undefined ? req.body.windowEnd : cur.windowEnd)
    const patch = { ...req.body, ...(req.body.filters ? { audience: describeAudience(req.body.filters) } : {}) }
    const [row] = Object.keys(patch).length ? await db.update(broadcasts).set(patch).where(eq(broadcasts.id, cur.id)).returning() : [cur]
    const [out] = await shape([row ?? cur])
    if (!out) throw notFound('Broadcast')
    return out
  })

  app.post('/broadcasts/:id/test-send', { onRequest: send, schema: { tags, summary: 'Send a test copy to yourself (or an address you name that is your own)', params: idParam, body: z.object({ to: emailField.optional() }), response: { 200: okBody } } }, async (req) => {
    const a = auth(req)
    const b = await getRow(req.params.id)
    // Only to the caller's own address: otherwise this endpoint is an open mail relay.
    const to = req.body.to ?? a.user.email
    if (to !== a.user.email) throw badRequest('Test mails can only go to your own account email.')
    const msg = renderBroadcast(b, { email: to, broadcastId: b.id, merge: { name: a.user.name, firstName: a.user.name.split(/\s+/)[0] ?? '', company: 'Example Co', title: 'Manager', owner: a.user.name } }, config)
    await mail.send({ ...msg, subject: `[TEST] ${msg.subject}` })
    await audit(db, req, { action: 'broadcast.test_send', entity: 'broadcast', entityId: b.id })
    return { ok: true as const }
  })

  app.post('/broadcasts/:id/start', { onRequest: send, schema: { tags, summary: 'Freeze the audience into recipient rows and start sending', params: idParam, response: { 200: detailOut } } }, async (req) => {
    const b = await getRow(req.params.id)
    if (b.status !== 'draft') throw conflict('This broadcast was already started.', 'ALREADY_STARTED')
    const audience = await selectAudience(db, b.filters as z.infer<typeof audienceFilters>)
    if (audience.eligible.length === 0) throw badRequest('Nobody in this audience can receive email.')
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      // Claim the draft first: a double click must not insert the audience twice.
      const claimed = await tx.update(broadcasts).set({ status: 'running', startedAt: now }).where(and(eq(broadcasts.id, b.id), eq(broadcasts.status, 'draft'))).returning({ id: broadcasts.id })
      if (claimed.length === 0) throw conflict('This broadcast was already started.', 'ALREADY_STARTED')
      for (let i = 0; i < audience.eligible.length; i += 500) {
        await tx
          .insert(broadcastRecipients)
          .values(audience.eligible.slice(i, i + 500).map((r) => ({ broadcastId: b.id, leadId: r.leadId, email: r.email, name: r.name, merge: r.merge })))
          .onConflictDoNothing({ target: [broadcastRecipients.broadcastId, broadcastRecipients.email] })
      }
    })
    await audit(db, req, { action: 'broadcast.start', entity: 'broadcast', entityId: b.id, meta: { recipients: audience.eligible.length, excluded: audience.excluded } })
    app.worker?.nudge()
    return detail(b.id)
  })

  const transition = (path: string, summary: string, from: ('running' | 'paused' | 'draft')[], to: 'running' | 'paused' | 'cancelled', action: string) =>
    app.post(`/broadcasts/:id/${path}`, { onRequest: send, schema: { tags, summary, params: idParam, response: { 200: detailOut } } }, async (req) => {
      const b = await getRow(req.params.id)
      if (!from.includes(b.status as 'running' | 'paused' | 'draft')) throw conflict(`Cannot ${path} a broadcast that is ${b.status}.`, 'BAD_STATE')
      await db.transaction(async (tx) => {
        await tx.update(broadcasts).set({ status: to, resumeAt: null, pausedReason: '', ...(to === 'cancelled' ? { finishedAt: new Date().toISOString() } : {}) }).where(eq(broadcasts.id, b.id))
        if (to === 'cancelled') {
          await tx.update(broadcastRecipients).set({ status: 'cancelled' }).where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending')))
        }
      })
      await audit(db, req, { action, entity: 'broadcast', entityId: b.id })
      if (to === 'running') app.worker?.nudge()
      return detail(b.id)
    })
  app.post('/broadcasts/:id/pause', { onRequest: send, schema: { tags, summary: 'Pause sending (in-flight messages finish). Optionally give a reason and a time to continue by itself', params: idParam, body: z.object({ reason: z.string().trim().max(300).default(''), resumeAt: isoTs.optional() }).nullish(), response: { 200: detailOut } } }, async (req) => {
    const body = req.body ?? { reason: '', resumeAt: undefined }
    const b = await getRow(req.params.id)
    if (b.status !== 'running') throw conflict(`Cannot pause a broadcast that is ${b.status}.`, 'BAD_STATE')
    if (body.resumeAt && Date.parse(body.resumeAt) <= Date.now()) throw badRequest('resumeAt must be in the future.')
    await db.update(broadcasts).set({ status: 'paused', pausedReason: body.reason ?? '', resumeAt: body.resumeAt ?? null }).where(eq(broadcasts.id, b.id))
    await audit(db, req, { action: 'broadcast.pause', entity: 'broadcast', entityId: b.id, meta: { reason: body.reason, resumeAt: body.resumeAt } })
    return detail(b.id)
  })
  transition('resume', 'Resume a paused broadcast', ['paused'], 'running', 'broadcast.resume')
  transition('cancel', 'Cancel: pending recipients will never be sent', ['running', 'paused', 'draft'], 'cancelled', 'broadcast.cancel')

  app.post('/broadcasts/:id/retry-failed', { onRequest: send, schema: { tags, summary: 'Queue failed recipients again (use after fixing the cause, or when a crash left delivery unknown)', params: idParam, response: { 200: detailOut } } }, async (req) => {
    const b = await getRow(req.params.id)
    if (b.status === 'draft' || b.status === 'cancelled') throw conflict(`Cannot retry a ${b.status} broadcast.`, 'BAD_STATE')
    const now = new Date().toISOString()
    await db.transaction(async (tx) => {
      await tx.update(broadcastRecipients).set({ status: 'pending', attempts: 0, nextAttemptAt: now, error: '' }).where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'failed')))
      if (b.status === 'done') await tx.update(broadcasts).set({ status: 'running', finishedAt: null }).where(eq(broadcasts.id, b.id))
    })
    await audit(db, req, { action: 'broadcast.retry_failed', entity: 'broadcast', entityId: b.id })
    app.worker?.nudge()
    return detail(b.id)
  })

  app.delete('/broadcasts/:id', { onRequest: send, schema: { tags, summary: 'Delete a draft, finished or cancelled broadcast', params: idParam, response: { 200: okBody } } }, async (req) => {
    const b = await getRow(req.params.id)
    if (b.status === 'running' || b.status === 'paused') throw conflict('Cancel the broadcast first.', 'BAD_STATE')
    await db.delete(broadcasts).where(eq(broadcasts.id, b.id))
    await audit(db, req, { action: 'broadcast.delete', entity: 'broadcast', entityId: b.id })
    return { ok: true as const }
  })

  // ---------- suppression list ----------
  const supOut = z.object({ email: z.string(), reason: z.enum(['unsubscribe', 'bounce', 'manual']), broadcastId: z.uuid().nullable(), createdAt: isoTs })
  app.get('/suppressions', { onRequest: read, schema: { tags: ['suppressions'], summary: 'Addresses that will never be mailed', querystring: z.object({ q: z.string().trim().max(200).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(50) }), response: { 200: listOf(supOut) } } }, async (req) => {
    const where = req.query.q ? ilike(emailSuppressions.email, likePattern(req.query.q)) : undefined
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(emailSuppressions).where(where)
    const data = await db.select().from(emailSuppressions).where(where).orderBy(desc(emailSuppressions.createdAt)).limit(req.query.pageSize).offset(offsetOf(req.query))
    return { data, meta: { page: req.query.page, pageSize: req.query.pageSize, total } }
  })

  app.post('/suppressions', { onRequest: send, schema: { tags: ['suppressions'], summary: 'Add an address to the suppression list', body: z.object({ email: emailField, reason: z.enum(['bounce', 'manual']).default('manual') }), response: { 200: okBody } } }, async (req) => {
    await db.insert(emailSuppressions).values({ email: req.body.email, reason: req.body.reason }).onConflictDoNothing()
    await db.update(leads).set({ unsubscribed: true }).where(sql`lower(${leads.email}) = ${req.body.email}`)
    await db.update(broadcastRecipients).set({ status: 'skipped', error: 'Address is on the suppression list.' }).where(and(eq(broadcastRecipients.email, req.body.email), inArray(broadcastRecipients.status, ['pending'])))
    await audit(db, req, { action: 'suppression.add', entity: 'suppression', entityId: req.body.email })
    return { ok: true as const }
  })

  app.delete('/suppressions/:email', { onRequest: send, schema: { tags: ['suppressions'], summary: 'Remove an address (only with the person\'s consent)', params: z.object({ email: emailField }), response: { 200: okBody } } }, async (req) => {
    await db.delete(emailSuppressions).where(eq(emailSuppressions.email, req.params.email))
    await audit(db, req, { action: 'suppression.remove', entity: 'suppression', entityId: req.params.email })
    return { ok: true as const }
  })

  // ---------- one-off email to a single lead (the lead page "send email" action) ----------
  const sentOut = z.object({ id: z.uuid(), leadId: z.uuid().nullable(), to: z.string(), subject: z.string(), body: z.string(), status: z.enum(['sent', 'failed']), error: z.string(), sentAt: isoTs })
  const asSent = (r: typeof sentEmails.$inferSelect) => ({ ...r, status: r.status === 'sent' ? ('sent' as const) : ('failed' as const) })

  app.get('/leads/:id/emails', { onRequest: read, schema: { tags: ['marketing: leads'], summary: 'Emails sent to this lead one by one', params: idParam, response: { 200: z.object({ data: z.array(sentOut) }) } } }, async (req) => {
    const rows = await db.select().from(sentEmails).where(eq(sentEmails.leadId, req.params.id)).orderBy(desc(sentEmails.sentAt)).limit(200)
    return { data: rows.map(asSent) }
  })

  app.post(
    '/leads/:id/emails',
    {
      onRequest: send,
      config: { rateLimit: { max: 30, timeWindow: 60_000 } },
      schema: { tags: ['marketing: leads'], summary: 'Send one email to a lead. Merge fields work; unsubscribed or suppressed leads are refused', params: idParam, body: z.object({ subject: z.string().trim().min(1).max(500), body: z.string().min(1).max(100_000) }), response: { 201: sentOut } },
    },
    async (req, reply) => {
      const a = auth(req)
      const [lead] = await db.select().from(leads).where(eq(leads.id, req.params.id)).limit(1)
      if (!lead) throw notFound('Lead')
      const to = lead.email.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw badRequest('This lead has no valid email address.')
      const [sup] = await db.select({ e: emailSuppressions.email }).from(emailSuppressions).where(eq(emailSuppressions.email, to)).limit(1)
      if (lead.unsubscribed || sup) throw conflict('This person unsubscribed. Do not email them.', 'SUPPRESSED')
      const name = lead.name.trim()
      const merge = { name, firstName: name.split(/\s+/)[0] ?? '', company: lead.company, title: lead.title, owner: lead.owner }
      const subject = fillMerge(req.body.subject, merge).replace(/[\r\n]+/g, ' ').trim()
      const text = fillMerge(req.body.body, merge)
      let status: 'sent' | 'failed' = 'sent'
      let error = ''
      let providerMessageId: string | null = null
      try {
        providerMessageId = (await mail.send({ to, subject, text })).messageId
      } catch (err) {
        status = 'failed'
        error = (err instanceof Error ? err.message : String(err)).slice(0, 1000)
      }
      const [row] = await db.insert(sentEmails).values({ leadId: lead.id, to, subject, body: text, status, error, sentBy: a.user.id, providerMessageId }).returning()
      if (!row) throw new Error('sent email insert failed')
      if (status === 'sent') await db.update(leads).set({ lastContactAt: todayStr() }).where(eq(leads.id, lead.id))
      await audit(db, req, { action: `lead.email_${status}`, entity: 'lead', entityId: lead.id })
      return reply.code(201).send(asSent(row))
    },
  )
}
