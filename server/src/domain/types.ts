// Nested shapes stored as jsonb. They mirror the frontend src/types.ts.

export interface Stage {
  id: string
  label: string
  color: string
  type: 'active' | 'won' | 'lost'
  interview: boolean
  nextStep: string
}

export type RoundResult = 'pending' | 'pass' | 'fail' | 'no_show' | 'rescheduled'

export interface RoundAttempt {
  date: string
  time: string
  interviewer: string
  result: RoundResult
  notes: string
  reason: string
  at: string
}

export interface Round {
  date: string
  time: string
  interviewer: string
  result: RoundResult
  notes: string
  history?: RoundAttempt[]
}

export interface TestFile {
  id: string
  name: string
  size: number
  uploadedAt: string
}

export interface FormLink {
  id: string
  label: string
  url: string
}

export interface Stakeholder {
  id: string
  name: string
  role: string
  influence: 'low' | 'medium' | 'high'
  contact: string
}

export interface ProjectInfo {
  /** Id of a project status; see StatusDef. */
  health: string
  phase: 'initiation' | 'planning' | 'execution' | 'monitoring' | 'closing'
  methodology: 'Agile' | 'Waterfall' | 'Hybrid'
  priority: 'low' | 'medium' | 'high' | 'critical'
  sponsor: string
  manager: string
  client: string
  startDate: string
  endDate: string
  budget: number | null
  objectives: string
  scopeIn: string
  scopeOut: string
  successCriteria: string
  assumptions: string
  stakeholders: Stakeholder[]
}

export type PmFeatureFlags = Record<'board' | 'timeline' | 'risks' | 'team' | 'budget' | 'updates', boolean>

export interface ScheduleTemplateItem {
  id: string
  description: string
  qty: number
  unitPrice: number
  ref?: string
}

export interface ScheduleTemplate {
  items: ScheduleTemplateItem[]
  taxPct: number
  clientEmail: string
  notes: string
}

/** A project status teams can define (frontend StatusDef). */
export interface StatusDef {
  id: string
  label: string
  color: string
  attention: boolean
}
