import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminLogin, createEnv, json, type Session, type TestEnv } from './helpers.js'

let env: TestEnv
let admin: Session
beforeAll(async () => { env = await createEnv(); admin = await adminLogin(env) })
afterAll(async () => { await env.close() })

describe('client-generated ids (the web app creates records before the server answers)', () => {
  it('keeps the ids the browser sends for project, position, talent and candidate', async () => {
    const projectId = randomUUID()
    const positionId = randomUUID()
    const talentId = randomUUID()
    const candidateId = randomUUID()

    const p = await json<{ id: string }>(env, 'POST', '/projects', admin, { id: projectId, name: 'Client ids' })
    expect(p.status).toBe(201)
    expect(p.body.id).toBe(projectId)

    const pos = await json<{ id: string }>(env, 'POST', `/projects/${projectId}/positions`, admin, { id: positionId, title: 'Backend' })
    expect(pos.body.id).toBe(positionId)

    const t = await json<{ id: string }>(env, 'POST', '/talents', admin, { id: talentId, name: 'Pool Person', email: 'pool@x.id' })
    expect(t.body.id).toBe(talentId)

    const c = await json<{ id: string; talentId: string | null }>(env, 'POST', `/projects/${projectId}/candidates`, admin, { id: candidateId, talentId: randomUUID(), name: 'New Person', email: 'new@x.id', positionId })
    expect(c.status).toBe(201)
    expect(c.body.id).toBe(candidateId)
    expect(c.body.talentId).not.toBeNull()
  })

  it('an explicit talentId never matches by name: two blank "New candidate" rows can coexist', async () => {
    const projectId = randomUUID()
    await json(env, 'POST', '/projects', admin, { id: projectId, name: 'Blank rows' })
    const t1 = randomUUID()
    const t2 = randomUUID()
    const a = await json<{ talentId: string | null }>(env, 'POST', `/projects/${projectId}/candidates`, admin, { talentId: t1, name: 'New candidate' })
    const b = await json<{ talentId: string | null }>(env, 'POST', `/projects/${projectId}/candidates`, admin, { talentId: t2, name: 'New candidate' })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    expect([a.body.talentId, b.body.talentId]).toEqual([t1, t2])
  })

  it('an explicit talentId of an existing pool entry links to it', async () => {
    const projectId = randomUUID()
    await json(env, 'POST', '/projects', admin, { id: projectId, name: 'Link' })
    const existing = await json<{ id: string }>(env, 'POST', '/talents', admin, { name: 'Pool Linked', email: 'linked@x.id' })
    const c = await json<{ talentId: string | null }>(env, 'POST', `/projects/${projectId}/candidates`, admin, { talentId: existing.body.id, name: 'Pool Linked', email: 'linked@x.id' })
    expect(c.body.talentId).toBe(existing.body.id)
  })

  it('rejects an id that is not a UUID', async () => {
    const r = await json(env, 'POST', '/projects', admin, { id: 'p1', name: 'Bad' })
    expect(r.status).toBe(400)
  })
})

describe('candidate create with rounds and archived (used by the web app import)', () => {
  it('stores rounds and the archived flag sent on create', async () => {
    const projectId = randomUUID()
    await json(env, 'POST', '/projects', admin, { id: projectId, name: 'Import' })
    const c = await json<{ archived: boolean; rounds: Record<string, { interviewer: string; result: string }> }>(env, 'POST', `/projects/${projectId}/candidates`, admin, {
      name: 'Imported One', email: 'imp1@x.id', archived: true, rounds: { tech: { interviewer: 'Budi', result: 'pass' } },
    })
    expect(c.status).toBe(201)
    expect(c.body.archived).toBe(true)
    expect(c.body.rounds.tech?.interviewer).toBe('Budi')
  })
})
