import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { candidates, positions, projects, shareLinks } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { randomToken } from '../../lib/crypto.js'
import { AppError, badRequest, forbidden, notFound } from '../../lib/errors.js'
import { dateStr, idParam, isoTs, okBody, patchOf, stagesSchema } from '../../lib/schemas.js'
import { auth, guard } from '../../plugins/authz.js'
import { strictLimit } from '../../plugins/security.js'

const base = {
  label: z.string().trim().max(200).default(''),
  access: z.enum(['public', 'password']).default('public'),
  view: z.enum(['table', 'kanban']).default('table'),
  showSalary: z.boolean().default(false),
  showContact: z.boolean().default(false),
  /** Empty = all positions. */
  positionIds: z.array(z.uuid()).max(200).default([]),
  enabled: z.boolean().default(true),
}
const passwordField = z.string().min(6, 'Use at least 6 characters.').max(128)

const shareCreate = z.object({ ...base, password: passwordField.optional() })
const shareUpdate = patchOf(z.object({ ...base, password: passwordField.optional() }))
const shareOut = z.object({
  id: z.uuid(),
  token: z.string(),
  projectId: z.uuid(),
  ...base,
  hasPassword: z.boolean(),
  views: z.number(),
  createdAt: isoTs,
  updatedAt: isoTs,
})

const publicBody = z.object({ password: z.string().max(128).optional() })
const publicOut = z.object({
  label: z.string(),
  view: z.enum(['table', 'kanban']),
  showSalary: z.boolean(),
  showContact: z.boolean(),
  project: z.object({ name: z.string(), stages: stagesSchema }),
  positions: z.array(z.object({ id: z.uuid(), title: z.string(), department: z.string(), level: z.string(), status: z.string(), arrangement: z.string(), salaryMin: z.number().nullable().optional(), salaryMax: z.number().nullable().optional() })),
  candidates: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      positionId: z.uuid().nullable(),
      stage: z.string(),
      nextStep: z.string(),
      screeningResult: z.string(),
      arrangement: z.string(),
      appliedAt: dateStr,
      owner: z.string(),
      rounds: z.record(z.string(), z.object({ date: z.string(), time: z.string(), result: z.string() })),
      email: z.string().optional(),
      phone: z.string().optional(),
      salaryMin: z.number().nullable().optional(),
      salaryMax: z.number().nullable().optional(),
    }),
  ),
})

type LinkRow = typeof shareLinks.$inferSelect
const toOut = ({ passwordHash, ...r }: LinkRow) => ({ ...r, hasPassword: Boolean(passwordHash) })

export const shareRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db, hasher, config } = app.ctx
  const tags = ['share links']
  const manage = guard('share.manage')

  const getRow = async (id: string) => {
    const [r] = await db.select().from(shareLinks).where(eq(shareLinks.id, id)).limit(1)
    if (!r) throw notFound('Share link')
    return r
  }
  const checkPositions = async (projectId: string, ids: string[]) => {
    if (!ids.length) return
    const found = await db.select({ id: positions.id }).from(positions).where(and(eq(positions.projectId, projectId), inArray(positions.id, ids)))
    if (found.length !== new Set(ids).size) throw badRequest('Some positions do not belong to this project.')
  }

  app.get('/projects/:id/share-links', { onRequest: manage, schema: { tags, summary: 'List share links of a project', params: idParam, response: { 200: z.object({ data: z.array(shareOut) }) } } }, async (req) => {
    const rows = await db.select().from(shareLinks).where(eq(shareLinks.projectId, req.params.id)).orderBy(asc(shareLinks.createdAt))
    return { data: rows.map(toOut) }
  })

  app.post('/projects/:id/share-links', { onRequest: manage, schema: { tags, summary: 'Create a share link. Password links need a password; it is stored as an argon2id hash', params: idParam, body: shareCreate, response: { 201: shareOut } } }, async (req, reply) => {
    const a = auth(req)
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, req.params.id)).limit(1)
    if (!p) throw notFound('Project')
    const { password, ...fields } = req.body
    if (fields.access === 'password' && !password) throw badRequest('A password is required for password-protected links.')
    if (fields.showSalary && !a.can('salary.view')) throw forbidden('You need salary access to publish salary data.')
    await checkPositions(p.id, fields.positionIds)
    const [row] = await db
      .insert(shareLinks)
      .values({ ...fields, projectId: p.id, token: randomToken(24), passwordHash: fields.access === 'password' && password ? await hasher.hash(password) : null, createdBy: a.user.id })
      .returning()
    if (!row) throw new Error('share link insert failed')
    await audit(db, req, { action: 'share.create', entity: 'share_link', entityId: row.id, meta: { access: row.access, showSalary: row.showSalary } })
    return reply.code(201).send(toOut(row))
  })

  app.patch('/share-links/:id', { onRequest: manage, schema: { tags, summary: 'Update a share link', params: idParam, body: shareUpdate, response: { 200: shareOut } } }, async (req) => {
    const a = auth(req)
    const cur = await getRow(req.params.id)
    const { password, ...fields } = req.body
    if (fields.showSalary && !a.can('salary.view')) throw forbidden('You need salary access to publish salary data.')
    if (fields.positionIds) await checkPositions(cur.projectId, fields.positionIds)
    const access = fields.access ?? cur.access
    let passwordHash: string | null | undefined
    if (access === 'public') passwordHash = null
    else if (password) passwordHash = await hasher.hash(password)
    else if (!cur.passwordHash) throw badRequest('A password is required for password-protected links.')
    const [row] = await db.update(shareLinks).set({ ...fields, ...(passwordHash !== undefined ? { passwordHash } : {}) }).where(eq(shareLinks.id, cur.id)).returning()
    await audit(db, req, { action: 'share.update', entity: 'share_link', entityId: cur.id, meta: { passwordChanged: Boolean(password) } })
    return toOut(row ?? cur)
  })

  app.post('/share-links/:id/rotate', { onRequest: manage, schema: { tags, summary: 'Issue a new URL token; the old URL stops working', params: idParam, response: { 200: shareOut } } }, async (req) => {
    const cur = await getRow(req.params.id)
    const [row] = await db.update(shareLinks).set({ token: randomToken(24), views: 0 }).where(eq(shareLinks.id, cur.id)).returning()
    await audit(db, req, { action: 'share.rotate', entity: 'share_link', entityId: cur.id })
    return toOut(row ?? cur)
  })

  app.delete('/share-links/:id', { onRequest: manage, schema: { tags, summary: 'Delete a share link', params: idParam, response: { 200: okBody } } }, async (req) => {
    const cur = await getRow(req.params.id)
    await db.delete(shareLinks).where(eq(shareLinks.id, cur.id))
    await audit(db, req, { action: 'share.delete', entity: 'share_link', entityId: cur.id })
    return { ok: true as const }
  })

  // ---------- public, no login ----------
  // Rate limited per IP *and* link so one link cannot be password-guessed from many requests of one client.
  const limit = strictLimit(config)
  app.post(
    '/public/share/:token',
    {
      config: { rateLimit: { ...limit.rateLimit, keyGenerator: (req) => `${req.ip}:${(req.params as { token?: string }).token ?? ''}` } },
      schema: { tags, summary: 'Read a shared pipeline. Send {"password"} for protected links', security: [], params: z.object({ token: z.string().min(10).max(64) }), body: publicBody, response: { 200: publicOut } },
    },
    async (req) => {
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, req.params.token)).limit(1)
      if (!link || !link.enabled) throw notFound('Share link')
      if (link.access === 'password') {
        if (!req.body.password) throw new AppError(401, 'SHARE_PASSWORD_REQUIRED', 'This link needs a password.')
        const ok = link.passwordHash ? await hasher.verify(link.passwordHash, req.body.password) : false
        if (!ok) {
          await audit(db, req, { action: 'share.password_failed', entity: 'share_link', entityId: link.id })
          throw new AppError(401, 'SHARE_PASSWORD_INVALID', 'That password is not correct.')
        }
      }
      const [project] = await db.select().from(projects).where(eq(projects.id, link.projectId)).limit(1)
      if (!project || project.status === 'archived') throw notFound('Share link')

      const scoped = link.positionIds.length > 0
      const pos = await db.select().from(positions).where(and(eq(positions.projectId, project.id), scoped ? inArray(positions.id, link.positionIds) : undefined))
      const cands = await db
        .select()
        .from(candidates)
        .where(and(eq(candidates.projectId, project.id), eq(candidates.archived, false), scoped ? inArray(candidates.positionId, link.positionIds) : undefined))
        .orderBy(asc(candidates.createdAt))
      await db.update(shareLinks).set({ views: sql`${shareLinks.views} + 1` }).where(eq(shareLinks.id, link.id))

      // Only the whitelisted fields leave the building. Notes, reject reasons and sources stay internal.
      return {
        label: link.label,
        view: link.view,
        showSalary: link.showSalary,
        showContact: link.showContact,
        project: { name: project.name, stages: project.stages },
        positions: pos.map((p) => ({
          id: p.id, title: p.title, department: p.department, level: p.level, status: p.status, arrangement: p.arrangement,
          ...(link.showSalary ? { salaryMin: p.salaryMin, salaryMax: p.salaryMax } : {}),
        })),
        candidates: cands.map((c) => ({
          id: c.id, name: c.name, positionId: c.positionId, stage: c.stage, nextStep: c.nextStep, screeningResult: c.screeningResult, arrangement: c.arrangement,
          appliedAt: c.appliedAt, owner: c.owner,
          rounds: Object.fromEntries(Object.entries(c.rounds).map(([k, r]) => [k, { date: r.date, time: r.time, result: r.result }])),
          ...(link.showContact ? { email: c.email, phone: c.phone } : {}),
          ...(link.showSalary ? { salaryMin: c.salaryMin, salaryMax: c.salaryMax } : {}),
        })),
      }
    },
  )
}
