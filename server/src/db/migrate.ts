import { fileURLToPath } from 'node:url'
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Db } from './client.js'
import type * as schema from './schema.js'

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

/** Apply committed SQL migrations. Works with any Drizzle pg driver that has a matching migrator. */
export async function runMigrations(db: Db): Promise<void> {
  await migratePg(db as NodePgDatabase<typeof schema>, { migrationsFolder: MIGRATIONS_FOLDER })
}
