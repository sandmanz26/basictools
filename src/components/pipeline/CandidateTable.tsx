import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ArrowUpDown, PanelRightOpen, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { Candidate, Position, RoundResult, Stage } from '@/types'
import { ARRANGEMENTS, RESULT_META, SOURCES, getRound, reschedules, stageTone } from '@/lib/constants'
import { NumberCell, RangeCell, SelectCell, TextCell } from './cells'

export interface ViewMode {
  readOnly: boolean
  showSalary: boolean
  showContact: boolean
  canDelete?: boolean
}

type SortKey = 'name' | 'stage' | 'salary' | 'score'

const th = 'border-b border-r bg-muted px-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'

export function CandidateTable({
  rows, positions, stages, mode, onOpen,
}: {
  rows: Candidate[]
  positions: Position[]
  stages: Stage[]
  mode: ViewMode
  onOpen: (id: string) => void
}) {
  const { updateCandidate, updateRound, setRoundResult, rescheduleRound, deleteCandidate, archiveCandidate, moveCandidate } = useStore()
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 1 | -1 }>({ key: null, dir: 1 })
  const interviews = stages.filter((s) => s.interview)
  const stageById = (id: string) => stages.find((s) => s.id === id)

  const sorted = useMemo(() => {
    if (!sort.key) return rows
    const get = (c: Candidate) =>
      sort.key === 'name' ? c.name.toLowerCase()
      : sort.key === 'stage' ? stages.findIndex((s) => s.id === c.stage)
      : sort.key === 'salary' ? c.salaryMin ?? c.salaryMax ?? -1
      : c.screeningScore ?? -1
    return [...rows].sort((a, b) => (get(a) > get(b) ? 1 : get(a) < get(b) ? -1 : 0) * sort.dir)
  }, [rows, sort, stages])

  const toggle = (k: SortKey) => setSort((s) => (s.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : { key: null, dir: 1 }) : { key: k, dir: 1 }))
  const SortLabel = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggle(k)}>
      {children}
      {sort.key === k ? (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ArrowUpDown className="size-3 opacity-40" />}
    </button>
  )

  const ro = mode.readOnly
  const posOpts = positions.map((p) => ({ value: p.id, label: p.title }))
  // "Reschedule" is an action, not a stored result: it archives the attempt and opens a new slot.
  const resultOpts = [
    ...(['pending', 'pass', 'fail', 'no_show'] as RoundResult[]).map((r) => ({ value: r, label: RESULT_META[r].label })),
    { value: '__resched', label: '↻ Reschedule' },
  ]
  const cell = 'border-b border-r p-0 align-middle'
  const colCount = 10 + interviews.length * 3

  return (
    <div className="relative h-full overflow-auto rounded-lg border bg-background">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20">
          <tr>
            <th rowSpan={2} className={cn(th, 'sticky left-0 z-30 w-10 text-center')}>No</th>
            <th rowSpan={2} className={cn(th, 'sticky left-10 z-30 w-60')}><SortLabel k="name">Candidate</SortLabel></th>
            <th rowSpan={2} className={cn(th, 'w-44')}>Position</th>
            <th rowSpan={2} className={cn(th, 'w-28')}>Source</th>
            <th rowSpan={2} className={cn(th, 'w-32')}><SortLabel k="score">Tech Screening</SortLabel></th>
            {mode.showSalary && <th rowSpan={2} className={cn(th, 'w-48')}><SortLabel k="salary">Expected Salary</SortLabel></th>}
            <th rowSpan={2} className={cn(th, 'w-28')}>Working</th>
            <th rowSpan={2} className={cn(th, 'w-44')}><SortLabel k="stage">Stage</SortLabel></th>
            <th rowSpan={2} className={cn(th, 'w-72')}>Next Step</th>
            {interviews.map((s) => (
              <th key={s.id} colSpan={3} className="border-r border-b bg-muted/70 px-2 py-1.5 text-center text-xs font-semibold text-foreground">{s.label}</th>
            ))}
            <th rowSpan={2} className={cn(th, 'w-24')}>HR Owner</th>
            <th rowSpan={2} className="w-20 border-b bg-muted" />
          </tr>
          <tr>
            {interviews.flatMap((s) => [
              <th key={s.id + 'd'} className={cn(th, 'w-32 py-1.5')}>Date</th>,
              <th key={s.id + 't'} className={cn(th, 'w-24 py-1.5')}>Time</th>,
              <th key={s.id + 'r'} className={cn(th, 'w-28 py-1.5')}>Result</th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const st = stageById(c.stage)
            const dim = st?.type === 'lost' || c.archived
            return (
              <tr key={c.id} className={cn('group hover:bg-muted/30', dim && 'opacity-60')}>
                <td className={cn(cell, 'sticky left-0 z-10 bg-background text-center text-xs text-muted-foreground group-hover:bg-muted')}>{i + 1}</td>
                <td className={cn(cell, 'sticky left-10 z-10 bg-background group-hover:bg-muted')}>
                  <TextCell value={c.name} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { name: v })} className="font-medium" />
                  {mode.showContact && (
                    <TextCell value={c.email} readOnly={ro} placeholder="email@domain.com" onCommit={(v) => updateCandidate(c.id, { email: v })} className="py-0.5 text-[11px] text-muted-foreground" />
                  )}
                </td>
                <td className={cell}><SelectCell value={c.positionId} options={posOpts} readOnly={ro} onChange={(v) => updateCandidate(c.id, { positionId: v })} placeholder="Select…" /></td>
                <td className={cell}><SelectCell value={c.source} options={SOURCES.map((s) => ({ value: s, label: s }))} readOnly={ro} onChange={(v) => updateCandidate(c.id, { source: v })} /></td>
                <td className={cell}>
                  <div className="flex items-center">
                    <div className="w-14 shrink-0">
                      <NumberCell value={c.screeningScore} readOnly={ro} placeholder="0-100"
                        onCommit={(v) => updateCandidate(c.id, { screeningScore: v, screeningResult: v == null ? 'pending' : v >= 65 ? 'pass' : 'fail' })} />
                    </div>
                    <span className={cn('mr-1 rounded px-1 py-0.5 text-[10px] font-medium', RESULT_META[c.screeningResult].tone)}>{RESULT_META[c.screeningResult].label}</span>
                  </div>
                </td>
                {mode.showSalary && (
                  <td className={cell}>
                    <RangeCell min={c.salaryMin} max={c.salaryMax} readOnly={ro} onCommit={(mn, mx) => updateCandidate(c.id, { salaryMin: mn, salaryMax: mx })} />
                  </td>
                )}
                <td className={cell}><SelectCell value={c.arrangement} options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} readOnly={ro} onChange={(v) => updateCandidate(c.id, { arrangement: v as Candidate['arrangement'] })} /></td>
                <td className={cell}>
                  <SelectCell value={c.stage} options={stages.map((s) => ({ value: s.id, label: s.label }))} readOnly={ro} tone={stageTone(st)} onChange={(v) => moveCandidate(c.id, v)} />
                </td>
                <td className={cell}><TextCell value={c.nextStep} readOnly={ro} placeholder="What happens next?" onCommit={(v) => updateCandidate(c.id, { nextStep: v })} /></td>
                {interviews.map((s) => {
                  const rd = getRound(c, s.id)
                  return [
                    <td key={s.id + 'd'} className={cell}><TextCell type="date" value={rd.date} readOnly={ro} onCommit={(v) => updateRound(c.id, s.id, { date: v })} /></td>,
                    <td key={s.id + 't'} className={cell}><TextCell type="time" value={rd.time} readOnly={ro} onCommit={(v) => updateRound(c.id, s.id, { time: v })} /></td>,
                    <td key={s.id + 'r'} className={cell}>
                      <div className="relative">
                        <SelectCell
                          value={rd.result} options={resultOpts} readOnly={ro} tone={RESULT_META[rd.result].tone}
                          onChange={(v) => (v === '__resched' ? rescheduleRound(c.id, s.id, 'Candidate could not attend') : setRoundResult(c.id, s.id, v as RoundResult))}
                        />
                        {reschedules(c, s.id) > 0 && (
                          <span title={`Interview moved ${reschedules(c, s.id)}×. This is attempt ${reschedules(c, s.id) + 1}.`} className="pointer-events-none absolute top-0.5 right-0.5 rounded bg-sky-600 px-1 text-[9px] leading-3.5 font-semibold text-white">↻{reschedules(c, s.id)}</span>
                        )}
                      </div>
                    </td>,
                  ]
                })}
                <td className={cell}><TextCell value={c.owner} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { owner: v })} /></td>
                <td className="border-b p-0">
                  <div className="flex items-center justify-center gap-0.5 px-1">
                    <Button variant="ghost" size="icon-xs" title="Open details" onClick={() => onOpen(c.id)}><PanelRightOpen /></Button>
                    {!ro && (
                      <Button variant="ghost" size="icon-xs" title={c.archived ? 'Restore from archive' : 'Archive'} onClick={() => archiveCandidate(c.id, !c.archived)}>
                        {c.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                    )}
                    {mode.canDelete && <Button variant="ghost" size="icon-xs" title="Delete permanently" onClick={() => confirm(`Delete ${c.name} permanently?`) && deleteCandidate(c.id)}><Trash2 className="text-destructive" /></Button>}
                  </div>
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && <tr><td colSpan={colCount} className="py-16 text-center text-sm text-muted-foreground">No candidates match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
