import { loadConfig } from '../config.js'
import { createDb } from './client.js'
import { runMigrations } from './migrate.js'

const handle = createDb(loadConfig())
try {
  await runMigrations(handle.db)
  console.log('Migrations applied.')
} finally {
  await handle.close()
}
