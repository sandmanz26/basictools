import type { PmFeatureFlags, ProjectInfo, Stage, StatusDef } from './types.js'

export const DEFAULT_HR_STAGES = (): Stage[] => [
  { id: 'applied', label: 'Applied', color: 'slate', type: 'active', interview: false, nextStep: 'Review CV & send technical screening' },
  { id: 'screening', label: 'Tech Screening', color: 'violet', type: 'active', interview: false, nextStep: 'Review test result' },
  { id: 'hr', label: 'HR Interview', color: 'sky', type: 'active', interview: true, nextStep: 'Schedule HR interview' },
  { id: 'tech', label: 'Technical Interview', color: 'indigo', type: 'active', interview: true, nextStep: 'Schedule technical interview' },
  { id: 'user', label: 'User Interview', color: 'amber', type: 'active', interview: true, nextStep: 'Schedule user interview' },
  { id: 'offer', label: 'Offering', color: 'emerald', type: 'active', interview: false, nextStep: 'Prepare & send offer letter' },
  { id: 'hired', label: 'Hired', color: 'green', type: 'won', interview: false, nextStep: 'Onboarding' },
  { id: 'rejected', label: 'Rejected', color: 'red', type: 'lost', interview: false, nextStep: 'Send rejection email' },
]

export const DEFAULT_PM_STAGES = (): Stage[] => [
  { id: 'backlog', label: 'Backlog', color: 'slate', type: 'active', interview: false, nextStep: '' },
  { id: 'todo', label: 'To Do', color: 'sky', type: 'active', interview: false, nextStep: '' },
  { id: 'doing', label: 'In Progress', color: 'amber', type: 'active', interview: false, nextStep: '' },
  { id: 'review', label: 'In Review', color: 'violet', type: 'active', interview: false, nextStep: '' },
  { id: 'done', label: 'Done', color: 'green', type: 'won', interview: false, nextStep: '' },
]

export const DEFAULT_MKT_STAGES = (): Stage[] => [
  { id: 'new', label: 'New lead', color: 'slate', type: 'active', interview: false, nextStep: '' },
  { id: 'contacted', label: 'Contacted', color: 'sky', type: 'active', interview: false, nextStep: '' },
  { id: 'qualified', label: 'Qualified', color: 'violet', type: 'active', interview: false, nextStep: '' },
  { id: 'proposal', label: 'Proposal sent', color: 'amber', type: 'active', interview: false, nextStep: '' },
  { id: 'negotiation', label: 'Negotiation', color: 'orange', type: 'active', interview: false, nextStep: '' },
  { id: 'won', label: 'Won', color: 'green', type: 'won', interview: false, nextStep: '' },
  { id: 'lost', label: 'Lost', color: 'red', type: 'lost', interview: false, nextStep: '' },
]

export const DEFAULT_INFO = (): ProjectInfo => ({
  health: 'on_track', phase: 'planning', methodology: 'Agile', priority: 'medium', sponsor: '', manager: '', client: '',
  startDate: '', endDate: '', budget: null, objectives: '', scopeIn: '', scopeOut: '', successCriteria: '', assumptions: '', stakeholders: [],
})

export const DEFAULT_PM_FEATURES = (): PmFeatureFlags => ({
  board: false, timeline: false, risks: false, team: false, budget: false, updates: false,
})

export const DEFAULT_STATUSES = (): StatusDef[] => [
  { id: 'on_track', label: 'On track', color: 'emerald', attention: false },
  { id: 'at_risk', label: 'At risk', color: 'amber', attention: true },
  { id: 'off_track', label: 'Off track', color: 'red', attention: true },
  { id: 'on_hold', label: 'On hold', color: 'slate', attention: false },
  { id: 'done', label: 'Completed', color: 'sky', attention: false },
]
