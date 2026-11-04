import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type {
  Candidate,
  Permission,
  Position,
  Project,
  Role,
  RoundKey,
  Stage,
  RoundResult,
  ShareLink,
  StageId,
  TestQuestion,
  User,
} from '@/types'
import { CANDIDATES, POSITIONS, PROJECTS, ROLES, USERS } from '@/data/mock'
import { DEFAULT_STAGES, emptyRound, lostStageId, nextStageId, today } from '@/lib/constants'

interface State {
  projects: Project[]
  positions: Position[]
  candidates: Candidate[]
  roles: Role[]
  users: User[]
  shares: ShareLink[]
  currentUserId: string
  activeProjectId: string

  setUser: (id: string) => void
  setProject: (id: string) => void

  addProject: (name: string, description: string) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => string
  setStages: (projectId: string, stages: Stage[]) => void
  removeStage: (projectId: string, stageId: string, moveTo: string) => void

  addCandidate: (c: Partial<Candidate>) => string
  updateCandidate: (id: string, patch: Partial<Candidate>) => void
  updateRound: (id: string, key: RoundKey, patch: Partial<Candidate['rounds'][RoundKey]>) => void
  setRoundResult: (id: string, key: RoundKey, result: RoundResult) => void
  moveCandidate: (id: string, stage: StageId) => void
  deleteCandidate: (id: string) => void
  archiveCandidate: (id: string, archived: boolean) => void

  addPosition: (projectId: string) => string
  updatePosition: (id: string, patch: Partial<Position>) => void
  deletePosition: (id: string) => void
  upsertQuestion: (positionId: string, q: TestQuestion) => void
  deleteQuestion: (positionId: string, qid: string) => void

  updateRole: (id: string, patch: Partial<Role>) => void
  togglePermission: (roleId: string, p: Permission) => void
  addRole: (name: string) => void
  updateUser: (id: string, patch: Partial<User>) => void

  addShare: (s: Omit<ShareLink, 'id' | 'createdAt' | 'views'>) => string
  updateShare: (id: string, patch: Partial<ShareLink>) => void
  deleteShare: (id: string) => void
  bumpShare: (id: string) => void
  reset: () => void
}

const seed = () => ({
  projects: PROJECTS,
  positions: POSITIONS,
  candidates: CANDIDATES,
  roles: ROLES,
  users: USERS,
  shares: [
    {
      id: 'demo-public', projectId: 'p1', label: 'Hiring managers (public)', access: 'public' as const, password: '',
      view: 'kanban' as const, showSalary: false, showContact: false, positionIds: [], enabled: true, createdAt: '2026-10-30', views: 12,
    },
    {
      id: 'demo-private', projectId: 'p1', label: 'Leadership review (password)', access: 'password' as const, password: 'hire2026',
      view: 'table' as const, showSalary: true, showContact: true, positionIds: [], enabled: true, createdAt: '2026-10-31', views: 3,
    },
  ],
  currentUserId: 'u1',
  activeProjectId: 'p1',
})

const stagesOf = (s: State, projectId: string) => s.projects.find((p) => p.id === projectId)?.stages ?? DEFAULT_STAGES()
const stageById = (st: Stage[], id: string) => st.find((x) => x.id === id)

const mapC = (s: State, id: string, fn: (c: Candidate) => Candidate) =>
  ({ candidates: s.candidates.map((c) => (c.id === id ? fn(c) : c)) })

export const useStore = create<State>()(
  persist(
    (set) => ({
      ...seed(),
      setUser: (id) => set({ currentUserId: id }),
      setProject: (id) => set({ activeProjectId: id }),

      addProject: (name, description) => {
        const id = 'p-' + nanoid(6)
        set((s) => ({
          projects: [...s.projects, { id, name, description, status: 'active', createdAt: today(), stages: DEFAULT_STAGES() }],
          activeProjectId: id,
        }))
        return id
      },
      updateProject: (id, patch) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),

      deleteProject: (id) =>
        set((s) => {
          const projects = s.projects.filter((p) => p.id !== id)
          return {
            projects,
            positions: s.positions.filter((p) => p.projectId !== id),
            candidates: s.candidates.filter((c) => c.projectId !== id),
            shares: s.shares.filter((x) => x.projectId !== id),
            activeProjectId: s.activeProjectId === id ? (projects.find((p) => p.status === 'active') ?? projects[0])?.id ?? '' : s.activeProjectId,
          }
        }),
      duplicateProject: (id) => {
        const nid = 'p-' + nanoid(6)
        set((s) => {
          const src = s.projects.find((p) => p.id === id)!
          return {
            projects: [...s.projects, { ...src, id: nid, name: src.name + ' (copy)', status: 'active', createdAt: today(), stages: src.stages.map((x) => ({ ...x })) }],
            positions: [
              ...s.positions,
              ...s.positions.filter((p) => p.projectId === id).map((p) => ({ ...p, id: 'pos-' + nanoid(6), projectId: nid, questions: p.questions.map((q) => ({ ...q, id: nanoid(6) })) })),
            ],
            activeProjectId: nid,
          }
        })
        return nid
      },
      setStages: (projectId, stages) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, stages } : p)) })),
      removeStage: (projectId, stageId, moveTo) =>
        set((s) => {
          const target = stageById(stagesOf(s, projectId), moveTo)
          return {
            projects: s.projects.map((p) => (p.id === projectId ? { ...p, stages: p.stages.filter((x) => x.id !== stageId) } : p)),
            candidates: s.candidates.map((c) =>
              c.projectId === projectId && c.stage === stageId ? { ...c, stage: moveTo, nextStep: target?.nextStep ?? c.nextStep } : c,
            ),
          }
        }),

      addCandidate: (c) => {
        const id = 'c-' + nanoid(6)
        set((s) => {
          const first = stagesOf(s, s.activeProjectId)[0]
          return {
          candidates: [
            {
              id, projectId: s.activeProjectId, name: 'New candidate', email: '', phone: '', positionId: '',
              source: 'LinkedIn', screeningScore: null, screeningResult: 'pending', salaryMin: null, salaryMax: null,
              archived: false, arrangement: 'Any', stage: first?.id ?? '', nextStep: first?.nextStep ?? '', owner: 'Sari',
              appliedAt: today(), rejectReason: '', notes: '', rounds: {},
              ...c,
            },
            ...s.candidates,
          ],
        }})
        return id
      },
      updateCandidate: (id, patch) => set((s) => mapC(s, id, (c) => ({ ...c, ...patch }))),
      updateRound: (id, key, patch) =>
        set((s) => mapC(s, id, (c) => ({ ...c, rounds: { ...c.rounds, [key]: { ...(c.rounds[key] ?? emptyRound()), ...patch } } }))),
      // Setting a result moves the candidate: pass -> next stage, fail -> the pipeline's "lost" stage.
      setRoundResult: (id, key, result) =>
        set((s) =>
          mapC(s, id, (c) => {
            const stages = stagesOf(s, c.projectId)
            const rounds = { ...c.rounds, [key]: { ...(c.rounds[key] ?? emptyRound()), result } }
            let stage = c.stage
            if (result === 'pass' && c.stage === key) stage = nextStageId(stages, c.stage)
            if (result === 'fail') stage = lostStageId(stages) ?? c.stage
            return { ...c, rounds, stage, nextStep: stage !== c.stage ? stageById(stages, stage)?.nextStep ?? c.nextStep : c.nextStep }
          }),
        ),
      moveCandidate: (id, stage) =>
        set((s) => mapC(s, id, (c) => ({ ...c, stage, nextStep: stageById(stagesOf(s, c.projectId), stage)?.nextStep ?? c.nextStep }))),
      archiveCandidate: (id, archived) => set((s) => mapC(s, id, (c) => ({ ...c, archived }))),
      deleteCandidate: (id) => set((s) => ({ candidates: s.candidates.filter((c) => c.id !== id) })),

      addPosition: (projectId) => {
        const id = 'pos-' + nanoid(6)
        set((s) => ({
          positions: [
            ...s.positions,
            {
              id, projectId, title: 'New position', department: '', level: 'Mid', headcount: 1, status: 'draft',
              arrangement: 'Hybrid', salaryMin: null, salaryMax: null, description: '', requirements: '', questions: [],
            },
          ],
        }))
        return id
      },
      updatePosition: (id, patch) =>
        set((s) => ({ positions: s.positions.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deletePosition: (id) => set((s) => ({ positions: s.positions.filter((p) => p.id !== id) })),
      upsertQuestion: (pid, q) =>
        set((s) => ({
          positions: s.positions.map((p) =>
            p.id !== pid
              ? p
              : { ...p, questions: p.questions.some((x) => x.id === q.id) ? p.questions.map((x) => (x.id === q.id ? q : x)) : [...p.questions, q] },
          ),
        })),
      deleteQuestion: (pid, qid) =>
        set((s) => ({
          positions: s.positions.map((p) => (p.id === pid ? { ...p, questions: p.questions.filter((q) => q.id !== qid) } : p)),
        })),

      updateRole: (id, patch) => set((s) => ({ roles: s.roles.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      togglePermission: (roleId, p) =>
        set((s) => ({
          roles: s.roles.map((r) => (r.id === roleId ? { ...r, permissions: { ...r.permissions, [p]: !r.permissions[p] } } : r)),
        })),
      addRole: (name) =>
        set((s) => ({
          roles: [
            ...s.roles,
            { id: 'r-' + nanoid(5), name, description: '', permissions: Object.fromEntries(Object.keys(s.roles[0].permissions).map((k) => [k, false])) as Role['permissions'] },
          ],
        })),
      updateUser: (id, patch) => set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),

      addShare: (sh) => {
        const id = nanoid(10)
        set((s) => ({ shares: [...s.shares, { ...sh, id, createdAt: today(), views: 0 }] }))
        return id
      },
      updateShare: (id, patch) => set((s) => ({ shares: s.shares.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteShare: (id) => set((s) => ({ shares: s.shares.filter((x) => x.id !== id) })),
      bumpShare: (id) => set((s) => ({ shares: s.shares.map((x) => (x.id === id ? { ...x, views: x.views + 1 } : x)) })),
      reset: () => set(seed()),
    }),
    { name: 'hiring-pipeline-v2' },
  ),
)

export function useCurrentUser() {
  const user = useStore((s) => s.users.find((u) => u.id === s.currentUserId)!)
  const role = useStore((s) => s.roles.find((r) => r.id === user.roleId)!)
  return { user, role }
}

export function useCan() {
  const { role } = useCurrentUser()
  return (p: Permission) => !!role?.permissions[p]
}
