import { useStore } from '@/store'
import { fetchCandidates, fetchPositions, fetchProjects, fetchStatuses, fetchTalents, flushAll } from './hr'
import { setResync } from './status'
import { ApiError } from './client'

/** Someone without HR access gets 403 on these lists: that just means an empty list for them. */
const orEmpty = <T>(p: Promise<T[]>): Promise<T[]> => p.catch((e) => { if (e instanceof ApiError && e.status === 403) return []; throw e })

/** Replace projects, positions, talents and candidates in the store with what the server has. */
export async function hydrateHr(): Promise<void> {
  flushAll()
  const [projects, talents, statuses] = await Promise.all([fetchProjects(), orEmpty(fetchTalents()), fetchStatuses().catch(() => null)])
  const perProject = await Promise.all(projects.map(async (p) => [await orEmpty(fetchPositions(p.id)), await orEmpty(fetchCandidates(p.id))] as const))
  useStore.setState((s) => {
    const files = new Map(s.projects.map((p) => [p.id, p.files]))
    const merged = projects.map((p) => (files.get(p.id) ? { ...p, files: files.get(p.id) } : p))
    const active = merged.some((p) => p.id === s.activeProjectId) ? s.activeProjectId : (merged.find((p) => p.status === 'active') ?? merged[0])?.id ?? ''
    return {
      projects: merged,
      positions: perProject.flatMap(([pos]) => pos),
      candidates: perProject.flatMap(([, c]) => c),
      talents,
      ...(statuses ? { statuses } : {}),
      activeProjectId: active,
    }
  })
}

/** Forget the cached HR data (sign-out, or before the first load after sign-in). */
export const clearHr = () => useStore.setState({ projects: [], positions: [], candidates: [], talents: [], activeProjectId: '' })

setResync(hydrateHr)
