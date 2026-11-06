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
  testFiles?: TestFile[] // uploaded PDF test papers (file bytes live in IndexedDB, see lib/files.ts)
  formLinks?: FormLink[] // external forms HR uses to collect candidate data
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

export interface Project {
  id: string
  name: string
  description: string
  status: 'active' | 'archived'
  createdAt: string
  stages: Stage[] // HR hiring pipeline
  pmStages: Stage[] // PM work board workflow (separate from HR)
  info: ProjectInfo
  pmFeatures: Record<PmFeature, boolean> // optional PM tools, off by default
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
  | 'module.hr'
  | 'module.pm'
  | 'pm.edit'
  | 'pm.invoice'
  | 'module.mkt'
  | 'mkt.edit'
  | 'mkt.send'

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

// ---------- Project management (PM) ----------

export type Health = 'on_track' | 'at_risk' | 'off_track' | 'on_hold' | 'done'
export type Phase = 'initiation' | 'planning' | 'execution' | 'monitoring' | 'closing'
export type Priority = 'low' | 'medium' | 'high' | 'critical'

export interface Stakeholder {
  id: string
  name: string
  role: string
  influence: 'low' | 'medium' | 'high'
  contact: string
}

export interface ProjectInfo {
  health: Health
  phase: Phase
  methodology: 'Agile' | 'Waterfall' | 'Hybrid'
  priority: Priority
  sponsor: string
  manager: string
  client: string
  startDate: string
  endDate: string
  budget: number | null // IDR
  objectives: string
  scopeIn: string
  scopeOut: string
  successCriteria: string
  assumptions: string
  stakeholders: Stakeholder[]
}

export interface Task {
  id: string
  projectId: string
  title: string
  description: string
  stage: string // id in project.pmStages
  assignee: string
  priority: Priority
  startDate: string
  dueDate: string
  estimateH: number | null
  milestoneId: string
  labels: string
}

export interface Milestone {
  id: string
  projectId: string
  title: string
  date: string
  status: 'upcoming' | 'done' | 'missed'
  owner: string
  notes: string
}

export interface Risk {
  id: string
  projectId: string
  kind: 'risk' | 'issue'
  title: string
  probability: number // 1-5
  impact: number // 1-5
  status: 'open' | 'mitigating' | 'closed'
  owner: string
  mitigation: string
  dueDate: string
}

export interface Member {
  id: string
  projectId: string
  name: string
  role: string
  email: string
  allocation: number // % of time
  startDate: string
  endDate: string
}

export interface BudgetItem {
  id: string
  projectId: string
  category: string
  description: string
  planned: number
  actual: number
}

export interface StatusUpdate {
  id: string
  projectId: string
  date: string
  author: string
  health: Health
  summary: string
  highlights: string
  blockers: string
  nextSteps: string
}

export interface PMCollections {
  tasks: Task[]
  milestones: Milestone[]
  risks: Risk[]
  members: Member[]
  budget: BudgetItem[]
  updates: StatusUpdate[]
}

// ---------- Marketing ----------

export interface Lead {
  id: string
  name: string // contact person
  company: string
  title: string
  email: string
  phone: string
  source: string
  stage: StageId // id in mktStages
  value: number | null // estimated deal value, IDR
  owner: string
  nextAction: string
  nextActionDate: string // yyyy-mm-dd
  tags: string
  notes: string
  createdAt: string
  lastContactAt: string
  unsubscribed: boolean
  custom?: Record<string, string> // values of user-defined fields, keyed by FieldDef.id
}

export interface FieldDef {
  id: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  options: string // comma separated, for type 'select'
}

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body: string // plain text, supports {{name}} {{firstName}} {{company}} {{title}} {{owner}}
}

export interface SentEmail {
  id: string
  leadId: string
  to: string
  subject: string
  body: string
  sentAt: string // ISO
  sentBy: string
  status: 'sent' | 'failed'
  error: string
}

export interface MsConfig {
  clientId: string
  tenant: string // 'common' | 'organizations' | tenant id
}

export type PmFeature = 'board' | 'timeline' | 'risks' | 'team' | 'budget' | 'updates'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export interface InvoiceItem {
  id: string
  description: string
  qty: number
  unitPrice: number // IDR
}

export interface Invoice {
  id: string
  projectId: string
  number: string
  clientName: string
  clientEmail: string
  issueDate: string // yyyy-mm-dd
  dueDate: string
  items: InvoiceItem[]
  taxPct: number // e.g. 11 for PPN
  status: InvoiceStatus // 'overdue' is derived from sent + past due, see effectiveStatus()
  notes: string
  sentAt: string // ISO, '' until sent
}

export type BroadcastStatus = 'running' | 'paused' | 'done'

export interface Broadcast {
  id: string
  name: string
  subject: string
  body: string // raw, merge fields filled per recipient at send time
  footer: boolean
  audience: string // human readable description of the filters
  recipients: Record<string, 'pending' | 'sent' | 'failed'> // by lead id
  status: BroadcastStatus
  createdAt: string // ISO
  finishedAt: string
  createdBy: string
}
