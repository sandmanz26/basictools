import { and, count, desc, eq, ilike, inArray, or } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { DbOrTx } from '../../db/client.js'
import { candidates, positions, projects, talents } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { idParam } from '../../lib/schemas.js'
import { dropSalaryInput, stripSalary } from '../../lib/salary.js'
import { todayStr } from '../../lib/dates.js'
import { TalentIndex, type PersonKey } from '../../lib/talent.js'
import { auth, guard } from '../../plugins/authz.js'
import { applyReschedule, applyRoundResult, emptyRound } from './logic.js'
import {
  archiveBody, candidateCreate, candidateListQuery, candidateOut, candidateUpdate, fromTalentsBody, moveBody, rescheduleBody, resultBody, roundParams, roundPatch,
} from './schemas.js'

type CandidateRow = typeof candidates.$inferSelect

export const candidateRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const tags = ['candidates']
  const read = guard('module.hr')
  const edit = guard('module.hr', 'candidates.edit')

  const getCandidate = async (id: string, dbx: DbOrTx = db) => {
    const [c] = await dbx.select().from(candidates).where(eq(candidates.id, id)).limit(1)
    if (!c) throw notFound('Candidate')
    return c
  }
  const getProject = async (id: string, dbx: DbOrTx = db) => {
    const [p] = await dbx.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!p) throw notFound('Project')
    return p
  }
  const assertPosition = async (positionId: string | null | undefined, projectId: string) => {
    if (!positionId) return
    const [p] = await db.select({ projectId: positions.projectId }).from(positions).where(eq(positions.id, positionId)).limit(1)
    if (!p || p.projectId !== projectId) throw badRequest('That position does not belong to this project.')
  }
  const out = (row: CandidateRow, canSalary: boolean) => stripSalary(row, canSalary)

  app.get('/projects/:id/candidates', { onRequest: read, schema: { tags, summary: 'List candidates of a project', params: idParam, querystring: candidateListQuery, response: { 200: listOf(candidateOut) } } }, async (req) => {
    const canSalary = auth(req).can('salary.view')
    const { stage, positionId, archived, q, page, pageSize } = req.query
    const where = and(
      eq(candidates.projectId, req.params.id),
      stage ? eq(candidates.stage, stage) : undefined,
      positionId ? eq(candidates.positionId, positionId) : undefined,
      archived === 'all' ? undefined : eq(candidates.archived, archived === 'true'),
      q ? or(ilike(candidates.name, likePattern(q)), ilike(candidates.email, likePattern(q)), ilike(candidates.phone, likePattern(q))) : undefined,
    )
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(candidates).where(where)
    const rows = await db.select().from(candidates).where(where).orderBy(desc(candidates.createdAt)).limit(pageSize).offset(offsetOf(req.query))
    return { data: rows.map((r) => out(r, canSalary)), meta: { page, pageSize, total } }
  })

  app.get('/candidates/:id', { onRequest: read, schema: { tags, summary: 'Get a candidate', params: idParam, response: { 200: candidateOut } } }, async (req) => out(await getCandidate(req.params.id), auth(req).can('salary.view')))

  app.post('/projects/:id/candidates', { onRequest: edit, schema: { tags, summary: 'Add a candidate (re-uses a matching talent pool entry or creates one)', params: idParam, body: candidateCreate, response: { 201: candidateOut } } }, async (req, reply) => {
    const a = auth(req)
    const project = await getProject(req.params.id)
    await assertPosition(req.body.positionId, project.id)
    const stage = project.stages.find((s) => s.id === req.body.stage) ?? project.stages[0]
    if (!stage) throw badRequest('The project has no stages.')
    const input = dropSalaryInput(req.body, a.can('salary.view'))
    const row = await db.transaction(async (tx) => {
      const pool = await tx.select({ id: talents.id, name: talents.name, email: talents.email, phone: talents.phone }).from(talents)
      // An explicit talentId means the web app already decided: link to that pool entry, or create it with that id.
      // Without one, look the person up in the pool (email, phone, then name).
      let talentId = input.talentId
        ? pool.find((t) => t.id === input.talentId)?.id
        : new TalentIndex<PersonKey & { id: string }>(pool).find({ name: input.name, email: input.email, phone: input.phone })?.id
      if (!talentId) {
        const [t] = await tx
          .insert(talents)
          .values({ ...(input.talentId ? { id: input.talentId } : {}), name: input.name, email: input.email, phone: input.phone, source: input.source, salaryMin: input.salaryMin ?? null, salaryMax: input.salaryMax ?? null, arrangement: input.arrangement, notes: input.notes })
          .returning({ id: talents.id })
        talentId = t?.id
      }
      const dup = talentId ? await tx.select({ id: candidates.id }).from(candidates).where(and(eq(candidates.projectId, project.id), eq(candidates.talentId, talentId))).limit(1) : []
      if (dup.length) throw conflict('This person is already a candidate in this project.', 'DUPLICATE_CANDIDATE')
      const { stage: _s, nextStep, ...rest } = input
      const [c] = await tx
        .insert(candidates)
        .values({ ...rest, projectId: project.id, talentId: talentId ?? null, stage: stage.id, nextStep: nextStep ?? stage.nextStep })
        .returning()
      if (!c) throw new Error('candidate insert failed')
      return c
    })
    await audit(db, req, { action: 'candidate.create', entity: 'candidate', entityId: row.id })
    return reply.code(201).send(out(row, a.can('salary.view')))
  })

  app.post('/projects/:id/candidates/from-talents', { onRequest: edit, schema: { tags, summary: 'Add talent pool entries to a project (skips people already in it)', params: idParam, body: fromTalentsBody, response: { 200: z.object({ added: z.number(), skipped: z.number() }) } } }, async (req) => {
    const project = await getProject(req.params.id)
    await assertPosition(req.body.positionId, project.id)
    const stage = project.stages.find((s) => s.id === req.body.stageId) ?? project.stages[0]
    if (!stage) throw badRequest('The project has no stages.')
    const ids = [...new Set(req.body.talentIds)]
    const pool = await db.select().from(talents).where(inArray(talents.id, ids))
    const have = new Set((await db.select({ t: candidates.talentId }).from(candidates).where(eq(candidates.projectId, project.id))).map((r) => r.t))
    const rows = pool
      .filter((t) => !have.has(t.id))
      .map((t) => ({
        projectId: project.id, talentId: t.id, positionId: req.body.positionId, name: t.name, email: t.email, phone: t.phone, source: t.source,
        salaryMin: t.salaryMin, salaryMax: t.salaryMax, arrangement: t.arrangement, notes: t.notes, stage: stage.id, nextStep: req.body.nextStep ?? stage.nextStep,
      }))
    for (let i = 0; i < rows.length; i += 500) await db.insert(candidates).values(rows.slice(i, i + 500))
    await audit(db, req, { action: 'candidate.add_from_talents', entity: 'project', entityId: project.id, meta: { added: rows.length } })
    return { added: rows.length, skipped: ids.length - rows.length }
  })

  app.patch('/candidates/:id', { onRequest: edit, schema: { tags, summary: 'Edit candidate fields (not stage or rounds)', params: idParam, body: candidateUpdate, response: { 200: candidateOut } } }, async (req) => {
    const a = auth(req)
    const cur = await getCandidate(req.params.id)
    await assertPosition(req.body.positionId, cur.projectId)
    const patch = dropSalaryInput(req.body, a.can('salary.view'))
    const shared = { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.email !== undefined ? { email: patch.email } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}) }
    const row = await db.transaction(async (tx) => {
      const [updated] = Object.keys(patch).length ? await tx.update(candidates).set(patch).where(eq(candidates.id, cur.id)).returning() : [cur]
      // A person's name / email / phone live once in the pool and are mirrored on all their candidates.
      if (cur.talentId && Object.keys(shared).length) {
        await tx.update(talents).set(shared).where(eq(talents.id, cur.talentId))
        await tx.update(candidates).set(shared).where(eq(candidates.talentId, cur.talentId))
      }
      return updated ?? cur
    })
    await audit(db, req, { action: 'candidate.update', entity: 'candidate', entityId: cur.id })
    return out(row, a.can('salary.view'))
  })

  app.post('/candidates/:id/move', { onRequest: edit, schema: { tags, summary: 'Move a candidate to another stage', params: idParam, body: moveBody, response: { 200: candidateOut } } }, async (req) => {
    const cur = await getCandidate(req.params.id)
    const project = await getProject(cur.projectId)
    const target = project.stages.find((s) => s.id === req.body.stage)
    if (!target) throw badRequest('That stage does not exist in this project.')
    const [row] = await db.update(candidates).set({ stage: target.id, nextStep: target.nextStep }).where(eq(candidates.id, cur.id)).returning()
    await audit(db, req, { action: 'candidate.move', entity: 'candidate', entityId: cur.id, meta: { from: cur.stage, to: target.id } })
    return out(row ?? cur, auth(req).can('salary.view'))
  })

  const withRound = async (id: string, key: string) => {
    const cur = await getCandidate(id)
    const project = await getProject(cur.projectId)
    if (!project.stages.some((s) => s.id === key)) throw badRequest('That stage does not exist in this project.')
    return { cur, stages: project.stages }
  }

  app.patch('/candidates/:id/rounds/:key', { onRequest: edit, schema: { tags, summary: 'Edit date, time, interviewer or notes of an interview round', params: roundParams, body: roundPatch, response: { 200: candidateOut } } }, async (req) => {
    const { cur } = await withRound(req.params.id, req.params.key)
    const round = { ...(cur.rounds[req.params.key] ?? emptyRound()), ...req.body }
    const [row] = await db.update(candidates).set({ rounds: { ...cur.rounds, [req.params.key]: round } }).where(eq(candidates.id, cur.id)).returning()
    return out(row ?? cur, auth(req).can('salary.view'))
  })

  app.put('/candidates/:id/rounds/:key/result', { onRequest: edit, schema: { tags, summary: 'Set a round result: pass advances, fail moves to the lost stage', params: roundParams, body: resultBody, response: { 200: candidateOut } } }, async (req) => {
    const { cur, stages } = await withRound(req.params.id, req.params.key)
    const next = applyRoundResult(cur, stages, req.params.key, req.body.result)
    const [row] = await db.update(candidates).set(next).where(eq(candidates.id, cur.id)).returning()
    await audit(db, req, { action: 'candidate.round_result', entity: 'candidate', entityId: cur.id, meta: { round: req.params.key, result: req.body.result } })
    return out(row ?? cur, auth(req).can('salary.view'))
  })

  app.post('/candidates/:id/rounds/:key/reschedule', { onRequest: edit, schema: { tags, summary: 'Repeat an interview: keep the old attempt in history and open a fresh slot', params: roundParams, body: rescheduleBody, response: { 200: candidateOut } } }, async (req) => {
    const { cur, stages } = await withRound(req.params.id, req.params.key)
    const next = applyReschedule(cur, stages, req.params.key, req.body.reason, todayStr())
    if (!next) throw conflict('Nothing is scheduled for this round yet.', 'NOTHING_TO_RESCHEDULE')
    const [row] = await db.update(candidates).set(next).where(eq(candidates.id, cur.id)).returning()
    await audit(db, req, { action: 'candidate.reschedule', entity: 'candidate', entityId: cur.id, meta: { round: req.params.key, reason: req.body.reason } })
    return out(row ?? cur, auth(req).can('salary.view'))
  })

  app.post('/candidates/:id/archive', { onRequest: edit, schema: { tags, summary: 'Archive or restore a candidate', params: idParam, body: archiveBody, response: { 200: candidateOut } } }, async (req) => {
    const cur = await getCandidate(req.params.id)
    const [row] = await db.update(candidates).set({ archived: req.body.archived }).where(eq(candidates.id, cur.id)).returning()
    await audit(db, req, { action: req.body.archived ? 'candidate.archive' : 'candidate.restore', entity: 'candidate', entityId: cur.id })
    return out(row ?? cur, auth(req).can('salary.view'))
  })

  app.delete('/candidates/:id', { onRequest: guard('module.hr', 'candidates.delete'), schema: { tags, summary: 'Delete a candidate', params: idParam, response: { 200: z.object({ ok: z.literal(true) }) } } }, async (req) => {
    await getCandidate(req.params.id)
    await db.delete(candidates).where(eq(candidates.id, req.params.id))
    await audit(db, req, { action: 'candidate.delete', entity: 'candidate', entityId: req.params.id })
    return { ok: true as const }
  })
}
