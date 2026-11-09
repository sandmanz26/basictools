import { and, eq, inArray, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { broadcastRecipients, budgetItems, emailTemplates, leadColumns, leads, members, milestones, projects, risks, statusUpdates, tasks } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { badRequest } from '../../lib/errors.js'
import { getMktStages, getStatuses, setMktStages } from '../../lib/settings.js'
import { dateStr, emailOrEmpty, idr, isoTs, stagesSchema } from '../../lib/schemas.js'
import { guard } from '../../plugins/authz.js'
import { registerCrud, type ValidateContext } from './factory.js'

const meta = { id: z.uuid(), createdAt: isoTs, updatedAt: isoTs }
const projectMeta = { ...meta, projectId: z.uuid() }
const optDate = dateStr.nullable().default(null)
const priority = z.enum(['low', 'medium', 'high', 'critical'])
const health = z.string().min(1).max(60)

// ---------- PM ----------
const taskIn = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(10_000).default(''),
  stage: z.string().min(1).max(80),
  assignee: z.string().max(200).default(''),
  priority: priority.default('medium'),
  startDate: optDate,
  dueDate: optDate,
  estimateH: z.number().min(0).max(100_000).nullable().default(null),
  milestoneId: z.uuid().nullable().default(null),
  labels: z.string().max(300).default(''),
})
const milestoneIn = z.object({
  title: z.string().trim().min(1).max(300),
  date: optDate,
  status: z.enum(['upcoming', 'done', 'missed']).default('upcoming'),
  owner: z.string().max(200).default(''),
  notes: z.string().max(5000).default(''),
})
const riskIn = z.object({
  kind: z.enum(['risk', 'issue']).default('risk'),
  title: z.string().trim().min(1).max(300),
  probability: z.number().int().min(1).max(5).default(3),
  impact: z.number().int().min(1).max(5).default(3),
  status: z.enum(['open', 'mitigating', 'closed']).default('open'),
  owner: z.string().max(200).default(''),
  mitigation: z.string().max(5000).default(''),
  dueDate: optDate,
})
const memberIn = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().max(200).default(''),
  email: emailOrEmpty.default(''),
  allocation: z.number().int().min(0).max(100).default(100),
  startDate: optDate,
  endDate: optDate,
})
const budgetIn = z.object({
  category: z.string().max(200).default(''),
  description: z.string().max(5000).default(''),
  planned: idr.default(0),
  actual: idr.default(0),
})
const updateIn = z.object({
  date: dateStr.optional(),
  author: z.string().max(200).default(''),
  health: health.default('on_track'),
  summary: z.string().max(10_000).default(''),
  highlights: z.string().max(10_000).default(''),
  blockers: z.string().max(10_000).default(''),
  nextSteps: z.string().max(10_000).default(''),
})

// ---------- Marketing ----------
const leadIn = z.object({
  name: z.string().trim().max(200).default(''),
  company: z.string().trim().max(200).default(''),
  title: z.string().trim().max(200).default(''),
  email: emailOrEmpty.default(''),
  phone: z.string().trim().max(60).default(''),
  source: z.string().trim().max(120).default(''),
  stage: z.string().min(1).max(80).default('new'),
  value: idr.nullable().default(null),
  owner: z.string().max(200).default(''),
  nextAction: z.string().max(2000).default(''),
  nextActionDate: optDate,
  tags: z.string().max(300).default(''),
  notes: z.string().max(10_000).default(''),
  lastContactAt: optDate,
  unsubscribed: z.boolean().default(false),
  custom: z.record(z.string().max(80), z.string().max(2000)).default({}),
})
const templateIn = z.object({
  name: z.string().trim().min(1).max(200),
  subject: z.string().max(500).default(''),
  body: z.string().max(50_000).default(''),
})
const columnIn = z.object({
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'number', 'date', 'select']).default('text'),
  options: z.string().max(2000).default(''),
  sort: z.number().int().min(0).default(0),
})

const projectStages = async ({ db, projectId }: ValidateContext, pick: 'pmStages' | 'stages' = 'pmStages') => {
  if (!projectId) return []
  const [p] = await db.select({ s: projects[pick] }).from(projects).where(eq(projects.id, projectId)).limit(1)
  return p?.s ?? []
}

const importLead = leadIn.partial()

export const crudRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const pmRead = ['module.pm' as const]
  const pmWrite = ['pm.edit' as const]

  registerCrud(app, {
    entity: 'task', path: 'tasks', tag: 'pm: tasks', table: tasks, projectColumn: tasks.projectId, create: taskIn, out: z.object({ ...projectMeta, ...taskIn.shape }),
    read: pmRead, write: pmWrite, filters: { stage: tasks.stage, assignee: tasks.assignee, priority: tasks.priority }, search: [tasks.title, tasks.labels], orderBy: tasks.createdAt,
    validate: async (ctx) => {
      if (typeof ctx.data.stage === 'string' && !(await projectStages(ctx)).some((s) => s.id === ctx.data.stage)) throw badRequest('That stage does not exist on this project\'s board.')
      if (typeof ctx.data.milestoneId === 'string') {
        const [m] = await db.select({ p: milestones.projectId }).from(milestones).where(eq(milestones.id, ctx.data.milestoneId)).limit(1)
        if (!m || m.p !== ctx.projectId) throw badRequest('That milestone does not belong to this project.')
      }
    },
  })
  registerCrud(app, {
    entity: 'milestone', path: 'milestones', tag: 'pm: milestones', table: milestones, projectColumn: milestones.projectId, create: milestoneIn, out: z.object({ ...projectMeta, ...milestoneIn.shape }),
    read: pmRead, write: pmWrite, filters: { status: milestones.status }, search: [milestones.title], orderBy: milestones.date,
  })
  registerCrud(app, {
    entity: 'risk', path: 'risks', tag: 'pm: risks', table: risks, projectColumn: risks.projectId, create: riskIn, out: z.object({ ...projectMeta, ...riskIn.shape }),
    read: pmRead, write: pmWrite, filters: { kind: risks.kind, status: risks.status }, search: [risks.title], orderBy: risks.createdAt,
  })
  registerCrud(app, {
    entity: 'member', path: 'members', tag: 'pm: team', table: members, projectColumn: members.projectId, create: memberIn, out: z.object({ ...projectMeta, ...memberIn.shape }),
    read: pmRead, write: pmWrite, search: [members.name, members.role], orderBy: members.createdAt,
  })
  // Budget carries money, so it follows the /pm/budget page rule: pm.edit or pm.invoice.
  registerCrud(app, {
    entity: 'budget_item', path: 'budget-items', tag: 'pm: budget', table: budgetItems, projectColumn: budgetItems.projectId, create: budgetIn, out: z.object({ ...projectMeta, ...budgetIn.shape }),
    read: ['pm.edit', 'pm.invoice'], write: pmWrite, filters: { category: budgetItems.category }, search: [budgetItems.category, budgetItems.description], orderBy: budgetItems.createdAt,
  })
  registerCrud(app, {
    entity: 'status_update', path: 'status-updates', tag: 'pm: status updates', table: statusUpdates, projectColumn: statusUpdates.projectId, create: updateIn, out: z.object({ ...projectMeta, ...updateIn.shape, date: dateStr }),
    read: pmRead, write: pmWrite, orderBy: statusUpdates.date,
    validate: async ({ data }) => {
      if (typeof data.health === 'string' && !(await getStatuses(db)).some((s) => s.id === data.health)) throw badRequest('That project status does not exist.')
    },
  })

  registerCrud(app, {
    entity: 'lead', path: 'leads', tag: 'marketing: leads', table: leads, create: leadIn, out: z.object({ ...meta, ...leadIn.shape }),
    read: ['module.mkt'], write: ['mkt.edit'], filters: { stage: leads.stage, source: leads.source, owner: leads.owner }, search: [leads.name, leads.company, leads.email, leads.tags], orderBy: leads.createdAt,
    // Queued sends to a deleted lead would only turn into failures: drop them.
    beforeDelete: async ({ db: dbx, id }) => {
      await dbx.update(broadcastRecipients).set({ status: 'cancelled' }).where(and(eq(broadcastRecipients.leadId, id), eq(broadcastRecipients.status, 'pending')))
    },
    validate: async ({ data }) => {
      if (typeof data.stage === 'string' && !(await getMktStages(db)).some((s) => s.id === data.stage)) throw badRequest('That stage does not exist in the marketing pipeline.')
    },
  })
  registerCrud(app, {
    entity: 'email_template', path: 'email-templates', tag: 'marketing: templates', table: emailTemplates, create: templateIn, out: z.object({ ...meta, ...templateIn.shape }),
    read: ['module.mkt'], write: ['mkt.edit'], search: [emailTemplates.name, emailTemplates.subject], orderBy: emailTemplates.createdAt,
  })
  registerCrud(app, {
    entity: 'lead_column', path: 'lead-columns', tag: 'marketing: leads', table: leadColumns, create: columnIn, out: z.object({ ...meta, ...columnIn.shape }),
    read: ['module.mkt'], write: ['mkt.edit'], orderBy: leadColumns.sort,
  })

  // ---------- marketing pipeline stages ----------
  app.get('/settings/mkt-stages', { onRequest: guard('module.mkt'), schema: { tags: ['marketing: leads'], summary: 'Marketing pipeline stages', response: { 200: z.object({ stages: stagesSchema }) } } }, async () => ({ stages: await getMktStages(db) }))
  app.put('/settings/mkt-stages', { onRequest: guard('mkt.edit'), schema: { tags: ['marketing: leads'], summary: 'Replace the marketing pipeline stages', body: z.object({ stages: stagesSchema }), response: { 200: z.object({ stages: stagesSchema }) } } }, async (req) => {
    await setMktStages(db, req.body.stages)
    await audit(db, req, { action: 'settings.mkt_stages', entity: 'settings', entityId: 'mktStages' })
    return { stages: req.body.stages }
  })

  // ---------- bulk lead import (the owner's list of ~4,300 contacts) ----------
  app.post(
    '/leads/import',
    {
      onRequest: guard('mkt.edit'),
      schema: {
        tags: ['marketing: leads'],
        summary: 'Bulk import leads, skipping emails that already exist (case-insensitive)',
        body: z.object({ records: z.array(importLead).min(1).max(5000) }),
        response: { 200: z.object({ total: z.number(), created: z.number(), skipped: z.number() }) },
      },
    },
    async (req) => {
      const stages = await getMktStages(db)
      const firstStage = stages[0]?.id ?? 'new'
      const emails = req.body.records.map((r) => (r.email ?? '').toLowerCase()).filter(Boolean)
      const existing = new Set<string>()
      for (let i = 0; i < emails.length; i += 1000) {
        const rows = await db.select({ e: sql<string>`lower(${leads.email})` }).from(leads).where(inArray(sql`lower(${leads.email})`, emails.slice(i, i + 1000)))
        for (const r of rows) existing.add(r.e)
      }
      const seen = new Set<string>()
      const toInsert: (typeof leads.$inferInsert)[] = []
      let skipped = 0
      for (const r of req.body.records) {
        const email = (r.email ?? '').toLowerCase()
        if (email && (existing.has(email) || seen.has(email))) {
          skipped++
          continue
        }
        if (email) seen.add(email)
        toInsert.push({ ...r, email, stage: r.stage && stages.some((s) => s.id === r.stage) ? r.stage : firstStage, source: r.source || 'Import' })
      }
      for (let i = 0; i < toInsert.length; i += 500) await db.insert(leads).values(toInsert.slice(i, i + 500))
      await audit(db, req, { action: 'lead.import', entity: 'lead', meta: { total: req.body.records.length, created: toInsert.length, skipped } })
      return { total: req.body.records.length, created: toInsert.length, skipped }
    },
  )
}
