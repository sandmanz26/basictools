import { useEffect, useRef, useState } from 'react'

/**
 * Edit a copy of saved data. Nothing reaches the store until `save()` is called, so people can't
 * leave a half-finished change behind by accident. `resetKey` identifies which record is being edited.
 */
export function useDraft<T>(source: T, resetKey: string, commit: (draft: T) => void) {
  const [draft, setDraft] = useState<T>(source)
  const key = useRef(resetKey)
  useEffect(() => {
    if (key.current !== resetKey) { key.current = resetKey; setDraft(source) }
  }, [resetKey, source])

  const dirty = JSON.stringify(draft) !== JSON.stringify(source)

  // Warn before closing / reloading the tab with unsaved work.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  return {
    draft,
    set: (patch: Partial<T>) => setDraft((d) => ({ ...d, ...patch })),
    replace: setDraft,
    dirty,
    save: () => commit(draft),
    discard: () => setDraft(source),
  }
}
