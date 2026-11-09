import { and, eq, ilike, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../../db/client.js'
import { broadcastRecipients, emailSuppressions, leads } from '../../db/schema.js'
import { likePattern } from '../../lib/pagination.js'

export const audienceFilters = z.object({
  stage: z.string().max(80).optional(),
  source: z.string().max(120).optional(),
  owner: z.string().max(200).optional(),
  tag: z.string().max(120).optional(),
  /** Explicit list of leads; combined (AND) with the other filters. */
  leadIds: z.array(z.uuid()).max(5000).optional(),
})
export type AudienceFilters = z.infer<typeof audienceFilters>

export interface Audience {
  eligible: { leadId: string; email: string; name: string; merge: Record<string, string> }[]
  excluded: { noEmail: number; invalidEmail: number; unsubscribed: number; suppressed: number; duplicate: number }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function describeAudience(f: AudienceFilters): string {
  const parts = [
    f.stage && `stage = ${f.stage}`,
    f.source && `source = ${f.source}`,
    f.owner && `owner = ${f.owner}`,
    f.tag && `tag contains "${f.tag}"`,
    f.leadIds && `${f.leadIds.length} selected leads`,
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'All leads'
}

/** Who a broadcast would reach: valid, unique, not unsubscribed, not suppressed. */
export async function selectAudience(db: Db, f: AudienceFilters): Promise<Audience> {
  const rows = await db
    .select()
    .from(leads)
    .where(
      and(
        f.stage ? eq(leads.stage, f.stage) : undefined,
        f.source ? eq(leads.source, f.source) : undefined,
        f.owner ? eq(leads.owner, f.owner) : undefined,
        f.tag ? ilike(leads.tags, likePattern(f.tag)) : undefined,
        f.leadIds ? inArray(leads.id, f.leadIds) : undefined,
      ),
    )
  const suppressed = new Set((await db.select({ e: emailSuppressions.email }).from(emailSuppressions)).map((r) => r.e))
  const seen = new Set<string>()
  const out: Audience = { eligible: [], excluded: { noEmail: 0, invalidEmail: 0, unsubscribed: 0, suppressed: 0, duplicate: 0 } }
  for (const l of rows) {
    const email = l.email.trim().toLowerCase()
    if (!email) out.excluded.noEmail++
    else if (!EMAIL.test(email)) out.excluded.invalidEmail++
    else if (l.unsubscribed) out.excluded.unsubscribed++
    else if (suppressed.has(email)) out.excluded.suppressed++
    else if (seen.has(email)) out.excluded.duplicate++
    else {
      seen.add(email)
      const name = l.name.trim()
      out.eligible.push({
        leadId: l.id,
        email,
        name,
        merge: { name, firstName: name.split(/\s+/)[0] ?? '', company: l.company, title: l.title, owner: l.owner },
      })
    }
  }
  return out
}

export type RecipientCounts = Record<'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'cancelled' | 'total', number>

export async function countsFor(db: Db, broadcastIds: string[]): Promise<Map<string, RecipientCounts>> {
  const map = new Map<string, RecipientCounts>()
  if (!broadcastIds.length) return map
  const rows = await db
    .select({ id: broadcastRecipients.broadcastId, status: broadcastRecipients.status, n: sql<number>`count(*)::int` })
    .from(broadcastRecipients)
    .where(inArray(broadcastRecipients.broadcastId, broadcastIds))
    .groupBy(broadcastRecipients.broadcastId, broadcastRecipients.status)
  for (const id of broadcastIds) map.set(id, { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, total: 0 })
  for (const r of rows) {
    const c = map.get(r.id)
    if (!c) continue
    c[r.status] = r.n
    c.total += r.n
  }
  return map
}
