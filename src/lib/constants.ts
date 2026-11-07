import type { Candidate, Permission, Round, RoundResult, Stage, WorkArrangement } from '@/types'

export const STAGE_COLORS: Record<string, { label: string; tone: string; dot: string }> = {
  slate: { label: 'Gray', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', dot: 'bg-slate-400' },
  violet: { label: 'Violet', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300', dot: 'bg-violet-500' },
  sky: { label: 'Sky', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', dot: 'bg-sky-500' },
  indigo: { label: 'Indigo', tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300', dot: 'bg-indigo-500' },
  teal: { label: 'Teal', tone: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300', dot: 'bg-teal-500' },
  amber: { label: 'Amber', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', dot: 'bg-amber-500' },
  orange: { label: 'Orange', tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300', dot: 'bg-orange-500' },
  pink: { label: 'Pink', tone: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300', dot: 'bg-pink-500' },
  emerald: { label: 'Emerald', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-500' },
  green: { label: 'Green', tone: 'bg-green-600 text-white', dot: 'bg-green-600' },
  red: { label: 'Red', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', dot: 'bg-red-500' },
}

export const stageTone = (s?: Stage) => STAGE_COLORS[s?.color ?? 'slate']?.tone ?? STAGE_COLORS.slate.tone
export const stageDot = (s?: Stage) => STAGE_COLORS[s?.color ?? 'slate']?.dot ?? STAGE_COLORS.slate.dot

export const DEFAULT_STAGES = (): Stage[] => [
  { id: 'applied', label: 'Applied', color: 'slate', type: 'active', interview: false, nextStep: 'Review CV & send technical screening' },
  { id: 'screening', label: 'Tech Screening', color: 'violet', type: 'active', interview: false, nextStep: 'Review test result' },
  { id: 'hr', label: 'HR Interview', color: 'sky', type: 'active', interview: true, nextStep: 'Schedule HR interview' },
  { id: 'tech', label: 'Technical Interview', color: 'indigo', type: 'active', interview: true, nextStep: 'Schedule technical interview' },
  { id: 'user', label: 'User Interview', color: 'amber', type: 'active', interview: true, nextStep: 'Schedule user interview' },
  { id: 'offer', label: 'Offering', color: 'emerald', type: 'active', interview: false, nextStep: 'Prepare & send offer letter' },
  { id: 'hired', label: 'Hired', color: 'green', type: 'won', interview: false, nextStep: 'Onboarding' },
  { id: 'rejected', label: 'Rejected', color: 'red', type: 'lost', interview: false, nextStep: 'Send rejection email' },
]

export const emptyRound = (): Round => ({ date: '', time: '', interviewer: '', result: 'pending', notes: '' })
export const getRound = (c: Candidate, stageId: string): Round => c.rounds[stageId] ?? emptyRound()

/** Where a candidate goes on "pass" (next stage in order) and "fail" (first lost stage). */
export function nextStageId(stages: Stage[], current: string) {
  const i = stages.findIndex((s) => s.id === current)
  const n = stages.slice(i + 1).find((s) => s.type !== 'lost')
  return n?.id ?? current
}
export const lostStageId = (stages: Stage[]) => stages.find((s) => s.type === 'lost')?.id

export const salaryText = (min: number | null, max: number | null) => {
  const f = (n: number) => (n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })
  if (min == null && max == null) return ''
  if (min != null && max != null && min !== max) return `${f(min)} – ${f(max)} jt`
  return `${f((min ?? max)!)} jt`
}

export const RESULT_META: Record<RoundResult, { label: string; tone: string }> = {
  pending: { label: 'Pending', tone: 'bg-muted text-muted-foreground' },
  pass: { label: 'Pass', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  fail: { label: 'Fail', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
  no_show: { label: 'No show', tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  rescheduled: { label: 'Rescheduled', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
}

export const RESCHEDULE_REASONS = ['Candidate could not attend', 'Candidate asked to move', 'Interviewer unavailable', 'Other']

/** How many times this interview was moved. */
export const reschedules = (c: Candidate, stageId: string) => c.rounds[stageId]?.history?.length ?? 0

export const ARRANGEMENTS: WorkArrangement[] = ['WFO', 'Hybrid', 'WFH', 'Any']
export const SOURCES = ['LinkedIn', 'JobStreet', 'Glints', 'Referral', 'Website', 'Kalibrr', 'Headhunter']
export const LEVELS = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager']

export const PERMISSIONS: { id: Permission; label: string; hint: string }[] = [
  { id: 'candidates.edit', label: 'Edit candidates', hint: 'Edit cells, move cards, add candidates' },
  { id: 'candidates.delete', label: 'Delete candidates', hint: 'Remove candidates from the pipeline' },
  { id: 'salary.view', label: 'See salary data', hint: 'Expected salary and salary bands' },
  { id: 'positions.edit', label: 'Edit job descriptions', hint: 'Job description, requirements, status' },
  { id: 'tests.edit', label: 'Edit test questions', hint: 'Technical screening question bank' },
  { id: 'projects.manage', label: 'Manage projects', hint: 'Create, rename, archive projects' },
  { id: 'share.manage', label: 'Manage share links', hint: 'Create public / password links' },
  { id: 'roles.manage', label: 'Manage roles', hint: 'Edit roles and permissions' },
  { id: 'module.hr', label: 'Open HR module', hint: 'Hiring pipeline, talent pool, positions' },
  { id: 'module.pm', label: 'Open PM module', hint: 'Project dashboard, board, risks, budget' },
  { id: 'pm.edit', label: 'Edit project management data', hint: 'Tasks, milestones, risks, team, budget, updates' },
  { id: 'pm.invoice', label: 'Manage & send invoices', hint: 'Create invoices and email them to clients' },
  { id: 'module.mkt', label: 'Open Marketing module', hint: 'Lead pipeline, email outreach' },
  { id: 'mkt.edit', label: 'Edit leads & templates', hint: 'Add, move and edit leads and email templates' },
  { id: 'mkt.send', label: 'Send marketing email', hint: 'Send email through the connected Microsoft account' },
]

export const idr = (n: number | null | undefined) =>
  n == null ? '' : new Intl.NumberFormat('id-ID').format(n)

export const fmtDate = (d: string) => {
  if (!d) return ''
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export const today = () => new Date().toISOString().slice(0, 10)

export const DEFAULT_MKT_STAGES = (): Stage[] => [
  { id: 'new', label: 'New lead', color: 'slate', type: 'active', interview: false, nextStep: '' },
  { id: 'contacted', label: 'Contacted', color: 'sky', type: 'active', interview: false, nextStep: '' },
  { id: 'qualified', label: 'Qualified', color: 'violet', type: 'active', interview: false, nextStep: '' },
  { id: 'proposal', label: 'Proposal sent', color: 'amber', type: 'active', interview: false, nextStep: '' },
  { id: 'negotiation', label: 'Negotiation', color: 'orange', type: 'active', interview: false, nextStep: '' },
  { id: 'won', label: 'Won', color: 'green', type: 'won', interview: false, nextStep: '' },
  { id: 'lost', label: 'Lost', color: 'red', type: 'lost', interview: false, nextStep: '' },
]
export const LEAD_SOURCES = ['Website', 'LinkedIn', 'Referral', 'Event', 'Cold outreach', 'Webinar', 'Instagram', 'Partner']

/** Built-in lead columns. Custom fields are added as `cf:<id>`. */
export const LEAD_BUILTIN_COLUMNS: { key: string; label: string }[] = [
  { key: 'company', label: 'Company' }, { key: 'name', label: 'Contact' }, { key: 'title', label: 'Job title' },
  { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'stage', label: 'Stage' },
  { key: 'value', label: 'Value (Rp)' }, { key: 'source', label: 'Source' }, { key: 'owner', label: 'Owner' },
  { key: 'tags', label: 'Tags' }, { key: 'nextAction', label: 'Next action' }, { key: 'nextActionDate', label: 'Due' },
  { key: 'lastContactAt', label: 'Last contact' }, { key: 'createdAt', label: 'Created' }, { key: 'notes', label: 'Notes' },
]
export const DEFAULT_LEAD_COLUMNS = ['company', 'name', 'email', 'stage', 'value', 'source', 'nextAction', 'nextActionDate']
