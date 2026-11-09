import { and, asc, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { positions, projects, shareLinks, testQuestions } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { arrangementEnum, httpUrl, idParam, idr, isoTs, okBody, patchOf } from '../../lib/schemas.js'
import { dropSalaryInput, stripSalary } from '../../lib/salary.js'
import { auth, guard, guardAny } from '../../plugins/authz.js'

const questionIn = z.object({
  text: z.string().trim().min(1).max(5000),
  type: z.enum(['essay', 'multiple_choice', 'coding', 'case_study']).default('essay'),
  weight: z.number().int().min(0).max(1000).default(1),
  answerKey: z.string().max(5000).default(''),
})
const questionOut = questionIn.extend({ id: z.uuid() })
// Question ids are assigned by the server; ids sent in a replace call are ignored.

const testFile = z.object({ id: z.string().max(80), name: z.string().max(300), size: z.number().int().min(0), uploadedAt: z.string().max(40) })
const formLink = z.object({ id: z.string().max(80), label: z.string().max(200), url: httpUrl })

const base = {
  title: z.string().trim().min(1).max(200),
  department: z.string().max(120).default(''),
  level: z.string().max(60).default(''),
  headcount: z.number().int().min(0).max(10_000).default(1),
  status: z.enum(['open', 'closed', 'draft']).default('open'),
  arrangement: arrangementEnum.default('Any'),
  salaryMin: idr.nullable().default(null),
  salaryMax: idr.nullable().default(null),
  description: z.string().max(20_000).default(''),
  requirements: z.string().max(20_000).default(''),
  testFiles: z.array(testFile).max(50).default([]),
  formLinks: z.array(formLink).max(50).default([]),
}
const positionCreate = z.object(base)
const positionUpdate = patchOf(z.object(base))

const positionOut = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  ...base,
  questions: z.array(questionOut),
  createdAt: isoTs,
  updatedAt: isoTs,
})

const listQuery = z.object({
  status: z.enum(['open', 'closed', 'draft']).optional(),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

type PositionRow = typeof positions.$inferSelect

async function withQuestions(db: Db, rows: PositionRow[], canSeeKeys: boolean, canSalary: boolean) {
  const qs = rows.length ? await db.select().from(testQuestions).where(inArray(testQuestions.positionId, rows.map((r) => r.id))).orderBy(asc(testQuestions.sort)) : []
  return rows.map((r) =>
    stripSalary(
      {
        ...r,
        questions: qs
          .filter((q) => q.positionId === r.id)
          // Answer keys are for test owners only.
          .map((q) => ({ id: q.id, text: q.text, type: q.type, weight: q.weight, answerKey: canSeeKeys ? q.answerKey : '' })),
      },
      canSalary,
    ),
  )
}

export const positionRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const tags = ['positions']
  const read = guardAny('module.hr', 'module.pm')

  const one = async (id: string, can: (p: 'salary.view' | 'tests.edit') => boolean) => {
    const [p] = await db.select().from(positions).where(eq(positions.id, id)).limit(1)
    if (!p) throw notFound('Position')
    const [out] = await withQuestions(db, [p], can('tests.edit'), can('salary.view'))
    if (!out) throw notFound('Position')
    return out
  }
  const ensureProject = async (id: string) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1)
    if (!p) throw notFound('Project')
  }

  app.get('/projects/:id/positions', { onRequest: read, schema: { tags, summary: 'List positions of a project', params: idParam, querystring: listQuery, response: { 200: listOf(positionOut) } } }, async (req) => {
    const a = auth(req)
    const { status, q, page, pageSize } = req.query
    const where = and(eq(positions.projectId, req.params.id), status ? eq(positions.status, status) : undefined, q ? ilike(positions.title, likePattern(q)) : undefined)
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(positions).where(where)
    const rows = await db.select().from(positions).where(where).orderBy(desc(positions.createdAt)).limit(pageSize).offset(offsetOf(req.query))
    return { data: await withQuestions(db, rows, a.can('tests.edit'), a.can('salary.view')), meta: { page, pageSize, total } }
  })

  app.get('/positions/:id', { onRequest: read, schema: { tags, summary: 'Get a position', params: idParam, response: { 200: positionOut } } }, async (req) => one(req.params.id, auth(req).can))

  app.post('/projects/:id/positions', { onRequest: guard('positions.edit'), schema: { tags, summary: 'Create a position', params: idParam, body: positionCreate, response: { 201: positionOut } } }, async (req, reply) => {
    const a = auth(req)
    await ensureProject(req.params.id)
    const [row] = await db.insert(positions).values({ ...dropSalaryInput(req.body, a.can('salary.view')), projectId: req.params.id }).returning({ id: positions.id })
    if (!row) throw new Error('position insert failed')
    await audit(db, req, { action: 'position.create', entity: 'position', entityId: row.id })
    return reply.code(201).send(await one(row.id, a.can))
  })

  app.patch('/positions/:id', { onRequest: guard('positions.edit'), schema: { tags, summary: 'Update a position', params: idParam, body: positionUpdate, response: { 200: positionOut } } }, async (req) => {
    const a = auth(req)
    await one(req.params.id, a.can)
    const patch = dropSalaryInput(req.body, a.can('salary.view'))
    if (Object.keys(patch).length) await db.update(positions).set(patch).where(eq(positions.id, req.params.id))
    await audit(db, req, { action: 'position.update', entity: 'position', entityId: req.params.id })
    return one(req.params.id, a.can)
  })

  app.put('/positions/:id/questions', { onRequest: guard('tests.edit'), schema: { tags, summary: 'Replace the screening question bank of a position', params: idParam, body: z.object({ questions: z.array(questionIn).max(200) }), response: { 200: positionOut } } }, async (req) => {
    const a = auth(req)
    await one(req.params.id, a.can)
    await db.transaction(async (tx) => {
      await tx.delete(testQuestions).where(eq(testQuestions.positionId, req.params.id))
      if (req.body.questions.length) {
        await tx.insert(testQuestions).values(req.body.questions.map((q, i) => ({ text: q.text, type: q.type, weight: q.weight, answerKey: q.answerKey, positionId: req.params.id, sort: i })))
      }
    })
    await audit(db, req, { action: 'position.questions_replace', entity: 'position', entityId: req.params.id, meta: { count: req.body.questions.length } })
    return one(req.params.id, a.can)
  })

  app.delete('/positions/:id', { onRequest: guard('positions.edit'), schema: { tags, summary: 'Delete a position (candidates keep their record, unlinked)', params: idParam, response: { 200: okBody } } }, async (req) => {
    await one(req.params.id, auth(req).can)
    await db.transaction(async (tx) => {
      // Share links stop pointing at the deleted position (candidates are unlinked by the foreign key).
      await tx
        .update(shareLinks)
        .set({ positionIds: sql`coalesce((select jsonb_agg(e) from jsonb_array_elements(${shareLinks.positionIds}) e where e <> to_jsonb(${req.params.id}::text)), '[]'::jsonb)` })
        .where(sql`${shareLinks.positionIds} @> to_jsonb(${req.params.id}::text)`)
      await tx.delete(positions).where(eq(positions.id, req.params.id))
    })
    await audit(db, req, { action: 'position.delete', entity: 'position', entityId: req.params.id })
    return { ok: true as const }
  })
}
