import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { PERMISSIONS, type Permission } from '../../domain/permissions.js'
import { rolePermissions, roles, users } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { likePattern, listOf, offsetOf } from '../../lib/pagination.js'
import { idParam, okBody } from '../../lib/schemas.js'
import { guard } from '../../plugins/authz.js'
import { createAuthService } from '../auth/service.js'
import { approveBody, roleBody, roleCreate, roleOut, roleUpdate, userListQuery, userOut, userUpdate } from './schemas.js'

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  const { db } = app.ctx
  const authSvc = createAuthService(app.ctx)
  const tags = ['users & roles']
  const admin = guard('roles.manage')

  const userCols = {
    id: users.id, name: users.name, email: users.email, roleId: users.roleId, status: users.status, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
  }
  const getUser = async (id: string) => {
    const [u] = await db.select(userCols).from(users).where(eq(users.id, id)).limit(1)
    if (!u) throw notFound('User')
    return u
  }
  const assertRole = async (roleId: string) => {
    const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).limit(1)
    if (!r) throw badRequest('That role does not exist.')
  }
  const notSelf = (req: { auth?: { user: { id: string } } }, id: string, what: string) => {
    if (req.auth?.user.id === id) throw forbidden(`You cannot ${what} your own account.`)
  }

  // ---------- users ----------
  app.get('/users', { onRequest: admin, schema: { tags, summary: 'List users', querystring: userListQuery, response: { 200: listOf(userOut) } } }, async (req) => {
    const { status, roleId, q, page, pageSize } = req.query
    const where = and(
      status ? eq(users.status, status) : undefined,
      roleId ? eq(users.roleId, roleId) : undefined,
      q ? or(ilike(users.name, likePattern(q)), ilike(users.email, likePattern(q))) : undefined,
    )
    const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(users).where(where)
    const data = await db.select(userCols).from(users).where(where).orderBy(desc(users.createdAt)).limit(pageSize).offset(offsetOf(req.query))
    return { data, meta: { page, pageSize, total } }
  })

  app.get('/users/:id', { onRequest: admin, schema: { tags, summary: 'Get a user', params: idParam, response: { 200: userOut } } }, async (req) => getUser(req.params.id))

  app.patch('/users/:id', { onRequest: admin, schema: { tags, summary: 'Rename a user', params: idParam, body: userUpdate, response: { 200: userOut } } }, async (req) => {
    await getUser(req.params.id)
    await db.update(users).set({ name: req.body.name }).where(eq(users.id, req.params.id))
    await audit(db, req, { action: 'user.update', entity: 'user', entityId: req.params.id })
    return getUser(req.params.id)
  })

  app.post('/users/:id/approve', { onRequest: admin, schema: { tags, summary: 'Approve a pending account, optionally assigning a role', params: idParam, body: approveBody, response: { 200: userOut } } }, async (req) => {
    const u = await getUser(req.params.id)
    if (u.status !== 'pending') throw conflict('Only pending accounts can be approved.', 'NOT_PENDING')
    if (req.body.roleId) await assertRole(req.body.roleId)
    await db.update(users).set({ status: 'active', ...(req.body.roleId ? { roleId: req.body.roleId } : {}) }).where(eq(users.id, u.id))
    await audit(db, req, { action: 'user.approve', entity: 'user', entityId: u.id, meta: { roleId: req.body.roleId } })
    return getUser(u.id)
  })

  app.post('/users/:id/disable', { onRequest: admin, schema: { tags, summary: 'Disable an account and end its sessions', params: idParam, response: { 200: userOut } } }, async (req) => {
    notSelf(req, req.params.id, 'disable')
    await getUser(req.params.id)
    await db.update(users).set({ status: 'disabled' }).where(eq(users.id, req.params.id))
    await authSvc.revokeAllForUser(req.params.id)
    await audit(db, req, { action: 'user.disable', entity: 'user', entityId: req.params.id })
    return getUser(req.params.id)
  })

  app.post('/users/:id/enable', { onRequest: admin, schema: { tags, summary: 'Re-enable a disabled account', params: idParam, response: { 200: userOut } } }, async (req) => {
    const u = await getUser(req.params.id)
    if (u.status !== 'disabled') throw conflict('Only disabled accounts can be enabled.', 'NOT_DISABLED')
    await db.update(users).set({ status: 'active', failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id))
    await audit(db, req, { action: 'user.enable', entity: 'user', entityId: u.id })
    return getUser(u.id)
  })

  app.delete('/users/:id', { onRequest: admin, schema: { tags, summary: 'Delete an account (never yourself, never the last active admin)', params: idParam, response: { 200: okBody } } }, async (req) => {
    notSelf(req, req.params.id, 'delete')
    const u = await getUser(req.params.id)
    const [target] = await db.select({ roleKey: roles.key }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(eq(users.id, u.id)).limit(1)
    if (target?.roleKey === 'admin' && u.status === 'active') {
      const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).innerJoin(roles, eq(roles.id, users.roleId)).where(and(eq(roles.key, 'admin'), eq(users.status, 'active')))
      if (n <= 1) throw conflict('This is the last active admin.', 'LAST_ADMIN')
    }
    await db.delete(users).where(eq(users.id, u.id))
    await audit(db, req, { action: 'user.delete', entity: 'user', entityId: u.id, meta: { email: u.email } })
    return { ok: true as const }
  })

  app.put('/users/:id/role', { onRequest: admin, schema: { tags, summary: 'Change a user\'s role', params: idParam, body: roleBody, response: { 200: userOut } } }, async (req) => {
    notSelf(req, req.params.id, 'change the role of')
    await getUser(req.params.id)
    await assertRole(req.body.roleId)
    await db.update(users).set({ roleId: req.body.roleId }).where(eq(users.id, req.params.id))
    await audit(db, req, { action: 'user.change_role', entity: 'user', entityId: req.params.id, meta: { roleId: req.body.roleId } })
    return getUser(req.params.id)
  })

  // ---------- roles ----------
  const loadRoles = async (ids?: string[]) => {
    const rs = await db.select().from(roles).where(ids ? inArray(roles.id, ids) : undefined).orderBy(roles.createdAt)
    if (rs.length === 0) return []
    const perms = await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, rs.map((r) => r.id)))
    return rs.map((r) => {
      const granted = new Set(perms.filter((p) => p.roleId === r.id).map((p) => p.permission))
      return {
        id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem,
        permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, granted.has(p)])) as Record<Permission, boolean>,
      }
    })
  }
  const oneRole = async (id: string) => {
    const [r] = await loadRoles([id])
    if (!r) throw notFound('Role')
    return r
  }
  const setPerms = async (roleId: string, patch: Partial<Record<Permission, boolean>>) => {
    const current = new Set((await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId))).map((p) => p.permission))
    for (const p of PERMISSIONS) {
      if (!(p in patch)) continue
      if (patch[p]) current.add(p)
      else current.delete(p)
    }
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
      if (current.size) await tx.insert(rolePermissions).values([...current].map((permission) => ({ roleId, permission })))
    })
  }

  app.get('/roles', { onRequest: admin, schema: { tags, summary: 'List roles with their permissions', response: { 200: z.object({ data: z.array(roleOut) }) } } }, async () => ({ data: await loadRoles() }))

  app.post('/roles', { onRequest: admin, schema: { tags, summary: 'Create a role', body: roleCreate, response: { 201: roleOut } } }, async (req, reply) => {
    const key = `custom-${crypto.randomUUID().slice(0, 8)}`
    const [r] = await db.insert(roles).values({ key, name: req.body.name, description: req.body.description }).returning({ id: roles.id })
    if (!r) throw new Error('role insert failed')
    await setPerms(r.id, req.body.permissions)
    await audit(db, req, { action: 'role.create', entity: 'role', entityId: r.id })
    return reply.code(201).send(await oneRole(r.id))
  })

  app.patch('/roles/:id', { onRequest: admin, schema: { tags, summary: 'Edit a role (the Admin role always keeps every permission)', params: idParam, body: roleUpdate, response: { 200: roleOut } } }, async (req) => {
    const role = await oneRole(req.params.id)
    if (role.key === 'admin' && req.body.permissions) throw forbidden('The Admin role always has every permission.')
    const { name, description, permissions } = req.body
    if (name !== undefined || description !== undefined) {
      await db.update(roles).set({ ...(name !== undefined ? { name } : {}), ...(description !== undefined ? { description } : {}) }).where(eq(roles.id, role.id))
    }
    if (permissions) await setPerms(role.id, permissions)
    await audit(db, req, { action: 'role.update', entity: 'role', entityId: role.id, meta: { permissionsChanged: Boolean(permissions) } })
    return oneRole(role.id)
  })

  app.delete('/roles/:id', { onRequest: admin, schema: { tags, summary: 'Delete an unused custom role', params: idParam, response: { 200: okBody } } }, async (req) => {
    const role = await oneRole(req.params.id)
    if (role.isSystem) throw forbidden('Built-in roles cannot be deleted.')
    const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.roleId, role.id))
    if (n > 0) throw conflict('Move the users on this role to another role first.', 'ROLE_IN_USE')
    await db.delete(roles).where(eq(roles.id, role.id))
    await audit(db, req, { action: 'role.delete', entity: 'role', entityId: role.id })
    return { ok: true as const }
  })
}
