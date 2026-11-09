import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { seed } from './db/seed.js'
import { createPasswordHasher } from './lib/password.js'
import { BroadcastWorker } from './jobs/broadcast-worker.js'
import { createMailProvider } from './mail/index.js'

const config = loadConfig()
const handle = createDb(config)
const mail = createMailProvider(config)

const app = await buildApp({ config, db: handle.db, ping: handle.ping, hasher: createPasswordHasher(config), mail })

// Migrations are idempotent. Running them here keeps a single-container deploy simple;
// set up a separate release step instead if you run many API replicas.
await runMigrations(handle.db)
// Idempotent: makes sure the default roles exist and creates the bootstrap admin once (when BOOTSTRAP_ADMIN_* is set).
await seed(handle.db, config)

if (config.WORKER_ENABLED) {
  const worker = new BroadcastWorker({ config, db: handle.db, mail, log: app.log })
  app.worker = worker
  worker.start()
  app.log.info('broadcast worker started')
}

let closing = false
async function shutdown(signal: string) {
  if (closing) return
  closing = true
  app.log.info({ signal }, 'shutting down')
  // Hard stop if something hangs, so the orchestrator can restart us.
  setTimeout(() => process.exit(1), 25_000).unref()
  try {
    await app.worker?.stop() // let an in-flight send finish and be recorded
    await app.close()
    await mail.close?.()
    await handle.close()
    process.exit(0)
  } catch (err) {
    app.log.error({ err }, 'error during shutdown')
    process.exit(1)
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('unhandledRejection', (err) => app.log.error({ err }, 'unhandled rejection'))

await app.listen({ host: config.HOST, port: config.PORT })
