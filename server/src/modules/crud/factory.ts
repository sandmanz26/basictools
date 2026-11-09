import { and, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm'
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core'
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from 'fastify'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import type { Permission } from '../../domain/permissions.js'
import { projects } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { idParam, okBody, patchOf } from '../../lib/schemas.js'
import { authenticate, requireAnyPermission } from '../../plugins/authz.js'

/** What a table must look like to be served by the factory. */
export type CrudTable = PgTable & { id: PgColumn; createdAt: PgColumn }

export interface ValidateContext {
  db: Db
  /** Set for project scoped resources. */
  projectId: string | null
  data: Record<string, unknown>
  /** The row being updated, when updating. */
  existing: Record<string, unknown> | null
}

export interface CrudConfig<T extends CrudTable, TIn extends z.ZodObject, TOut extends z.ZodType> {
  /** Singular entity name for audit actions, e.g. "task". */
  entity: string
  /** URL segment, e.g. "tasks". */
  path: string
  tag: string
  table: T
  /** Present for resources that live inside a project: list/create are nested under /projects/:id/<path>. */
  projectColumn?: PgColumn
  create: TIn
  out: TOut
  /** Caller needs ANY of these to read / to write. */
  read: Permission[]
  write: Permission[]
  /** ?name=value filters on equality. */
  filters?: Record<string, PgColumn>
  search?: PgColumn[]
  orderBy?: PgColumn
  validate?: (ctx: ValidateContext) => Promise<void>
  /** Runs just before a delete, for cleanup the foreign keys do not cover. */
  beforeDelete?: (ctx: { db: Db; id: string }) => Promise<void>
}

/**
 * Small typed CRUD factory. One call gives list (paginated, filterable, searchable), get, create, patch and delete,
 * each behind a permission check and each mutation written to the audit log.
 * The only casts are at the Drizzle boundary (insert/update value shapes), where the Zod schema is the source of truth.
 */
export function registerCrud<T extends CrudTable, TIn extends z.ZodObject, TOut extends z.ZodType>(app: FastifyInstance, cfg: CrudConfig<T, TIn, TOut>): void {
  const { db } = app.ctx
  const tags = [cfg.tag]
  const readPre = [authenticate, requireAnyPermission(...cfg.read)]
  const writePre = [authenticate, requireAnyPermission(...cfg.write)]
  const idCol = cfg.table.id
  const projectCol = cfg.projectColumn
  const filterShape = Object.fromEntries(Object.keys(cfg.filters ?? {}).map((k) => [k, z.string().max(120).optional()]))
  const query = z.object({
    ...filterShape,
    q: z.string().trim().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  const patchSchema = patchOf(cfg.create)

  const ensureProject = async (id: string) => {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)).limit(1)
    if (!p) throw notFound('Project')
  }
  const getRow = async (id: string): Promise<Record<string, unknown>> => {
    const [row] = await db.select().from(cfg.table as PgTable).where(eq(idCol, id)).limit(1)
    if (!row) throw notFound(cfg.entity)
    return row as Record<string, unknown>
  }

  // Schemas are Zod (compiled by the app-level validator/serializer). Typed loosely here: the factory is generic over them.
  const schemaOf = (s: object) => s as FastifySchema

  const list = async (req: FastifyRequest) => {
    const qs = req.query as Record<string, string | number | undefined>
    const page = Number(qs.page ?? 1)
    const pageSize = Number(qs.pageSize ?? 50)
    const conds: (SQL | undefined)[] = []
    if (projectCol) conds.push(eq(projectCol, (req.params as { id: string }).id))
    for (const [k, col] of Object.entries(cfg.filters ?? {})) if (qs[k] !== undefined) conds.push(eq(col, String(qs[k])))
    if (qs.q && cfg.search?.length) conds.push(or(...cfg.search.map((c) => ilike(c, likePattern(String(qs.q))))))
    const where = and(...conds)
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(cfg.table as PgTable).where(where)
    const data = await db
      .select()
      .from(cfg.table as PgTable)
      .where(where)
      .orderBy(desc(cfg.orderBy ?? cfg.table.createdAt))
      .limit(pageSize)
      .offset(offsetOf({ page, pageSize }))
    return { data, meta: { page, pageSize, total } }
  }

  const listPath = projectCol ? `/projects/:id/${cfg.path}` : `/${cfg.path}`
  app.route({ method: 'GET', url: listPath, onRequest: readPre, schema: schemaOf({ tags, summary: `List ${cfg.path}`, ...(projectCol ? { params: idParam } : {}), querystring: query, response: { 200: listOf(cfg.out) } }), handler: list })

  app.route({
    method: 'GET',
    url: `/${cfg.path}/:id`,
    onRequest: readPre,
    schema: schemaOf({ tags, summary: `Get one of ${cfg.path}`, params: idParam, response: { 200: cfg.out } }),
    handler: async (req) => getRow((req.params as { id: string }).id),
  })

  app.route({
    method: 'POST',
    url: listPath,
    onRequest: writePre,
    schema: schemaOf({ tags, summary: `Create ${cfg.entity}`, ...(projectCol ? { params: idParam } : {}), body: cfg.create, response: { 201: cfg.out } }),
    handler: async (req: FastifyRequest, reply: FastifyReply) => {
      const projectId = projectCol ? (req.params as { id: string }).id : null
      if (projectId) await ensureProject(projectId)
      const data = req.body as Record<string, unknown>
      await cfg.validate?.({ db, projectId, data, existing: null })
      const values = { ...data, ...(projectCol && projectId ? { projectId } : {}) } as T['$inferInsert']
      const rows = (await db.insert(cfg.table).values(values).returning()) as unknown as Record<string, unknown>[]
      const row = rows[0]
      const id = row?.id as string | undefined
      if (!row || !id) throw new Error(`${cfg.entity} insert failed`)
      await audit(db, req, { action: `${cfg.entity}.create`, entity: cfg.entity, entityId: id })
      return reply.code(201).send(row)
    },
  })

  app.route({ method: 'PATCH', url: `/${cfg.path}/:id`, onRequest: writePre, schema: schemaOf({ tags, summary: `Update ${cfg.entity}`, params: idParam, body: patchSchema, response: { 200: cfg.out } }), handler: async (req: FastifyRequest) => {
    const id = (req.params as { id: string }).id
    const existing = await getRow(id)
    const data = req.body as Record<string, unknown>
    await cfg.validate?.({ db, projectId: (existing.projectId as string | undefined) ?? null, data, existing })
    if (Object.keys(data).length === 0) return existing
    const rows = (await db.update(cfg.table).set(data as Partial<T['$inferInsert']>).where(eq(idCol, id)).returning()) as unknown as Record<string, unknown>[]
    await audit(db, req, { action: `${cfg.entity}.update`, entity: cfg.entity, entityId: id, meta: { fields: Object.keys(data) } })
    return rows[0] ?? existing
  } })

  app.route({ method: 'DELETE', url: `/${cfg.path}/:id`, onRequest: writePre, schema: schemaOf({ tags, summary: `Delete ${cfg.entity}`, params: idParam, response: { 200: okBody } }), handler: async (req: FastifyRequest) => {
    const id = (req.params as { id: string }).id
    await getRow(id)
    await cfg.beforeDelete?.({ db, id })
    await db.delete(cfg.table).where(eq(idCol, id))
    await audit(db, req, { action: `${cfg.entity}.delete`, entity: cfg.entity, entityId: id })
    return { ok: true as const }
  } })
}
