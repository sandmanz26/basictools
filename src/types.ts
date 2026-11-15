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

export type RoundResult = 'pending' | 'pass' | 'fail' | 'no_show' | 'rescheduled'
export type RoundKey = string
export type WorkArrangement = 'WFO' | 'Hybrid' | 'WFH' | 'Any'
export type ScreeningResult = 'pending' | 'pass' | 'fail'

/** A previous try of the same interview (candidate couldn't attend, interviewer unavailable, ...). */
export interface RoundAttempt {
  date: string
  time: string
  interviewer: string
  result: RoundResult
  notes: string
  reason: string
  at: string // yyyy-mm-dd the reschedule was recorded
}

export interface Round {
  date: string // yyyy-mm-dd
  time: string // HH:mm
  interviewer: string
  result: RoundResult
  notes: string
  history?: RoundAttempt[] // earlier attempts, oldest first; the fields above are the current attempt
}

export interface Talent {
  id: string
  name: string
  email: string
  phone: string
  source: string
  skills: string // free text / comma separated
  portfolio?: string // link to portfolio / GitHub / Behance
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
  pmFields?: Record<PmField, boolean> // which project-info fields this project uses; missing = all
  files?: FileRef[] // NDA, agreement, SOW and other documents (links into SharePoint or any URL)
}

// ---------- Files (SharePoint / links) ----------

export type FileCategory = 'nda' | 'agreement' | 'sow' | 'invoice' | 'tax' | 'other'

/** A document that lives elsewhere (SharePoint/OneDrive or any link). Only the link and name are stored here. */
export interface FileRef {
  id: string
  name: string
  url: string
  category: FileCategory
  size?: number
  source: 'sharepoint' | 'link'
  addedAt: string // ISO
  addedBy: string
}

// ---------- Project meetings ----------

export type ProjectMeetingStatus = 'planned' | 'held' | 'cancelled'

/** One meeting in a project's history: when, who came, what was discussed and decided. */
export interface ProjectMeeting {
  id: string
  projectId: string
  title: string
  date: string // yyyy-mm-dd (local)
  startTime: string // HH:mm, '' when unknown
  endTime: string
  attendees: string[] // names or emails
  summary: string // short discussion notes
  decisions: string // decisions and next steps
  location: string
  joinUrl: string
  outlookId: string // Outlook calendar event id when linked, else ''
  status: ProjectMeetingStatus
  createdBy: string
  createdAt: string // ISO
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

export type UserStatus = 'active' | 'pending' | 'disabled'

export interface User {
  id: string
  name: string
  email: string
  roleId: string
  /** Missing means active (accounts created before login existed). */
  status?: UserStatus
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

/** Id of a project status (see StatusDef). Default ids: on_track, at_risk, off_track, on_hold, done. */
export type Health = string

/** A project status the team can define: shown as a coloured badge on projects and updates. */
export interface StatusDef {
  id: string
  label: string
  color: string // key of STAGE_COLORS
  attention: boolean // counts as "needs attention" on the project list
}
export type Phase = 'planning' | 'ongoing' | 'completed'
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

/** What happened to a meeting after it ended. Only the meeting id is kept, never its contents. */
export interface MeetingFollowup { status: 'done' | 'skipped'; at: string; sent?: number }

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
  broadcastId?: string // set when sent as part of a broadcast (for daily caps)
  attachments?: string[] // file names that went with the email
}

/** A file attached to an email or broadcast. The bytes live in IndexedDB (lib/files.ts) under `att-<id>`. */
export interface AttachmentMeta {
  id: string
  name: string
  size: number
  type: string // MIME type
}

export interface MsConfig {
  clientId: string
  tenant: string // 'common' | 'organizations' | tenant id
  sharepoint?: SharePointConfig
}

/** Where documents are uploaded: a SharePoint site (or the user's OneDrive when siteUrl is empty). */
export interface SharePointConfig {
  siteUrl: string // e.g. https://contoso.sharepoint.com/sites/Projects, '' = OneDrive of the signed-in user
  folder: string // root folder inside the document library, e.g. HireFlow
}

export type PmField =
  | 'health' | 'phase' | 'priority' | 'methodology' | 'startDate' | 'endDate' | 'manager' | 'sponsor' | 'client' | 'budget'
  | 'objectives' | 'successCriteria' | 'scope' | 'assumptions' | 'stakeholders'

export type PmFeature = 'board' | 'timeline' | 'risks' | 'team' | 'budget' | 'updates'

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue'

export interface InvoiceItem {
  id: string
  description: string
  qty: number
  unitPrice: number // IDR
  ref?: string // where the line came from, e.g. "ms:<milestoneId>", so it isn't billed twice
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
  scheduleKey?: string // set when a recurring schedule generated this invoice (`${scheduleId}:${date}`)
  period?: string // e.g. "November 2026" for recurring invoices
  currency?: Currency // missing = IDR
  bankId?: string // which of our bank accounts the client pays into (BillingProfile.banks)
  payments?: Payment[] // money received; may be partial, late, or short because of withholding tax
  attachments?: FileRef[] // signed copy, tax slip (bukti potong), PO …
}

export type Currency = 'IDR' | 'USD' | 'JPY'

/** One receipt of money against an invoice. Clients often pay late and less than the total because they withhold PPh. */
export interface Payment {
  id: string
  date: string // yyyy-mm-dd the money arrived
  amount: number // what actually landed in the bank
  withheld: number // tax the client withheld and paid to the tax office (PPh), counts toward the invoice
  note: string
}

export interface BankAccount {
  id: string
  bank: string // BCA, Maybank …
  number: string
  holder: string
  currency: Currency
  swift?: string // for foreign payments
  branch?: string
}

/** Company details and defaults printed on every invoice PDF (the invoice template). */
export interface BillingProfile {
  company: string
  address: string
  email: string
  phone: string
  taxId: string // NPWP
  paymentNote: string // default text for the notes box of new invoices
  logo?: string // data URL, resized small (see lib/image.ts)
  website?: string
  banks?: BankAccount[] // accounts clients can pay into; the invoice prints the one chosen on it
  defaultTaxPct?: number // PPN, default 11
  defaultTermDays?: number // days a client has to pay, default 14
  footer?: string // small print at the bottom of the PDF
  signerName?: string
  signerTitle?: string
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
  attachments?: AttachmentMeta[] // sent with every email of this broadcast
  dailyCap?: number // max emails per calendar day for this broadcast (0/undefined = no cap)
  windowStart?: number // only send from this hour (0-23)
  windowEnd?: number // ...until this hour (1-24)
  pausedReason?: string // why it stopped by itself
  resumeAt?: string // ISO: when it continues automatically (while the app is open)
}

// ---------- Billing schedules & reminders ----------

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'

/** What a recurring client invoice contains each time. Empty items = one line from the schedule title and amount. */
export interface ScheduleTemplate {
  items: InvoiceItem[]
  taxPct: number
  clientEmail: string
  notes: string
}

/** Something that repeats on a calendar: an invoice we must release to a client, or a bill we must pay a vendor. */
export interface Schedule {
  id: string
  kind: 'receivable' | 'payable'
  projectId: string // '' for company-wide payables
  party: string // client (receivable) or vendor (payable)
  title: string
  amount: number | null // IDR, expected amount
  frequency: Frequency
  day: number // monthly+: 1-31, or 0 = last day of the month
  weekday?: number // weekly / biweekly: 0 = Sunday … 6 = Saturday (default: the weekday of startDate)
  startDate: string // first occurrence is on/after this date
  endDate: string // '' = open ended
  leadDays: number // start reminding this many days before the date
  termDays: number // receivable: days the client has to pay after we release the invoice
  pic: string
  notes: string
  active: boolean
  template?: ScheduleTemplate // receivable: how the generated invoice looks
  autoDraft?: boolean // receivable: create the draft invoice by itself when the reminder window opens (default on)
  currency?: Currency // missing = IDR
  bankId?: string // receivable: our account the client should pay into
  payTo?: { bank: string; account: string; holder: string } // payable: the vendor's bank details
  attachments?: FileRef[] // contract, quotation …
}

/** Progress of one occurrence of a schedule. Keyed by `${scheduleId}:${yyyy-mm-dd}` in the store. */
export interface ScheduleEvent {
  issuedAt: string // receivable: date the invoice was released
  invoiceNo: string
  paidAt: string // receivable: date money came in; payable: date we paid
  skipped: boolean
  invoiceId?: string // the generated invoice document, if any
  paidAmount?: number // amount that actually arrived / was paid (may differ from the expected amount)
  withheld?: number // receivable: tax the client withheld (PPh)
  paidNote?: string
  attachments?: FileRef[] // this occurrence's vendor invoice, proof of payment …
}
