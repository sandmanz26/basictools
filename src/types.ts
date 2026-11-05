export type StageId = string
export type StageType = 'active' | 'won' | 'lost'

export interface Stage {
  id: StageId
  label: string
  color: string // key of STAGE_COLORS
  type: StageType
  interview: boolean // gets Date / Time / Result columns
  nextStep: string // default "Next step" text when a candidate enters this stage
}

export type RoundResult = 'pending' | 'pass' | 'fail' | 'no_show'
export type RoundKey = string
export type WorkArrangement = 'WFO' | 'Hybrid' | 'WFH' | 'Any'
export type ScreeningResult = 'pending' | 'pass' | 'fail'

export interface Round {
  date: string // yyyy-mm-dd
  time: string // HH:mm
  interviewer: string
  result: RoundResult
  notes: string
}

export interface Talent {
  id: string
  name: string
  email: string
  phone: string
  source: string
  skills: string // free text / comma separated
  salaryMin: number | null
  salaryMax: number | null
  arrangement: WorkArrangement
  notes: string
  createdAt: string
}

export interface Candidate {
  id: string
  projectId: string
  talentId: string // link to the Talent Pool entry (one talent can be in many projects)
  name: string
  email: string
  phone: string
  positionId: string
  source: string
  screeningScore: number | null // 0-100
  screeningResult: ScreeningResult
  salaryMin: number | null // expected salary range, IDR / month
  salaryMax: number | null
  archived: boolean
  arrangement: WorkArrangement
  stage: StageId
  nextStep: string
  owner: string // HR PIC
  appliedAt: string
  rounds: Record<StageId, Round>
  rejectReason: string
  notes: string
}

export interface TestQuestion {
  id: string
  text: string
  type: 'essay' | 'multiple_choice' | 'coding' | 'case_study'
  weight: number
  answerKey: string
}

export interface Position {
  id: string
  projectId: string
  title: string
  department: string
  level: string
  headcount: number
  status: 'open' | 'closed' | 'draft'
  arrangement: WorkArrangement
  salaryMin: number | null
  salaryMax: number | null
  description: string
  requirements: string
  questions: TestQuestion[]
}

export interface Project {
  id: string
  name: string
  description: string
  status: 'active' | 'archived'
  createdAt: string
  stages: Stage[]
}

export type Permission =
  | 'candidates.edit'
  | 'candidates.delete'
  | 'salary.view'
  | 'positions.edit'
  | 'tests.edit'
  | 'projects.manage'
  | 'share.manage'
  | 'roles.manage'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Record<Permission, boolean>
}

export interface User {
  id: string
  name: string
  email: string
  roleId: string
}

export interface ShareLink {
  id: string // token used in the URL
  projectId: string
  label: string
  access: 'public' | 'password'
  password: string // mock only: stored in plain text, no backend yet
  view: 'table' | 'kanban'
  showSalary: boolean
  showContact: boolean
  positionIds: string[] // empty = all
  enabled: boolean
  createdAt: string
  views: number
}
