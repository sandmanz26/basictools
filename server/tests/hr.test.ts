import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '../src/db/schema.js'
import { createPasswordHasher } from '../src/lib/password.js'
import { PASSWORD, adminLogin, createEnv, json, login, userWithRole, type Session, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Session
let projectId: string
let positionId: string

beforeAll(async () => {
  env = await createEnv()
  admin = await adminLogin(env)
  const p = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Eng Q4' })
  projectId = p.body.id
  const pos = await json<{ id: string }>(env, 'POST', `/projects/${projectId}/positions`, admin, { title: 'Backend', salaryMin: 20_000_000, salaryMax: 30_000_000 })
  positionId = pos.body.id
})
afterAll(async () => { await env.close() })

type Cand = { id: string; stage: string; nextStep: string; salaryMin: number | null; talentId: string | null; rounds: Record<string, { result: string; date: string; history?: { reason: string; result: string }[] }>; name: string; email: string }

const addCandidate = async (name: string, extra: Record<string, unknown> = {}) => {
  const r = await json<Cand>(env, 'POST', `/projects/${projectId}/candidates`, admin, { name, email: `${name.toLowerCase()}@x.id`, positionId, salaryMin: 15_000_000, salaryMax: 18_000_000, ...extra })
  expect(r.status).toBe(201)
  return r.body
}

describe('projects and positions', () => {
  it('creates a project with the default HR and PM stages', async () => {
    const r = await json<{ stages: { id: string }[]; pmStages: { id: string }[]; info: { health: string } }>(env, 'GET', `/projects/${projectId}`, admin)
    expect(r.body.stages.map((s) => s.id)).toEqual(['applied', 'screening', 'hr', 'tech', 'user', 'offer', 'hired', 'rejected'])
    expect(r.body.pmStages).toHaveLength(5)
    expect(r.body.info.health).toBe('on_track')
  })

  it('archives instead of deleting and lists by status', async () => {
    const p = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Old' })
    await json(env, 'PATCH', `/projects/${p.body.id}`, admin, { status: 'archived' })
    const archived = await json<{ data: { id: string }[] }>(env, 'GET', '/projects?status=archived', admin)
    expect(archived.body.data.map((x) => x.id)).toContain(p.body.id)
  })

  it('PATCH leaves untouched fields alone (no default clobbering)', async () => {
    const before = await json<{ department: string; headcount: number }>(env, 'PATCH', `/positions/${positionId}`, admin, { department: 'Eng', headcount: 3 })
    expect(before.body.headcount).toBe(3)
    const after = await json<{ department: string; headcount: number; salaryMin: number }>(env, 'PATCH', `/positions/${positionId}`, admin, { title: 'Senior Backend' })
    expect(after.body).toMatchObject({ department: 'Eng', headcount: 3, salaryMin: 20_000_000 })
  })

  it('removing a stage moves its candidates', async () => {
    const p = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Stage test' })
    const c = await json<Cand>(env, 'POST', `/projects/${p.body.id}/candidates`, admin, { name: 'Stagey', stage: 'screening' })
    const bad = await json(env, 'DELETE', `/projects/${p.body.id}/stages/screening?moveTo=nope`, admin)
    expect(bad.status).toBe(400)
    const ok = await json<{ stages: { id: string }[] }>(env, 'DELETE', `/projects/${p.body.id}/stages/screening?moveTo=applied`, admin)
    expect(ok.body.stages.some((s) => s.id === 'screening')).toBe(false)
    const moved = await json<Cand>(env, 'GET', `/candidates/${c.body.id}`, admin)
    expect(moved.body.stage).toBe('applied')
  })
})

describe('talent pool', () => {
  it('adding a candidate creates a pool entry and reuses it by email', async () => {
    const c = await addCandidate('Rani')
    expect(c.talentId).toBeTruthy()
    const p2 = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Second' })
    const again = await json<Cand>(env, 'POST', `/projects/${p2.body.id}/candidates`, admin, { name: 'Rani', email: 'RANI@x.id' })
    expect(again.body.talentId).toBe(c.talentId)
    const dup = await json<{ error: { code: string } }>(env, 'POST', `/projects/${p2.body.id}/candidates`, admin, { name: 'Rani', email: 'rani@x.id' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('DUPLICATE_CANDIDATE')
  })

  it('bulk import dedupes by email, phone and name (also inside the batch)', async () => {
    const seedRes = await json(env, 'POST', '/talents', admin, { name: 'Seed Person', email: 'seed@x.id', phone: '+62 811-2222-333' })
    expect(seedRes.status).toBe(201)
    const records = [
      { name: 'Seed Person', email: 'SEED@x.id', skills: 'go' }, // email match -> merge, fills skills
      { name: 'Other Name', phone: '0811 2222 333'.replace(/^0/, '62'), email: '' }, // phone match
      { name: 'Brand New', email: 'new@x.id' },
      { name: 'Brand New', email: 'new@x.id', notes: 'dup in batch' }, // dup of the row above
      { name: 'No Email Dup', email: '' },
      { name: 'no email dup', email: '' }, // same name, neither has email
      { name: 'Fresh', email: 'fresh@x.id' },
    ]
    const r = await json<{ total: number; created: number; merged: number; skipped: number }>(env, 'POST', '/talents/import', admin, { records })
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ total: 7, created: 3, merged: 4, skipped: 0 })
    const list = await json<{ data: { email: string; skills: string; notes: string }[] }>(env, 'GET', '/talents?q=seed', admin)
    expect(list.body.data.find((t) => t.email === 'seed@x.id')?.skills).toBe('go')
    const again = await json<{ created: number; skipped: number }>(env, 'POST', '/talents/import', admin, { records, onDuplicate: 'skip' })
    expect(again.body).toMatchObject({ created: 0, skipped: 7 })
  })

  it('adds talents to a project once', async () => {
    const t = await json<{ id: string }>(env, 'POST', '/talents', admin, { name: 'Pooled', email: 'pooled@x.id' })
    const r1 = await json<{ added: number }>(env, 'POST', `/projects/${projectId}/candidates/from-talents`, admin, { talentIds: [t.body.id], positionId })
    const r2 = await json<{ added: number; skipped: number }>(env, 'POST', `/projects/${projectId}/candidates/from-talents`, admin, { talentIds: [t.body.id], positionId })
    expect(r1.body.added).toBe(1)
    expect(r2.body).toEqual({ added: 0, skipped: 1 })
  })

  it('editing name / email on a candidate updates the pool and sibling candidates', async () => {
    const c = await addCandidate('Mirror')
    const p2 = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Mirror project' })
    const sibling = await json<Cand>(env, 'POST', `/projects/${p2.body.id}/candidates`, admin, { name: 'Mirror', email: 'mirror@x.id' })
    await json(env, 'PATCH', `/candidates/${c.id}`, admin, { email: 'mirror.new@x.id' })
    const s = await json<Cand>(env, 'GET', `/candidates/${sibling.body.id}`, admin)
    expect(s.body.email).toBe('mirror.new@x.id')
    const t = await json<{ email: string }>(env, 'GET', `/talents/${c.talentId}`, admin)
    expect(t.body.email).toBe('mirror.new@x.id')
  })
})

describe('candidate pipeline', () => {
  it('moves stages and takes the default next step of the new stage', async () => {
    const c = await addCandidate('Mover')
    expect(c.stage).toBe('applied')
    const m = await json<Cand>(env, 'POST', `/candidates/${c.id}/move`, admin, { stage: 'hr' })
    expect(m.body).toMatchObject({ stage: 'hr', nextStep: 'Schedule HR interview' })
    expect((await json(env, 'POST', `/candidates/${c.id}/move`, admin, { stage: 'ghost' })).status).toBe(400)
  })

  it('pass advances to the next stage, fail goes to the lost stage', async () => {
    const c = await addCandidate('Result')
    await json(env, 'POST', `/candidates/${c.id}/move`, admin, { stage: 'hr' })
    await json(env, 'PATCH', `/candidates/${c.id}/rounds/hr`, admin, { date: '2026-11-20', time: '10:00', interviewer: 'Sari' })
    const pass = await json<Cand>(env, 'PUT', `/candidates/${c.id}/rounds/hr/result`, admin, { result: 'pass' })
    expect(pass.body.stage).toBe('tech')
    expect(pass.body.rounds.hr).toMatchObject({ result: 'pass', date: '2026-11-20' })
    const fail = await json<Cand>(env, 'PUT', `/candidates/${c.id}/rounds/tech/result`, admin, { result: 'fail' })
    expect(fail.body.stage).toBe('rejected')
    expect(fail.body.nextStep).toBe('Send rejection email')
  })

  it('reschedule keeps the old attempt in history, opens a fresh slot and brings a rejected candidate back', async () => {
    const c = await addCandidate('Resched')
    await json(env, 'POST', `/candidates/${c.id}/move`, admin, { stage: 'hr' })
    expect((await json(env, 'POST', `/candidates/${c.id}/rounds/hr/reschedule`, admin, { reason: 'x' })).status).toBe(409) // nothing scheduled yet
    await json(env, 'PATCH', `/candidates/${c.id}/rounds/hr`, admin, { date: '2026-11-20', time: '10:00', interviewer: 'Sari', notes: 'n' })
    const r1 = await json<Cand>(env, 'POST', `/candidates/${c.id}/rounds/hr/reschedule`, admin, { reason: 'Candidate could not attend' })
    expect(r1.body.rounds.hr).toMatchObject({ date: '', result: 'pending', interviewer: 'Sari' })
    expect(r1.body.rounds.hr?.history).toHaveLength(1)
    expect(r1.body.rounds.hr?.history?.[0]).toMatchObject({ result: 'rescheduled', reason: 'Candidate could not attend' })
    expect(r1.body.nextStep).toBe('Reschedule HR Interview (attempt 2)')

    // second attempt fails, candidate is rejected, then the interview is repeated: they come back to HR round
    await json(env, 'PATCH', `/candidates/${c.id}/rounds/hr`, admin, { date: '2026-11-25', time: '11:00' })
    await json(env, 'PUT', `/candidates/${c.id}/rounds/hr/result`, admin, { result: 'fail' })
    const r2 = await json<Cand>(env, 'POST', `/candidates/${c.id}/rounds/hr/reschedule`, admin, { reason: 'Interviewer unavailable' })
    expect(r2.body.stage).toBe('hr')
    expect(r2.body.rounds.hr?.history).toHaveLength(2)
    expect(r2.body.rounds.hr?.history?.[1]?.result).toBe('fail')
    expect(r2.body.nextStep).toBe('Reschedule HR Interview (attempt 3)')
  })

  it('archives, filters and deletes', async () => {
    const c = await addCandidate('Archie')
    await json(env, 'POST', `/candidates/${c.id}/archive`, admin, { archived: true })
    const active = await json<{ data: { id: string }[] }>(env, 'GET', `/projects/${projectId}/candidates?q=archie`, admin)
    expect(active.body.data).toHaveLength(0)
    const all = await json<{ data: { id: string }[] }>(env, 'GET', `/projects/${projectId}/candidates?q=archie&archived=all`, admin)
    expect(all.body.data).toHaveLength(1)
    expect((await json(env, 'DELETE', `/candidates/${c.id}`, admin)).status).toBe(200)
    expect((await json(env, 'GET', `/candidates/${c.id}`, admin)).status).toBe(404)
  })

  it('paginates', async () => {
    const r = await json<{ data: unknown[]; meta: { total: number; pageSize: number } }>(env, 'GET', `/projects/${projectId}/candidates?pageSize=2&archived=all`, admin)
    expect(r.body.data).toHaveLength(2)
    expect(r.body.meta.total).toBeGreaterThan(2)
  })
})

describe('salary visibility', () => {
  it('strips salary unless the role has salary.view', async () => {
    const c = await addCandidate('Salaried')
    const hr = await userWithRole(env, 'hr') // HR has salary.view
    const viewer = await userWithRole(env, 'viewer') // does not
    const hm = await userWithRole(env, 'hm') // has it

    const asHr = await json<Cand>(env, 'GET', `/candidates/${c.id}`, hr)
    expect(asHr.body.salaryMin).toBe(15_000_000)
    const asViewer = await json<Cand & { salaryMax: number | null }>(env, 'GET', `/candidates/${c.id}`, viewer)
    expect(asViewer.body.salaryMin).toBeNull()
    expect(asViewer.body.salaryMax).toBeNull()
    expect((await json<Cand>(env, 'GET', `/candidates/${c.id}`, hm)).body.salaryMin).toBe(15_000_000)

    const list = await json<{ data: Cand[] }>(env, 'GET', `/projects/${projectId}/candidates`, viewer)
    expect(list.body.data.every((x) => x.salaryMin === null)).toBe(true)
    const pos = await json<{ salaryMin: number | null }>(env, 'GET', `/positions/${positionId}`, viewer)
    expect(pos.body.salaryMin).toBeNull()
    const tal = await json<{ data: { salaryMin: number | null }[] }>(env, 'GET', '/talents', viewer)
    expect(tal.body.data.every((x) => x.salaryMin === null)).toBe(true)
    // raw body never contains the number
    const raw = await env.app.inject({ method: 'GET', url: `/api/v1/candidates/${c.id}`, headers: viewer.auth })
    expect(raw.body).not.toContain('15000000')
  })

  it('a user without salary.view cannot overwrite salary', async () => {
    const c = await addCandidate('Guarded')
    // custom role: can edit candidates, no salary access
    const role = await json<{ id: string }>(env, 'POST', '/roles', admin, { name: 'Editor no salary', permissions: { 'module.hr': true, 'candidates.edit': true } })
    const hasher = createPasswordHasher(env.config)
    await env.db.insert(users).values({ name: 'Ed', email: 'ed@test.id', passwordHash: await hasher.hash(PASSWORD), roleId: role.body.id, status: 'active' })
    const ed = await login(env, 'ed@test.id')
    const patched = await json<Cand>(env, 'PATCH', `/candidates/${c.id}`, ed, { salaryMin: 1, notes: 'changed' })
    expect(patched.status).toBe(200)
    const check = await json<Cand & { notes: string }>(env, 'GET', `/candidates/${c.id}`, admin)
    expect(check.body.salaryMin).toBe(15_000_000)
    expect(check.body.notes).toBe('changed')
  })

  it('hides answer keys from people who cannot edit tests', async () => {
    await json(env, 'PUT', `/positions/${positionId}/questions`, admin, { questions: [{ text: 'Explain CAP', answerKey: 'secret' }] })
    const viewer = await userWithRole(env, 'viewer')
    const v = await json<{ questions: { answerKey: string }[] }>(env, 'GET', `/positions/${positionId}`, viewer)
    expect(v.body.questions[0]?.answerKey).toBe('')
    const a = await json<{ questions: { answerKey: string }[] }>(env, 'GET', `/positions/${positionId}`, admin)
    expect(a.body.questions[0]?.answerKey).toBe('secret')
  })
})
