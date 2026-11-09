import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthContext } from '../context.js'
import { PERMISSIONS, type Permission } from '../domain/permissions.js'
import { roles, rolePermissions, users } from '../db/schema.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { verifyAccessToken } from '../lib/jwt.js'
import type { Db } from '../db/client.js'

const known = new Set<string>(PERMISSIONS)

/** Load the user and the permissions of their role fresh from the DB, so role changes and disabling apply immediately. */
export async function loadAuth(db: Db, userId: string): Promise<AuthContext | null> {
  const [u] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      roleId: users.roleId,
      roleKey: roles.key,
      status: users.status,
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.id, userId))
    .limit(1)
  if (!u || u.status !== 'active') return null
  const rows = await db.select({ p: rolePermissions.permission }).from(rolePermissions).where(eq(rolePermissions.roleId, u.roleId))
  const permissions = new Set<Permission>(rows.map((r) => r.p).filter((p): p is Permission => known.has(p)))
  return { user: u, permissions, can: (p) => permissions.has(p) }
}

/** onRequest: requires a valid access token in `Authorization: Bearer`. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw unauthorized()
  const { config, db } = req.server.ctx
  const userId = await verifyAccessToken(config.JWT_ACCESS_SECRET, token)
  if (!userId) throw unauthorized('Session expired or invalid.')
  const auth = await loadAuth(db, userId)
  if (!auth) throw unauthorized('Session expired or invalid.')
  req.auth = auth
}

/** The caller must hold ALL listed permissions. */
export function requirePermission(...perms: Permission[]) {
  return async (req: FastifyRequest): Promise<void> => {
    const auth = req.auth
    if (!auth) throw unauthorized()
    if (!perms.every((p) => auth.can(p))) throw forbidden()
  }
}

/** The caller must hold AT LEAST ONE listed permission (how the frontend ROUTE_ACCESS works). */
export function requireAnyPermission(...perms: Permission[]) {
  return async (req: FastifyRequest): Promise<void> => {
    const auth = req.auth
    if (!auth) throw unauthorized()
    if (!perms.some((p) => auth.can(p))) throw forbidden()
  }
}

/** Convenience: authenticate + all permissions. */
export const guard = (...perms: Permission[]) => [authenticate, requirePermission(...perms)]
/** Convenience: authenticate + any permission. */
export const guardAny = (...perms: Permission[]) => [authenticate, requireAnyPermission(...perms)]

export function auth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized()
  return req.auth
}
