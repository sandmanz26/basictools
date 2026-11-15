import { STAGE_COLORS, today } from '@/lib/constants'
import { curOf, fmtCompact, fmtMoney, roundCur, sumBy, type Totals } from '@/lib/money'
import type { Invoice, StatusDef, InvoiceStatus, Phase, PmFeature, PmField, Priority, Project, ProjectInfo, Stage } from '@/types'

export const DEFAULT_STATUSES = (): StatusDef[] => [
  { id: 'on_track', label: 'On track', color: 'emerald', attention: false },
  { id: 'at_risk', label: 'At risk', color: 'amber', attention: true },
  { id: 'off_track', label: 'Off track', color: 'red', attention: true },
  { id: 'on_hold', label: 'On hold', color: 'slate', attention: false },
  { id: 'done', label: 'Completed', color: 'sky', attention: false },
]

/** Badge look for a status id. Unknown ids (e.g. a status deleted elsewhere) still render, in grey. */
export function statusStyle(list: StatusDef[], id: string): { label: string; tone: string; dot: string } {
  const st = list.find((x) => x.id === id)
  const c = STAGE_COLORS[st?.color ?? 'slate'] ?? STAGE_COLORS.slate
  return { label: st?.label ?? (id ? id.replace(/_/g, ' ') : '—'), tone: c.tone.replace('bg-green-600 text-white', 'bg-green-100 text-green-800'), dot: c.dot }
}

export const PHASES: { value: Phase; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'ongoing', label: 'On going' },
  { value: 'completed', label: 'Completed' },
]

/** Older data used five PMBOK phases; fold them into the three the team actually uses. */
export const migratePhase = (p: string): Phase =>
  p === 'ongoing' || p === 'completed' || p === 'planning' ? p : p === 'execution' || p === 'monitoring' ? 'ongoing' : p === 'closing' ? 'completed' : 'planning'

export const PRIORITY: Record<Priority, { label: string; tone: string }> = {
  low: { label: 'Low', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  medium: { label: 'Medium', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  high: { label: 'High', tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' },
  critical: { label: 'Critical', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
}

export const DEFAULT_PM_STAGES = (): Stage[] => [
  { id: 'backlog', label: 'Backlog', color: 'slate', type: 'active', interview: false, nextStep: '' },
  { id: 'todo', label: 'To Do', color: 'sky', type: 'active', interview: false, nextStep: '' },
  { id: 'doing', label: 'In Progress', color: 'amber', type: 'active', interview: false, nextStep: '' },
  { id: 'review', label: 'In Review', color: 'violet', type: 'active', interview: false, nextStep: '' },
  { id: 'done', label: 'Done', color: 'green', type: 'won', interview: false, nextStep: '' },
]

export const DEFAULT_INFO = (): ProjectInfo => ({
  health: 'on_track', phase: 'planning', methodology: 'Agile', priority: 'medium', sponsor: '', manager: '', client: '',
  startDate: '', endDate: '', budget: null, objectives: '', scopeIn: '', scopeOut: '', successCriteria: '', assumptions: '', stakeholders: [],
})

export const riskScore = (p: number, i: number) => p * i
export const riskTone = (score: number) =>
  score >= 15 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
  : score >= 8 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
  : score >= 4 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'

/** Compact IDR: 1.8 M (billion), 450 jt. Other currencies show the full amount (see lib/money.ts). */
export const money = (n: number | null | undefined) => fmtCompact(n, 'IDR')

export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
export const todayStr = () => today()

export const PM_FEATURES: { id: PmFeature; label: string; hint: string; to: string }[] = [
  { id: 'board', label: 'Work board', hint: 'Kanban tasks with its own workflow stages', to: '/pm/board' },
  { id: 'timeline', label: 'Timeline', hint: 'Milestones and task schedule', to: '/pm/timeline' },
  { id: 'risks', label: 'Risks & issues', hint: 'Risk register with probability and impact', to: '/pm/risks' },
  { id: 'team', label: 'Team', hint: 'Members and allocation', to: '/pm/team' },
  { id: 'budget', label: 'Budget', hint: 'Planned vs actual spend by category', to: '/pm/budget' },
  { id: 'updates', label: 'Status updates', hint: 'Running log of project status', to: '/pm/updates' },
]
export const NO_FEATURES = (): Record<PmFeature, boolean> => ({ board: false, timeline: false, risks: false, team: false, budget: false, updates: false })
export const ALL_FEATURES = (): Record<PmFeature, boolean> => ({ board: true, timeline: true, risks: true, team: true, budget: true, updates: true })

// ---------- project info fields ----------

export const PM_FIELDS: { id: PmField; label: string; group: string }[] = [
  { id: 'health', label: 'Status (health)', group: 'Status & schedule' },
  { id: 'startDate', label: 'Start date', group: 'Status & schedule' },
  { id: 'endDate', label: 'Target end date', group: 'Status & schedule' },
  { id: 'phase', label: 'Phase', group: 'Status & schedule' },
  { id: 'priority', label: 'Priority', group: 'Status & schedule' },
  { id: 'manager', label: 'Project manager', group: 'People & money' },
  { id: 'sponsor', label: 'Sponsor', group: 'People & money' },
  { id: 'client', label: 'Client / business owner', group: 'People & money' },
  { id: 'methodology', label: 'Methodology', group: 'People & money' },
  { id: 'budget', label: 'Budget', group: 'People & money' },
  { id: 'objectives', label: 'Objectives', group: 'Planning notes' },
  { id: 'successCriteria', label: 'Success criteria', group: 'Planning notes' },
  { id: 'scope', label: 'Scope (in / out)', group: 'Planning notes' },
  { id: 'assumptions', label: 'Assumptions & constraints', group: 'Planning notes' },
  { id: 'stakeholders', label: 'Stakeholders', group: 'Planning notes' },
]
const fieldSet = (on: PmField[]): Record<PmField, boolean> =>
  Object.fromEntries(PM_FIELDS.map((f) => [f.id, on.includes(f.id)])) as Record<PmField, boolean>
export const FIELDS_MINIMAL = () => fieldSet(['health', 'startDate'])
export const FIELDS_STANDARD = () => fieldSet(['health', 'phase', 'startDate', 'endDate', 'manager', 'client', 'budget'])
export const FIELDS_FULL = () => fieldSet(PM_FIELDS.map((f) => f.id))
export const FIELD_PRESETS: { id: string; label: string; hint: string; make: () => Record<PmField, boolean> }[] = [
  { id: 'minimal', label: 'Minimal', hint: 'Status and start date only', make: FIELDS_MINIMAL },
  { id: 'standard', label: 'Standard', hint: 'Status, dates, phase, PM, client, budget', make: FIELDS_STANDARD },
  { id: 'full', label: 'Full', hint: 'Everything, including planning notes', make: FIELDS_FULL },
]
/** Projects created before this setting existed show every field. */
export const fieldsOf = (p: Pick<Project, 'pmFields'>) => p.pmFields ?? FIELDS_FULL()

// ---------- invoices ----------

export const invoiceSubtotal = (i: Invoice) => roundCur(i.items.reduce((a, x) => a + x.qty * x.unitPrice, 0), curOf(i))
export const invoiceTax = (i: Invoice) => roundCur((invoiceSubtotal(i) * (i.taxPct || 0)) / 100, curOf(i))
export const invoiceTotal = (i: Invoice) => roundCur(invoiceSubtotal(i) + invoiceTax(i), curOf(i))

/** Money that actually arrived in the bank. */
export const receivedTotal = (i: Invoice) => roundCur((i.payments ?? []).reduce((a, p) => a + p.amount, 0), curOf(i))
/** Tax the client withheld (PPh) on our behalf. It reduces what they owe, but is not cash for us. */
export const withheldTotal = (i: Invoice) => roundCur((i.payments ?? []).reduce((a, p) => a + p.withheld, 0), curOf(i))
/** What is still owed after payments and withholding. */
export const balanceDue = (i: Invoice) =>
  // Invoices marked paid before payments were tracked have no payment rows: they are simply settled.
  !i.payments?.length && i.status === 'paid' ? 0 : Math.max(0, roundCur(invoiceTotal(i) - receivedTotal(i) - withheldTotal(i), curOf(i)))
/** Amount counted as settled: all of it once the invoice is marked paid, otherwise what was received plus withheld. */
export const settledAmount = (i: Invoice) => (i.status === 'paid' ? invoiceTotal(i) : roundCur(receivedTotal(i) + withheldTotal(i), curOf(i)))
export const isPartlyPaid = (i: Invoice) => (i.payments?.length ?? 0) > 0 && balanceDue(i) > 0
/** Last day money arrived, '' if none. */
export const lastPaymentDate = (i: Invoice) => (i.payments ?? []).reduce((d, p) => (p.date > d ? p.date : d), '')

/** A sent invoice past its due date counts as overdue. */
export const effectiveStatus = (i: Invoice, today = todayStr()): InvoiceStatus =>
  i.status === 'sent' && i.dueDate && i.dueDate < today ? 'overdue' : i.status

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  sent: { label: 'Sent', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  paid: { label: 'Paid', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  overdue: { label: 'Overdue', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' },
}

/** Money still expected from the client (sent and overdue invoices), per currency. */
export const outstanding = (list: Invoice[]): Totals => sumBy(list.filter((i) => i.status === 'sent'), curOf, balanceDue)
/** Total of the invoices that have left the building (not drafts), per currency. */
export const billedTotals = (list: Invoice[]): Totals => sumBy(list.filter((i) => i.status !== 'draft'), curOf, invoiceTotal)
/** Total settled (money received plus tax withheld) across the list, per currency. */
export const paidTotals = (list: Invoice[]): Totals => sumBy(list, curOf, settledAmount)

const longDate = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—')

export function invoiceEmail(i: Invoice, projectName: string, sender: string): { subject: string; body: string } {
  const cur = curOf(i)
  const fullIdr = (n: number) => fmtMoney(n, cur)
  const lines = i.items.map((x) => `  - ${x.description} (${x.qty} x ${fullIdr(x.unitPrice)}) = ${fullIdr(x.qty * x.unitPrice)}`).join('\n')
  const tax = i.taxPct ? `\nTax (${i.taxPct}%): ${fullIdr(invoiceTax(i))}` : ''
  return {
    subject: `Invoice ${i.number} - ${projectName}`,
    body: `Dear ${i.clientName || 'Sir/Madam'},\n\nPlease find the invoice for ${projectName} below.\n\nInvoice: ${i.number}\nIssued: ${longDate(i.issueDate)}\nDue: ${longDate(i.dueDate)}\n\n${lines}\n\nSubtotal: ${fullIdr(invoiceSubtotal(i))}${tax}\nTotal due: ${fullIdr(balanceDue(i) || invoiceTotal(i))}\n${i.notes ? `\n${i.notes}\n` : ''}\nThank you,\n${sender}`,
  }
}

/** Next free number like INV-2026-004, counting every invoice so numbers never repeat. */
export function nextInvoiceNumber(invoices: Invoice[], issueDate = todayStr()) {
  const max = invoices.reduce((m, i) => Math.max(m, Number(i.number.match(/(\d+)$/)?.[1] ?? 0)), 0)
  return `INV-${issueDate.slice(0, 4)}-${String(max + 1).padStart(3, '0')}`
}

export const statusOptions = (list: StatusDef[]) => list.map((x) => ({ value: x.id, label: x.label }))
