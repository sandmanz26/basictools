import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BroadcastWorker } from '../src/jobs/broadcast-worker.js'
import { broadcasts, shareLinks } from '../src/db/schema.js'
import type { MailMessage, MailProvider } from '../src/mail/provider.js'
import { adminLogin, createEnv, json, userWithRole, type Session, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Session
beforeAll(async () => { env = await createEnv(); admin = await adminLogin(env) })
afterAll(async () => { await env.close() })

describe('custom project statuses', () => {
  it('validates health, blocks removing a used status, remaps', async () => {
    const p = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'S', info: { health: 'at_risk' } })
    expect(p.status).toBe(201)
    expect((await json(env, 'POST', '/projects', admin, { name: 'Bad', info: { health: 'nope' } })).status).toBe(400)
    const list = await json<{ statuses: { id: string; label: string; color: string; attention: boolean }[] }>(env, 'GET', '/settings/project-statuses', admin)
    const withNew = [...list.body.statuses, { id: 'blocked', label: 'Blocked', color: 'red', attention: true }]
    expect((await json(env, 'PUT', '/settings/project-statuses', admin, { statuses: withNew })).status).toBe(200)
    await json(env, 'PATCH', `/projects/${p.body.id}`, admin, { info: { health: 'blocked' } })
    const without = withNew.filter((s) => s.id !== 'blocked')
    expect((await json(env, 'PUT', '/settings/project-statuses', admin, { statuses: without })).status).toBe(409)
    const r = await json<{ projects: number }>(env, 'POST', '/settings/project-statuses/remap', admin, { from: 'blocked', to: 'on_hold' })
    expect(r.body.projects).toBe(1)
    expect((await json(env, 'PUT', '/settings/project-statuses', admin, { statuses: without })).status).toBe(200)
    const got = await json<{ info: { health: string } }>(env, 'GET', `/projects/${p.body.id}`, admin)
    expect(got.body.info.health).toBe('on_hold')
  })
})

describe('talent portfolio and links', () => {
  it('stores http(s) portfolio links only', async () => {
    expect((await json(env, 'POST', '/talents', admin, { name: 'P', portfolio: 'https://x.dev/me' })).status).toBe(201)
    expect((await json(env, 'POST', '/talents', admin, { name: 'P', portfolio: 'javascript:alert(1)' })).status).toBe(400)
  })
})

describe('deleting things', () => {
  it('position delete removes it from share links', async () => {
    const pr = (await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'D' })).body.id
    const pos = (await json<{ id: string }>(env, 'POST', `/projects/${pr}/positions`, admin, { title: 'A' })).body.id
    const link = (await json<{ id: string }>(env, 'POST', `/projects/${pr}/share-links`, admin, { positionIds: [pos] })).body.id
    expect((await json(env, 'DELETE', `/positions/${pos}`, admin)).status).toBe(200)
    const [row] = await env.db.select().from(shareLinks).where(eq(shareLinks.id, link))
    expect(row?.positionIds).toEqual([])
  })

  it('user delete refuses self and the last admin', async () => {
    expect((await json(env, 'DELETE', `/users/${admin.userId}`, admin)).status).toBe(403)
    const viewer = await userWithRole(env, 'viewer')
    expect((await json(env, 'DELETE', `/users/${viewer.userId}`, admin)).status).toBe(200)
  })
})

class Fake implements MailProvider {
  readonly name = 'fake'
  sent: MailMessage[] = []
  async send(m: MailMessage) { this.sent.push(m); return { messageId: 'x' } }
}

describe('per-broadcast limits and one-off email', () => {
  it('daily cap, own window and auto resume', async () => {
    const mkt = await userWithRole(env, 'mkt')
    await json(env, 'POST', '/leads/import', mkt, { records: Array.from({ length: 6 }, (_, i) => ({ name: `L${i}`, email: `l${i}@cap.test`, tags: 'cap' })) })
    const b = await json<{ id: string }>(env, 'POST', '/broadcasts', mkt, { name: 'cap', subject: 's', body: 'b', filters: { tag: 'cap' }, dailyCap: 4, windowStart: 9, windowEnd: 17 })
    expect(b.status).toBe(201)
    expect((await json(env, 'POST', '/broadcasts', mkt, { name: 'x', subject: 's', body: 'b', windowStart: 9 })).status).toBe(400)
    await json(env, 'POST', `/broadcasts/${b.body.id}/start`, mkt)
    const mail = new Fake()
    let now = new Date('2026-11-09T14:00:00Z') // 21:00 Jakarta: closed
    const w = new BroadcastWorker({ db: env.db, mail, clock: () => now, config: { ...env.config, BROADCAST_PER_MINUTE: 10, BROADCAST_PER_DAY: 100 } })
    expect((await w.tick()).reason).toBe('outside_window')
    now = new Date('2026-11-10T03:00:00Z')
    expect((await w.tick()).sent).toBe(4)
    now = new Date(now.getTime() + 120_000)
    expect((await w.tick()).sent).toBe(0) // own daily cap reached
    now = new Date('2026-11-11T03:00:00Z')
    expect((await w.tick()).sent).toBe(2)

    // pause with resumeAt resumes by itself
    await env.db.update(broadcasts).set({ status: 'paused', resumeAt: '2026-11-11T05:00:00.000Z', pausedReason: 'test' }).where(eq(broadcasts.id, b.body.id))
    now = new Date('2026-11-11T06:00:00Z')
    await w.tick()
    const [row] = await env.db.select().from(broadcasts).where(eq(broadcasts.id, b.body.id))
    expect(row?.status).toBe('done')
  })

  it('one-off lead email: merges, logs, refuses unsubscribed', async () => {
    const mkt = await userWithRole(env, 'mkt')
    const lead = (await json<{ id: string }>(env, 'POST', '/leads', mkt, { name: 'Ann Lee', company: 'Co', email: 'ann@one.test' })).body.id
    const r = await json<{ status: string; subject: string }>(env, 'POST', `/leads/${lead}/emails`, mkt, { subject: 'Hi {{firstName}}', body: 'At {{company}}' })
    expect(r.status).toBe(201)
    expect(r.body).toMatchObject({ status: 'sent', subject: 'Hi Ann' })
    expect(env.mail.outbox.at(-1)?.text).toBe('At Co')
    const log = await json<{ data: unknown[] }>(env, 'GET', `/leads/${lead}/emails`, mkt)
    expect(log.body.data).toHaveLength(1)
    await json(env, 'PATCH', `/leads/${lead}`, mkt, { unsubscribed: true })
    expect((await json(env, 'POST', `/leads/${lead}/emails`, mkt, { subject: 's', body: 'b' })).status).toBe(409)
  })
})
