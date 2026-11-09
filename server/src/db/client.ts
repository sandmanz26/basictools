import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import pg from 'pg'
import type { Config } from '../config.js'
import * as schema from './schema.js'

/** Driver agnostic handle: node-postgres in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>
/** A transaction has the same query API as the db. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbOrTx = Db | Tx

export interface DbHandle {
  db: Db
  /** Cheap liveness probe used by /readyz. */
  ping: () => Promise<void>
  close: () => Promise<void>
}

export function createDb(config: Pick<Config, 'DATABASE_URL' | 'DB_POOL_MAX' | 'DB_SSL'> & { DB_SSL_REJECT_UNAUTHORIZED?: boolean }): DbHandle {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: config.DB_POOL_MAX,
    ssl: config.DB_SSL ? { rejectUnauthorized: config.DB_SSL_REJECT_UNAUTHORIZED ?? true } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  // No named prepared statements and no session state anywhere, so this works behind a transaction pooler
  // (Supabase pooler on port 6543, PgBouncer). Advisory locks used by the worker are transaction scoped.
  // An idle client erroring must not crash the process.
  pool.on('error', () => undefined)
  const db = drizzle(pool, { schema })
  return {
    db,
    ping: async () => {
      await pool.query('select 1')
    },
    close: () => pool.end(),
  }
}

export { schema }
