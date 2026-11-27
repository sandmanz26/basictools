import { create } from 'zustand'
import { ApiError } from './client'

/** Sync problems shown in a banner (see ApiStatusBanner). The store is rolled back by refetching from the server. */
export const useApiStatus = create<{ error: string; clear: () => void }>((set) => ({ error: '', clear: () => set({ error: '' }) }))

let resync: (() => Promise<void>) | null = null
export const setResync = (fn: () => Promise<void>) => { resync = fn }

export function reportSyncError(e: unknown) {
  const msg = e instanceof ApiError ? (e.status === 403 ? 'You do not have permission for that change.' : e.message) : 'Could not save. Check your connection.'
  useApiStatus.setState({ error: `${msg} The screen was refreshed from the server.` })
  void resync?.().catch(() => undefined)
}
