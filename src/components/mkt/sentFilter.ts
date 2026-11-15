import { localDay } from '@/lib/billing'
import type { SentEmail } from '@/types'

export interface HistoryFilter { from: string; to: string; status: string; type: string; q: string }
export interface HistoryCtx { company: (e: SentEmail) => string; typeLabel: (e: SentEmail) => string }

/** Pure filter, exported for tests. Dates are local yyyy-mm-dd; `type` is '', 'single', 'broadcast' or a broadcast id. */
export function filterEmails(emails: SentEmail[], f: HistoryFilter, ctx: HistoryCtx): SentEmail[] {
  const needle = f.q.trim().toLowerCase()
  return emails.filter((e) => {
    if (f.status && e.status !== f.status) return false
    if (f.type === 'single' ? !!e.broadcastId : f.type === 'broadcast' ? !e.broadcastId : f.type ? e.broadcastId !== f.type : false) return false
    if (f.from || f.to) { const d = localDay(e.sentAt); if ((f.from && d < f.from) || (f.to && d > f.to)) return false }
    return !needle || `${e.to} ${e.subject} ${ctx.company(e)}`.toLowerCase().includes(needle)
  })
}
