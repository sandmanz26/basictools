import { and, count, desc, eq, ilike, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { DEFAULT_HR_STAGES, DEFAULT_INFO, DEFAULT_PM_FEATURES, DEFAULT_PM_STAGES } from '../../domain/defaults.js'
import { candidates, projects, statusUpdates, tasks } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { getStatuses, setStatuses } from '../../lib/settings.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { idParam, okBody } from '../../lib/schemas.js'
import { auth, guard, guardAny } from '../../plugins/authz.js'
import { statusListSchema } from './schemas.js'
import { projectCreate, projectListQuery, projectOut, projectUpdate, stageRemoveQuery } from './schemas.js'

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const tags = ['projects']

  const getProject = async (id: string) => {
    const [p] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!p) throw notFound('Project')
    return p
  }

  const assertHealth = async (health: string | undefined) => {
    if (health !== undefined && !(await getStatuses(db)).some((s) => s.id === health)) throw badRequest('That project status does not exist.')
  }

  app.get('/projects', { onRequest: guardAny('module.hr', 'module.pm'), schema: { tags, summary: 'List projects', querystring: projectListQuery, response: { 200: listOf(projectOut) } } }, async (req) => {
    const { status, q, page, pageSize } = req.query
    const where = and(status ? eq(projects.status, status) : undefined, q ? ilike(projects.name, likePattern(q)) : undefined)
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(projects).where(where)
    const data = await db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(pageSize).offset(offsetOf(req.query))
    return { data, meta: { page, pageSize, total } }
  })

  app.get('/projects/:id', { onRequest: guardAny('module.hr', 'module.pm'), schema: { tags, summary: 'Get a project', params: idParam, response: { 200: projectOut } } }, async (req) => getProject(req.params.id))

  app.post('/projects', { onRequest: guard('projects.manage'), schema: { tags, summary: 'Create a project', body: projectCreate, response: { 201: projectOut } } }, async (req, reply) => {
    const b = req.body
    await assertHealth(b.info?.health)
    const [row] = await db
      .insert(projects)
      .values({
        ...(b.id ? { id: b.id } : {}),
        name: b.name,
        description: b.description,
        stages: b.stages ?? DEFAULT_HR_STAGES(),
        pmStages: b.pmStages ?? DEFAULT_PM_STAGES(),
        info: { ...DEFAULT_INFO(), ...b.info },
        pmFeatures: b.pmFeatures ?? DEFAULT_PM_FEATURES(),
        pmFields: b.pmFields ?? null,
        createdBy: auth(req).user.id,
      })
      .returning()
    if (!row) throw new Error('project insert failed')
    await audit(db, req, { action: 'project.create', entity: 'project', entityId: row.id })
    return reply.code(201).send(row)
  })

  app.patch('/projects/:id', { onRequest: guardAny('projects.manage', 'pm.edit'), schema: { tags, summary: 'Update a project. PM settings need pm.edit or projects.manage; name, status and HR stages need projects.manage', params: idParam, body: projectUpdate, response: { 200: projectOut } } }, async (req) => {
    const a = auth(req)
    const b = req.body
    if ((b.name !== undefined || b.description !== undefined || b.status !== undefined || b.stages !== undefined) && !a.can('projects.manage')) throw forbidden()
    const cur = await getProject(req.params.id)
    await assertHealth(b.info?.health)
    const [row] = await db
      .update(projects)
      .set({
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
        ...(b.stages !== undefined ? { stages: b.stages } : {}),
        ...(b.pmStages !== undefined ? { pmStages: b.pmStages } : {}),
        ...(b.info !== undefined ? { info: { ...cur.info, ...b.info } } : {}),
        ...(b.pmFeatures !== undefined ? { pmFeatures: { ...cur.pmFeatures, ...b.pmFeatures } } : {}),
        ...(b.pmFields !== undefined ? { pmFields: b.pmFields } : {}),
      })
      .where(eq(projects.id, cur.id))
      .returning()
    await audit(db, req, { action: b.status ? `project.${b.status === 'archived' ? 'archive' : 'restore'}` : 'project.update', entity: 'project', entityId: cur.id })
    return row ?? cur
  })

  app.delete('/projects/:id', { onRequest: guard('projects.manage'), schema: { tags, summary: 'Delete a project and everything in it (prefer archiving)', params: idParam, response: { 200: okBody } } }, async (req) => {
    const p = await getProject(req.params.id)
    await db.delete(projects).where(eq(projects.id, p.id))
    await audit(db, req, { action: 'project.delete', entity: 'project', entityId: p.id, meta: { name: p.name } })
    return { ok: true as const }
  })

  // Removing a stage never strands work: candidates / tasks move to another stage in the same call.
  app.delete('/projects/:id/stages/:stageId', { onRequest: guard('projects.manage'), schema: { tags, summary: 'Remove an HR stage, moving its candidates to ?moveTo', params: idParam.extend({ stageId: z.string() }), querystring: stageRemoveQuery, response: { 200: projectOut } } }, async (req) => {
    const p = await getProject(req.params.id)
    const { stageId } = req.params
    const target = p.stages.find((s) => s.id === req.query.moveTo)
    if (!p.stages.some((s) => s.id === stageId)) throw notFound('Stage')
    if (!target || target.id === stageId) throw badRequest('moveTo must be another stage of this project.')
    if (p.stages.length <= 1) throw badRequest('A project needs at least one stage.')
    return db.transaction(async (tx) => {
      await tx.update(candidates).set({ stage: target.id, nextStep: target.nextStep }).where(and(eq(candidates.projectId, p.id), eq(candidates.stage, stageId)))
      const [row] = await tx.update(projects).set({ stages: p.stages.filter((s) => s.id !== stageId) }).where(eq(projects.id, p.id)).returning()
      if (!row) throw notFound('Project')
      return row
    })
  })

  app.delete('/projects/:id/pm-stages/:stageId', { onRequest: guardAny('projects.manage', 'pm.edit'), schema: { tags, summary: 'Remove a PM board stage, moving its tasks to ?moveTo', params: idParam.extend({ stageId: z.string() }), querystring: stageRemoveQuery, response: { 200: projectOut } } }, async (req) => {
    const p = await getProject(req.params.id)
    const { stageId } = req.params
    if (!p.pmStages.some((s) => s.id === stageId)) throw notFound('Stage')
    if (!p.pmStages.some((s) => s.id === req.query.moveTo) || req.query.moveTo === stageId) throw badRequest('moveTo must be another stage of this project.')
    return db.transaction(async (tx) => {
      await tx.update(tasks).set({ stage: req.query.moveTo }).where(and(eq(tasks.projectId, p.id), eq(tasks.stage, stageId)))
      const [row] = await tx.update(projects).set({ pmStages: p.pmStages.filter((s) => s.id !== stageId) }).where(eq(projects.id, p.id)).returning()
      if (!row) throw notFound('Project')
      return row
    })
  })

  // ---------- project statuses (the "health" values teams can customise) ----------
  const statusRead = guardAny('module.pm', 'module.hr')
  const statusWrite = guardAny('pm.edit', 'projects.manage')
  const statusOut = z.object({ statuses: statusListSchema })

  app.get('/settings/project-statuses', { onRequest: statusRead, schema: { tags: ['project statuses'], summary: 'Project statuses (on track, at risk, ... or your own)', response: { 200: statusOut } } }, async () => ({ statuses: await getStatuses(db) }))

  app.put('/settings/project-statuses', { onRequest: statusWrite, schema: { tags: ['project statuses'], summary: 'Replace the status list. A status still used by a project or update cannot be removed: remap first', body: statusOut, response: { 200: statusOut } } }, async (req) => {
    const keep = new Set(req.body.statuses.map((s) => s.id))
    const inProjects = await db.selectDistinct({ id: sql<string>`${projects.info}->>'health'` }).from(projects)
    const inUpdates = await db.selectDistinct({ id: statusUpdates.health }).from(statusUpdates)
    const stuck = [...new Set([...inProjects, ...inUpdates].map((r) => r.id))].filter((id) => id && !keep.has(id))
    if (stuck.length) throw conflict(`These statuses are still in use: ${stuck.join(', ')}. Remap them first.`, 'STATUS_IN_USE')
    await setStatuses(db, req.body.statuses)
    await audit(db, req, { action: 'settings.project_statuses', entity: 'settings', entityId: 'projectStatuses' })
    return req.body
  })

  app.post('/settings/project-statuses/remap', { onRequest: statusWrite, schema: { tags: ['project statuses'], summary: 'Move every project and status update from one status to another (before deleting a status)', body: z.object({ from: z.string().min(1).max(60), to: z.string().min(1).max(60) }), response: { 200: z.object({ projects: z.number(), updates: z.number() }) } } }, async (req) => {
    await assertHealth(req.body.to)
    const { from, to } = req.body
    const moved = await db.transaction(async (tx) => {
      const p = await tx.update(projects).set({ info: sql`jsonb_set(${projects.info}, '{health}', to_jsonb(${to}::text))` }).where(sql`${projects.info}->>'health' = ${from}`).returning({ id: projects.id })
      const u = await tx.update(statusUpdates).set({ health: to }).where(eq(statusUpdates.health, from)).returning({ id: statusUpdates.id })
      return { projects: p.length, updates: u.length }
    })
    await audit(db, req, { action: 'settings.project_status_remap', entity: 'settings', entityId: 'projectStatuses', meta: { from, to, ...moved } })
    return moved
  })
}
