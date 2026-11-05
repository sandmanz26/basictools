import { useMemo, useState } from 'react'
import { Columns3, Table2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { applyFilters, emptyFilters, type Filters } from '@/lib/filters'
import type { Candidate, Position, Stage } from '@/types'
import { FilterBar } from './FilterBar'
import { CandidateTable, type ViewMode } from './CandidateTable'
import { CandidateKanban } from './CandidateKanban'
import { CandidateSheet } from './CandidateSheet'

/** Shared by the internal app and the public share page. */
export function PipelineView({
  candidates, positions, stages, mode, initialView = 'table', toolbarExtra, lockView,
}: {
  candidates: Candidate[]
  positions: Position[]
  stages: Stage[]
  mode: ViewMode
  initialView?: 'table' | 'kanban'
  toolbarExtra?: (rows: Candidate[]) => React.ReactNode
  lockView?: boolean
}) {
  const [view, setView] = useState<'table' | 'kanban'>(initialView)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = useMemo(() => applyFilters(candidates, filters, stages), [candidates, filters, stages])
  const owners = useMemo(() => [...new Set(candidates.map((c) => c.owner))], [candidates])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {!lockView && (
          <Tabs value={view} onValueChange={(v) => setView(v as 'table' | 'kanban')}>
            <TabsList>
              <TabsTrigger value="table"><Table2 className="size-3.5" /> Table</TabsTrigger>
              <TabsTrigger value="kanban"><Columns3 className="size-3.5" /> Kanban</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <div className="min-w-0 flex-1">
          <FilterBar filters={filters} onChange={setFilters} positions={positions} stages={stages} owners={owners} showSalary={mode.showSalary} total={candidates.filter((c) => c.archived === filters.archived).length} shown={rows.length} />
        </div>
        {toolbarExtra?.(rows)}
      </div>
      <div className="min-h-0 flex-1">
        {view === 'table' ? (
          <CandidateTable rows={rows} positions={positions} stages={stages} mode={mode} onOpen={setOpenId} />
        ) : (
          <CandidateKanban rows={rows} positions={positions} stages={stages} mode={mode} onOpen={setOpenId} />
        )}
      </div>
      <CandidateSheet id={openId} onClose={() => setOpenId(null)} positions={positions} stages={stages} mode={mode} />
    </div>
  )
}
