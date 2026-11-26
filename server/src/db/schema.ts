import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { isoTimestamp } from './columns.js'
import type {
  PmFeatureFlags,
  ProjectInfo,
  Stage,
  ScheduleTemplate,
  FormLink,
  TestFile,
  Round,
} from '../domain/types.js'

// ---------- shared column helpers ----------
const id = () => uuid('id').primaryKey().defaultRandom()
const createdAt = () => isoTimestamp('created_at').notNull().default(sql`now()`)
const updatedAt = () =>
  isoTimestamp('updated_at')
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => new Date().toISOString())
const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() })
const idr = (name: string) => bigint(name, { mode: 'number' })

// ---------- enums ----------
export const userStatus = pgEnum('user_status', ['pending', 'active', 'disabled'])
export const projectStatus = pgEnum('project_status', ['active', 'archived'])
export const positionStatus = pgEnum('position_status', ['open', 'closed', 'draft'])
export const arrangement = pgEnum('work_arrangement', ['WFO', 'Hybrid', 'WFH', 'Any'])
export const screeningResult = pgEnum('screening_result', ['pending', 'pass', 'fail'])
export const questionType = pgEnum('question_type', ['essay', 'multiple_choice', 'coding', 'case_study'])
export const priority = pgEnum('priority', ['low', 'medium', 'high', 'critical'])
export const milestoneStatus = pgEnum('milestone_status', ['upcoming', 'done', 'missed'])
export const riskKind = pgEnum('risk_kind', ['risk', 'issue'])
export const riskStatus = pgEnum('risk_status', ['open', 'mitigating', 'closed'])
export const invoiceStatus = pgEnum('invoice_status', ['draft', 'sent', 'paid'])
export const scheduleKind = pgEnum('schedule_kind', ['receivable', 'payable'])
export const frequency = pgEnum('frequency', ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
export const shareAccess = pgEnum('share_access', ['public', 'password'])
export const shareView = pgEnum('share_view', ['table', 'kanban'])
export const fieldType = pgEnum('field_type', ['text', 'number', 'date', 'select'])
export const broadcastStatus = pgEnum('broadcast_status', ['draft', 'running', 'paused', 'done', 'cancelled'])
export const recipientStatus = pgEnum('recipient_status', ['pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled'])
export const suppressionReason = pgEnum('suppression_reason', ['unsubscribe', 'bounce', 'manual'])

// ---------- auth & access ----------
export const roles = pgTable('roles', {
  id: id(),
  /** Stable key used by the seed and the frontend mapping (admin, hr, pm, hm, mkt, viewer). */
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps(),
})

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
    permission: varchar('permission', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
)

export const users = pgTable(
  'users',
  {
    id: id(),
    name: varchar('name', { length: 200 }).notNull(),
    /** Always stored lower-cased and trimmed. */
    email: varchar('email', { length: 320 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    roleId: uuid('role_id').notNull().references(() => roles.id),
    status: userStatus('status').notNull().default('pending'),
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: isoTimestamp('locked_until'),
    lastLoginAt: isoTimestamp('last_login_at'),
    passwordChangedAt: isoTimestamp('password_changed_at'),
    ...timestamps(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), index('users_status_idx').on(t.status), index('users_role_idx').on(t.roleId)],
)

/** One row per issued refresh token. `familyId` groups a login session so reuse can revoke all of it. */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    remember: boolean('remember').notNull().default(false),
    expiresAt: isoTimestamp('expires_at').notNull(),
    revokedAt: isoTimestamp('revoked_at'),
    replacedBy: uuid('replaced_by'),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 400 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash),
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_family_idx').on(t.familyId),
  ],
)

export const passwordResets = pgTable(
  'password_resets',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: isoTimestamp('expires_at').notNull(),
    usedAt: isoTimestamp('used_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('password_resets_hash_uq').on(t.tokenHash), index('password_resets_user_idx').on(t.userId)],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 80 }).notNull(),
    entity: varchar('entity', { length: 60 }),
    entityId: varchar('entity_id', { length: 80 }),
    ip: varchar('ip', { length: 64 }),
    requestId: varchar('request_id', { length: 80 }),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_actor_idx').on(t.actorId), index('audit_log_action_idx').on(t.action, t.createdAt), index('audit_log_entity_idx').on(t.entity, t.entityId)],
)

// ---------- HR ----------
export const projects = pgTable(
  'projects',
  {
    id: id(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description').notNull().default(''),
    status: projectStatus('status').notNull().default('active'),
    stages: jsonb('stages').$type<Stage[]>().notNull(),
    pmStages: jsonb('pm_stages').$type<Stage[]>().notNull(),
    info: jsonb('info').$type<ProjectInfo>().notNull(),
    pmFeatures: jsonb('pm_features').$type<PmFeatureFlags>().notNull(),
    pmFields: jsonb('pm_fields').$type<Record<string, boolean>>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('projects_status_idx').on(t.status)],
)

export const positions = pgTable(
  'positions',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    department: varchar('department', { length: 120 }).notNull().default(''),
    level: varchar('level', { length: 60 }).notNull().default(''),
    headcount: integer('headcount').notNull().default(1),
    status: positionStatus('status').notNull().default('open'),
    arrangement: arrangement('arrangement').notNull().default('Any'),
    salaryMin: idr('salary_min'),
    salaryMax: idr('salary_max'),
    description: text('description').notNull().default(''),
    requirements: text('requirements').notNull().default(''),
    testFiles: jsonb('test_files').$type<TestFile[]>().notNull().default([]),
    formLinks: jsonb('form_links').$type<FormLink[]>().notNull().default([]),
    ...timestamps(),
  },
  (t) => [index('positions_project_idx').on(t.projectId)],
)

export const testQuestions = pgTable(
  'test_questions',
  {
    id: id(),
    positionId: uuid('position_id').notNull().references(() => positions.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    type: questionType('type').notNull().default('essay'),
    weight: integer('weight').notNull().default(1),
    answerKey: text('answer_key').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('test_questions_position_idx').on(t.positionId)],
)

export const talents = pgTable(
  'talents',
  {
    id: id(),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 320 }).notNull().default(''),
    phone: varchar('phone', { length: 60 }).notNull().default(''),
    source: varchar('source', { length: 120 }).notNull().default(''),
    skills: text('skills').notNull().default(''),
    portfolio: varchar('portfolio', { length: 500 }).notNull().default(''),
    salaryMin: idr('salary_min'),
    salaryMax: idr('salary_max'),
    arrangement: arrangement('arrangement').notNull().default('Any'),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
  },
  (t) => [index('talents_email_idx').on(sql`lower(${t.email})`), index('talents_name_idx').on(sql`lower(${t.name})`)],
)

export const candidates = pgTable(
  'candidates',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    /** Pool entry this candidate came from. Deleting the talent keeps the candidate. */
    talentId: uuid('talent_id').references(() => talents.id, { onDelete: 'set null' }),
    positionId: uuid('position_id').references(() => positions.id, { onDelete: 'set null' }),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 320 }).notNull().default(''),
    phone: varchar('phone', { length: 60 }).notNull().default(''),
    source: varchar('source', { length: 120 }).notNull().default(''),
    screeningScore: integer('screening_score'),
    screeningResult: screeningResult('screening_result').notNull().default('pending'),
    salaryMin: idr('salary_min'),
    salaryMax: idr('salary_max'),
    archived: boolean('archived').notNull().default(false),
    arrangement: arrangement('arrangement').notNull().default('Any'),
    stage: varchar('stage', { length: 80 }).notNull(),
    nextStep: text('next_step').notNull().default(''),
    owner: varchar('owner', { length: 200 }).notNull().default(''),
    appliedAt: date('applied_at', { mode: 'string' }).notNull().default(sql`current_date`),
    /** Interview rounds keyed by stage id, each with its reschedule history. Genuinely nested, so jsonb. */
    rounds: jsonb('rounds').$type<Record<string, Round>>().notNull().default({}),
    rejectReason: text('reject_reason').notNull().default(''),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
  },
  (t) => [
    index('candidates_project_idx').on(t.projectId, t.archived),
    index('candidates_talent_idx').on(t.talentId),
    index('candidates_position_idx').on(t.positionId),
    index('candidates_stage_idx').on(t.projectId, t.stage),
    check('candidates_score_chk', sql`${t.screeningScore} is null or (${t.screeningScore} between 0 and 100)`),
  ],
)

export const shareLinks = pgTable(
  'share_links',
  {
    id: id(),
    /** Random URL token. Not the primary key so it can be rotated. */
    token: varchar('token', { length: 64 }).notNull(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 200 }).notNull().default(''),
    access: shareAccess('access').notNull().default('public'),
    /** argon2id hash, never the plaintext. */
    passwordHash: text('password_hash'),
    view: shareView('view').notNull().default('table'),
    showSalary: boolean('show_salary').notNull().default(false),
    showContact: boolean('show_contact').notNull().default(false),
    positionIds: jsonb('position_ids').$type<string[]>().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    views: integer('views').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('share_links_token_uq').on(t.token), index('share_links_project_idx').on(t.projectId)],
)

// ---------- PM ----------
export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 300 }).notNull(),
    description: text('description').notNull().default(''),
    stage: varchar('stage', { length: 80 }).notNull(),
    assignee: varchar('assignee', { length: 200 }).notNull().default(''),
    priority: priority('priority').notNull().default('medium'),
    startDate: date('start_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),
    estimateH: numeric('estimate_h', { mode: 'number' }),
    milestoneId: uuid('milestone_id').references((): AnyPgColumn => milestones.id, { onDelete: 'set null' }),
    labels: varchar('labels', { length: 300 }).notNull().default(''),
    ...timestamps(),
  },
  (t) => [index('tasks_project_idx').on(t.projectId, t.stage), index('tasks_milestone_idx').on(t.milestoneId)],
)

export const milestones = pgTable(
  'milestones',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 300 }).notNull(),
    date: date('date', { mode: 'string' }),
    status: milestoneStatus('status').notNull().default('upcoming'),
    owner: varchar('owner', { length: 200 }).notNull().default(''),
    notes: text('notes').notNull().default(''),
    ...timestamps(),
  },
  (t) => [index('milestones_project_idx').on(t.projectId)],
)

export const risks = pgTable(
  'risks',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    kind: riskKind('kind').notNull().default('risk'),
    title: varchar('title', { length: 300 }).notNull(),
    probability: integer('probability').notNull().default(3),
    impact: integer('impact').notNull().default(3),
    status: riskStatus('status').notNull().default('open'),
    owner: varchar('owner', { length: 200 }).notNull().default(''),
    mitigation: text('mitigation').notNull().default(''),
    dueDate: date('due_date', { mode: 'string' }),
    ...timestamps(),
  },
  (t) => [
    index('risks_project_idx').on(t.projectId),
    check('risks_prob_chk', sql`${t.probability} between 1 and 5`),
    check('risks_impact_chk', sql`${t.impact} between 1 and 5`),
  ],
)

export const members = pgTable(
  'members',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    role: varchar('role', { length: 200 }).notNull().default(''),
    email: varchar('email', { length: 320 }).notNull().default(''),
    allocation: integer('allocation').notNull().default(100),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    ...timestamps(),
  },
  (t) => [index('members_project_idx').on(t.projectId)],
)

export const budgetItems = pgTable(
  'budget_items',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 200 }).notNull().default(''),
    description: text('description').notNull().default(''),
    planned: idr('planned').notNull().default(0),
    actual: idr('actual').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('budget_items_project_idx').on(t.projectId)],
)

export const statusUpdates = pgTable(
  'status_updates',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull().default(sql`current_date`),
    author: varchar('author', { length: 200 }).notNull().default(''),
    /** Id of a project status (settings.projectStatuses); not an enum because teams define their own. */
    health: varchar('health', { length: 60 }).notNull().default('on_track'),
    summary: text('summary').notNull().default(''),
    highlights: text('highlights').notNull().default(''),
    blockers: text('blockers').notNull().default(''),
    nextSteps: text('next_steps').notNull().default(''),
    ...timestamps(),
  },
  (t) => [index('status_updates_project_idx').on(t.projectId, t.date)],
)

// ---------- Billing ----------
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 40 }).notNull(),
    clientName: varchar('client_name', { length: 200 }).notNull().default(''),
    clientEmail: varchar('client_email', { length: 320 }).notNull().default(''),
    issueDate: date('issue_date', { mode: 'string' }).notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    taxPct: numeric('tax_pct', { mode: 'number' }).notNull().default(11),
    /** 'overdue' is derived (sent + past due), never stored. */
    status: invoiceStatus('status').notNull().default('draft'),
    notes: text('notes').notNull().default(''),
    sentAt: isoTimestamp('sent_at'),
    paidAt: isoTimestamp('paid_at'),
    /** `${scheduleId}:${yyyy-mm-dd}` when a recurring schedule generated this invoice. */
    scheduleKey: varchar('schedule_key', { length: 80 }),
    period: varchar('period', { length: 80 }).notNull().default(''),
    /** ISO 4217 code. Money columns hold the smallest unit (IDR rupiah, USD cents). */
    currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
    /** Which of our bank accounts the client pays into. */
    bankId: uuid('bank_id').references((): AnyPgColumn => bankAccounts.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('invoices_number_uq').on(t.number),
    uniqueIndex('invoices_schedule_key_uq').on(t.scheduleKey),
    index('invoices_project_idx').on(t.projectId),
    index('invoices_status_due_idx').on(t.status, t.dueDate),
  ],
)

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: id(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    qty: numeric('qty', { mode: 'number' }).notNull().default(1),
    unitPrice: idr('unit_price').notNull().default(0),
    /** e.g. "ms:<milestoneId>" so a milestone is not billed twice. */
    ref: varchar('ref', { length: 120 }),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('invoice_items_invoice_idx').on(t.invoiceId)],
)

/** Single company-wide row (id is always 1). */
export const billingProfile = pgTable(
  'billing_profile',
  {
    id: integer('id').primaryKey().default(1),
    company: varchar('company', { length: 200 }).notNull().default(''),
    address: text('address').notNull().default(''),
    email: varchar('email', { length: 320 }).notNull().default(''),
    phone: varchar('phone', { length: 60 }).notNull().default(''),
    taxId: varchar('tax_id', { length: 60 }).notNull().default(''),
    bankName: varchar('bank_name', { length: 120 }).notNull().default(''),
    bankAccount: varchar('bank_account', { length: 60 }).notNull().default(''),
    bankHolder: varchar('bank_holder', { length: 200 }).notNull().default(''),
    paymentNote: text('payment_note').notNull().default(''),
    /** Logo is a file in object storage; only its path is stored here. */
    logoPath: varchar('logo_path', { length: 500 }).notNull().default(''),
    defaultTaxPct: numeric('default_tax_pct', { mode: 'number' }).notNull().default(11),
    defaultTermDays: integer('default_term_days').notNull().default(14),
    footer: text('footer').notNull().default(''),
    signerName: varchar('signer_name', { length: 200 }).notNull().default(''),
    signerTitle: varchar('signer_title', { length: 200 }).notNull().default(''),
    ...timestamps(),
  },
  (t) => [check('billing_profile_singleton', sql`${t.id} = 1`)],
)

export const schedules = pgTable(
  'schedules',
  {
    id: id(),
    kind: scheduleKind('kind').notNull(),
    /** Null for company-wide payables. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    party: varchar('party', { length: 200 }).notNull().default(''),
    title: varchar('title', { length: 300 }).notNull().default(''),
    amount: idr('amount'),
    frequency: frequency('frequency').notNull().default('monthly'),
    day: integer('day').notNull().default(1),
    weekday: integer('weekday'),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    leadDays: integer('lead_days').notNull().default(7),
    termDays: integer('term_days').notNull().default(14),
    pic: varchar('pic', { length: 200 }).notNull().default(''),
    notes: text('notes').notNull().default(''),
    active: boolean('active').notNull().default(true),
    template: jsonb('template').$type<ScheduleTemplate>(),
    autoDraft: boolean('auto_draft').notNull().default(true),
    currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
    /** Vendor bank details for payables: { bank, number, holder, swift? }. */
    payTo: jsonb('pay_to').$type<Record<string, string>>(),
    ...timestamps(),
  },
  (t) => [
    index('schedules_project_idx').on(t.projectId),
    check('schedules_day_chk', sql`${t.day} between 0 and 31`),
  ],
)

/** Progress of one occurrence of a schedule. */
export const scheduleEvents = pgTable(
  'schedule_events',
  {
    scheduleId: uuid('schedule_id').notNull().references(() => schedules.id, { onDelete: 'cascade' }),
    occurrenceDate: date('occurrence_date', { mode: 'string' }).notNull(),
    issuedAt: date('issued_at', { mode: 'string' }),
    invoiceNo: varchar('invoice_no', { length: 40 }).notNull().default(''),
    paidAt: date('paid_at', { mode: 'string' }),
    skipped: boolean('skipped').notNull().default(false),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    /** True when the invoice was deleted on purpose, so it is not auto-drafted again. */
    invoiceDeleted: boolean('invoice_deleted').notNull().default(false),
    paidAmount: idr('paid_amount'),
    withheld: idr('withheld'),
    paidNote: text('paid_note').notNull().default(''),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.scheduleId, t.occurrenceDate] }), index('schedule_events_invoice_idx').on(t.invoiceId)],
)

// ---------- Marketing ----------
/** Small key/value store for settings such as the marketing pipeline stages. */
export const settings = pgTable('settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: updatedAt(),
})

export const leadColumns = pgTable(
  'lead_columns',
  {
    id: id(),
    label: varchar('label', { length: 120 }).notNull(),
    type: fieldType('type').notNull().default('text'),
    options: text('options').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    ...timestamps(),
  },
)

export const leads = pgTable(
  'leads',
  {
    id: id(),
    name: varchar('name', { length: 200 }).notNull().default(''),
    company: varchar('company', { length: 200 }).notNull().default(''),
    title: varchar('title', { length: 200 }).notNull().default(''),
    email: varchar('email', { length: 320 }).notNull().default(''),
    phone: varchar('phone', { length: 60 }).notNull().default(''),
    source: varchar('source', { length: 120 }).notNull().default(''),
    stage: varchar('stage', { length: 80 }).notNull().default('new'),
    value: idr('value'),
    owner: varchar('owner', { length: 200 }).notNull().default(''),
    nextAction: text('next_action').notNull().default(''),
    nextActionDate: date('next_action_date', { mode: 'string' }),
    tags: varchar('tags', { length: 300 }).notNull().default(''),
    notes: text('notes').notNull().default(''),
    lastContactAt: date('last_contact_at', { mode: 'string' }),
    unsubscribed: boolean('unsubscribed').notNull().default(false),
    /** Values of user-defined fields keyed by lead_columns.id. */
    custom: jsonb('custom').$type<Record<string, string>>().notNull().default({}),
    ...timestamps(),
  },
  (t) => [
    index('leads_stage_idx').on(t.stage),
    index('leads_email_idx').on(sql`lower(${t.email})`),
    index('leads_company_idx').on(sql`lower(${t.company})`),
  ],
)

export const emailTemplates = pgTable('email_templates', {
  id: id(),
  name: varchar('name', { length: 200 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull().default(''),
  body: text('body').notNull().default(''),
  ...timestamps(),
})

export const broadcasts = pgTable(
  'broadcasts',
  {
    id: id(),
    name: varchar('name', { length: 200 }).notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    /** Raw template. Merge fields are filled per recipient at send time. */
    body: text('body').notNull(),
    footer: boolean('footer').notNull().default(true),
    audience: text('audience').notNull().default(''),
    status: broadcastStatus('status').notNull().default('draft'),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
    /** Optional per-broadcast limits, applied on top of the server-wide caps. Null = use the server setting. */
    dailyCap: integer('daily_cap'),
    windowStart: integer('window_start'),
    windowEnd: integer('window_end'),
    /** [{ path, name, size, type }] files in object storage, attached to every message. */
    attachments: jsonb('attachments').$type<Array<{ path: string; name: string; size: number; type: string }>>().notNull().default([]),
    pausedReason: text('paused_reason').notNull().default(''),
    /** A paused broadcast continues by itself from this moment. */
    resumeAt: isoTimestamp('resume_at'),
    startedAt: isoTimestamp('started_at'),
    finishedAt: isoTimestamp('finished_at'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('broadcasts_status_idx').on(t.status)],
)

export const broadcastRecipients = pgTable(
  'broadcast_recipients',
  {
    id: id(),
    broadcastId: uuid('broadcast_id').notNull().references(() => broadcasts.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 200 }).notNull().default(''),
    /** Merge field snapshot taken when the broadcast was started. */
    merge: jsonb('merge').$type<Record<string, string>>().notNull().default({}),
    status: recipientStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: isoTimestamp('next_attempt_at').notNull().default(sql`now()`),
    claimedAt: isoTimestamp('claimed_at'),
    sentAt: isoTimestamp('sent_at'),
    error: text('error').notNull().default(''),
    providerMessageId: varchar('provider_message_id', { length: 300 }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('broadcast_recipients_uq').on(t.broadcastId, t.email),
    // The hot path of the worker: pending rows that are due.
    index('broadcast_recipients_due_idx').on(t.status, t.nextAttemptAt),
    index('broadcast_recipients_broadcast_idx').on(t.broadcastId, t.status),
    index('broadcast_recipients_sent_idx').on(t.sentAt),
  ],
)

export const emailSuppressions = pgTable(
  'email_suppressions',
  {
    email: varchar('email', { length: 320 }).primaryKey(),
    reason: suppressionReason('reason').notNull(),
    broadcastId: uuid('broadcast_id').references(() => broadcasts.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
)

/** One-off emails sent to a single lead from the lead page (broadcasts are logged in broadcast_recipients). */
export const sentEmails = pgTable(
  'sent_emails',
  {
    id: id(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    to: varchar('to_email', { length: 320 }).notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    body: text('body').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    error: text('error').notNull().default(''),
    sentBy: uuid('sent_by').references(() => users.id, { onDelete: 'set null' }),
    providerMessageId: varchar('provider_message_id', { length: 300 }),
    attachments: jsonb('attachments').$type<string[]>().notNull().default([]),
    sentAt: isoTimestamp('sent_at').notNull().default(sql`now()`),
    createdAt: createdAt(),
  },
  (t) => [index('sent_emails_lead_idx').on(t.leadId, t.sentAt)],
)

// ---------- Added for client feedback round 2 (currencies, banks, payments, files, meetings) ----------
export const fileOwner = pgEnum('file_owner', ['project', 'invoice', 'schedule', 'schedule_event'])
export const meetingStatus = pgEnum('meeting_status', ['planned', 'held', 'cancelled'])

/** Our own bank accounts. An invoice prints the one chosen on it. */
export const bankAccounts = pgTable('bank_accounts', {
  id: id(),
  bank: varchar('bank', { length: 120 }).notNull(),
  number: varchar('number', { length: 60 }).notNull(),
  holder: varchar('holder', { length: 200 }).notNull().default(''),
  currency: varchar('currency', { length: 3 }).notNull().default('IDR'),
  swift: varchar('swift', { length: 20 }).notNull().default(''),
  branch: varchar('branch', { length: 200 }).notNull().default(''),
  ...timestamps(),
})

/** Money received for an invoice. May be partial, late, or short because the client withheld tax (PPh). */
export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: id(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    /** What landed in the bank. */
    amount: idr('amount').notNull().default(0),
    /** Tax withheld by the client and paid to the tax office. Counts toward the invoice. */
    withheld: idr('withheld').notNull().default(0),
    note: text('note').notNull().default(''),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('invoice_payments_invoice_idx').on(t.invoiceId), check('invoice_payments_nonneg', sql`${t.amount} >= 0 and ${t.withheld} >= 0`)],
)

/** Links to documents (SharePoint or any URL). Only the link is stored, never the file. */
export const fileRefs = pgTable(
  'file_refs',
  {
    id: id(),
    ownerType: fileOwner('owner_type').notNull(),
    /** Id of the project / invoice / schedule, or "<scheduleId>:<yyyy-mm-dd>" for a schedule event. */
    ownerId: varchar('owner_id', { length: 80 }).notNull(),
    name: varchar('name', { length: 300 }).notNull(),
    url: text('url').notNull(),
    category: varchar('category', { length: 40 }).notNull().default('other'),
    size: bigint('size', { mode: 'number' }),
    source: varchar('source', { length: 20 }).notNull().default('link'),
    addedBy: uuid('added_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('file_refs_owner_idx').on(t.ownerType, t.ownerId)],
)

export const projectMeetings = pgTable(
  'project_meetings',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 300 }).notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    startTime: varchar('start_time', { length: 5 }).notNull().default(''),
    endTime: varchar('end_time', { length: 5 }).notNull().default(''),
    attendees: jsonb('attendees').$type<string[]>().notNull().default([]),
    summary: text('summary').notNull().default(''),
    decisions: text('decisions').notNull().default(''),
    location: varchar('location', { length: 300 }).notNull().default(''),
    joinUrl: text('join_url').notNull().default(''),
    /** Outlook calendar event id when linked. The event itself stays in Outlook. */
    outlookId: varchar('outlook_id', { length: 300 }).notNull().default(''),
    status: meetingStatus('status').notNull().default('planned'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('project_meetings_project_idx').on(t.projectId, t.date)],
)

/** Follow-up state of an Outlook meeting (done / skipped), per user. */
export const meetingFollowups = pgTable(
  'meeting_followups',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    outlookId: varchar('outlook_id', { length: 300 }).notNull(),
    status: varchar('status', { length: 10 }).notNull(),
    sentCount: integer('sent_count').notNull().default(0),
    at: isoTimestamp('at').notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.userId, t.outlookId] })],
)
