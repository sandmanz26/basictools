import type { FastifyRequest } from 'fastify'
import type { Db } from '../db/client.js'
import { auditLog } from '../db/schema.js'

export interface AuditEntry {
  action: string
  actorId?: string | null
  entity?: string
  entityId?: string
  meta?: Record<string, unknown>
}

/** Strings that must never reach the audit log, even by accident. */
const SECRET_KEYS = /pass|token|secret|hash/i

function scrub(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(meta).filter(([k]) => !SECRET_KEYS.test(k)))
}

export async function audit(db: Db, req: FastifyRequest | null, entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      action: entry.action,
      actorId: entry.actorId ?? req?.auth?.user.id ?? null,
      entity: entry.entity ?? null,
      entityId: entry.entityId ?? null,
      ip: req?.ip ?? null,
      requestId: req?.id ?? null,
      meta: scrub(entry.meta ?? {}),
    })
  } catch (err) {
    // Auditing must never take a request down, but a failure has to be visible.
    req?.log.error({ err }, 'audit log write failed')
  }
}
