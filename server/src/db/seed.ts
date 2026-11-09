import { eq } from 'drizzle-orm'
import type { Config } from '../config.js'
import { DEFAULT_MKT_STAGES } from '../domain/defaults.js'
import { DEFAULT_ROLES, PERMISSIONS } from '../domain/permissions.js'
import { createPasswordHasher, passwordOk, PASSWORD_MESSAGE } from '../lib/password.js'
import type { Db } from './client.js'
import { billingProfile, rolePermissions, roles, settings, users } from './schema.js'

export interface SeedResult {
  roles: number
  adminCreated: boolean
}

/**
 * Idempotent. Creates the default roles (never overwrites permissions an admin already edited),
 * the singleton billing profile and the marketing stages, and ONE bootstrap admin when the env provides it.
 */
export async function seed(db: Db, config: Config): Promise<SeedResult> {
  let adminRoleId = ''
  for (const r of DEFAULT_ROLES) {
    const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, r.key)).limit(1)
    if (existing) {
      if (r.key === 'admin') adminRoleId = existing.id
      continue
    }
    const [created] = await db
      .insert(roles)
      .values({ key: r.key, name: r.name, description: r.description, isSystem: true })
      .returning({ id: roles.id })
    if (!created) throw new Error(`Could not create role ${r.key}`)
    const granted = PERMISSIONS.filter((p) => r.permissions[p])
    if (granted.length) await db.insert(rolePermissions).values(granted.map((permission) => ({ roleId: created.id, permission })))
    if (r.key === 'admin') adminRoleId = created.id
  }

  await db.insert(billingProfile).values({ id: 1 }).onConflictDoNothing()
  await db.insert(settings).values({ key: 'mktStages', value: DEFAULT_MKT_STAGES() }).onConflictDoNothing()

  let adminCreated = false
  const email = config.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const password = config.BOOTSTRAP_ADMIN_PASSWORD
  if (email && password) {
    if (!passwordOk(password)) throw new Error(`BOOTSTRAP_ADMIN_PASSWORD: ${PASSWORD_MESSAGE}`)
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
    if (!exists) {
      const hasher = createPasswordHasher(config)
      await db.insert(users).values({
        name: config.BOOTSTRAP_ADMIN_NAME,
        email,
        passwordHash: await hasher.hash(password),
        roleId: adminRoleId,
        status: 'active',
        passwordChangedAt: new Date().toISOString(),
      })
      adminCreated = true
    }
  }
  return { roles: DEFAULT_ROLES.length, adminCreated }
}
