import { useState } from 'react'
import { CalendarDays, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'
import type { Candidate, Position, Stage, StageId } from '@/types'
import { fmtDate, getRound, reschedules, salaryText, stageDot } from '@/lib/constants'
import type { ViewMode } from './CandidateTable'

function nextInterview(c: Candidate, stages: Stage[]) {
  for (const st of stages.filter((x) => x.interview)) {
    const r = getRound(c, st.id)
    if (r.date && r.result === 'pending') return `${st.label} · ${fmtDate(r.date)} ${r.time}${reschedules(c, st.id) ? ` · ↻${reschedules(c, st.id)}` : ''}`
  }
  return null
}

export function CandidateKanban({
  rows, positions, stages, mode, onOpen,
}: {
  rows: Candidate[]
  positions: Position[]
  stages: Stage[]
  mode: ViewMode
  onOpen: (id: string) => void
}) {
  const move = useStore((s) => s.moveCandidate)
  const [over, setOver] = useState<StageId | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const posName = (id: string) => positions.find((p) => p.id === id)?.title ?? 'No position'

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {stages.map((st) => {
        const items = rows.filter((c) => c.stage === st.id)
        return (
          <div
            key={st.id}
            onDragOver={(e) => { if (!mode.readOnly) { e.preventDefault(); setOver(st.id) } }}
            onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain') || dragId
              if (id && !mode.readOnly) move(id, st.id)
              setOver(null); setDragId(null)
            }}
            className={cn(
              'flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors',
              over === st.id && 'border-primary bg-primary/5',
            )}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className={cn('size-2 rounded-full', stageDot(st))} />
              <span className="text-sm font-semibold">{st.label}</span>
              <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{items.length}</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {items.map((c) => {
                const ni = nextInterview(c, stages)
                return (
                  <div
                    key={c.id}
                    draggable={!mode.readOnly}
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); setDragId(c.id) }}
                    onDragEnd={() => { setDragId(null); setOver(null) }}
                    onClick={() => onOpen(c.id)}
                    className={cn(
                      'cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow hover:shadow-md',
                      !mode.readOnly && 'cursor-grab active:cursor-grabbing',
                      dragId === c.id && 'opacity-40',
                    )}
                  >
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{posName(c.positionId)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-muted px-1.5 py-0.5">{c.arrangement}</span>
                      {c.screeningScore != null && (
                        <span className={cn('rounded px-1.5 py-0.5', c.screeningResult === 'pass' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300')}>
                          Test {c.screeningScore}
                        </span>
                      )}
                      <span className="rounded bg-muted px-1.5 py-0.5">{c.source}</span>
                    </div>
                    {mode.showSalary && (c.salaryMin != null || c.salaryMax != null) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Wallet className="size-3" /> Rp {salaryText(c.salaryMin, c.salaryMax)}</div>
                    )}
                    {ni && <div className="mt-1 flex items-center gap-1 text-xs text-sky-700 dark:text-sky-300"><CalendarDays className="size-3" /> {ni}</div>}
                    {c.nextStep && <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">→ {c.nextStep}</div>}
                  </div>
                )
              })}
              {items.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Drop candidates here</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
