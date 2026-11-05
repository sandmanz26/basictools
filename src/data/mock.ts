import type {
  Candidate,
  Permission,
  Position,
  Project,
  Role,
  Round,
  StageId,
  Talent,
  User,
  WorkArrangement,
} from '@/types'
import { DEFAULT_STAGES, PERMISSIONS } from '@/lib/constants'

const allPerms = (v: boolean): Record<Permission, boolean> =>
  Object.fromEntries(PERMISSIONS.map((p) => [p.id, v])) as Record<Permission, boolean>

export const ROLES: Role[] = [
  { id: 'r-admin', name: 'Admin', description: 'Full access', permissions: allPerms(true) },
  {
    id: 'r-hr',
    name: 'HR Recruiter',
    description: 'Runs the pipeline day to day',
    permissions: { ...allPerms(true), 'roles.manage': false, 'projects.manage': false },
  },
  {
    id: 'r-hm',
    name: 'Hiring Manager',
    description: 'Owns job descriptions and tests, views candidates',
    permissions: { ...allPerms(false), 'positions.edit': true, 'tests.edit': true, 'salary.view': true, 'candidates.edit': true },
  },
  {
    id: 'r-viewer',
    name: 'Viewer',
    description: 'Read only, salary hidden',
    permissions: allPerms(false),
  },
]

export const USERS: User[] = [
  { id: 'u1', name: 'Chandra', email: 'chandra@company.id', roleId: 'r-admin' },
  { id: 'u2', name: 'Sari (HR)', email: 'sari@company.id', roleId: 'r-hr' },
  { id: 'u3', name: 'Budi (Eng Manager)', email: 'budi@company.id', roleId: 'r-hm' },
  { id: 'u4', name: 'Dewi (Guest)', email: 'dewi@company.id', roleId: 'r-viewer' },
]

export const PROJECTS: Project[] = [
  { id: 'p1', name: 'Engineering Q4 2026', description: 'Product engineering hiring for the Q4 roadmap', status: 'active', createdAt: '2026-09-15', stages: DEFAULT_STAGES() },
  { id: 'p2', name: 'Design & Product 2026', description: 'Design team expansion', status: 'active', createdAt: '2026-10-01', stages: DEFAULT_STAGES() },
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
