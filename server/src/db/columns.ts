import { customType } from 'drizzle-orm/pg-core'

/**
 * timestamptz exposed to the app as an ISO-8601 string. Keeping strings end to end means API
 * response schemas stay plain `z.iso.datetime()` and nothing depends on driver Date parsing.
 */
export const isoTimestamp = customType<{ data: string; driverData: string | Date; notNull: false; default: false }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: (v) => (v instanceof Date ? v : new Date(v)).toISOString(),
  toDriver: (v) => v,
})
