import type { Health, Phase, Priority, ProjectInfo, Stage } from '@/types'

export const HEALTH: Record<Health, { label: string; tone: string; dot: string }> = {
  on_track: { label: 'On track', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', dot: 'bg-emerald-500' },
  at_risk: { label: 'At risk', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', dot: 'bg-amber-500' },
  off_track: { label: 'Off track', tone: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300', dot: 'bg-red-500' },
  on_hold: { label: 'On hold', tone: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', dot: 'bg-slate-400' },
  done: { label: 'Completed', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300', dot: 'bg-sky-500' },
}

export const PHASES: { value: Phase; label: string }[] = [
  { value: 'initiation', label: 'Initiation' },
  { value: 'planning', label: 'Planning' },
  { value: 'execution', label: 'Execution' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'closing', label: 'Closing' },
]

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

/** Compact IDR: 1.8 M (billion), 450 jt. */
export const money = (n: number | null | undefined) => {
  if (n == null) return '—'
  const a = Math.abs(n)
  if (a >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`
  if (a >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}

export const daysBetween = (a: string, b: string) => Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)
export const todayStr = () => new Date().toISOString().slice(0, 10)
