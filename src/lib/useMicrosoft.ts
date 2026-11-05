import { useCallback, useEffect, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { currentAccount, signIn, signOut } from '@/lib/microsoft'
import { useStore } from '@/store'

/** Microsoft sign-in state for the configured Azure app. */
export function useMicrosoft() {
  const cfg = useStore((s) => s.msConfig)
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setAccount(null)
    currentAccount(cfg).then((a) => live && setAccount(a)).catch(() => {})
    return () => { live = false }
  }, [cfg])

  const run = useCallback(async (fn: () => Promise<AccountInfo | null>) => {
    setBusy(true); setError('')
    try { setAccount(await fn()) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }, [])

  return {
    configured: !!cfg.clientId.trim(), account, busy, error,
    connect: () => run(() => signIn(cfg)),
    disconnect: () => run(async () => { await signOut(cfg); return null }),
  }
}
