import { useEffect, useSyncExternalStore } from 'react'
import { nanoid } from 'nanoid'
import { useStore } from '@/store'
import { merge, sendMail } from '@/lib/microsoft'
import { validEmail } from '@/lib/auth'

/** Microsoft Graph allows ~30 messages/minute and 10,000 recipients/day per mailbox (personal accounts: far less). */
export const GAP_MS = 2100
export const DAILY_LIMIT = 10000
export const FOOTER = "\n\n--\nDon't want these emails? Reply STOP and we'll remove you from our list."
const MAX_CONSECUTIVE_FAILURES = 3

type Runner = { id: string; stop: boolean }

// Only one tab may send at a time, otherwise two tabs would email the same people twice.
const LEASE = 'hf-broadcast-lease'
const TAB = nanoid(6)
const readLease = (): { tab: string; at: number } | null => { try { return JSON.parse(localStorage.getItem(LEASE) ?? 'null') } catch { return null } }
const otherTabSending = () => { const l = readLease(); return !!l && l.tab !== TAB && Date.now() - l.at < 20_000 }
const touchLease = () => { try { localStorage.setItem(LEASE, JSON.stringify({ tab: TAB, at: Date.now() })) } catch { /* storage blocked */ } }
const dropLease = () => { try { if (readLease()?.tab === TAB) localStorage.removeItem(LEASE) } catch { /* storage blocked */ } }

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
/** Next moment (ISO) a broadcast may send again: today at the window start if it hasn't opened yet, else tomorrow. */
export function nextWindowStart(startHour = 0, now = new Date()): string {
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  if (now.getHours() >= startHour) d.setDate(d.getDate() + 1)
  d.setHours(startHour)
  return d.toISOString()
}
export const inWindow = (b: { windowStart?: number; windowEnd?: number }, now = new Date()) => now.getHours() >= (b.windowStart ?? 0) && now.getHours() < (b.windowEnd ?? 24)
/** How many days it takes to send `n` emails at `cap` per day (no cap = one day). */
export const daysNeeded = (n: number, cap: number) => (cap > 0 ? Math.max(1, Math.ceil(n / cap)) : 1)
let runner: Runner | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Id of the broadcast currently sending in this tab (it keeps going while you browse other pages). */
export const useRunningId = () => useSyncExternalStore(subscribe, () => runner?.id ?? null)
export const pauseBroadcast = () => { if (runner) { runner.stop = true; emit() } }

const sleep = async (ms: number, r: Runner) => { for (let t = 0; t < ms && !r.stop; t += 150) await new Promise((res) => setTimeout(res, 150)) }

/** Send to everyone in the broadcast who is not marked sent yet (pending and failed). One at a time, with a pause between sends. */
export async function runBroadcast(id: string) {
  if (runner) return
  if (otherTabSending()) { alert('Another browser tab is already sending a broadcast. Close it or wait for it to finish.'); return }
  const r: Runner = { id, stop: false }
  runner = r; emit()
  const st = () => useStore.getState()
  st().updateBroadcast(id, { status: 'running', finishedAt: '', pausedReason: '', resumeAt: '' })
  let failuresInRow = 0, interrupted = false
  let pause: { reason: string; resumeAt: string } | null = null
  try {
    const first = st().broadcasts.find((x) => x.id === id)
    const queue = first ? Object.keys(first.recipients).filter((k) => first.recipients[k] !== 'sent') : []
    for (let n = 0; n < queue.length; n++) {
      if (r.stop) { interrupted = true; break }
      const b = st().broadcasts.find((x) => x.id === id)
      const lead = st().leads.find((l) => l.id === queue[n])
      if (!b) return
      if (!lead || lead.unsubscribed || !validEmail(lead.email)) { st().setBroadcastRecipient(id, queue[n], 'failed'); continue }
      touchLease()

      // Pace the campaign: daily cap and allowed hours (what keeps a 4,000+ list out of spam folders).
      const sentToday = st().emails.filter((e) => e.broadcastId === id && e.status === 'sent' && Date.parse(e.sentAt) >= startOfToday()).length
      if (b.dailyCap && sentToday >= b.dailyCap) { interrupted = true; pause = { reason: `Daily limit of ${b.dailyCap} reached`, resumeAt: nextWindowStart(b.windowStart ?? 0) }; break }
      if (!inWindow(b)) { interrupted = true; pause = { reason: `Outside the send window (${b.windowStart ?? 0}:00–${b.windowEnd ?? 24}:00)`, resumeAt: nextWindowStart(b.windowStart ?? 0) }; break }

      const subject = merge(b.subject, lead).replace(/[\r\n]+/g, ' ') // a lead's name must never add header lines
      const body = merge(b.body, lead) + (b.footer ? FOOTER : '')
      let error = ''
      try { await sendMail(st().msConfig, lead.email, subject, body) } catch (e) { error = e instanceof Error ? e.message : String(e) }
      st().setBroadcastRecipient(id, lead.id, error ? 'failed' : 'sent')
      st().logEmail({ id: 'em-' + nanoid(6), leadId: lead.id, to: lead.email, subject, body: '', sentAt: new Date().toISOString(), sentBy: b.createdBy, status: error ? 'failed' : 'sent', error, broadcastId: id })

      failuresInRow = error ? failuresInRow + 1 : 0
      if (failuresInRow >= MAX_CONSECUTIVE_FAILURES) { interrupted = true; pause = { reason: 'Stopped after 3 failures in a row. Check the error, then resume.', resumeAt: '' }; break } // token expired, throttled or limit hit: stop and let the user look
      if (n < queue.length - 1) await sleep(GAP_MS, r)
    }
    if (r.stop) interrupted = true
  } finally {
    const b = st().broadcasts.find((x) => x.id === id)
    if (b) st().updateBroadcast(id, interrupted ? { status: 'paused', pausedReason: pause?.reason ?? 'Paused by you', resumeAt: pause?.resumeAt ?? '' } : { status: 'done', finishedAt: new Date().toISOString(), pausedReason: '', resumeAt: '' })
    runner = null; dropLease(); emit()
  }
}

export const counts = (b: { recipients: Record<string, 'pending' | 'sent' | 'failed'> }) => {
  const v = Object.values(b.recipients)
  return { total: v.length, sent: v.filter((x) => x === 'sent').length, failed: v.filter((x) => x === 'failed').length, pending: v.filter((x) => x === 'pending').length }
}


/** Continue paused campaigns by themselves once their `resumeAt` has passed. Works while the app is open. */
export function useBroadcastAutoResume() {
  useEffect(() => {
    // A reload or closed tab leaves a campaign marked 'running' although nothing is sending: show it as paused.
    const stale = useStore.getState().broadcasts.filter((b) => b.status === 'running' && !runner && !otherTabSending())
    stale.forEach((b) => useStore.getState().updateBroadcast(b.id, { status: 'paused', pausedReason: 'Interrupted: the tab was closed or reloaded' }))
    const t = setInterval(() => {
      if (runner) return
      const due = useStore.getState().broadcasts.find((b) => b.status === 'paused' && b.resumeAt && Date.parse(b.resumeAt) <= Date.now())
      if (due) void runBroadcast(due.id)
    }, 30_000)
    return () => clearInterval(t)
  }, [])
}
