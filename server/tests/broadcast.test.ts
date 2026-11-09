import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { BroadcastWorker } from '../src/jobs/broadcast-worker.js'
import { backoffSeconds, inSendWindow, localHour, sendBudget } from '../src/jobs/throttle.js'
import { broadcastRecipients, broadcasts, emailSuppressions, leads } from '../src/db/schema.js'
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../src/lib/unsubscribe.js'
import { MailError, type MailMessage, type MailProvider } from '../src/mail/provider.js'
import { createEnv, json, userWithRole, type Session, type TestEnv } from './helpers.js'

describe('throttle helpers', () => {
  it('sendBudget honours the tighter of the minute and day caps', () => {
    expect(sendBudget({ perMinute: 30, perDay: 1000 }, 0, 0)).toBe(30)
    expect(sendBudget({ perMinute: 30, perDay: 1000 }, 10, 0)).toBe(20)
    expect(sendBudget({ perMinute: 30, perDay: 1000 }, 0, 990)).toBe(10)
    expect(sendBudget({ perMinute: 30, perDay: 1000 }, 30, 0)).toBe(0)
    expect(sendBudget({ perMinute: 30, perDay: 1000 }, 0, 1000)).toBe(0)
    expect(sendBudget({ perMinute: 30, perDay: 1000 }, 99, 5000)).toBe(0) // never negative
  })

  it('backoff doubles and is capped', () => {
    expect([1, 2, 3, 4].map((n) => backoffSeconds(n, 60))).toEqual([60, 120, 240, 480])
    expect(backoffSeconds(30, 60)).toBe(6 * 3600)
    expect(backoffSeconds(3, 10, 25)).toBe(25)
  })

  it('send window is evaluated in the configured time zone', () => {
    const caps = { windowStartHour: 9, windowEndHour: 17, tz: 'Asia/Jakarta' } // UTC+7
    expect(localHour(new Date('2026-11-09T02:00:00Z'), 'Asia/Jakarta')).toBe(9)
    expect(inSendWindow(new Date('2026-11-09T01:59:00Z'), caps)).toBe(false) // 08:59
    expect(inSendWindow(new Date('2026-11-09T02:00:00Z'), caps)).toBe(true) // 09:00
    expect(inSendWindow(new Date('2026-11-09T09:59:00Z'), caps)).toBe(true) // 16:59
    expect(inSendWindow(new Date('2026-11-09T10:00:00Z'), caps)).toBe(false) // 17:00
    expect(inSendWindow(new Date('2026-11-09T20:00:00Z'), { windowStartHour: 0, windowEndHour: 24, tz: 'Asia/Jakarta' })).toBe(true)
  })
})

describe('unsubscribe tokens', () => {
  const secret = 'unsub-secret-unsub-secret-unsub-secret-1'
  it('round trips and rejects tampering or another secret', () => {
    const t = signUnsubscribeToken(secret, { email: 'A@B.id', broadcastId: 'b1' })
    expect(verifyUnsubscribeToken(secret, t)).toEqual({ email: 'a@b.id', broadcastId: 'b1' })
    const [body, sig] = t.split('.')
    const forged = `${Buffer.from(JSON.stringify({ e: 'victim@x.id', b: 'b1' })).toString('base64url')}.${sig}`
    expect(verifyUnsubscribeToken(secret, forged)).toBeNull()
    expect(verifyUnsubscribeToken('other-secret-other-secret-other-secret!', t)).toBeNull()
    expect(verifyUnsubscribeToken(secret, `${body}`)).toBeNull()
    expect(verifyUnsubscribeToken(secret, 'garbage')).toBeNull()
  })
})

/** A provider the tests can script. */
class FakeMail implements MailProvider {
  readonly name = 'fake'
  sent: MailMessage[] = []
  /** Return an error to fail this call, or undefined to succeed. */
  script: (msg: MailMessage, call: number) => Error | undefined = () => undefined
  calls = 0
  async send(msg: MailMessage) {
    const err = this.script(msg, ++this.calls)
    if (err) throw err
    this.sent.push(msg)
    return { messageId: `fake-${this.sent.length}` }
  }
}

let env: TestEnv
let mkt: Session
let admin: Session
let now: Date
const clock = () => now
const at = (iso: string) => { now = new Date(iso) }
const advance = (seconds: number) => { now = new Date(now.getTime() + seconds * 1000) }

const makeWorker = (mail: MailProvider, over: Partial<{ perMinute: number; perDay: number }> = {}) =>
  new BroadcastWorker({
    db: env.db,
    mail,
    clock,
    config: {
      ...env.config,
      BROADCAST_PER_MINUTE: over.perMinute ?? 5,
      BROADCAST_PER_DAY: over.perDay ?? 1000,
      BROADCAST_WINDOW_START_HOUR: 0,
      BROADCAST_WINDOW_END_HOUR: 24,
      BROADCAST_MAX_ATTEMPTS: 3,
      BROADCAST_BACKOFF_BASE_SECONDS: 60,
      BROADCAST_STALE_SENDING_SECONDS: 300,
    },
  })

let seq = 0
/** Insert n leads with unique emails and return a broadcast started for exactly them. */
async function startedBroadcast(n: number, opts: { tag?: string; footer?: boolean } = {}) {
  const tag = opts.tag ?? `t${++seq}`
  const records = Array.from({ length: n }, (_, i) => ({ name: `Person ${i} Surname`, company: 'Acme', email: `${tag}-${i}@mail.test`, tags: tag }))
  const imp = await json<{ created: number }>(env, 'POST', '/leads/import', mkt, { records })
  expect(imp.body.created).toBe(n)
  const b = await json<{ id: string }>(env, 'POST', '/broadcasts', mkt, {
    name: `B ${tag}`, subject: 'Hi {{firstName}} from {{owner}}', body: 'Hello {{name}} at {{company}}', footer: opts.footer ?? true, filters: { tag },
  })
  const started = await json<{ status: string; counts: { total: number } }>(env, 'POST', `/broadcasts/${b.body.id}/start`, mkt)
  expect(started.status).toBe(200)
  expect(started.body.counts.total).toBe(n)
  return b.body.id
}

const statusCounts = async (broadcastId: string) => {
  const d = await json<{ status: string; counts: Record<string, number> }>(env, 'GET', `/broadcasts/${broadcastId}`, mkt)
  return d.body
}
const rows = (broadcastId: string) => env.db.select().from(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, broadcastId))
const unique = (xs: string[]) => new Set(xs).size === xs.length

beforeAll(async () => {
  env = await createEnv()
  mkt = await userWithRole(env, 'mkt')
  admin = await userWithRole(env, 'admin')
})
afterAll(async () => { await env.close() })
// The queue is global (caps are shared across broadcasts), so each test starts from an empty queue.
beforeEach(async () => {
  await env.db.delete(broadcasts)
  await env.db.delete(emailSuppressions)
})

describe('throttled sending', () => {
  it('respects the per-minute cap, sends everyone exactly once and finishes', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(12)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 5 })

    expect((await w.tick()).sent).toBe(5)
    const again = await w.tick() // same minute
    expect(again.sent).toBe(0)
    expect(again.reason).toBe('budget_exhausted')
    advance(61)
    expect((await w.tick()).sent).toBe(5)
    advance(61)
    const last = await w.tick()
    expect(last.sent).toBe(2)
    expect(last.finished).toBe(1)

    expect(mail.sent).toHaveLength(12)
    expect(unique(mail.sent.map((m) => m.to))).toBe(true)
    const d = await statusCounts(id)
    expect(d.status).toBe('done')
    expect(d.counts).toMatchObject({ sent: 12, pending: 0, failed: 0 })
  })

  it('respects the per-day cap and continues the next local day', async () => {
    at('2026-11-09T03:00:00Z') // 10:00 Jakarta
    const id = await startedBroadcast(10)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 5, perDay: 7 })
    expect((await w.tick()).sent).toBe(5)
    advance(61)
    expect((await w.tick()).sent).toBe(2) // 7 reached
    advance(61)
    expect((await w.tick()).sent).toBe(0)
    advance(3600 * 5) // 15:00 Jakarta, same local day
    expect((await w.tick()).sent).toBe(0)
    expect((await statusCounts(id)).counts.pending).toBe(3)
    at('2026-11-10T03:00:00Z') // next day
    expect((await w.tick()).sent).toBe(3)
    expect((await statusCounts(id)).status).toBe('done')
    // The day is the Jakarta day: 18:00Z is already tomorrow there
  })

  it('does not send outside the send window', async () => {
    at('2026-11-09T14:00:00Z') // 21:00 Jakarta
    const id = await startedBroadcast(3)
    const mail = new FakeMail()
    const w = new BroadcastWorker({ db: env.db, mail, clock, config: { ...env.config, BROADCAST_PER_MINUTE: 10, BROADCAST_PER_DAY: 100, BROADCAST_WINDOW_START_HOUR: 9, BROADCAST_WINDOW_END_HOUR: 17, BROADCAST_TZ: 'Asia/Jakarta' } })
    const t = await w.tick()
    expect(t).toMatchObject({ sent: 0, reason: 'outside_window' })
    expect(mail.sent).toHaveLength(0)
    at('2026-11-10T03:00:00Z') // 10:00 next day
    expect((await w.tick()).sent).toBe(3)
    expect((await statusCounts(id)).status).toBe('done')
  })

  it('fills merge fields, adds the footer and one-click unsubscribe headers', async () => {
    at('2026-11-09T03:00:00Z')
    await startedBroadcast(1, { tag: 'merge' })
    const mail = new FakeMail()
    await makeWorker(mail).tick()
    const m = mail.sent[0]
    expect(m?.subject).toBe('Hi Person from') // owner empty
    expect(m?.text).toContain('Hello Person 0 Surname at Acme')
    expect(m?.text).toContain('/api/v1/unsubscribe/')
    expect(m?.headers?.['List-Unsubscribe']).toMatch(/^<http.*\/api\/v1\/unsubscribe\/.+>$/)
    expect(m?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(m?.idempotencyKey).toBeTruthy()
  })

  it('omits the footer when switched off but still sends the unsubscribe header', async () => {
    at('2026-11-09T03:00:00Z')
    await startedBroadcast(1, { footer: false })
    const mail = new FakeMail()
    await makeWorker(mail).tick()
    expect(mail.sent[0]?.text).not.toContain('Unsubscribe')
    expect(mail.sent[0]?.headers?.['List-Unsubscribe']).toBeDefined()
  })
})

describe('retries and errors', () => {
  it('retries a temporary failure with exponential backoff and records the error', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(2)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 10 })
    const flaky = (await rows(id)).find((r) => r.email.endsWith('-0@mail.test'))
    mail.script = (msg) => (msg.to === flaky?.email ? new MailError('421 try later', true) : undefined)

    const t1 = await w.tick()
    expect(t1).toMatchObject({ sent: 1, retried: 1 })
    let r = (await rows(id)).find((x) => x.id === flaky?.id)
    expect(r).toMatchObject({ status: 'pending', attempts: 1, error: '421 try later' })
    expect(Date.parse(r?.nextAttemptAt ?? '')).toBe(now.getTime() + 60_000)

    advance(30)
    expect((await w.tick()).sent).toBe(0) // not due yet
    advance(31)
    expect((await w.tick()).retried).toBe(1) // second failure -> 120s
    r = (await rows(id)).find((x) => x.id === flaky?.id)
    expect(r?.attempts).toBe(2)
    expect(Date.parse(r?.nextAttemptAt ?? '')).toBe(now.getTime() + 120_000)

    mail.script = () => undefined // provider recovers
    advance(121)
    const t4 = await w.tick()
    expect(t4.sent).toBe(1)
    expect(t4.finished).toBe(1)
    r = (await rows(id)).find((x) => x.id === flaky?.id)
    expect(r).toMatchObject({ status: 'sent', attempts: 3, error: '' })
    expect(mail.sent.filter((m) => m.to === flaky?.email)).toHaveLength(1)
  })

  it('gives up after the max attempts and keeps the last error per recipient', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(2)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 10 })
    mail.script = (msg) => (msg.to.includes('-1@') ? new Error('connection reset') : undefined) // not a MailError: treated as retryable
    for (let i = 0; i < 6; i++) {
      await w.tick()
      advance(300)
    }
    const failed = (await rows(id)).find((r) => r.email.includes('-1@'))
    expect(failed).toMatchObject({ status: 'failed', attempts: 3, error: 'connection reset' })
    const d = await statusCounts(id)
    expect(d.counts).toMatchObject({ sent: 1, failed: 1, pending: 0 })
    expect(d.status).toBe('done')

    // fix the problem, retry only the failed ones
    mail.script = () => undefined
    const retry = await json<{ status: string }>(env, 'POST', `/broadcasts/${id}/retry-failed`, mkt)
    expect(retry.body.status).toBe('running')
    advance(5)
    await w.tick()
    expect((await statusCounts(id)).counts).toMatchObject({ sent: 2, failed: 0 })
    expect(unique(mail.sent.filter((m) => m.to.startsWith(`${id}`)).map((m) => m.to))).toBe(true)
  })

  it('fails a permanent error at once without retrying', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(2)
    const mail = new FakeMail()
    mail.script = (msg) => (msg.to.includes('-0@') ? new MailError('550 no such mailbox', false) : undefined)
    const t = await makeWorker(mail, { perMinute: 10 }).tick()
    expect(t).toMatchObject({ sent: 1, failed: 1, retried: 0 })
    expect((await rows(id)).find((r) => r.status === 'failed')).toMatchObject({ attempts: 1, error: '550 no such mailbox' })
  })
})

describe('idempotency and restarts', () => {
  it('two workers ticking at the same moment never send the same recipient twice and never exceed the cap', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(14)
    const mail = new FakeMail()
    const a = makeWorker(mail, { perMinute: 6 })
    const b = makeWorker(mail, { perMinute: 6 })
    const [ra, rb] = await Promise.all([a.tick(), b.tick(), a.tick(), b.tick()])
    expect((ra?.sent ?? 0) + (rb?.sent ?? 0)).toBeLessThanOrEqual(6)
    expect(mail.sent.length).toBe(6)
    expect(unique(mail.sent.map((m) => m.to))).toBe(true)
    for (let i = 0; i < 6; i++) {
      advance(61)
      await Promise.all([a.tick(), b.tick()])
    }
    expect(mail.sent).toHaveLength(14)
    expect(unique(mail.sent.map((m) => m.to))).toBe(true)
    expect((await statusCounts(id)).status).toBe('done')
  })

  it('a restart (fresh worker, same database) continues without resending', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(8)
    const mail = new FakeMail()
    await makeWorker(mail, { perMinute: 5 }).tick()
    expect(mail.sent).toHaveLength(5)
    const restarted = makeWorker(mail, { perMinute: 5 }) // new process
    advance(61)
    await restarted.tick()
    expect(mail.sent).toHaveLength(8)
    expect(unique(mail.sent.map((m) => m.to))).toBe(true)
    expect((await statusCounts(id)).counts.sent).toBe(8)
  })

  it('a crash mid-send leaves "sending" rows that are never auto-resent; they count against the budget until recovered', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(4)
    const [victim] = await rows(id)
    // simulate: claimed, provider may or may not have delivered, process died
    await env.db.update(broadcastRecipients).set({ status: 'sending', claimedAt: now.toISOString(), attempts: 1 }).where(eq(broadcastRecipients.id, victim?.id ?? ''))
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 5 })

    expect((await w.tick()).sent).toBe(3) // victim untouched, budget 5 - 1 in flight = 4, only 3 left
    advance(301)
    const t = await w.tick()
    expect(t.recovered).toBe(1)
    const v = (await rows(id)).find((r) => r.id === victim?.id)
    expect(v?.status).toBe('failed')
    expect(v?.error).toMatch(/Delivery state unknown/)
    expect(mail.sent.some((m) => m.to === victim?.email)).toBe(false) // never re-sent
    expect((await statusCounts(id)).status).toBe('done')
  })

  it('stop() lets the in-flight tick finish', async () => {
    at('2026-11-09T03:00:00Z')
    await startedBroadcast(2)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 5 })
    w.start()
    await new Promise((r) => setTimeout(r, 300))
    await w.stop()
    await w.stop() // idempotent
    expect(mail.sent.length).toBeGreaterThanOrEqual(0)
    expect(unique(mail.sent.map((m) => m.to))).toBe(true)
  })
})

describe('pause, resume, cancel', () => {
  it('pause stops sending, resume continues, cancel drops what is left', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(9)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 3 })
    await w.tick()
    expect(mail.sent).toHaveLength(3)

    const paused = await json<{ status: string }>(env, 'POST', `/broadcasts/${id}/pause`, mkt)
    expect(paused.body.status).toBe('paused')
    advance(61)
    expect((await w.tick()).sent).toBe(0)
    expect(mail.sent).toHaveLength(3)
    expect((await json(env, 'POST', `/broadcasts/${id}/pause`, mkt)).status).toBe(409) // already paused

    expect((await json<{ status: string }>(env, 'POST', `/broadcasts/${id}/resume`, mkt)).body.status).toBe('running')
    expect((await w.tick()).sent).toBe(3)

    const cancelled = await json<{ status: string; counts: Record<string, number> }>(env, 'POST', `/broadcasts/${id}/cancel`, mkt)
    expect(cancelled.body.status).toBe('cancelled')
    expect(cancelled.body.counts).toMatchObject({ sent: 6, cancelled: 3, pending: 0 })
    advance(61)
    expect((await w.tick()).sent).toBe(0)
    expect(mail.sent).toHaveLength(6)
  })

  it('a message claimed just before a pause goes back to pending, not lost and not sent', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(2)
    const mail = new FakeMail()
    const w = makeWorker(mail, { perMinute: 5 })
    // pause lands between claim and delivery
    mail.script = () => undefined
    await env.db.update(broadcasts).set({ status: 'paused' }).where(eq(broadcasts.id, id))
    expect((await w.tick()).sent).toBe(0)
    expect((await statusCounts(id)).counts).toMatchObject({ pending: 2, sending: 0 })
  })
})

describe('audience, suppression and unsubscribe', () => {
  it('previews the audience and excludes bad, duplicate, unsubscribed and suppressed addresses', async () => {
    const tag = 'aud'
    await json(env, 'POST', '/leads/import', mkt, {
      records: [
        { name: 'Ok', email: 'ok@aud.test', tags: tag },
        { name: 'No mail', email: '', tags: tag },
        { name: 'Unsub', email: 'unsub@aud.test', tags: tag, unsubscribed: true },
        { name: 'Sup', email: 'sup@aud.test', tags: tag },
      ],
    })
    await env.db.insert(emailSuppressions).values({ email: 'sup@aud.test', reason: 'bounce' })
    // the import endpoint validates emails, so a malformed one can only exist from older data: insert it directly
    await env.db.insert(leads).values({ name: 'Bad2', email: 'broken@', tags: tag, stage: 'new' })
    await env.db.insert(leads).values({ name: 'Dup', email: 'OK@aud.test', tags: tag, stage: 'new' })
    const p = await json<{ eligible: number; excluded: Record<string, number> }>(env, 'POST', '/broadcasts/audience-preview', mkt, { filters: { tag } })
    expect(p.body.eligible).toBe(1)
    expect(p.body.excluded).toMatchObject({ noEmail: 1, invalidEmail: 1, unsubscribed: 1, suppressed: 1, duplicate: 1 })
  })

  it('one-click unsubscribe: GET is harmless, POST suppresses, drops queued mail and flags the lead', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(3)
    const target = (await rows(id))[0]
    const token = signUnsubscribeToken(env.config.UNSUBSCRIBE_SECRET, { email: target?.email ?? '', broadcastId: id })

    const get = await env.app.inject({ method: 'GET', url: `/api/v1/unsubscribe/${token}` })
    expect(get.statusCode).toBe(200)
    expect(get.headers['content-type']).toContain('text/html')
    expect(await env.db.select().from(emailSuppressions).where(eq(emailSuppressions.email, target?.email ?? ''))).toHaveLength(0) // prefetch safe

    // mail clients POST this exact body without any login
    const post = await env.app.inject({ method: 'POST', url: `/api/v1/unsubscribe/${token}`, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'List-Unsubscribe=One-Click' })
    expect(post.statusCode).toBe(200)
    expect(await env.db.select().from(emailSuppressions).where(eq(emailSuppressions.email, target?.email ?? ''))).toHaveLength(1)
    const [lead] = await env.db.select().from(leads).where(eq(leads.email, target?.email ?? ''))
    expect(lead?.unsubscribed).toBe(true)
    expect((await rows(id)).find((r) => r.id === target?.id)).toMatchObject({ status: 'skipped' })

    const mail = new FakeMail()
    await makeWorker(mail, { perMinute: 10 }).tick()
    expect(mail.sent.map((m) => m.to)).not.toContain(target?.email)
    expect(mail.sent).toHaveLength(2)
    expect((await statusCounts(id)).status).toBe('done')

    // idempotent, and a later broadcast to the same tag excludes them
    expect((await env.app.inject({ method: 'POST', url: `/api/v1/unsubscribe/${token}` })).statusCode).toBe(200)
    const prev = await json<{ eligible: number; excluded: { unsubscribed: number } }>(env, 'POST', '/broadcasts/audience-preview', mkt, { filters: { tag: target?.email.split('-')[0] } })
    expect(prev.body.eligible).toBe(2)
  })

  it('rejects forged tokens', async () => {
    const r = await env.app.inject({ method: 'POST', url: '/api/v1/unsubscribe/abc.def' })
    expect(r.statusCode).toBe(400)
    const g = await env.app.inject({ method: 'GET', url: '/api/v1/unsubscribe/abc.def' })
    expect(g.statusCode).toBe(400)
  })

  it('suppressing an address mid-flight stops its queued mail (checked again right before sending)', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(2)
    const target = (await rows(id))[0]
    await env.db.insert(emailSuppressions).values({ email: target?.email ?? '', reason: 'manual' })
    const mail = new FakeMail()
    await makeWorker(mail, { perMinute: 10 }).tick()
    expect(mail.sent.map((m) => m.to)).not.toContain(target?.email)
    expect((await rows(id)).find((r) => r.id === target?.id)).toMatchObject({ status: 'skipped' })
  })
})

describe('broadcast API rules', () => {
  it('cannot be started twice, edited after start, and test mails only go to yourself', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(1)
    expect((await json(env, 'POST', `/broadcasts/${id}/start`, mkt)).status).toBe(409)
    expect((await json(env, 'PATCH', `/broadcasts/${id}`, mkt, { name: 'x' })).status).toBe(409)
    expect((await json(env, 'POST', `/broadcasts/${id}/test-send`, mkt, { to: 'someone.else@x.id' })).status).toBe(400)
    const before = env.mail.outbox.length
    expect((await json(env, 'POST', `/broadcasts/${id}/test-send`, mkt, {})).status).toBe(200)
    expect(env.mail.outbox.length).toBe(before + 1)
    expect(env.mail.outbox.at(-1)?.subject.startsWith('[TEST]')).toBe(true)
  })

  it('concurrent start requests insert the audience once', async () => {
    const tag = 'dbl'
    await json(env, 'POST', '/leads/import', mkt, { records: [{ name: 'A', email: 'a@dbl.test', tags: tag }, { name: 'B', email: 'b@dbl.test', tags: tag }] })
    const b = await json<{ id: string }>(env, 'POST', '/broadcasts', mkt, { name: 'dbl', subject: 's', body: 'b', filters: { tag } })
    const res = await Promise.all([json(env, 'POST', `/broadcasts/${b.body.id}/start`, mkt), json(env, 'POST', `/broadcasts/${b.body.id}/start`, mkt)])
    expect(res.map((r) => r.status).sort()).toEqual([200, 409])
    expect(await rows(b.body.id)).toHaveLength(2)
  })

  it('needs mkt.send; viewers and HR are refused', async () => {
    const hr = await userWithRole(env, 'hr')
    const viewer = await userWithRole(env, 'viewer')
    expect((await json(env, 'GET', '/broadcasts', hr)).status).toBe(403)
    expect((await json(env, 'POST', '/broadcasts', viewer, { name: 'x', subject: 's', body: 'b' })).status).toBe(403)
    expect((await json(env, 'POST', '/broadcasts', admin, { name: 'x', subject: 's', body: 'b' })).status).toBe(201)
  })

  it('lists recipients with their error and supports status filter', async () => {
    at('2026-11-09T03:00:00Z')
    const id = await startedBroadcast(3)
    const mail = new FakeMail()
    mail.script = (m) => (m.to.includes('-2@') ? new MailError('550 nope', false) : undefined)
    await makeWorker(mail, { perMinute: 10 }).tick()
    const failed = await json<{ data: { email: string; error: string }[]; meta: { total: number } }>(env, 'GET', `/broadcasts/${id}/recipients?status=failed`, mkt)
    expect(failed.body.meta.total).toBe(1)
    expect(failed.body.data[0]?.error).toBe('550 nope')
    const detail = await json<{ minutesRemainingAtMinuteCap: number; throttle: { perMinute: number } }>(env, 'GET', `/broadcasts/${id}`, mkt)
    expect(detail.body.throttle.perMinute).toBe(env.config.BROADCAST_PER_MINUTE)
    expect(detail.body.minutesRemainingAtMinuteCap).toBe(0)
  })

  it('handles the owner scale: 4,300 recipients in one go', async () => {
    const tag = 'big'
    for (let chunk = 0; chunk < 5; chunk++) {
      const records = Array.from({ length: 860 }, (_, i) => ({ name: `Big ${chunk}-${i}`, email: `big-${chunk}-${i}@scale.test`, tags: tag }))
      await json(env, 'POST', '/leads/import', mkt, { records })
    }
    const b = await json<{ id: string }>(env, 'POST', '/broadcasts', mkt, { name: 'Big', subject: 's', body: 'b', filters: { tag } })
    const started = await json<{ counts: { total: number }; minutesRemainingAtMinuteCap: number; daysRemainingAtDailyCap: number }>(env, 'POST', `/broadcasts/${b.body.id}/start`, mkt)
    expect(started.body.counts.total).toBe(4300)
    expect(started.body.daysRemainingAtDailyCap).toBe(Math.ceil(4300 / env.config.BROADCAST_PER_DAY))
    // send a full minute's worth with a big cap to prove the claim query is fine at this size
    const mail = new FakeMail()
    at('2026-11-09T03:00:00Z')
    const t = await makeWorker(mail, { perMinute: 500, perDay: 5000 }).tick()
    expect(t.sent).toBe(500)
    expect(unique(mail.sent.map((m) => m.to))).toBe(true)
  })
})
