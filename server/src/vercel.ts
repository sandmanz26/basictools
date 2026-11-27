import type { IncomingMessage, ServerResponse } from 'node:http'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { createPasswordHasher } from './lib/password.js'
import { createMailProvider } from './mail/index.js'

/**
 * Vercel Function entry: the same API as server.ts, without the long-running parts.
 *  - no migrations or seed at start (run them once from a computer: `npm run db:migrate`, `npm run db:seed`)
 *  - no in-process broadcast worker (the /cron/broadcast endpoint does the work when Supabase pg_cron calls it)
 * The app is built once per warm instance and reused.
 */
let ready: ReturnType<typeof boot> | undefined

async function boot() {
  const config = loadConfig()
  // A function instance serves one request at a time; keep database connections minimal.
  const handle = createDb({ ...config, DB_POOL_MAX: Math.min(config.DB_POOL_MAX, 2) })
  const app = await buildApp({ config, db: handle.db, ping: handle.ping, hasher: createPasswordHasher(config), mail: createMailProvider(config) })
  await app.ready()
  return app
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    ready ??= boot()
    const app = await ready
    app.server.emit('request', req, res)
  } catch (err) {
    ready = undefined // try again from scratch on the next request
    // eslint-disable-next-line no-console -- last-resort log: the app (and its logger) did not start
    console.error('api boot failed', err instanceof Error ? err.message : err)
    // A bad environment is the usual first-deploy problem. loadConfig() lists only variable NAMES and what is wrong
    // with them (never values), so showing it helps the owner fix it without opening the logs.
    const msg = err instanceof Error ? err.message : ''
    let reason: string | undefined
    if (msg.startsWith('Invalid environment configuration')) reason = msg
    else if (err instanceof Error) {
      // Other boot failures (database unreachable, module load...): show the error type, code and a redacted message.
      const code = (err as { code?: unknown }).code
      const safe = msg.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '<url>').slice(0, 200)
      reason = `${err.name}${typeof code === 'string' ? ` (${code})` : ''}: ${safe}`
    }
    res.statusCode = 503
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'service_unavailable', ...(reason ? { reason } : {}), build: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'unknown').slice(0, 7), node: process.version }))
  }
}
