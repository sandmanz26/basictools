import { and, asc, count, eq, inArray, lt, lte, sql } from 'drizzle-orm'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { broadcastRecipients, broadcasts, emailSuppressions } from '../db/schema.js'
import { MailError, type MailProvider } from '../mail/provider.js'
import { renderBroadcast } from '../modules/broadcasts/render.js'
import { backoffSeconds, inSendWindow, sendBudget, type SendCaps } from './throttle.js'

export interface WorkerOptions {
  config: Pick<
    Config,
    | 'BROADCAST_PER_MINUTE' | 'BROADCAST_PER_DAY' | 'BROADCAST_WINDOW_START_HOUR' | 'BROADCAST_WINDOW_END_HOUR' | 'BROADCAST_TZ'
    | 'BROADCAST_MAX_ATTEMPTS' | 'BROADCAST_BACKOFF_BASE_SECONDS' | 'BROADCAST_STALE_SENDING_SECONDS' | 'WORKER_POLL_MS'
    | 'UNSUBSCRIBE_SECRET' | 'PUBLIC_API_URL' | 'BROADCAST_FOOTER_ADDRESS'
  >
  db: Db
  mail: MailProvider
  clock?: () => Date
  log?: { info: (o: object, m?: string) => void; error: (o: object, m?: string) => void }
}

export interface TickResult {
  /** Messages handed to the provider and accepted. */
  sent: number
  /** Failed this tick and scheduled for another try. */
  retried: number
  /** Failed for good (permanent error or out of attempts). */
  failed: number
  /** Skipped because the address is suppressed / unsubscribed, or the broadcast stopped meanwhile. */
  skipped: number
  /** Recipients stuck in "sending" from a crash, moved to failed. */
  recovered: number
  /** Broadcasts that finished this tick. */
  finished: number
  reason?: 'outside_window' | 'budget_exhausted' | 'nothing_due'
}

const STALE_MESSAGE = 'Delivery state unknown after a restart or timeout. Not retried automatically so nobody gets the mail twice; use "retry failed" if it never arrived.'

/**
 * Durable broadcast sender backed by the broadcast_recipients table.
 *
 * Guarantees:
 *  - A recipient is claimed pending -> sending inside one transaction (advisory lock + FOR UPDATE SKIP LOCKED),
 *    so two workers never pick the same row and the per-minute / per-day caps hold across workers.
 *  - Delivery is at-most-once: if the process dies between "provider accepted" and "mark sent", the row stays
 *    "sending" and is later moved to "failed" for a human to decide. It is never silently re-sent.
 *  - Temporary errors retry with exponential backoff up to BROADCAST_MAX_ATTEMPTS; permanent errors fail at once.
 */
export class BroadcastWorker {
  private running = false
  private loop: Promise<void> | null = null
  private wake: (() => void) | null = null
  private readonly clock: () => Date
  private readonly caps: SendCaps

  constructor(private readonly o: WorkerOptions) {
    this.clock = o.clock ?? (() => new Date())
    this.caps = {
      perMinute: o.config.BROADCAST_PER_MINUTE,
      perDay: o.config.BROADCAST_PER_DAY,
      windowStartHour: o.config.BROADCAST_WINDOW_START_HOUR,
      windowEndHour: o.config.BROADCAST_WINDOW_END_HOUR,
      tz: o.config.BROADCAST_TZ,
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.loop = (async () => {
      while (this.running) {
        let busy = false
        try {
          const r = await this.tick()
          busy = r.sent + r.retried + r.failed + r.skipped > 0
        } catch (err) {
          this.o.log?.error({ err }, 'broadcast worker tick failed')
        }
        if (!this.running) break
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, busy ? 500 : this.o.config.WORKER_POLL_MS)
          this.wake = () => {
            clearTimeout(t)
            resolve()
          }
        })
        this.wake = null
      }
    })()
  }

  /** Finish the tick in progress, then stop. Safe to call twice. */
  async stop(): Promise<void> {
    this.running = false
    this.wake?.()
    await this.loop
    this.loop = null
  }

  /** Called by the API after start/resume so a new broadcast begins without waiting for the next poll. */
  nudge(): void {
    this.wake?.()
  }

  async tick(): Promise<TickResult> {
    const { db, config } = this.o
    const now = this.clock()
    const nowIso = now.toISOString()
    const result: TickResult = { sent: 0, retried: 0, failed: 0, skipped: 0, recovered: 0, finished: 0 }

    // 1. A crash can leave rows in "sending". They are never re-sent automatically.
    const staleBefore = new Date(now.getTime() - config.BROADCAST_STALE_SENDING_SECONDS * 1000).toISOString()
    const stale = await db
      .update(broadcastRecipients)
      .set({ status: 'failed', error: STALE_MESSAGE, claimedAt: null })
      .where(and(eq(broadcastRecipients.status, 'sending'), lt(broadcastRecipients.claimedAt, staleBefore)))
      .returning({ id: broadcastRecipients.id })
    result.recovered = stale.length

    // A pause with a "resume at" time continues by itself.
    await db
      .update(broadcasts)
      .set({ status: 'running', resumeAt: null, pausedReason: '' })
      .where(and(eq(broadcasts.status, 'paused'), lte(broadcasts.resumeAt, nowIso)))

    const { rows: claimed, windowClosed } = await this.claim(now, nowIso)
    if (claimed.length === 0) {
      result.reason = windowClosed ? 'outside_window' : 'budget_exhausted'
    } else {
      for (const row of claimed) {
        const outcome = await this.deliver(row, now)
        result[outcome]++
      }
    }

    result.finished = await this.finishDone(nowIso)
    if (result.reason === 'budget_exhausted' && result.finished === 0) {
      // Distinguish "caps hit" from "nothing to do" for the logs.
      const [due] = await db
        .select({ n: count() })
        .from(broadcastRecipients)
        .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
        .where(and(eq(broadcastRecipients.status, 'pending'), eq(broadcasts.status, 'running'), lte(broadcastRecipients.nextAttemptAt, nowIso)))
      if (!due?.n) result.reason = 'nothing_due'
    }
    return result
  }

  /**
   * Reserve up to the remaining budget of due recipients, broadcast by broadcast (oldest first), honouring each
   * broadcast's own send window and daily cap on top of the server-wide caps.
   * The advisory lock makes budget + claim atomic across workers.
   */
  private async claim(now: Date, nowIso: string) {
    const minuteAgo = new Date(now.getTime() - 60_000).toISOString()
    const sameLocalDay = sql`(${broadcastRecipients.sentAt} AT TIME ZONE ${this.caps.tz})::date = (${nowIso}::timestamptz AT TIME ZONE ${this.caps.tz})::date`
    return this.o.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(727001)`)
      const [m] = await tx.select({ n: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.status, 'sent'), sql`${broadcastRecipients.sentAt} > ${minuteAgo}`))
      const [d] = await tx.select({ n: count() }).from(broadcastRecipients).where(and(eq(broadcastRecipients.status, 'sent'), sameLocalDay))
      const inflightRows = await tx
        .select({ id: broadcastRecipients.broadcastId, n: count() })
        .from(broadcastRecipients)
        .where(eq(broadcastRecipients.status, 'sending'))
        .groupBy(broadcastRecipients.broadcastId)
      const inflight = inflightRows.reduce((a, r) => a + r.n, 0)
      let budget = sendBudget(this.caps, (m?.n ?? 0) + inflight, (d?.n ?? 0) + inflight)
      if (budget <= 0) return { rows: [], windowClosed: false }

      const running = await tx
        .select({ id: broadcasts.id, dailyCap: broadcasts.dailyCap, windowStart: broadcasts.windowStart, windowEnd: broadcasts.windowEnd })
        .from(broadcasts)
        .where(eq(broadcasts.status, 'running'))
        .orderBy(asc(broadcasts.createdAt), asc(broadcasts.id))
      const sentTodayRows = await tx
        .select({ id: broadcastRecipients.broadcastId, n: count() })
        .from(broadcastRecipients)
        .where(and(eq(broadcastRecipients.status, 'sent'), sameLocalDay))
        .groupBy(broadcastRecipients.broadcastId)
      const sentToday = new Map(sentTodayRows.map((r) => [r.id, r.n]))
      const sending = new Map(inflightRows.map((r) => [r.id, r.n]))

      const ids: string[] = []
      let windowClosed = false
      for (const b of running) {
        if (budget <= 0) break
        const window = { windowStartHour: b.windowStart ?? this.caps.windowStartHour, windowEndHour: b.windowEnd ?? this.caps.windowEndHour, tz: this.caps.tz }
        if (!inSendWindow(now, window)) {
          windowClosed = true
          continue
        }
        let allow = budget
        if (b.dailyCap && b.dailyCap > 0) allow = Math.min(allow, b.dailyCap - (sentToday.get(b.id) ?? 0) - (sending.get(b.id) ?? 0))
        if (allow <= 0) continue
        const due = await tx
          .select({ id: broadcastRecipients.id })
          .from(broadcastRecipients)
          .where(and(eq(broadcastRecipients.broadcastId, b.id), eq(broadcastRecipients.status, 'pending'), lte(broadcastRecipients.nextAttemptAt, nowIso)))
          .orderBy(asc(broadcastRecipients.nextAttemptAt), asc(broadcastRecipients.id))
          .limit(allow)
          .for('update', { skipLocked: true })
        ids.push(...due.map((r) => r.id))
        budget -= due.length
      }
      if (ids.length === 0) return { rows: [], windowClosed }

      await tx
        .update(broadcastRecipients)
        .set({ status: 'sending', claimedAt: nowIso, attempts: sql`${broadcastRecipients.attempts} + 1` })
        .where(inArray(broadcastRecipients.id, ids))

      const rows = await tx
        .select({
          id: broadcastRecipients.id,
          broadcastId: broadcastRecipients.broadcastId,
          email: broadcastRecipients.email,
          merge: broadcastRecipients.merge,
          attempts: broadcastRecipients.attempts,
          subject: broadcasts.subject,
          body: broadcasts.body,
          footer: broadcasts.footer,
        })
        .from(broadcastRecipients)
        .innerJoin(broadcasts, eq(broadcasts.id, broadcastRecipients.broadcastId))
        .where(inArray(broadcastRecipients.id, ids))
        .orderBy(asc(broadcasts.createdAt), asc(broadcastRecipients.nextAttemptAt))
      return { rows, windowClosed }
    })
  }

  private async deliver(
    row: { id: string; broadcastId: string; email: string; merge: Record<string, string>; attempts: number; subject: string; body: string; footer: boolean },
    now: Date,
  ): Promise<'sent' | 'retried' | 'failed' | 'skipped'> {
    const { db, mail, config } = this.o
    const settle = async (set: Partial<typeof broadcastRecipients.$inferInsert>) => {
      // Only settle rows still in "sending": a recovery pass may have moved it meanwhile.
      await db.update(broadcastRecipients).set({ claimedAt: null, ...set }).where(and(eq(broadcastRecipients.id, row.id), eq(broadcastRecipients.status, 'sending')))
    }

    // Re-check right before sending: the owner may have paused or cancelled, or the person unsubscribed, since the claim.
    const [b] = await db.select({ status: broadcasts.status }).from(broadcasts).where(eq(broadcasts.id, row.broadcastId)).limit(1)
    if (b?.status === 'cancelled') {
      await settle({ status: 'cancelled' })
      return 'skipped'
    }
    if (b?.status !== 'running') {
      await settle({ status: 'pending', attempts: Math.max(0, row.attempts - 1) }) // paused: give the slot back
      return 'skipped'
    }
    const [sup] = await db.select({ e: emailSuppressions.email }).from(emailSuppressions).where(eq(emailSuppressions.email, row.email.toLowerCase())).limit(1)
    if (sup) {
      await settle({ status: 'skipped', error: 'Address is on the suppression list.' })
      return 'skipped'
    }

    try {
      const msg = renderBroadcast({ subject: row.subject, body: row.body, footer: row.footer }, row, config)
      const res = await mail.send({ ...msg, idempotencyKey: row.id })
      await settle({ status: 'sent', sentAt: this.clock().toISOString(), providerMessageId: res.messageId.slice(0, 300), error: '' })
      return 'sent'
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000)
      const retryable = err instanceof MailError ? err.retryable : true
      if (retryable && row.attempts < config.BROADCAST_MAX_ATTEMPTS) {
        const next = new Date(now.getTime() + backoffSeconds(row.attempts, config.BROADCAST_BACKOFF_BASE_SECONDS) * 1000)
        await settle({ status: 'pending', nextAttemptAt: next.toISOString(), error: message })
        return 'retried'
      }
      await settle({ status: 'failed', error: message })
      return 'failed'
    }
  }

  /** A running broadcast with nothing left to send is done. */
  private async finishDone(nowIso: string): Promise<number> {
    const open = sql`exists (select 1 from ${broadcastRecipients} r where r.broadcast_id = ${broadcasts.id} and r.status in ('pending','sending'))`
    const done = await this.o.db
      .update(broadcasts)
      .set({ status: 'done', finishedAt: nowIso })
      .where(and(eq(broadcasts.status, 'running'), sql`not ${open}`))
      .returning({ id: broadcasts.id })
    return done.length
  }
}
