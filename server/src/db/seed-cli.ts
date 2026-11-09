import { loadConfig } from '../config.js'
import { createDb } from './client.js'
import { seed } from './seed.js'

const config = loadConfig()
const handle = createDb(config)
try {
  const result = await seed(handle.db, config)
  console.log(`Seed done. Roles: ${result.roles}, admin ${result.adminCreated ? 'created' : 'already existed or skipped'}.`)
} finally {
  await handle.close()
}
