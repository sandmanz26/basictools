import type { Candidate, Stage, StageId } from '@/types'
import { today } from '@/lib/constants'

export interface Filters {
  q: string
  positions: string[]
  stages: StageId[]
  arrangements: string[]
  sources: string[]
  owners: string[]
  salaryMin: string
  salaryMax: string
  upcoming: boolean // has an interview scheduled in the next 7 days
  hideClosed: boolean // hide candidates in a "lost" stage
  archived: boolean // show archived candidates only
}

export const emptyFilters: Filters = {
  q: '', positions: [], stages: [], arrangements: [], sources: [], owners: [],
  salaryMin: '', salaryMax: '', upcoming: false, hideClosed: false, archived: false,
}

export function activeCount(f: Filters) {
  return (
    (f.q ? 1 : 0) + f.positions.length + f.stages.length + f.arrangements.length + f.sources.length +
    f.owners.length + (f.salaryMin ? 1 : 0) + (f.salaryMax ? 1 : 0) + (f.upcoming ? 1 : 0) + (f.hideClosed ? 1 : 0) + (f.archived ? 1 : 0)
  )
}

const addDays = (d: string, n: number) => {
  const dt = new Date(d + 'T00:00:00')
  dt.setDate(dt.getDate() + n)
  return dt.toISOString().slice(0, 10)
}

export function applyFilters(list: Candidate[], f: Filters, stages: Stage[]) {
  const lost = new Set(stages.filter((s) => s.type === 'lost').map((s) => s.id))
  const t = today()
  const end = addDays(t, 7)
  const q = f.q.trim().toLowerCase()
  const min = f.salaryMin ? Number(f.salaryMin) * 1_000_000 : null
  const max = f.salaryMax ? Number(f.salaryMax) * 1_000_000 : null
  return list.filter((c) => {
    if (q && !`${c.name} ${c.email} ${c.nextStep} ${c.owner}`.toLowerCase().includes(q)) return false
    if (f.positions.length && !f.positions.includes(c.positionId)) return false
    if (f.stages.length && !f.stages.includes(c.stage)) return false
    if (f.arrangements.length && !f.arrangements.includes(c.arrangement)) return false
    if (f.sources.length && !f.sources.includes(c.source)) return false
    if (f.owners.length && !f.owners.includes(c.owner)) return false
    if (c.archived !== f.archived) return false
    // salary ranges overlap with the filter range
    if (min != null && (c.salaryMax ?? c.salaryMin ?? 0) < min) return false
    if (max != null && (c.salaryMin ?? c.salaryMax ?? Infinity) > max) return false
    if (f.hideClosed && lost.has(c.stage)) return false
    if (f.upcoming) {
      const hit = Object.values(c.rounds).some((r) => r.date && r.result === 'pending' && r.date >= t && r.date <= end)
      if (!hit) return false
    }
    return true
  })
}
