import { useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useStore } from '@/store'
import type { Position, RoundResult, Stage } from '@/types'
import { ARRANGEMENTS, RESCHEDULE_REASONS, RESULT_META, SOURCES, fmtDate, getRound, stageTone } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Archive, ArchiveRestore, RefreshCw } from 'lucide-react'
import { NativeSelect } from '@/components/NativeSelect'
import { NumberCell, SelectCell, TextCell } from './cells'
import type { ViewMode } from './CandidateTable'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="rounded-md border">{children}</div>
    </div>
  )
}

export function CandidateSheet({
  id, onClose, positions, stages, mode,
}: {
  id: string | null
  onClose: () => void
  positions: Position[]
  stages: Stage[]
  mode: ViewMode
}) {
  const c = useStore((s) => s.candidates.find((x) => x.id === id))
  const { updateCandidate, updateRound, setRoundResult, rescheduleRound, moveCandidate, archiveCandidate } = useStore()
  const [reason, setReason] = useState(RESCHEDULE_REASONS[0])
  const ro = mode.readOnly
  const resultOpts = (['pending', 'pass', 'fail', 'no_show'] as RoundResult[]).map((r) => ({ value: r, label: RESULT_META[r].label }))

  return (
    <Sheet open={!!c} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {c && (
          <>
            <SheetHeader>
              <SheetTitle>{c.name}</SheetTitle>
              <SheetDescription>
                {positions.find((p) => p.id === c.positionId)?.title ?? 'No position'} · applied {c.appliedAt}{c.archived ? ' · archived' : ''}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><TextCell value={c.name} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { name: v })} /></Field>
                <Field label="Stage">
                  <SelectCell value={c.stage} options={stages.map((s) => ({ value: s.id, label: s.label }))} readOnly={ro} tone={stageTone(stages.find((s) => s.id === c.stage))} onChange={(v) => moveCandidate(c.id, v)} />
                </Field>
                {mode.showContact && (
                  <>
                    <Field label="Email"><TextCell value={c.email} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { email: v })} /></Field>
                    <Field label="Phone"><TextCell value={c.phone} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { phone: v })} /></Field>
                  </>
                )}
                <Field label="Position">
                  <SelectCell value={c.positionId} options={positions.map((p) => ({ value: p.id, label: p.title }))} readOnly={ro} onChange={(v) => updateCandidate(c.id, { positionId: v })} />
                </Field>
                <Field label="Source"><SelectCell value={c.source} options={SOURCES.map((s) => ({ value: s, label: s }))} readOnly={ro} onChange={(v) => updateCandidate(c.id, { source: v })} /></Field>
                <Field label="Working arrangement"><SelectCell value={c.arrangement} options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} readOnly={ro} onChange={(v) => updateCandidate(c.id, { arrangement: v as typeof c.arrangement })} /></Field>
                <Field label="Tech screening score">
                  <NumberCell value={c.screeningScore} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { screeningScore: v, screeningResult: v == null ? 'pending' : v >= 65 ? 'pass' : 'fail' })} />
                </Field>
                {mode.showSalary && (
                  <>
                    <Field label="Expected salary min (IDR)"><NumberCell value={c.salaryMin} readOnly={ro} format={(n) => new Intl.NumberFormat('id-ID').format(n)} onCommit={(v) => updateCandidate(c.id, { salaryMin: v })} /></Field>
                    <Field label="Expected salary max (IDR)"><NumberCell value={c.salaryMax} readOnly={ro} format={(n) => new Intl.NumberFormat('id-ID').format(n)} onCommit={(v) => updateCandidate(c.id, { salaryMax: v })} /></Field>
                  </>
                )}
                <Field label="HR owner"><TextCell value={c.owner} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { owner: v })} /></Field>
              </div>
              <Field label="Next step"><TextCell value={c.nextStep} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { nextStep: v })} /></Field>

              {stages.filter((r) => r.interview).map((r) => {
                const k = r.id
                const rd = getRound(c, k)
                return (
                  <div key={k} className="space-y-2 rounded-lg border p-3">
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Date"><TextCell type="date" value={rd.date} readOnly={ro} onCommit={(v) => updateRound(c.id, k, { date: v })} /></Field>
                      <Field label="Time"><TextCell type="time" value={rd.time} readOnly={ro} onCommit={(v) => updateRound(c.id, k, { time: v })} /></Field>
                      <Field label="Interviewer"><TextCell value={rd.interviewer} readOnly={ro} onCommit={(v) => updateRound(c.id, k, { interviewer: v })} /></Field>
                      <Field label="Result"><SelectCell value={rd.result} options={resultOpts} readOnly={ro} tone={RESULT_META[rd.result].tone} onChange={(v) => setRoundResult(c.id, k, v as RoundResult)} /></Field>
                    </div>
                    <Textarea disabled={ro} placeholder="Interview notes" defaultValue={rd.notes} key={c.id + k + (rd.history?.length ?? 0)} onBlur={(e) => updateRound(c.id, k, { notes: e.target.value })} />
                    {!ro && (rd.date || rd.result !== 'pending') && (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
                        <span className="text-xs text-muted-foreground">Can’t make it?</span>
                        <NativeSelect value={reason} onChange={setReason} options={RESCHEDULE_REASONS.map((x) => ({ value: x, label: x }))} />
                        <Button size="sm" variant="outline" onClick={() => rescheduleRound(c.id, k, reason)}><RefreshCw /> Reschedule</Button>
                      </div>
                    )}
                    {(rd.history?.length ?? 0) > 0 && (
                      <div className="space-y-1 border-t pt-2">
                        <div className="text-xs font-medium text-muted-foreground">Earlier attempts</div>
                        {rd.history!.map((h, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-x-2 text-xs">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-medium">#{i + 1}</span>
                            <span>{fmtDate(h.date) || 'no date'} {h.time}</span>
                            <span className={'rounded px-1.5 py-0.5 ' + RESULT_META[h.result].tone}>{RESULT_META[h.result].label}</span>
                            <span className="text-muted-foreground">{h.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {stages.find((x) => x.id === c.stage)?.type === 'lost' && (
                <Field label="Rejection reason"><TextCell value={c.rejectReason} readOnly={ro} onCommit={(v) => updateCandidate(c.id, { rejectReason: v })} /></Field>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea disabled={ro} defaultValue={c.notes} key={c.id + 'n'} onBlur={(e) => updateCandidate(c.id, { notes: e.target.value })} />
              </div>
              {!ro && (
                <Button variant="outline" onClick={() => { archiveCandidate(c.id, !c.archived); onClose() }}>
                  {c.archived ? <ArchiveRestore /> : <Archive />} {c.archived ? 'Restore from archive' : 'Archive candidate'}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
