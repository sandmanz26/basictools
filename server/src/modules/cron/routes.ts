import type { FastifyPluginAsync } from 'fastify'
import { safeEqual } from '../../lib/crypto.js'
import { seed } from '../../db/seed.js'
import { BroadcastWorker, type TickResult } from '../../jobs/broadcast-worker.js'

/** Stop starting new ticks after this long, so the function ends before the platform's time limit. */
const TIME_BUDGET_MS = 45_000

/**
 * Scheduled sending for hosts that cannot keep a process alive (Vercel). A scheduler (Supabase pg_cron, see
 * supabase/02_cron_broadcast.sql) calls this every minute; each call runs the same BroadcastWorker.tick() the
 * long-running worker uses, so caps, send window, retries and "never send twice" behave identically.
 * Switched off unless CRON_SECRET is set.
 */
export const cronRoutes: FastifyPluginAsync = async (app) => {
  const { config, db, mail } = app.ctx
  const secret = config.CRON_SECRET
  const worker = new BroadcastWorker({ config, db, mail, log: app.log })

  const handler = async (req: { headers: Record<string, string | string[] | undefined> }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    const h = req.headers.authorization
    const given = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : ''
    if (!secret || !given || !safeEqual(given, secret)) return reply.code(401).send({ error: 'unauthorized' })

    const started = Date.now()
    const total: TickResult = { sent: 0, retried: 0, failed: 0, skipped: 0, recovered: 0, finished: 0 }
    let ticks = 0
    for (;;) {
      const r = await worker.tick()
      ticks++
      for (const k of ['sent', 'retried', 'failed', 'skipped', 'recovered', 'finished'] as const) total[k] += r[k]
      const busy = r.sent + r.retried + r.failed + r.skipped > 0
      if (!busy || Date.now() - started > TIME_BUDGET_MS) break
    }
    return reply.code(200).send({ ticks, ...total })
  }

  // Both verbs: pg_net posts, a person testing with curl/browser may get.
  app.get('/cron/broadcast', { schema: { hide: true } }, handler as never)
  app.post('/cron/broadcast', { schema: { hide: true } }, handler as never)

  // One-time setup without a computer: creates the default roles and the first admin from BOOTSTRAP_ADMIN_* (idempotent:
  // nothing is overwritten, an existing admin is left alone). Same secret as the cron call.
  app.post('/setup/seed', { schema: { hide: true } }, async (req, reply) => {
    const h = req.headers.authorization
    const given = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : ''
    if (!secret || !given || !safeEqual(given, secret)) return reply.code(401).send({ error: 'unauthorized' })
    try {
      return reply.code(200).send(await seed(db, config))
    } catch (err) {
      req.log.error({ err }, 'seed failed')
      return reply.code(500).send({ error: 'seed_failed', message: err instanceof Error ? err.message : 'unknown' })
    }
  })
}
