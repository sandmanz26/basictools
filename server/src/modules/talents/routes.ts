import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { candidates, talents } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { arrangementEnum, emailOrEmpty, httpUrlOrEmpty, idParam, idr, isoTs, okBody, patchOf } from '../../lib/schemas.js'
import { dropSalaryInput, stripSalary } from '../../lib/salary.js'
import { TalentIndex, type PersonKey } from '../../lib/talent.js'
import { auth, guard } from '../../plugins/authz.js'

const base = {
  name: z.string().trim().min(1).max(200),
  email: emailOrEmpty.default(''),
  phone: z.string().trim().max(60).default(''),
  source: z.string().trim().max(120).default(''),
  skills: z.string().max(5000).default(''),
  portfolio: httpUrlOrEmpty.default(''),
  salaryMin: idr.nullable().default(null),
  salaryMax: idr.nullable().default(null),
  arrangement: arrangementEnum.default('Any'),
  notes: z.string().max(10_000).default(''),
}
const talentCreate = z.object({ ...base, id: z.uuid().optional() })
const talentUpdate = patchOf(z.object(base))
const talentOut = z.object({ id: z.uuid(), ...base, createdAt: isoTs, updatedAt: isoTs })

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  source: z.string().max(120).optional(),
  arrangement: arrangementEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

const importRecord = z.object({ ...base, arrangement: arrangementEnum.optional() })
const importBody = z.object({
  records: z.array(importRecord).min(1).max(5000),
  /** merge fills blank fields of the existing talent; skip leaves it untouched. */
  onDuplicate: z.enum(['merge', 'skip']).default('merge'),
})
const importOut = z.object({ total: z.number(), created: z.number(), merged: z.number(), skipped: z.number() })

type TalentRow = typeof talents.$inferSelect

/** Fill only the blank fields of an existing talent (the frontend fillTalent behaviour). */
function fill(cur: TalentRow, r: z.infer<typeof importRecord>, canSalary: boolean): Partial<TalentRow> {
  const patch: Partial<TalentRow> = {}
  if (!cur.email && r.email) patch.email = r.email
  if (!cur.phone && r.phone) patch.phone = r.phone
  if (!cur.source && r.source) patch.source = r.source
  if (!cur.skills && r.skills) patch.skills = r.skills
  if (!cur.portfolio && r.portfolio) patch.portfolio = r.portfolio
  if (!cur.notes && r.notes) patch.notes = r.notes
  if (canSalary && cur.salaryMin == null && r.salaryMin != null) patch.salaryMin = r.salaryMin
  if (canSalary && cur.salaryMax == null && r.salaryMax != null) patch.salaryMax = r.salaryMax
  if (cur.arrangement === 'Any' && r.arrangement && r.arrangement !== 'Any') patch.arrangement = r.arrangement
  return patch
}

export const talentRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const tags = ['talents']
  const read = guard('module.hr')
  const edit = guard('module.hr', 'candidates.edit')

  const one = async (id: string) => {
    const [t] = await db.select().from(talents).where(eq(talents.id, id)).limit(1)
    if (!t) throw notFound('Talent')
    return t
  }

  app.get('/talents', { onRequest: read, schema: { tags, summary: 'List the talent pool', querystring: listQuery, response: { 200: listOf(talentOut) } } }, async (req) => {
    const can = auth(req).can('salary.view')
    const { q, source, arrangement, page, pageSize } = req.query
    const where = and(
      source ? eq(talents.source, source) : undefined,
      arrangement ? eq(talents.arrangement, arrangement) : undefined,
      q ? or(ilike(talents.name, likePattern(q)), ilike(talents.email, likePattern(q)), ilike(talents.skills, likePattern(q)), ilike(talents.phone, likePattern(q))) : undefined,
    )
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(talents).where(where)
    const rows = await db.select().from(talents).where(where).orderBy(desc(talents.createdAt)).limit(pageSize).offset(offsetOf(req.query))
    return { data: rows.map((r) => stripSalary(r, can)), meta: { page, pageSize, total } }
  })

  app.get('/talents/:id', { onRequest: read, schema: { tags, summary: 'Get a talent', params: idParam, response: { 200: talentOut } } }, async (req) => stripSalary(await one(req.params.id), auth(req).can('salary.view')))

  app.post('/talents', { onRequest: edit, schema: { tags, summary: 'Add a talent', body: talentCreate, response: { 201: talentOut } } }, async (req, reply) => {
    const a = auth(req)
    const [row] = await db.insert(talents).values(dropSalaryInput(req.body, a.can('salary.view'))).returning()
    if (!row) throw new Error('talent insert failed')
    await audit(db, req, { action: 'talent.create', entity: 'talent', entityId: row.id })
    return reply.code(201).send(stripSalary(row, a.can('salary.view')))
  })

  app.patch('/talents/:id', { onRequest: edit, schema: { tags, summary: 'Update a talent; name, email and phone also update their project candidates', params: idParam, body: talentUpdate, response: { 200: talentOut } } }, async (req) => {
    const a = auth(req)
    await one(req.params.id)
    const patch = dropSalaryInput(req.body, a.can('salary.view'))
    const shared = { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.email !== undefined ? { email: patch.email } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}) }
    const row = await db.transaction(async (tx) => {
      const [updated] = Object.keys(patch).length
        ? await tx.update(talents).set(patch).where(eq(talents.id, req.params.id)).returning()
        : await tx.select().from(talents).where(eq(talents.id, req.params.id))
      if (Object.keys(shared).length) await tx.update(candidates).set(shared).where(eq(candidates.talentId, req.params.id))
      return updated
    })
    if (!row) throw notFound('Talent')
    await audit(db, req, { action: 'talent.update', entity: 'talent', entityId: row.id })
    return stripSalary(row, a.can('salary.view'))
  })

  app.delete('/talents/:id', { onRequest: guard('module.hr', 'candidates.delete'), schema: { tags, summary: 'Delete a talent (project candidates stay, unlinked)', params: idParam, response: { 200: okBody } } }, async (req) => {
    await one(req.params.id)
    await db.delete(talents).where(eq(talents.id, req.params.id))
    await audit(db, req, { action: 'talent.delete', entity: 'talent', entityId: req.params.id })
    return { ok: true as const }
  })

  app.post('/talents/import', { onRequest: edit, schema: { tags, summary: 'Bulk import with de-duplication by email, phone or name (same rules as the pool lookup in the app)', body: importBody, response: { 200: importOut } } }, async (req) => {
    const canSalary = auth(req).can('salary.view')
    const existing = await db.select().from(talents)
    const byId = new Map<string, TalentRow>(existing.map((t) => [t.id, t]))
    const index = new TalentIndex<PersonKey & { id: string }>(existing)
    const inserts: (typeof talents.$inferInsert)[] = []
    const updates = new Map<string, Partial<TalentRow>>()
    let created = 0
    let merged = 0
    let skipped = 0

    for (const r of req.body.records) {
      const found = index.find(r)
      if (!found) {
        const row = { id: crypto.randomUUID(), ...dropSalaryInput(r, canSalary), arrangement: r.arrangement ?? 'Any' }
        inserts.push(row)
        index.add({ ...row, email: row.email ?? '', phone: row.phone ?? '' })
        created++
        continue
      }
      if (req.body.onDuplicate === 'skip') {
        skipped++
        continue
      }
      // A row created earlier in this same batch lives in `inserts`, not in the DB yet.
      const pending = inserts.find((i) => i.id === found.id)
      if (pending) {
        const patch = fill({ ...(pending as TalentRow) }, r, canSalary)
        Object.assign(pending, patch)
      } else {
        const cur = byId.get(found.id)
        if (!cur) continue
        const patch = { ...updates.get(cur.id), ...fill({ ...cur, ...updates.get(cur.id) }, r, canSalary) }
        if (Object.keys(patch).length) updates.set(cur.id, patch)
      }
      merged++
    }

    await db.transaction(async (tx) => {
      for (let i = 0; i < inserts.length; i += 500) await tx.insert(talents).values(inserts.slice(i, i + 500))
      for (const [id, patch] of updates) await tx.update(talents).set(patch).where(eq(talents.id, id))
    })
    await audit(db, req, { action: 'talent.import', entity: 'talent', meta: { total: req.body.records.length, created, merged, skipped } })
    return { total: req.body.records.length, created, merged, skipped }
  })
}
