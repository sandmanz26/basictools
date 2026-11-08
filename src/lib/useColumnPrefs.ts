import { useCallback, useState } from 'react'

/** Remember which table columns a person wants to see. Stored per browser; falls back to the defaults. */
export function useColumnPrefs(key: string, defaults: Record<string, boolean>) {
  const storageKey = `hf-columns-${key}`
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => {
    try { return { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) ?? '{}') } } catch { return defaults }
  })
  const update = useCallback((next: Record<string, boolean>) => {
    setPrefs(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* storage blocked: still works for this visit */ }
  }, [storageKey])
  return {
    shown: (id: string) => prefs[id] !== false,
    set: (id: string, on: boolean) => update({ ...prefs, [id]: on }),
    reset: () => update(defaults),
    prefs,
  }
}
