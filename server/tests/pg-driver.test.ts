import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createDb, type DbHandle } from '../src/db/client.js'
import { runMigrations } from '../src/db/migrate.js'
import { seed } from '../src/db/seed.js'
import { BroadcastWorker } from '../src/jobs/broadcast-worker.js'
import { createPasswordHasher } from '../src/lib/password.js'
import { ConsoleMailProvider } from '../src/mail/console.js'
import { PASSWORD, testConfig } from './helpers.js'

/**
 * The production path uses node-postgres, the other tests use PGlite directly.
 * This one talks to a real wire-protocol Postgres (PGlite behind a socket) through the same pool and
 * migrator as production, so driver differences (date/timestamp parsing, bigint, transactions) show up here.
 */
const PORT = 54_000 + Math.floor(Math.random() * 1000)
let server: PGLiteSocketServer
let lite: PGlite
let handle: DbHandle

beforeAll(async () => {
  lite = new PGlite()
  server = new PGLiteSocketServer({ db: lite, port: PORT, host: '127.0.0.1' })
  await server.start()
  handle = createDb({ DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, DB_POOL_MAX: 1, DB_SSL: false })
})
afterAll(async () => {
  await handle.close()
  await server.stop()
  await lite.close()
})

describe('node-postgres driver path', () => {
  it('runs the committed migrations, seeds, serves auth + data, and sends a broadcast', async () => {
    const config = testConfig()
    await runMigrations(handle.db)
    await runMigrations(handle.db) // idempotent
    const seeded = await seed(handle.db, config)
    expect(seeded).toMatchObject({ roles: 6, adminCreated: true })
    expect((await seed(handle.db, config)).adminCreated).toBe(false)

    const mail = new ConsoleMailProvider(true)
    const app = await buildApp({ config, db: handle.db, ping: handle.ping, hasher: createPasswordHasher(config), mail }, { logger: false })
    const res = await app.inject({ method: 'GET', url: '/readyz' })
    expect(res.statusCode).toBe(200)

    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@test.id', password: PASSWORD } })
    expect(login.statusCode).toBe(200)
    const headers = { authorization: `Bearer ${login.json<{ accessToken: string }>().accessToken}` }
    const call = (method: 'GET' | 'POST', url: string, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers, payload })

    const project = (await call('POST', '/projects', { name: 'Driver check' })).json<{ id: string; createdAt: string }>()
    expect(project.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
    const cand = await call('POST', `/projects/${project.id}/candidates`, { name: 'Pg Person', email: 'pg@x.id', salaryMin: 12_000_000 })
    expect(cand.statusCode).toBe(201)
    expect(cand.json<{ appliedAt: string; salaryMin: number }>()).toMatchObject({ salaryMin: 12_000_000 })
    expect(cand.json<{ appliedAt: string }>().appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const inv = await call('POST', '/invoices', { projectId: project.id, issueDate: '2026-11-01', dueDate: '2026-11-15', items: [{ description: 'x', qty: 2, unitPrice: 1_500_000 }] })
    expect(inv.statusCode).toBe(201)
    expect(inv.json<{ total: number; number: string }>()).toMatchObject({ total: 3_330_000 })

    await call('POST', '/leads/import', { records: [{ name: 'Lead One', email: 'one@lead.test', tags: 'drv' }, { name: 'Lead Two', email: 'two@lead.test', tags: 'drv' }] })
    const b = (await call('POST', '/broadcasts', { name: 'Drv', subject: 'Hi {{firstName}}', body: 'Body', filters: { tag: 'drv' } })).json<{ id: string }>()
    const started = await call('POST', `/broadcasts/${b.id}/start`)
    expect(started.statusCode).toBe(200)
    const worker = new BroadcastWorker({ db: handle.db, mail, config: { ...config, BROADCAST_PER_MINUTE: 10, BROADCAST_PER_DAY: 100 } })
    const tick = await worker.tick()
    expect(tick).toMatchObject({ sent: 2, finished: 1 })
    expect(mail.outbox.filter((m) => m.to.endsWith('@lead.test'))).toHaveLength(2)
    await app.close()
  })
})
