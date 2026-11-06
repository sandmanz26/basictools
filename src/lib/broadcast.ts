import { useSyncExternalStore } from 'react'
import { nanoid } from 'nanoid'
import { useStore } from '@/store'
import { merge, sendMail } from '@/lib/microsoft'

/** Microsoft Graph allows ~30 messages/minute and 10,000 recipients/day per mailbox (personal accounts: far less). */
export const GAP_MS = 2100
export const DAILY_LIMIT = 10000
export const FOOTER = "\n\n--\nDon't want these emails? Reply STOP and we'll remove you from our list."
const MAX_CONSECUTIVE_FAILURES = 3

type Runner = { id: string; stop: boolean }
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
  const r: Runner = { id, stop: false }
  runner = r; emit()
  const st = () => useStore.getState()
  st().updateBroadcast(id, { status: 'running', finishedAt: '' })
  let failuresInRow = 0, interrupted = false
  try {
    const first = st().broadcasts.find((x) => x.id === id)
    const queue = first ? Object.keys(first.recipients).filter((k) => first.recipients[k] !== 'sent') : []
    for (let n = 0; n < queue.length; n++) {
      if (r.stop) { interrupted = true; break }
      const b = st().broadcasts.find((x) => x.id === id)
      const lead = st().leads.find((l) => l.id === queue[n])
      if (!b) return
      if (!lead || !lead.email || lead.unsubscribed) { st().setBroadcastRecipient(id, queue[n], 'failed'); continue }

      const subject = merge(b.subject, lead)
      const body = merge(b.body, lead) + (b.footer ? FOOTER : '')
      let error = ''
      try { await sendMail(st().msConfig, lead.email, subject, body) } catch (e) { error = e instanceof Error ? e.message : String(e) }
      st().setBroadcastRecipient(id, lead.id, error ? 'failed' : 'sent')
      st().logEmail({ id: 'em-' + nanoid(6), leadId: lead.id, to: lead.email, subject, body: '', sentAt: new Date().toISOString(), sentBy: b.createdBy, status: error ? 'failed' : 'sent', error })

      failuresInRow = error ? failuresInRow + 1 : 0
      if (failuresInRow >= MAX_CONSECUTIVE_FAILURES) { interrupted = true; break } // token expired, throttled or limit hit: stop and let the user look
      if (n < queue.length - 1) await sleep(GAP_MS, r)
    }
    if (r.stop) interrupted = true
  } finally {
    const b = st().broadcasts.find((x) => x.id === id)
    if (b) st().updateBroadcast(id, interrupted ? { status: 'paused' } : { status: 'done', finishedAt: new Date().toISOString() })
    runner = null; emit()
  }
}

export const counts = (b: { recipients: Record<string, 'pending' | 'sent' | 'failed'> }) => {
  const v = Object.values(b.recipients)
  return { total: v.length, sent: v.filter((x) => x === 'sent').length, failed: v.filter((x) => x === 'failed').length, pending: v.filter((x) => x === 'pending').length }
}
