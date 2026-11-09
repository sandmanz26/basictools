// Standalone sender: run this as its own process (WORKER_ENABLED=false on the API) when you scale the API out.
import { loadConfig } from './config.js'
import { createDb } from './db/client.js'
import { BroadcastWorker } from './jobs/broadcast-worker.js'
import { createMailProvider } from './mail/index.js'

const config = loadConfig()
const handle = createDb(config)
const mail = createMailProvider(config)
const log = {
  info: (o: object, m?: string) => process.stdout.write(`${JSON.stringify({ level: 'info', msg: m, ...o })}\n`),
  error: (o: object, m?: string) => process.stderr.write(`${JSON.stringify({ level: 'error', msg: m, ...o })}\n`),
}
const worker = new BroadcastWorker({ config, db: handle.db, mail, log })
worker.start()
log.info({}, 'broadcast worker started')

let closing = false
const shutdown = async () => {
  if (closing) return
  closing = true
  await worker.stop()
  await mail.close?.()
  await handle.close()
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())
