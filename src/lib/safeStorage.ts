import { useSyncExternalStore } from 'react'
import { createJSONStorage } from 'zustand/middleware'

/**
 * localStorage that never throws. When the browser refuses a write (quota is about 5 MB, or storage is blocked)
 * the app keeps working in memory and shows a warning, instead of silently losing changes.
 */
let failed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

const safe = {
  getItem: (k: string) => { try { return localStorage.getItem(k) } catch { return null } },
  setItem: (k: string, v: string) => {
    try { localStorage.setItem(k, v); if (failed) { failed = false; emit() } } catch { if (!failed) { failed = true; emit() } }
  },
  removeItem: (k: string) => { try { localStorage.removeItem(k) } catch { /* nothing to do */ } },
}

export const appStorage = createJSONStorage(() => safe)
/** True while the last attempt to save to the browser failed. */
export const useStorageFailed = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => failed)
