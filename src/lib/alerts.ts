import { useEffect, useMemo } from 'react'
import { useStore } from '@/store'
import { buildAgenda, localToday, needsAction } from '@/lib/billing'

const FLAG = 'hf-desktop-alerts'
const LAST = 'hf-alerts-last-day'
const get = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const set = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* storage blocked */ } }

export const alertsEnabled = () => typeof Notification !== 'undefined' && Notification.permission === 'granted' && get(FLAG) === '1'

export async function enableAlerts(): Promise<boolean> {
  if (typeof Notification === 'undefined') { alert('This browser does not support desktop notifications.'); return false }
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (p !== 'granted') return false
  set(FLAG, '1')
  return true
}

/** Count of billing items needing action, plus one desktop notification a day while the app is open. */
export function useBillingAlerts(): number {
  const { schedules, scheduleEvents, projects } = useStore()
  const today = localToday()
  const urgent = useMemo(() => needsAction(buildAgenda(schedules, scheduleEvents, projects, today)), [schedules, scheduleEvents, projects, today])
  useEffect(() => {
    if (!urgent.length || !alertsEnabled() || get(LAST) === today) return
    set(LAST, today)
    const first = urgent.slice(0, 3).map((a) => `${a.party || a.title}: ${a.title}`).join('\n')
    new Notification(`${urgent.length} billing item${urgent.length > 1 ? 's' : ''} need action`, { body: first })
  }, [urgent, today])
  return urgent.length
}

/** Prepare draft invoices for recurring schedules whose reminder window has opened (once per day / when schedules change). */
export function useAutoDrafts(enabled: boolean) {
  const draftDueInvoices = useStore((s) => s.draftDueInvoices)
  const schedules = useStore((s) => s.schedules)
  const today = localToday()
  useEffect(() => { if (enabled) draftDueInvoices(today) }, [enabled, draftDueInvoices, schedules, today])
}
