import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type {
  Broadcast,
  Candidate,
  BillingProfile,
  Invoice,
  Schedule,
  ScheduleEvent,
  EmailTemplate,
  FieldDef,
  Lead,
  MsConfig,
  SentEmail,
  Permission,
  PMCollections,
  Position,
  Project,
  ProjectInfo,
  Role,
  RoundKey,
  Stage,
  RoundResult,
  ShareLink,
  StageId,
  Talent,
  TestQuestion,
  User,
} from '@/types'
import { SCHEDULES } from '@/data/mock'
import { BUDGET, CANDIDATES, INVOICES, EMAIL_TEMPLATES, LEADS, MEMBERS, MILESTONES, POSITIONS, PROJECTS, RISKS, ROLES, TALENTS, TASKS, UPDATES, USERS } from '@/data/mock'
import { eventKey, localDay, localToday, occurrenceDates, periodLabel, addDays as addDaysStr } from '@/lib/billing'
import { nextInvoiceNumber } from '@/lib/pm'
import { FIELDS_STANDARD, DEFAULT_INFO, DEFAULT_PM_STAGES, NO_FEATURES } from '@/lib/pm'
import { findTalent } from '@/lib/talent'
import type { ImportRecord } from '@/lib/importExport'
import { DEFAULT_LEAD_COLUMNS, DEFAULT_MKT_STAGES, DEFAULT_STAGES, emptyRound, lostStageId, nextStageId, today } from '@/lib/constants'

export interface ImportOpts { onDuplicate: 'skip' | 'update'; createPositions: boolean }
export interface ImportSummary { added: number; updated: number; skipped: number; newTalents: number; newPositions: number }

interface State {
  projects: Project[]
  positions: Position[]
  candidates: Candidate[]
  talents: Talent[]
  tasks: PMCollections['tasks']
  milestones: PMCollections['milestones']
  risks: PMCollections['risks']
  members: PMCollections['members']
  budget: PMCollections['budget']
  updates: PMCollections['updates']
  roles: Role[]
  users: User[]
  shares: ShareLink[]
  leads: Lead[]
  mktStages: Stage[]
  mktFields: FieldDef[]
  mktColumns: string[]
  templates: EmailTemplate[]
  emails: SentEmail[]
  invoices: Invoice[]
  schedules: Schedule[]
  scheduleEvents: Record<string, ScheduleEvent>
  broadcasts: Broadcast[]
  msConfig: MsConfig
  currentUserId: string
  activeProjectId: string

  setMktStages: (stages: Stage[]) => void
  setMktFields: (fields: FieldDef[]) => void
  setMktColumns: (cols: string[]) => void
  importLeads: (records: Partial<Lead>[], onDuplicate: 'skip' | 'update') => { added: number; updated: number; skipped: number }
  removeMktStage: (stageId: string, moveTo: string) => void
  addLead: (l?: Partial<Lead>) => string
  updateLead: (id: string, patch: Partial<Lead>) => void
  deleteLead: (id: string) => void
  upsertTemplate: (t: EmailTemplate) => void
  deleteTemplate: (id: string) => void
  logEmail: (e: SentEmail) => void
  addSchedule: (s: Schedule) => void
  updateSchedule: (id: string, patch: Partial<Schedule>) => void
  deleteSchedule: (id: string) => void
  setScheduleEvent: (key: string, patch: Partial<ScheduleEvent> | null) => void
  importSchedules: (list: Schedule[]) => void
  addInvoice: (i: Invoice) => void
  billingProfile: BillingProfile
  setBillingProfile: (patch: Partial<BillingProfile>) => void
  createInvoiceFromSchedule: (scheduleId: string, date: string) => string | null
  draftDueInvoices: (today: string) => number
  updateInvoice: (id: string, patch: Partial<Invoice>) => void
  deleteInvoice: (id: string) => void
  setPmFeature: (projectId: string, feature: keyof Project['pmFeatures'], on: boolean) => void
  setPmFields: (projectId: string, fields: NonNullable<Project['pmFields']>) => void
  addBroadcast: (b: Broadcast) => void
  updateBroadcast: (id: string, patch: Partial<Broadcast>) => void
  setBroadcastRecipient: (id: string, leadId: string, status: 'pending' | 'sent' | 'failed') => void
  deleteBroadcast: (id: string) => void
  setMsConfig: (patch: Partial<MsConfig>) => void

  setUser: (id: string) => void
  setProject: (id: string) => void

  addProject: (name: string, description: string) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => string
  setStages: (projectId: string, stages: Stage[]) => void
  setPmStages: (projectId: string, stages: Stage[]) => void
  removePmStage: (projectId: string, stageId: string, moveTo: string) => void
  updateInfo: (projectId: string, patch: Partial<ProjectInfo>) => void
  pmAdd: <K extends keyof PMCollections>(k: K, item: PMCollections[K][number]) => void
  pmUpdate: <K extends keyof PMCollections>(k: K, id: string, patch: Partial<PMCollections[K][number]>) => void
  pmDelete: <K extends keyof PMCollections>(k: K, id: string) => void
  removeStage: (projectId: string, stageId: string, moveTo: string) => void

  addCandidate: (c: Partial<Candidate>) => string
  updateCandidate: (id: string, patch: Partial<Candidate>) => void
  updateRound: (id: string, key: RoundKey, patch: Partial<Candidate['rounds'][RoundKey]>) => void
  setRoundResult: (id: string, key: RoundKey, result: RoundResult) => void
  rescheduleRound: (id: string, key: RoundKey, reason: string) => void
  moveCandidate: (id: string, stage: StageId) => void
  deleteCandidate: (id: string) => void
  archiveCandidate: (id: string, archived: boolean) => void

  addTalent: (t?: Partial<Talent>) => string
  updateTalent: (id: string, patch: Partial<Talent>) => void
  deleteTalent: (id: string) => void
  addTalentsToProject: (projectId: string, talentIds: string[], positionId: string, opts?: { stageId?: string; nextStep?: string }) => number
  importCandidates: (projectId: string, records: ImportRecord[], opts: ImportOpts) => ImportSummary
  importTalents: (records: ImportRecord[]) => ImportSummary

  addPosition: (projectId: string) => string
  updatePosition: (id: string, patch: Partial<Position>) => void
  deletePosition: (id: string) => void
  upsertQuestion: (positionId: string, q: TestQuestion) => void
  deleteQuestion: (positionId: string, qid: string) => void

  updateRole: (id: string, patch: Partial<Role>) => void
  togglePermission: (roleId: string, p: Permission) => void
  addRole: (name: string) => void
  updateUser: (id: string, patch: Partial<User>) => void
  addUser: (u: User) => void
  deleteUser: (id: string) => void

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
  talents: TALENTS,
  tasks: TASKS,
  milestones: MILESTONES,
  risks: RISKS,
  members: MEMBERS,
  budget: BUDGET,
  updates: UPDATES,
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
  leads: LEADS,
  mktStages: DEFAULT_MKT_STAGES(),
  mktFields: [] as FieldDef[],
  mktColumns: DEFAULT_LEAD_COLUMNS,
  templates: EMAIL_TEMPLATES,
  emails: [] as SentEmail[],
  invoices: INVOICES,
  schedules: SCHEDULES,
  billingProfile: { company: '', address: '', email: '', phone: '', taxId: '', bankName: '', bankAccount: '', bankHolder: '', paymentNote: '' } as BillingProfile,
  scheduleEvents: {} as Record<string, ScheduleEvent>,
  broadcasts: [] as Broadcast[],
  msConfig: { clientId: (import.meta.env.VITE_MS_CLIENT_ID as string | undefined) ?? '', tenant: (import.meta.env.VITE_MS_TENANT as string | undefined) ?? 'common' },
  currentUserId: 'u1',
  activeProjectId: 'p1',
})

const stagesOf = (s: State, projectId: string) => s.projects.find((p) => p.id === projectId)?.stages ?? DEFAULT_STAGES()
const stageById = (st: Stage[], id: string) => st.find((x) => x.id === id)

const blankCandidate = (projectId: string, talentId: string, stage: Stage | undefined): Candidate => ({
  id: 'c-' + nanoid(6), projectId, talentId, name: '', email: '', phone: '', positionId: '', source: '',
  screeningScore: null, screeningResult: 'pending', salaryMin: null, salaryMax: null, archived: false, arrangement: 'Any',
  stage: stage?.id ?? '', nextStep: stage?.nextStep ?? '', owner: 'Sari', appliedAt: today(), rejectReason: '', notes: '', rounds: {},
})

const newTalent = (p: Partial<Talent>): Talent => ({
  id: 't-' + nanoid(6), name: '', email: '', phone: '', source: '', skills: '', salaryMin: null, salaryMax: null,
  arrangement: 'Any', notes: '', createdAt: today(), ...p,
})

/** Fill only the empty fields of a pool entry from new data. */
const fillTalent = (t: Talent, r: Partial<Talent>): Talent => ({
  ...t,
  email: t.email || r.email || '', phone: t.phone || r.phone || '', source: t.source || r.source || '',
  skills: t.skills || r.skills || '', salaryMin: t.salaryMin ?? r.salaryMin ?? null, salaryMax: t.salaryMax ?? r.salaryMax ?? null,
  arrangement: t.arrangement !== 'Any' ? t.arrangement : r.arrangement || 'Any',
})

const mapC = (s: State, id: string, fn: (c: Candidate) => Candidate) =>
  ({ candidates: s.candidates.map((c) => (c.id === id ? fn(c) : c)) })

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),
      setMktStages: (stages) => set({ mktStages: stages }),
      setMktFields: (fields) => set((s) => ({
        mktFields: fields,
        mktColumns: s.mktColumns.filter((k) => !k.startsWith('cf:') || fields.some((f) => 'cf:' + f.id === k)),
      })),
      setMktColumns: (cols) => set({ mktColumns: cols }),
      importLeads: (records, onDuplicate) => {
        const sum = { added: 0, updated: 0, skipped: 0 }
        set((s) => {
          let leads = [...s.leads]
          const byEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email.trim().toLowerCase(), l.id]))
          const fresh: Lead[] = []
          for (const r of records) {
            const key = (r.email ?? '').trim().toLowerCase()
            const hit = key ? byEmail.get(key) : undefined
            if (hit) {
              if (onDuplicate === 'skip') { sum.skipped++; continue }
              leads = leads.map((l) => {
                if (l.id !== hit) return l
                const next = { ...l }
                for (const [k, v] of Object.entries(r)) if (k !== 'custom' && k !== 'id' && v !== '' && v != null) (next as Record<string, unknown>)[k] = v
                next.custom = { ...(l.custom ?? {}), ...Object.fromEntries(Object.entries(r.custom ?? {}).filter(([, v]) => v !== '')) }
                return next
              })
              sum.updated++
            } else {
              const l: Lead = {
                id: 'l-' + nanoid(6), name: '', company: '', title: '', email: '', phone: '', source: 'Import', stage: s.mktStages[0]?.id ?? '', value: null,
                owner: s.users.find((u) => u.id === s.currentUserId)?.name ?? '', nextAction: '', nextActionDate: '', tags: '', notes: '',
                createdAt: today(), lastContactAt: '', unsubscribed: false, custom: {}, ...r,
              }
              fresh.push(l)
              if (key) byEmail.set(key, l.id)
              sum.added++
            }
          }
          return { leads: [...fresh, ...leads] }
        })
        return sum
      },
      removeMktStage: (stageId, moveTo) =>
        set((s) => ({ mktStages: s.mktStages.filter((x) => x.id !== stageId), leads: s.leads.map((l) => (l.stage === stageId ? { ...l, stage: moveTo } : l)) })),
      addLead: (l) => {
        const id = 'l-' + nanoid(6)
        set((s) => ({
          leads: [{
            id, name: 'New lead', company: '', title: '', email: '', phone: '', source: 'Website', stage: s.mktStages[0]?.id ?? '', value: null,
            owner: s.users.find((u) => u.id === s.currentUserId)?.name ?? '', nextAction: '', nextActionDate: '', tags: '', notes: '', createdAt: today(), lastContactAt: '', unsubscribed: false, ...l,
          }, ...s.leads],
        }))
        return id
      },
      updateLead: (id, patch) => set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      deleteLead: (id) => set((s) => ({ leads: s.leads.filter((l) => l.id !== id) })),
      upsertTemplate: (t) => set((s) => ({ templates: s.templates.some((x) => x.id === t.id) ? s.templates.map((x) => (x.id === t.id ? t : x)) : [...s.templates, t] })),
      deleteTemplate: (id) => set((s) => ({ templates: s.templates.filter((x) => x.id !== id) })),
      logEmail: (e) =>
        set((s) => ({
          emails: [e, ...s.emails].slice(0, 2000),
          leads: e.status === 'sent' ? s.leads.map((l) => (l.id === e.leadId ? { ...l, lastContactAt: e.sentAt.slice(0, 10) } : l)) : s.leads,
        })),
      addSchedule: (x) => set((s) => ({ schedules: [x, ...s.schedules] })),
      updateSchedule: (id, patch) => set((s) => ({ schedules: s.schedules.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteSchedule: (id) => set((s) => ({
        schedules: s.schedules.filter((x) => x.id !== id),
        scheduleEvents: Object.fromEntries(Object.entries(s.scheduleEvents).filter(([k]) => !k.startsWith(id + ':'))),
      })),
      setScheduleEvent: (key, patch) => set((s) => {
        const next = { ...s.scheduleEvents }
        if (patch === null) delete next[key]
        else {
          const prev: Partial<ScheduleEvent> = next[key] ?? {}
          next[key] = { issuedAt: '', invoiceNo: '', paidAt: '', skipped: false, ...prev, ...patch }
        }
        return { scheduleEvents: next }
      }),
      importSchedules: (list) => set((s) => ({ schedules: [...list, ...s.schedules] })),
      addInvoice: (i) => set((s) => ({ invoices: [i, ...s.invoices] })),
      // Keep the billing reminders in step with the document: sending releases it, paying closes it.
      updateInvoice: (id, patch) =>
        set((s) => {
          const prev = s.invoices.find((x) => x.id === id)
          const next = prev ? { ...prev, ...patch } : undefined
          const invoices = s.invoices.map((x) => (x.id === id && next ? next : x))
          if (!next?.scheduleKey) return { invoices }
          const ev: ScheduleEvent = { issuedAt: '', invoiceNo: '', paidAt: '', skipped: false, ...(s.scheduleEvents[next.scheduleKey] as Partial<ScheduleEvent> | undefined) }
          const sentNow = next.status !== 'draft' && !ev.issuedAt
          const paidNow = next.status === 'paid' && !ev.paidAt
          if (!sentNow && !paidNow && ev.invoiceNo === next.number) return { invoices }
          return {
            invoices,
            scheduleEvents: {
              ...s.scheduleEvents,
              [next.scheduleKey]: {
                ...ev, invoiceId: next.id, invoiceNo: next.number,
                issuedAt: ev.issuedAt || (next.status !== 'draft' ? (next.sentAt ? localDay(next.sentAt) : next.issueDate) : ''),
                paidAt: next.status === 'paid' ? ev.paidAt || localToday() : ev.paidAt,
              },
            },
          }
        }),
      deleteInvoice: (id) =>
        set((s) => ({
          invoices: s.invoices.filter((x) => x.id !== id),
          // invoiceId '' means deleted on purpose: don't auto-draft it again
          scheduleEvents: Object.fromEntries(Object.entries(s.scheduleEvents).map(([k, e]) => [k, e.invoiceId === id ? { ...e, invoiceId: '' } : e])),
        })),
      setBillingProfile: (patch) => set((s) => ({ billingProfile: { ...s.billingProfile, ...patch } })),

      // One recurring occurrence -> one draft invoice, filled from the schedule (and its project).
      createInvoiceFromSchedule: (scheduleId, date) => {
        const s = get()
        const sch = s.schedules.find((x) => x.id === scheduleId)
        const project = s.projects.find((p) => p.id === sch?.projectId)
        if (!sch || sch.kind !== 'receivable' || !project) return null
        const key = eventKey(sch.id, date)
        const existing = s.scheduleEvents[key]?.invoiceId
        if (existing && s.invoices.some((i) => i.id === existing)) return existing
        const t = sch.template
        const period = periodLabel(sch, date)
        const base = t?.items.length ? t.items : [{ id: 'x', description: sch.title || 'Services', qty: 1, unitPrice: sch.amount ?? 0 }]
        const items = base.map((it, i) => ({ ...it, id: nanoid(5), description: i === 0 && period ? `${it.description} (${period})` : it.description }))
        const id = 'inv-' + nanoid(6)
        const number = nextInvoiceNumber(s.invoices, date)
        const inv: Invoice = {
          id, projectId: project.id, number, clientName: sch.party || project.info.client,
          clientEmail: t?.clientEmail || project.info.stakeholders.find((x) => x.contact.includes('@'))?.contact || '',
          issueDate: date, dueDate: addDaysStr(date, sch.termDays), items, taxPct: t?.taxPct ?? 11, status: 'draft',
          notes: t?.notes || s.billingProfile.paymentNote, sentAt: '', scheduleKey: key, period,
        }
        set((st) => ({
          invoices: [inv, ...st.invoices],
          scheduleEvents: { ...st.scheduleEvents, [key]: { issuedAt: '', paidAt: '', skipped: false, ...(st.scheduleEvents[key] as Partial<ScheduleEvent> | undefined), invoiceNo: number, invoiceId: id } },
        }))
        return id
      },
      // Called on app open: prepare the draft for every invoice whose reminder window has started.
      draftDueInvoices: (today) => {
        const s = get()
        let n = 0
        for (const sch of s.schedules) {
          if (!sch.active || sch.kind !== 'receivable' || !sch.projectId || sch.autoDraft === false) continue
          for (const date of occurrenceDates(sch, addDaysStr(today, -7), addDaysStr(today, sch.leadDays))) {
            const ev = get().scheduleEvents[eventKey(sch.id, date)]
            if (ev?.skipped || ev?.issuedAt || ev?.invoiceId === '') continue
            if (ev?.invoiceId && get().invoices.some((i) => i.id === ev.invoiceId)) continue
            if (get().createInvoiceFromSchedule(sch.id, date)) n++
          }
        }
        return n
      },
      setPmFields: (projectId, fields) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, pmFields: fields } : p)) })),
      setPmFeature: (projectId, feature, on) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, pmFeatures: { ...p.pmFeatures, [feature]: on } } : p)) })),
      addBroadcast: (b) => set((s) => ({ broadcasts: [b, ...s.broadcasts] })),
      updateBroadcast: (id, patch) => set((s) => ({ broadcasts: s.broadcasts.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      setBroadcastRecipient: (id, leadId, status) =>
        set((s) => ({ broadcasts: s.broadcasts.map((x) => (x.id === id ? { ...x, recipients: { ...x.recipients, [leadId]: status } } : x)) })),
      deleteBroadcast: (id) => set((s) => ({ broadcasts: s.broadcasts.filter((x) => x.id !== id) })),
      setMsConfig: (patch) => set((s) => ({ msConfig: { ...s.msConfig, ...patch } })),

      setUser: (id) => set({ currentUserId: id }),
      setProject: (id) => set({ activeProjectId: id }),

      addProject: (name, description) => {
        const id = 'p-' + nanoid(6)
        set((s) => ({
          projects: [...s.projects, { id, name, description, status: 'active', createdAt: today(), stages: DEFAULT_STAGES(), pmStages: DEFAULT_PM_STAGES(), pmFeatures: NO_FEATURES(), pmFields: FIELDS_STANDARD(), info: { ...DEFAULT_INFO(), startDate: today() } }],
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
            tasks: s.tasks.filter((x) => x.projectId !== id),
            milestones: s.milestones.filter((x) => x.projectId !== id),
            risks: s.risks.filter((x) => x.projectId !== id),
            members: s.members.filter((x) => x.projectId !== id),
            budget: s.budget.filter((x) => x.projectId !== id),
            updates: s.updates.filter((x) => x.projectId !== id),
            invoices: s.invoices.filter((x) => x.projectId !== id),
            activeProjectId: s.activeProjectId === id ? (projects.find((p) => p.status === 'active') ?? projects[0])?.id ?? '' : s.activeProjectId,
          }
        }),
      duplicateProject: (id) => {
        const nid = 'p-' + nanoid(6)
        set((s) => {
          const src = s.projects.find((p) => p.id === id)!
          return {
            projects: [...s.projects, { ...src, id: nid, name: src.name + ' (copy)', status: 'active', createdAt: today(), stages: src.stages.map((x) => ({ ...x })), pmStages: src.pmStages.map((x) => ({ ...x })), info: { ...src.info, stakeholders: src.info.stakeholders.map((x) => ({ ...x })) } }],
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
      setPmStages: (projectId, stages) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, pmStages: stages } : p)) })),
      removePmStage: (projectId, stageId, moveTo) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === projectId ? { ...p, pmStages: p.pmStages.filter((x) => x.id !== stageId) } : p)),
          tasks: s.tasks.map((t) => (t.projectId === projectId && t.stage === stageId ? { ...t, stage: moveTo } : t)),
        })),
      updateInfo: (projectId, patch) =>
        set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, info: { ...p.info, ...patch } } : p)) })),
      // Generic CRUD for the PM collections (tasks, milestones, risks, members, budget, updates).
      pmAdd: (k, item) => set((s) => ({ [k]: [...(s[k] as unknown[]), item] }) as Partial<State>),
      pmUpdate: (k, id, patch) =>
        set((s) => ({ [k]: (s[k] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }) as Partial<State>),
      pmDelete: (k, id) => set((s) => ({ [k]: (s[k] as { id: string }[]).filter((x) => x.id !== id) }) as Partial<State>),
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
        const cand = blankCandidate(get().activeProjectId, '', stagesOf(get(), get().activeProjectId)[0])
        const talent = newTalent({ name: 'New candidate', source: 'LinkedIn' })
        const full: Candidate = { ...cand, name: talent.name, source: talent.source, ...c, talentId: talent.id }
        set((s) => ({ talents: [talent, ...s.talents], candidates: [full, ...s.candidates] }))
        return full.id
      },
      updateCandidate: (id, patch) =>
        set((s) => {
          const cur = s.candidates.find((c) => c.id === id)
          const shared: Partial<Candidate> = {}
          for (const k of ['name', 'email', 'phone'] as const) if (k in patch) shared[k] = patch[k]
          if (!cur?.talentId || Object.keys(shared).length === 0) return mapC(s, id, (c) => ({ ...c, ...patch }))
          return {
            candidates: s.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c.talentId === cur.talentId ? { ...c, ...shared } : c)),
            talents: s.talents.map((t) => (t.id === cur.talentId ? { ...t, ...shared } : t)),
          }
        }),
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
      // Repeat an interview: keep the old attempt in history and open a fresh slot to schedule again.
      rescheduleRound: (id, key, reason) =>
        set((s) =>
          mapC(s, id, (c) => {
            const stages = stagesOf(s, c.projectId)
            const cur = c.rounds[key] ?? emptyRound()
            if (!cur.date && cur.result === 'pending') return c // nothing scheduled yet, nothing to reschedule
            const attempt = { date: cur.date, time: cur.time, interviewer: cur.interviewer, notes: cur.notes, reason, at: today(), result: cur.result === 'pending' ? ('rescheduled' as const) : cur.result }
            const label = stageById(stages, key)?.label ?? 'interview'
            const history = [...(cur.history ?? []), attempt]
            // If the candidate had already been rejected / moved on by this round, bring them back to it.
            const back = c.stage !== key && cur.result !== 'pending' ? key : c.stage
            return {
              ...c,
              stage: back,
              rounds: { ...c.rounds, [key]: { ...emptyRound(), interviewer: cur.interviewer, history } },
              nextStep: `Reschedule ${label} (attempt ${history.length + 1})`,
            }
          }),
        ),
      moveCandidate: (id, stage) =>
        set((s) => mapC(s, id, (c) => ({ ...c, stage, nextStep: stageById(stagesOf(s, c.projectId), stage)?.nextStep ?? c.nextStep }))),
      archiveCandidate: (id, archived) => set((s) => mapC(s, id, (c) => ({ ...c, archived }))),
      deleteCandidate: (id) => set((s) => ({ candidates: s.candidates.filter((c) => c.id !== id) })),

      addTalent: (t) => {
        const talent = newTalent({ name: 'New talent', ...t })
        set((s) => ({ talents: [talent, ...s.talents] }))
        return talent.id
      },
      updateTalent: (id, patch) =>
        set((s) => {
          const shared: Partial<Candidate> = {}
          for (const k of ['name', 'email', 'phone'] as const) if (k in patch) shared[k] = patch[k]
          return {
            talents: s.talents.map((t) => (t.id === id ? { ...t, ...patch } : t)),
            candidates: Object.keys(shared).length ? s.candidates.map((c) => (c.talentId === id ? { ...c, ...shared } : c)) : s.candidates,
          }
        }),
      // Project candidates stay; they just lose the link to the pool.
      deleteTalent: (id) =>
        set((s) => ({
          talents: s.talents.filter((t) => t.id !== id),
          candidates: s.candidates.map((c) => (c.talentId === id ? { ...c, talentId: '' } : c)),
        })),
      addTalentsToProject: (projectId, talentIds, positionId, opts) => {
        const s = get()
        const stages = stagesOf(s, projectId)
        const first = stages.find((x) => x.id === opts?.stageId) ?? stages[0]
        const have = new Set(s.candidates.filter((c) => c.projectId === projectId).map((c) => c.talentId))
        const add: Candidate[] = []
        for (const id of talentIds) {
          const t = s.talents.find((x) => x.id === id)
          if (!t || have.has(id)) continue
          add.push({
            ...blankCandidate(projectId, id, first), name: t.name, email: t.email, phone: t.phone, source: t.source,
            salaryMin: t.salaryMin, salaryMax: t.salaryMax, arrangement: t.arrangement, positionId, notes: t.notes,
            nextStep: opts?.nextStep ?? first?.nextStep ?? '',
          })
        }
        set({ candidates: [...add, ...s.candidates] })
        return add.length
      },
      importCandidates: (projectId, records, opts) => {
        const s = get()
        const stages = stagesOf(s, projectId)
        let talents = [...s.talents]
        let candidates = [...s.candidates]
        const positions = [...s.positions]
        const sum: ImportSummary = { added: 0, updated: 0, skipped: 0, newTalents: 0, newPositions: 0 }
        for (const r of records) {
          let t = findTalent(talents, r)
          if (!t) {
            t = newTalent({ name: r.name, email: r.email, phone: r.phone, source: r.source, skills: r.skills, salaryMin: r.salaryMin, salaryMax: r.salaryMax, arrangement: r.arrangement || 'Any', notes: r.notes })
            talents.push(t)
            sum.newTalents++
          } else {
            const cur = t
            talents = talents.map((x) => (x.id === cur.id ? fillTalent(x, { ...r, arrangement: r.arrangement || 'Any' }) : x))
          }
          let positionId = ''
          if (r.positionTitle) {
            let p = positions.find((x) => x.projectId === projectId && x.title.toLowerCase() === r.positionTitle.toLowerCase())
            if (!p && opts.createPositions) {
              p = { id: 'pos-' + nanoid(6), projectId, title: r.positionTitle, department: '', level: 'Mid', headcount: 1, status: 'open', arrangement: 'Any', salaryMin: null, salaryMax: null, description: '', requirements: '', questions: [] }
              positions.push(p)
              sum.newPositions++
            }
            positionId = p?.id ?? ''
          }
          const stage = stages.find((x) => x.id === r.stage) ?? stages[0]
          const rounds: Candidate['rounds'] = {}
          for (const [k, v] of Object.entries(r.rounds)) rounds[k] = { ...emptyRound(), ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)) }
          const existing = candidates.find((c) => c.projectId === projectId && c.talentId === t!.id)
          if (existing) {
            if (opts.onDuplicate === 'skip') { sum.skipped++; continue }
            candidates = candidates.map((c) => c.id !== existing.id ? c : {
              ...c,
              name: r.name || c.name, email: r.email || c.email, phone: r.phone || c.phone, source: r.source || c.source,
              positionId: positionId || c.positionId,
              screeningScore: r.score ?? c.screeningScore,
              screeningResult: r.score == null ? c.screeningResult : r.score >= 65 ? 'pass' : 'fail',
              salaryMin: r.salaryMin ?? c.salaryMin, salaryMax: r.salaryMax ?? c.salaryMax,
              arrangement: r.arrangement || c.arrangement, stage: r.stage || c.stage, nextStep: r.nextStep || c.nextStep,
              owner: r.owner || c.owner, notes: r.notes || c.notes, archived: r.archived || c.archived,
              rounds: { ...c.rounds, ...rounds },
            })
            sum.updated++
            continue
          }
          candidates.unshift({
            ...blankCandidate(projectId, t.id, stage), name: r.name, email: r.email, phone: r.phone, source: r.source || 'Import',
            positionId, screeningScore: r.score, screeningResult: r.score == null ? 'pending' : r.score >= 65 ? 'pass' : 'fail',
            salaryMin: r.salaryMin, salaryMax: r.salaryMax, arrangement: r.arrangement || 'Any',
            nextStep: r.nextStep || stage?.nextStep || '', owner: r.owner || 'Sari', appliedAt: r.appliedAt || today(),
            archived: r.archived, notes: r.notes, rounds,
          })
          sum.added++
        }
        set({ talents, candidates, positions })
        return sum
      },
      importTalents: (records) => {
        let talents = [...get().talents]
        const sum: ImportSummary = { added: 0, updated: 0, skipped: 0, newTalents: 0, newPositions: 0 }
        for (const r of records) {
          const t = findTalent(talents, r)
          if (t) {
            talents = talents.map((x) => (x.id === t.id ? { ...fillTalent(x, { ...r, arrangement: r.arrangement || 'Any' }), notes: x.notes || r.notes } : x))
            sum.updated++
          } else {
            talents.unshift(newTalent({ name: r.name, email: r.email, phone: r.phone, source: r.source, skills: r.skills, salaryMin: r.salaryMin, salaryMax: r.salaryMax, arrangement: r.arrangement || 'Any', notes: r.notes }))
            sum.added++
            sum.newTalents++
          }
        }
        set({ talents })
        return sum
      },

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
      addUser: (u) => set((s) => ({ users: [...s.users, u] })),
      deleteUser: (id) => set((s) => ({ users: s.users.filter((u) => u.id !== id) })),
      updateUser: (id, patch) => set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),

      addShare: (sh) => {
        const id = nanoid(10)
        set((s) => ({ shares: [...s.shares, { ...sh, id, createdAt: today(), views: 0 }] }))
        return id
      },
      updateShare: (id, patch) => set((s) => ({ shares: s.shares.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteShare: (id) => set((s) => ({ shares: s.shares.filter((x) => x.id !== id) })),
      bumpShare: (id) => set((s) => ({ shares: s.shares.map((x) => (x.id === id ? { ...x, views: x.views + 1 } : x)) })),
      // Keep whoever is signed in; registered users are re-added so nobody gets locked out.
      reset: () => set((s) => ({ ...seed(), currentUserId: s.currentUserId, users: [...USERS, ...s.users.filter((u) => !USERS.some((d) => d.id === u.id))] })),
    }),
    { name: 'hiring-pipeline-v8' },
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
