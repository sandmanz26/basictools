import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { loadConfig, type Config } from '../src/config.js'
import type { Db } from '../src/db/client.js'
import { MIGRATIONS_FOLDER } from '../src/db/migrate.js'
import * as schema from '../src/db/schema.js'
import { roles, users } from '../src/db/schema.js'
import { seed } from '../src/db/seed.js'
import { createPasswordHasher } from '../src/lib/password.js'
import { ConsoleMailProvider } from '../src/mail/console.js'

export const PASSWORD = 'Passw0rd-test'

export function testConfig(over: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused',
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123',
    UNSUBSCRIBE_SECRET: 'unsub-secret-unsub-secret-unsub-secret-1',
    COOKIE_SECURE: 'false',
    CORS_ORIGINS: 'http://localhost:5173',
    ARGON2_MEMORY_KIB: '1024',
    ARGON2_TIME_COST: '1',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    LOG_LEVEL: 'silent',
    WORKER_ENABLED: 'false',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@test.id',
    BOOTSTRAP_ADMIN_PASSWORD: PASSWORD,
    ...over,
  })
}

export async function createTestDb(config: Config): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  await seed(db, config)
  return { db, close: () => client.close() }
}

export interface TestEnv {
  app: FastifyInstance
  db: Db
  config: Config
  mail: ConsoleMailProvider
  close: () => Promise<void>
}

export async function createEnv(over: Record<string, string> = {}): Promise<TestEnv> {
  const config = testConfig(over)
  const { db, close } = await createTestDb(config)
  const mail = new ConsoleMailProvider(true)
  const app = await buildApp({ config, db, ping: async () => undefined, hasher: createPasswordHasher(config), mail }, { logger: false })
  await app.ready()
  return { app, db, config, mail, close: async () => { await app.close(); await close() } }
}

export interface Session {
  token: string
  cookie: string
  userId: string
  auth: { authorization: string }
}

export async function login(env: TestEnv, email: string, password = PASSWORD, remember = false): Promise<Session> {
  const res = await env.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password, remember } })
  if (res.statusCode !== 200) throw new Error(`login failed ${res.statusCode}: ${res.body}`)
  const body = res.json<{ accessToken: string; user: { id: string } }>()
  const c = res.cookies.find((x) => x.name === 'hf_refresh')
  return { token: body.accessToken, cookie: c?.value ?? '', userId: body.user.id, auth: { authorization: `Bearer ${body.accessToken}` } }
}

export const adminLogin = (env: TestEnv) => login(env, 'admin@test.id')

let counter = 0
/** Create an active user with a built-in role (by key) directly in the DB and sign them in. */
export async function userWithRole(env: TestEnv, roleKey: string): Promise<Session & { email: string }> {
  const [role] = await env.db.select({ id: roles.id }).from(roles).where(eq(roles.key, roleKey)).limit(1)
  if (!role) throw new Error(`role ${roleKey} missing`)
  const email = `${roleKey}-${++counter}@test.id`
  const hasher = createPasswordHasher(env.config)
  await env.db.insert(users).values({ name: `${roleKey} user`, email, passwordHash: await hasher.hash(PASSWORD), roleId: role.id, status: 'active' })
  return { ...(await login(env, email)), email }
}

export async function json<T>(env: TestEnv, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, s: Session | null, payload?: unknown) {
  const res = await env.app.inject({ method, url: `/api/v1${url}`, headers: s?.auth, payload: payload as object | undefined })
  return { status: res.statusCode, body: (res.body ? res.json() : null) as T, res }
}
