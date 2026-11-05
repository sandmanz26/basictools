import type {
  BudgetItem,
  Candidate,
  Member,
  Milestone,
  Permission,
  Position,
  Project,
  Risk,
  Role,
  Round,
  StatusUpdate,
  Task,
  StageId,
  Talent,
  User,
  WorkArrangement,
} from '@/types'
import { DEFAULT_STAGES, PERMISSIONS } from '@/lib/constants'
import { DEFAULT_INFO, DEFAULT_PM_STAGES } from '@/lib/pm'

const allPerms = (v: boolean): Record<Permission, boolean> =>
  Object.fromEntries(PERMISSIONS.map((p) => [p.id, v])) as Record<Permission, boolean>

export const ROLES: Role[] = [
  { id: 'r-admin', name: 'Admin', description: 'Full access', permissions: allPerms(true) },
  {
    id: 'r-hr',
    name: 'HR Recruiter',
    description: 'Runs the pipeline day to day',
    permissions: { ...allPerms(true), 'roles.manage': false, 'pm.edit': false },
  },
  {
    id: 'r-pm',
    name: 'Project Manager',
    description: 'Runs delivery; sees hiring read-only',
    permissions: {
      ...allPerms(false), 'module.hr': true, 'module.pm': true, 'pm.edit': true, 'projects.manage': true, 'positions.edit': true,
    },
  },
  {
    id: 'r-hm',
    name: 'Hiring Manager',
    description: 'Owns job descriptions and tests, views candidates',
    permissions: { ...allPerms(false), 'positions.edit': true, 'tests.edit': true, 'salary.view': true, 'candidates.edit': true, 'module.hr': true },
  },
  {
    id: 'r-viewer',
    name: 'Viewer',
    description: 'Read only, salary hidden',
    permissions: { ...allPerms(false), 'module.hr': true, 'module.pm': true },
  },
]

export const USERS: User[] = [
  { id: 'u1', name: 'Chandra', email: 'chandra@company.id', roleId: 'r-admin' },
  { id: 'u2', name: 'Sari (HR)', email: 'sari@company.id', roleId: 'r-hr' },
  { id: 'u3', name: 'Budi (Eng Manager)', email: 'budi@company.id', roleId: 'r-hm' },
  { id: 'u4', name: 'Dewi (Guest)', email: 'dewi@company.id', roleId: 'r-viewer' },
  { id: 'u5', name: 'Rina (PM)', email: 'rina@company.id', roleId: 'r-pm' },
]

export const PROJECTS: Project[] = [
  { id: 'p1', name: 'Engineering Q4 2026', description: 'Product engineering hiring for the Q4 roadmap', status: 'active', createdAt: '2026-09-15', stages: DEFAULT_STAGES(), pmStages: DEFAULT_PM_STAGES(),
    info: {
      ...DEFAULT_INFO(), health: 'at_risk', phase: 'execution', methodology: 'Agile', priority: 'high', sponsor: 'Rina (CTO)', manager: 'Rina (PM)',
      client: 'Internal – Product', startDate: '2026-10-01', endDate: '2027-02-26', budget: 1_800_000_000,
      objectives: '- Ship Customer Portal v2 to all enterprise customers\n- Cut support tickets about self-service by 30%\n- Build the core engineering team for 2027',
      scopeIn: '- Web portal (React)\n- Public API v2\n- SSO and role-based access\n- QA automation', scopeOut: '- Native mobile apps\n- Legacy portal migration tooling',
      successCriteria: '- 95% of enterprise customers onboarded by end Feb\n- p95 page load under 2s\n- Zero critical bugs at launch',
      assumptions: '- Design system v3 is ready by end Nov\n- Hiring for 5 engineers closes by mid Dec',
      stakeholders: [
        { id: 'sh1', name: 'Rina', role: 'CTO / Sponsor', influence: 'high', contact: 'rina@company.id' },
        { id: 'sh2', name: 'Anton', role: 'Head of Customer Success', influence: 'medium', contact: 'anton@company.id' },
        { id: 'sh3', name: 'Mira', role: 'Finance Business Partner', influence: 'medium', contact: 'mira@company.id' },
      ],
    } },
  { id: 'p2', name: 'Design & Product 2026', description: 'Design team expansion', status: 'active', createdAt: '2026-10-01', stages: DEFAULT_STAGES(), pmStages: DEFAULT_PM_STAGES(),
    info: {
      ...DEFAULT_INFO(), health: 'on_track', phase: 'planning', methodology: 'Hybrid', priority: 'medium', sponsor: 'Nina (Design Lead)', manager: 'Rina (PM)',
      client: 'Internal – Design', startDate: '2026-10-15', endDate: '2027-03-31', budget: 650_000_000,
      objectives: '- Establish a product design and product management function', scopeIn: '- Hiring\n- Design ops setup\n- Research toolkit', scopeOut: '- Brand refresh',
      successCriteria: '- Both roles filled by end Jan', assumptions: '', stakeholders: [{ id: 'sh4', name: 'Nina', role: 'Design Lead', influence: 'high', contact: 'nina@company.id' }],
    } },
]

export const POSITIONS: Position[] = [
  {
    id: 'pos1', projectId: 'p1', title: 'Frontend Engineer', department: 'Engineering', level: 'Mid', headcount: 2, status: 'open',
    arrangement: 'Hybrid', salaryMin: 12_000_000, salaryMax: 20_000_000,
    description: 'Build and maintain our customer-facing React applications. Work closely with design and backend to ship features end to end.',
    requirements: '- 2+ years with React & TypeScript\n- Experience with design systems\n- Comfortable writing tests\n- Good communication in English',
    questions: [
      { id: 'q1', text: 'Explain the difference between useMemo and useCallback and when you would avoid both.', type: 'essay', weight: 20, answerKey: 'Memoization of values vs functions; avoid when cost of memo > cost of recompute.' },
      { id: 'q2', text: 'Build a debounced search input component with loading and empty states.', type: 'coding', weight: 40, answerKey: 'Check cleanup, race conditions, accessibility.' },
      { id: 'q3', text: 'A list of 10k rows scrolls slowly. How do you diagnose and fix it?', type: 'case_study', weight: 40, answerKey: 'Profiler, virtualization, memoization, avoid layout thrash.' },
    ],
  },
  {
    id: 'pos2', projectId: 'p1', title: 'Backend Engineer', department: 'Engineering', level: 'Senior', headcount: 1, status: 'open',
    arrangement: 'WFO', salaryMin: 20_000_000, salaryMax: 32_000_000,
    description: 'Design and operate scalable APIs and data pipelines powering our products.',
    requirements: '- 4+ years in Node.js, Go or Java\n- Strong SQL and data modelling\n- Experience with message queues\n- Production on-call experience',
    questions: [
      { id: 'q4', text: 'Design a rate limiter for a public API. Discuss trade-offs.', type: 'case_study', weight: 50, answerKey: 'Token bucket / sliding window, Redis, distributed concerns.' },
      { id: 'q5', text: 'Write a SQL query for the top 3 customers by revenue per month.', type: 'coding', weight: 50, answerKey: 'Window functions: ROW_NUMBER / RANK partition by month.' },
    ],
  },
  {
    id: 'pos3', projectId: 'p1', title: 'QA Engineer', department: 'Engineering', level: 'Mid', headcount: 1, status: 'open',
    arrangement: 'Hybrid', salaryMin: 9_000_000, salaryMax: 15_000_000,
    description: 'Own quality across releases with automation and exploratory testing.',
    requirements: '- 2+ years in QA\n- Playwright or Cypress\n- API testing',
    questions: [{ id: 'q6', text: 'Write a test plan for a checkout flow.', type: 'essay', weight: 100, answerKey: 'Happy path, edge cases, payment failure, concurrency.' }],
  },
  {
    id: 'pos4', projectId: 'p2', title: 'Product Designer', department: 'Design', level: 'Mid', headcount: 1, status: 'open',
    arrangement: 'Hybrid', salaryMin: 12_000_000, salaryMax: 22_000_000,
    description: 'Own end-to-end product design from research to high-fidelity UI.',
    requirements: '- Portfolio with shipped products\n- Figma fluency\n- User research basics',
    questions: [{ id: 'q7', text: 'Redesign the onboarding of a banking app. Walk us through your process.', type: 'case_study', weight: 100, answerKey: 'Research, flows, hypotheses, metrics.' }],
  },
  {
    id: 'pos5', projectId: 'p2', title: 'Product Manager', department: 'Product', level: 'Senior', headcount: 1, status: 'draft',
    arrangement: 'WFO', salaryMin: 25_000_000, salaryMax: 40_000_000,
    description: 'Lead discovery and delivery for a core product area.',
    requirements: '- 4+ years PM experience\n- Data driven\n- Stakeholder management',
    questions: [],
  },
]

const emptyRound = (): Round => ({ date: '', time: '', interviewer: '', result: 'pending', notes: '' })

interface Seed {
  name: string
  pos: string
  proj: string
  src: string
  score: number | null
  sal: number | null
  arr: WorkArrangement
  stage: StageId
  hr?: Partial<Round>
  tech?: Partial<Round>
  user?: Partial<Round>
  next?: string
  owner?: string
}

const seeds: Seed[] = [
  { name: 'Andi Pratama', pos: 'pos1', proj: 'p1', src: 'LinkedIn', score: 82, sal: 16_000_000, arr: 'Hybrid', stage: 'user',
    hr: { date: '2026-10-20', time: '10:00', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-10-27', time: '14:00', result: 'pass', interviewer: 'Budi' }, user: { date: '2026-11-06', time: '13:30', interviewer: 'Rina (CTO)' }, next: 'Interview with CTO' },
  { name: 'Citra Lestari', pos: 'pos1', proj: 'p1', src: 'Referral', score: 91, sal: 18_000_000, arr: 'Hybrid', stage: 'tech',
    hr: { date: '2026-10-28', time: '11:00', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-11-05', time: '15:00', interviewer: 'Budi' } },
  { name: 'Dimas Saputra', pos: 'pos1', proj: 'p1', src: 'JobStreet', score: 64, sal: 14_000_000, arr: 'WFO', stage: 'hr',
    hr: { date: '2026-11-04', time: '16:00', interviewer: 'Sari' } },
  { name: 'Eka Wulandari', pos: 'pos1', proj: 'p1', src: 'Glints', score: null, sal: 15_000_000, arr: 'WFH', stage: 'screening', next: 'Waiting for test submission (due 7 Nov)' },
  { name: 'Fajar Nugroho', pos: 'pos1', proj: 'p1', src: 'LinkedIn', score: 45, sal: 22_000_000, arr: 'WFH', stage: 'rejected', next: 'Rejection email sent' },
  { name: 'Gita Permata', pos: 'pos2', proj: 'p1', src: 'Headhunter', score: 88, sal: 30_000_000, arr: 'WFO', stage: 'offer', 
    hr: { date: '2026-10-12', time: '10:00', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-10-16', time: '13:00', result: 'pass', interviewer: 'Budi' }, user: { date: '2026-10-23', time: '10:00', result: 'pass', interviewer: 'Rina (CTO)' }, next: 'Offer sent, waiting for reply' },
  { name: 'Hendra Wijaya', pos: 'pos2', proj: 'p1', src: 'LinkedIn', score: 73, sal: 27_000_000, arr: 'WFO', stage: 'tech',
    hr: { date: '2026-10-30', time: '09:30', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-11-07', time: '10:00', interviewer: 'Budi' } },
  { name: 'Indah Kusuma', pos: 'pos2', proj: 'p1', src: 'Website', score: null, sal: 25_000_000, arr: 'Hybrid', stage: 'applied' },
  { name: 'Joko Santoso', pos: 'pos3', proj: 'p1', src: 'JobStreet', score: 77, sal: 11_000_000, arr: 'Hybrid', stage: 'hired',
    hr: { date: '2026-10-05', time: '10:00', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-10-09', time: '10:00', result: 'pass', interviewer: 'Budi' }, user: { date: '2026-10-14', time: '10:00', result: 'pass', interviewer: 'Rina (CTO)' }, next: 'Onboarding on 1 Dec' },
  { name: 'Kartika Sari', pos: 'pos3', proj: 'p1', src: 'Kalibrr', score: 58, sal: 10_000_000, arr: 'WFO', stage: 'hr', hr: { date: '2026-11-05', time: '10:30', interviewer: 'Sari' } },
  { name: 'Lukman Hakim', pos: 'pos3', proj: 'p1', src: 'Referral', score: 69, sal: 12_000_000, arr: 'Hybrid', stage: 'screening', next: 'Review test result' },
  { name: 'Maya Anggraini', pos: 'pos4', proj: 'p2', src: 'LinkedIn', score: 85, sal: 17_000_000, arr: 'Hybrid', stage: 'user',
    hr: { date: '2026-10-22', time: '14:00', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-10-29', time: '11:00', result: 'pass', interviewer: 'Nina (Design Lead)' }, user: { date: '2026-11-08', time: '10:00', interviewer: 'Rina (CTO)' } },
  { name: 'Nanda Putri', pos: 'pos4', proj: 'p2', src: 'Website', score: 92, sal: 20_000_000, arr: 'WFH', stage: 'tech', hr: { date: '2026-10-31', time: '10:00', result: 'pass', interviewer: 'Sari' }, tech: { date: '2026-11-06', time: '10:00', interviewer: 'Nina (Design Lead)' } },
  { name: 'Oscar Tan', pos: 'pos4', proj: 'p2', src: 'Referral', score: null, sal: 14_000_000, arr: 'Hybrid', stage: 'applied' },
  { name: 'Putri Ayu', pos: 'pos5', proj: 'p2', src: 'Headhunter', score: null, sal: 35_000_000, arr: 'WFO', stage: 'applied' },
]

const names = (n: string) => n.toLowerCase().replace(/[^a-z]+/g, '.')

const BASE: Candidate[] = seeds.map((s, i) => ({
  id: `c${i + 1}`,
  talentId: `t${i + 1}`,
  projectId: s.proj,
  name: s.name,
  email: `${names(s.name)}@mail.com`,
  phone: `+62 812-${1000 + i * 37}-${2000 + i * 91}`,
  positionId: s.pos,
  source: s.src,
  screeningScore: s.score,
  screeningResult: s.score == null ? 'pending' : s.score >= 65 ? 'pass' : 'fail',

  arrangement: s.arr,
  salaryMin: s.sal,
  salaryMax: s.sal == null ? null : Math.round((s.sal * 1.2) / 500_000) * 500_000,
  archived: s.stage === 'rejected' && s.name.startsWith('F'),
  stage: s.stage,
  nextStep: s.next ?? '',
  owner: s.owner ?? 'Sari',
  appliedAt: '2026-10-0' + ((i % 8) + 1),
  rounds: { hr: { ...emptyRound(), ...s.hr }, tech: { ...emptyRound(), ...s.tech }, user: { ...emptyRound(), ...s.user } },
  rejectReason: s.stage === 'rejected' ? 'Technical screening below threshold, salary above band' : '',
  notes: '',
}))

// Citra also applied to the design project: same talent, second project.
export const CANDIDATES: Candidate[] = [
  ...BASE,
  {
    ...BASE[1], id: 'c16', projectId: 'p2', positionId: 'pos4', stage: 'applied', nextStep: 'Review CV & send technical screening',
    screeningScore: null, screeningResult: 'pending', rounds: {}, appliedAt: '2026-11-02',
  },
]

const pool = (id: string, name: string, src: string, skills: string, sal: number, arr: WorkArrangement): Talent => ({
  id, name, email: `${names(name)}@mail.com`, phone: '+62 811-0000-' + id.slice(-3), source: src, skills,
  salaryMin: sal, salaryMax: Math.round((sal * 1.25) / 500_000) * 500_000, arrangement: arr, notes: '', createdAt: '2026-11-03',
})

export const TALENTS: Talent[] = [
  ...BASE.map((c): Talent => ({
    id: c.talentId, name: c.name, email: c.email, phone: c.phone, source: c.source, skills: '',
    salaryMin: c.salaryMin, salaryMax: c.salaryMax, arrangement: c.arrangement, notes: '', createdAt: c.appliedAt,
  })),
  pool('t101', 'Rizky Maulana', 'LinkedIn', 'React, TypeScript, Next.js', 17_000_000, 'Hybrid'),
  pool('t102', 'Siti Aisyah', 'Referral', 'Go, PostgreSQL, Kafka', 28_000_000, 'WFO'),
  pool('t103', 'Tommy Hartono', 'Headhunter', 'Figma, UX research, design systems', 18_000_000, 'Hybrid'),
  pool('t104', 'Wulan Sari', 'Website', 'Playwright, Cypress, API testing', 11_000_000, 'WFH'),
]

// ---------- PM seed data ----------
const T = (id: string, projectId: string, title: string, stage: string, assignee: string, priority: Task['priority'], startDate: string, dueDate: string, estimateH: number | null, milestoneId = '', labels = ''): Task =>
  ({ id, projectId, title, description: '', stage, assignee, priority, startDate, dueDate, estimateH, milestoneId, labels })

export const TASKS: Task[] = [
  T('k1', 'p1', 'Finalise portal architecture', 'done', 'Budi', 'high', '2026-10-01', '2026-10-15', 24, 'm1', 'architecture'),
  T('k2', 'p1', 'Design system v3 handoff', 'doing', 'Nina', 'critical', '2026-10-20', '2026-11-20', 60, 'm2', 'design'),
  T('k3', 'p1', 'Auth & SSO service', 'doing', 'Andi', 'high', '2026-10-25', '2026-11-30', 80, 'm2', 'backend'),
  T('k4', 'p1', 'Customer dashboard UI', 'todo', 'Citra', 'medium', '2026-11-10', '2026-12-15', 100, 'm2', 'frontend'),
  T('k5', 'p1', 'Public API v2 contract', 'review', 'Gita', 'high', '2026-10-28', '2026-11-12', 30, 'm2', 'backend'),
  T('k6', 'p1', 'E2E test suite (Playwright)', 'backlog', '', 'medium', '2026-12-01', '2027-01-15', 60, 'm3', 'qa'),
  T('k7', 'p1', 'Load testing & performance budget', 'backlog', '', 'medium', '2027-01-05', '2027-01-25', 40, 'm3', 'qa'),
  T('k8', 'p1', 'Pilot rollout to 5 customers', 'backlog', 'Anton', 'high', '2027-01-10', '2027-02-05', 50, 'm4', 'rollout'),
  T('k9', 'p1', 'Hiring: close 5 engineering roles', 'doing', 'Sari', 'critical', '2026-10-01', '2026-12-15', null, 'm2', 'hiring'),
  T('k10', 'p1', 'Security review & pen test', 'todo', 'Budi', 'high', '2026-12-10', '2027-01-10', 40, 'm3', 'security'),
  T('k11', 'p2', 'Define Product Designer scorecard', 'done', 'Nina', 'medium', '2026-10-15', '2026-10-25', 8, 'm5'),
  T('k12', 'p2', 'Portfolio review panel', 'doing', 'Nina', 'high', '2026-11-01', '2026-11-20', 16, 'm5'),
  T('k13', 'p2', 'Set up research repository', 'todo', 'Rina (PM)', 'low', '2026-12-01', '2027-01-15', 20, 'm6'),
  T('k14', 'p2', 'Onboarding plan for new hires', 'backlog', 'Sari', 'medium', '2027-01-05', '2027-02-15', 12, 'm6'),
]

const M = (id: string, projectId: string, title: string, date: string, status: Milestone['status'], owner: string): Milestone => ({ id, projectId, title, date, status, owner, notes: '' })
export const MILESTONES: Milestone[] = [
  M('m1', 'p1', 'Architecture approved', '2026-10-15', 'done', 'Budi'),
  M('m2', 'p1', 'Alpha: core flows usable', '2026-12-18', 'upcoming', 'Rina (PM)'),
  M('m3', 'p1', 'Beta: QA & security sign-off', '2027-01-25', 'upcoming', 'Budi'),
  M('m4', 'p1', 'Pilot customers live', '2027-02-05', 'upcoming', 'Anton'),
  M('m5', 'p2', 'Hiring panel complete', '2026-11-30', 'upcoming', 'Nina'),
  M('m6', 'p2', 'Design ops ready', '2027-01-31', 'upcoming', 'Rina (PM)'),
]

const R = (id: string, projectId: string, kind: Risk['kind'], title: string, probability: number, impact: number, status: Risk['status'], owner: string, mitigation: string, dueDate = ''): Risk =>
  ({ id, projectId, kind, title, probability, impact, status, owner, mitigation, dueDate })
export const RISKS: Risk[] = [
  R('r1', 'p1', 'risk', 'Backend hiring slips past mid-December', 4, 4, 'mitigating', 'Sari', 'Use headhunter for senior backend; open contractor budget as fallback.', '2026-12-01'),
  R('r2', 'p1', 'risk', 'Design system v3 delivered late', 3, 4, 'open', 'Nina', 'Weekly sync; start UI work on v2 tokens and migrate later.', '2026-11-25'),
  R('r3', 'p1', 'issue', 'SSO provider sandbox is down intermittently', 5, 2, 'open', 'Andi', 'Escalated to vendor; local mock IdP in the meantime.', '2026-11-10'),
  R('r4', 'p1', 'risk', 'Pilot customers unavailable during holidays', 2, 3, 'open', 'Anton', 'Confirm pilot calendar with customers by Dec 15.', '2026-12-15'),
  R('r5', 'p2', 'risk', 'Strong design candidates decline due to salary band', 3, 3, 'open', 'Sari', 'Review band with Finance after panel feedback.', '2026-12-10'),
]

const MB = (id: string, projectId: string, name: string, role: string, allocation: number, startDate: string, endDate: string): Member =>
  ({ id, projectId, name, role, email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@company.id', allocation, startDate, endDate })
export const MEMBERS: Member[] = [
  MB('mb1', 'p1', 'Rina (PM)', 'Project Manager', 60, '2026-10-01', '2027-02-26'),
  MB('mb2', 'p1', 'Budi', 'Tech Lead', 70, '2026-10-01', '2027-02-26'),
  MB('mb3', 'p1', 'Andi', 'Backend Engineer', 100, '2026-10-20', '2027-02-26'),
  MB('mb4', 'p1', 'Nina', 'Design Lead', 40, '2026-10-01', '2026-12-31'),
  MB('mb5', 'p1', 'Sari', 'HR Recruiter', 30, '2026-10-01', '2026-12-31'),
  MB('mb6', 'p2', 'Rina (PM)', 'Project Manager', 20, '2026-10-15', '2027-03-31'),
  MB('mb7', 'p2', 'Nina', 'Design Lead', 30, '2026-10-15', '2027-03-31'),
]

const B = (id: string, projectId: string, category: string, description: string, planned: number, actual: number): BudgetItem => ({ id, projectId, category, description, planned, actual })
export const BUDGET: BudgetItem[] = [
  B('b1', 'p1', 'People', 'Engineering salaries (project share)', 900_000_000, 270_000_000),
  B('b2', 'p1', 'Recruitment', 'Headhunter fees & job boards', 180_000_000, 60_000_000),
  B('b3', 'p1', 'Infrastructure', 'Cloud, CI, observability', 260_000_000, 55_000_000),
  B('b4', 'p1', 'Tools & licences', 'Figma, Jira, SSO provider', 120_000_000, 48_000_000),
  B('b5', 'p1', 'Security', 'Pen test and compliance review', 150_000_000, 0),
  B('b6', 'p2', 'Recruitment', 'Design & product hiring', 120_000_000, 18_000_000),
  B('b7', 'p2', 'Tools & licences', 'Research and prototyping tools', 80_000_000, 22_000_000),
]

export const UPDATES: StatusUpdate[] = [
  { id: 'su1', projectId: 'p1', date: '2026-10-30', author: 'Rina (PM)', health: 'on_track', summary: 'Architecture approved; engineering kicked off on auth and API contract.',
    highlights: '- Architecture signed off by CTO\n- 3 of 5 engineering roles in interview stage', blockers: '- SSO sandbox flaky', nextSteps: '- Design system v3 handoff\n- Close backend offers' },
  { id: 'su2', projectId: 'p1', date: '2026-11-04', author: 'Rina (PM)', health: 'at_risk', summary: 'Hiring pace is behind plan and design system v3 is trending late, putting Alpha at risk.',
    highlights: '- API v2 contract in review\n- Offer out for senior backend', blockers: '- Design system v3 slipping ~1 week\n- 2 backend roles still open', nextSteps: '- Decide on contractor fallback by Nov 15' },
  { id: 'su3', projectId: 'p2', date: '2026-11-03', author: 'Rina (PM)', health: 'on_track', summary: 'Panel scheduled; scorecard finished.', highlights: '- Scorecard done', blockers: '', nextSteps: '- Run portfolio review' },
]
