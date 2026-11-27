// Projects + HR (positions, talents, candidates) over the API: shape mappers, the write queue and the push functions.
// The store updates itself first (instant screen); these functions save the same change on the server.
// Ids are UUIDs made in the browser (the server keeps them), so nothing has to be renamed afterwards.
import type { Candidate, Position, Project, StatusDef, Talent, TestQuestion } from '@/types'
import { del, get, patch, post, put } from './client'
import { reportSyncError } from './status'

type Rec = Record<string, unknown>
interface Page<T> { data: T[]; meta: { page: number; pageSize: number; total: number } }

export const newId = () => crypto.randomUUID()

// ---------- shape mappers (server -> store). Empty dates and ids are null on the server and '' in the store ----------
export const toProject = (p: Rec): Project => ({
  id: p.id as string, name: p.name as string, description: p.description as string, status: p.status as Project['status'],
  createdAt: String(p.createdAt).slice(0, 10), stages: p.stages as Project['stages'], pmStages: p.pmStages as Project['pmStages'],
  info: p.info as Project['info'], pmFeatures: p.pmFeatures as Project['pmFeatures'], pmFields: (p.pmFields ?? undefined) as Project['pmFields'],
})
export const toPosition = (p: Rec): Position => ({
  id: p.id as string, projectId: p.projectId as string, title: p.title as string, department: p.department as string, level: p.level as string,
  headcount: p.headcount as number, status: p.status as Position['status'], arrangement: p.arrangement as Position['arrangement'],
  salaryMin: (p.salaryMin ?? null) as number | null, salaryMax: (p.salaryMax ?? null) as number | null,
  description: p.description as string, requirements: p.requirements as string,
  questions: p.questions as TestQuestion[], testFiles: p.testFiles as Position['testFiles'], formLinks: p.formLinks as Position['formLinks'],
})
export const toTalent = (t: Rec): Talent => ({
  id: t.id as string, name: t.name as string, email: t.email as string, phone: t.phone as string, source: t.source as string,
  skills: t.skills as string, portfolio: (t.portfolio as string) || undefined, salaryMin: (t.salaryMin ?? null) as number | null,
  salaryMax: (t.salaryMax ?? null) as number | null, arrangement: t.arrangement as Talent['arrangement'], notes: t.notes as string,
  createdAt: String(t.createdAt).slice(0, 10),
})
export const toCandidate = (c: Rec): Candidate => ({
  id: c.id as string, projectId: c.projectId as string, talentId: (c.talentId as string | null) ?? '', name: c.name as string,
  email: c.email as string, phone: c.phone as string, positionId: (c.positionId as string | null) ?? '', source: c.source as string,
  screeningScore: (c.screeningScore ?? null) as number | null, screeningResult: c.screeningResult as Candidate['screeningResult'],
  salaryMin: (c.salaryMin ?? null) as number | null, salaryMax: (c.salaryMax ?? null) as number | null, archived: c.archived as boolean,
  arrangement: c.arrangement as Candidate['arrangement'], stage: c.stage as string, nextStep: c.nextStep as string, owner: c.owner as string,
  appliedAt: c.appliedAt as string, rounds: c.rounds as Candidate['rounds'], rejectReason: c.rejectReason as string, notes: c.notes as string,
})

const pick = (o: Rec, keys: readonly string[]): Rec => {
  const out: Rec = {}
  for (const k of keys) if (k in o) out[k] = o[k]
  return out
}
const nullIfEmpty = (o: Rec, keys: readonly string[]): Rec => {
  const out = { ...o }
  for (const k of keys) if (k in out && out[k] === '') out[k] = null
  return out
}

// ---------- write queue: every save runs in order (a candidate is never saved before its project); quick edits to one record are merged ----------
let chain: Promise<unknown> = Promise.resolve()
const pending = new Map<string, { entity: string; patch: Rec; timer: ReturnType<typeof setTimeout>; send: (p: Rec) => Promise<unknown> }>()

const run = (fn: () => Promise<unknown>) => {
  const next = chain.then(fn).catch(reportSyncError)
  chain = next
  return next
}
export function enqueue(entity: string, fn: () => Promise<unknown>): Promise<unknown> {
  flushEntity(entity)
  return run(fn)
}

function flush(key: string) {
  const p = pending.get(key)
  if (!p) return
  clearTimeout(p.timer)
  pending.delete(key)
  void run(() => p.send(p.patch))
}
function flushEntity(entity: string) { for (const [k, v] of [...pending]) if (v.entity === entity) flush(k) }
export function flushAll() { for (const k of [...pending.keys()]) flush(k) }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll() })
}

const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Merge rapid edits of one record (typing) into one request. */
function debounced(entity: string, kind: string, patchObj: Rec, send: (p: Rec) => Promise<unknown>) {
  const key = `${entity}|${kind}`
  const cur = pending.get(key)
  if (cur) clearTimeout(cur.timer)
  const merged: Rec = { ...(cur?.patch ?? {}) }
  // Nested objects (info, pmFeatures, ...) merge one level so two quick edits of different fields both survive.
  for (const [k, v] of Object.entries(patchObj)) merged[k] = isObj(v) && isObj(merged[k]) ? { ...(merged[k] as Rec), ...v } : v
  pending.set(key, { entity, patch: merged, send, timer: setTimeout(() => flush(key), 600) })
}

/** Run jobs with a small concurrency limit (bulk imports). */
async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<unknown>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) { const x = items[i++]; if (x !== undefined) await fn(x) } }))
}

// ---------- reading ----------
async function listAll<T>(path: string, pageSize: number, extra: Rec = {}): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; ; page++) {
    const r = await get<Page<T>>(path, { page, pageSize, ...extra } as Record<string, string | number>)
    out.push(...r.data)
    if (out.length >= r.meta.total || r.data.length === 0) return out
  }
}
export const fetchProjects = async () => (await listAll<Rec>('/projects', 200)).map(toProject)
export const fetchPositions = async (projectId: string) => (await listAll<Rec>(`/projects/${projectId}/positions`, 200)).map(toPosition)
export const fetchCandidates = async (projectId: string) => (await listAll<Rec>(`/projects/${projectId}/candidates`, 500, { archived: 'all' })).map(toCandidate)
export const fetchTalents = async () => (await listAll<Rec>('/talents', 200)).map(toTalent)
export const fetchStatuses = async () => (await get<{ statuses: StatusDef[] }>('/settings/project-statuses')).statuses

// ---------- writing ----------
const PROJECT_FIELDS = ['name', 'description', 'status'] as const
export const pushProject = {
  create: (p: Project) => enqueue(p.id, () => post('/projects', { id: p.id, name: p.name, description: p.description, stages: p.stages, pmStages: p.pmStages, info: p.info, pmFeatures: p.pmFeatures, pmFields: p.pmFields ?? null })),
  /** name, description, status, stages, pmStages, info, pmFeatures, pmFields: only keys present in `body` are sent. */
  update: (id: string, body: Rec) => debounced(id, 'project', body, (b) => patch(`/projects/${id}`, b)),
  fields: (id: string, p: Partial<Project>) => pushProject.update(id, { ...pick(p as Rec, PROJECT_FIELDS), ...pick(p as Rec, ['stages', 'pmStages', 'info', 'pmFeatures']), ...('pmFields' in p ? { pmFields: p.pmFields ?? null } : {}) }),
  remove: (id: string) => enqueue(id, () => del(`/projects/${id}`)),
  removeStage: (id: string, stageId: string, moveTo: string) => enqueue(id, () => del(`/projects/${id}/stages/${encodeURIComponent(stageId)}?moveTo=${encodeURIComponent(moveTo)}`)),
  removePmStage: (id: string, stageId: string, moveTo: string) => enqueue(id, () => del(`/projects/${id}/pm-stages/${encodeURIComponent(stageId)}?moveTo=${encodeURIComponent(moveTo)}`)),
  setStatuses: (list: StatusDef[]) => enqueue('settings:statuses', () => put('/settings/project-statuses', { statuses: list })),
  remapStatus: (from: string, to: string) => enqueue('settings:statuses', () => post('/settings/project-statuses/remap', { from, to })),
}

const POSITION_FIELDS = ['title', 'department', 'level', 'headcount', 'status', 'arrangement', 'salaryMin', 'salaryMax', 'description', 'requirements', 'testFiles', 'formLinks'] as const
const positionBody = (p: Position) => ({ id: p.id, ...pick(p as unknown as Rec, POSITION_FIELDS) })
const questionsBody = (qs: TestQuestion[]) => ({ questions: qs.map((q) => ({ text: q.text, type: q.type, weight: q.weight, answerKey: q.answerKey })) })
export const pushPosition = {
  create: (p: Position) => enqueue(p.id, async () => {
    await post(`/projects/${p.projectId}/positions`, positionBody(p))
    if (p.questions.length) await put(`/positions/${p.id}/questions`, questionsBody(p.questions))
  }),
  update: (id: string, p: Partial<Position>) => debounced(id, 'position', pick(p as Rec, POSITION_FIELDS), (b) => patch(`/positions/${id}`, b)),
  remove: (id: string) => enqueue(id, () => del(`/positions/${id}`)),
  /** Replaces the whole question list; the server assigns new question ids, which `apply` writes back. */
  questions: (id: string, qs: TestQuestion[], apply: (p: Position) => void) => enqueue(id, async () => apply(toPosition(await put<Rec>(`/positions/${id}/questions`, questionsBody(qs))))),
}

const TALENT_FIELDS = ['name', 'email', 'phone', 'source', 'skills', 'portfolio', 'salaryMin', 'salaryMax', 'arrangement', 'notes'] as const
export const pushTalent = {
  create: (t: Talent) => enqueue(t.id, () => post('/talents', { id: t.id, ...pick(t as unknown as Rec, TALENT_FIELDS), portfolio: t.portfolio ?? '' })),
  update: (id: string, t: Partial<Talent>) => debounced(id, 'talent', pick(t as Rec, TALENT_FIELDS), (b) => patch(`/talents/${id}`, b)),
  remove: (id: string) => enqueue(id, () => del(`/talents/${id}`)),
}

const CANDIDATE_FIELDS = ['name', 'email', 'phone', 'positionId', 'source', 'screeningScore', 'screeningResult', 'salaryMin', 'salaryMax', 'arrangement', 'owner', 'appliedAt', 'rejectReason', 'notes', 'archived', 'nextStep'] as const
const candidateCreateBody = (c: Candidate) => ({
  id: c.id, ...(c.talentId ? { talentId: c.talentId } : {}),
  ...nullIfEmpty(pick(c as unknown as Rec, [...CANDIDATE_FIELDS, 'stage', 'rounds']), ['positionId']),
})
export const pushCandidate = {
  create: (c: Candidate) => enqueue(c.id, () => post(`/projects/${c.projectId}/candidates`, candidateCreateBody(c))),
  update: (id: string, c: Partial<Candidate>, moveTo?: string) => {
    const body = nullIfEmpty(pick(c as Rec, CANDIDATE_FIELDS), ['positionId'])
    if (Object.keys(body).length) debounced(id, 'candidate', body, (b) => patch(`/candidates/${id}`, b))
    if (moveTo) void enqueue(id, () => post(`/candidates/${id}/move`, { stage: moveTo }))
  },
  move: (id: string, stage: string, apply: (c: Candidate) => void) => enqueue(id, async () => apply(toCandidate(await post<Rec>(`/candidates/${id}/move`, { stage })))),
  archive: (id: string, archived: boolean) => enqueue(id, () => post(`/candidates/${id}/archive`, { archived })),
  remove: (id: string) => enqueue(id, () => del(`/candidates/${id}`)),
  round: (id: string, key: string, r: Rec) => debounced(id, `round:${key}`, pick(r, ['date', 'time', 'interviewer', 'notes']), (b) => (Object.keys(b).length ? patch(`/candidates/${id}/rounds/${encodeURIComponent(key)}`, b) : Promise.resolve())),
  result: (id: string, key: string, result: string, apply: (c: Candidate) => void) => enqueue(id, async () => apply(toCandidate(await put<Rec>(`/candidates/${id}/rounds/${encodeURIComponent(key)}/result`, { result })))),
  reschedule: (id: string, key: string, reason: string, apply: (c: Candidate) => void) => enqueue(id, async () => apply(toCandidate(await post<Rec>(`/candidates/${id}/rounds/${encodeURIComponent(key)}/reschedule`, { reason })))),
  /** Pool entries -> project candidates (server skips people already in the project). Refetch afterwards to get the rows. */
  fromTalents: (projectId: string, talentIds: string[], positionId: string, opts: { stageId?: string; nextStep?: string } | undefined, done: () => void) =>
    enqueue('project-candidates:' + projectId, async () => {
      for (let i = 0; i < talentIds.length; i += 1000) await post(`/projects/${projectId}/candidates/from-talents`, { talentIds: talentIds.slice(i, i + 1000), positionId: positionId || null, ...opts })
      done()
    }),
}

/** Bulk import: create new positions, then talents, then candidates (a few at a time), then let the caller refetch. */
export async function pushImport(job: { positions: Position[]; talents: { create: Talent[]; update: Talent[] }; candidates: { create: Candidate[]; update: Candidate[]; before: Map<string, Candidate> } }, done: () => void) {
  await enqueue('import', async () => {
    for (const p of job.positions) await pushPosition.create(p)
    await pool(job.talents.create, 6, (t) => post('/talents', { id: t.id, ...pick(t as unknown as Rec, TALENT_FIELDS), portfolio: t.portfolio ?? '' }))
    await pool(job.talents.update, 6, (t) => patch(`/talents/${t.id}`, pick(t as unknown as Rec, TALENT_FIELDS)))
    await pool(job.candidates.create, 6, (c) => post(`/projects/${c.projectId}/candidates`, candidateCreateBody(c)))
    await pool(job.candidates.update, 6, async (c) => {
      const before = job.candidates.before.get(c.id)
      await patch(`/candidates/${c.id}`, nullIfEmpty(pick(c as unknown as Rec, CANDIDATE_FIELDS), ['positionId']))
      if (before && before.stage !== c.stage) await post(`/candidates/${c.id}/move`, { stage: c.stage })
      for (const [key, r] of Object.entries(c.rounds)) {
        const prev = before?.rounds[key]
        if (JSON.stringify(prev) === JSON.stringify(r)) continue
        await patch(`/candidates/${c.id}/rounds/${encodeURIComponent(key)}`, pick(r as unknown as Rec, ['date', 'time', 'interviewer', 'notes']))
        if (r.result !== (prev?.result ?? 'pending')) await put(`/candidates/${c.id}/rounds/${encodeURIComponent(key)}/result`, { result: r.result })
      }
    })
    done()
  })
}
