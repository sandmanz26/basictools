import type { Round, Stage } from '../../domain/types.js'

export const emptyRound = (): Round => ({ date: '', time: '', interviewer: '', result: 'pending', notes: '' })

/** Where a candidate goes on "pass": the next stage that is not a lost stage. */
export function nextStageId(stages: Stage[], current: string): string {
  const i = stages.findIndex((s) => s.id === current)
  return stages.slice(i + 1).find((s) => s.type !== 'lost')?.id ?? current
}
export const lostStageId = (stages: Stage[]) => stages.find((s) => s.type === 'lost')?.id

export interface PipelineState {
  stage: string
  nextStep: string
  rounds: Record<string, Round>
}

/** Setting a result moves the candidate: pass -> next stage, fail -> the pipeline's lost stage (store.setRoundResult). */
export function applyRoundResult(c: PipelineState, stages: Stage[], key: string, result: Round['result']): PipelineState {
  const rounds = { ...c.rounds, [key]: { ...(c.rounds[key] ?? emptyRound()), result } }
  let stage = c.stage
  if (result === 'pass' && c.stage === key) stage = nextStageId(stages, c.stage)
  if (result === 'fail') stage = lostStageId(stages) ?? c.stage
  const nextStep = stage !== c.stage ? (stages.find((s) => s.id === stage)?.nextStep ?? c.nextStep) : c.nextStep
  return { stage, nextStep, rounds }
}

/**
 * Repeat an interview (store.rescheduleRound): the current attempt moves to `history` and a fresh slot opens.
 * Returns null when nothing was scheduled yet, so there is nothing to reschedule.
 */
export function applyReschedule(c: PipelineState, stages: Stage[], key: string, reason: string, today: string): PipelineState | null {
  const cur = c.rounds[key] ?? emptyRound()
  if (!cur.date && cur.result === 'pending') return null
  const attempt = {
    date: cur.date,
    time: cur.time,
    interviewer: cur.interviewer,
    notes: cur.notes,
    reason,
    at: today,
    result: cur.result === 'pending' ? ('rescheduled' as const) : cur.result,
  }
  const label = stages.find((s) => s.id === key)?.label ?? 'interview'
  const history = [...(cur.history ?? []), attempt]
  // Already rejected / moved on by this round: bring the candidate back to it.
  const back = c.stage !== key && cur.result !== 'pending' ? key : c.stage
  return {
    stage: back,
    nextStep: `Reschedule ${label} (attempt ${history.length + 1})`,
    rounds: { ...c.rounds, [key]: { ...emptyRound(), interviewer: cur.interviewer, history } },
  }
}
