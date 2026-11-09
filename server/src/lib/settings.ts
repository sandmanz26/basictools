import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { settings } from '../db/schema.js'
import { DEFAULT_MKT_STAGES, DEFAULT_STATUSES } from '../domain/defaults.js'
import type { Stage, StatusDef } from '../domain/types.js'

async function read<T>(db: Db, key: string, fallback: () => T): Promise<T> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1)
  return (row?.value as T | undefined) ?? fallback()
}

async function write(db: Db, key: string, value: unknown): Promise<void> {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

export const getMktStages = (db: Db) => read<Stage[]>(db, 'mktStages', DEFAULT_MKT_STAGES)
export const setMktStages = (db: Db, stages: Stage[]) => write(db, 'mktStages', stages)
export const getStatuses = (db: Db) => read<StatusDef[]>(db, 'projectStatuses', DEFAULT_STATUSES)
export const setStatuses = (db: Db, list: StatusDef[]) => write(db, 'projectStatuses', list)
