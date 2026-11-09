import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadConfig } from '../src/config.js'
import { DEFAULT_HR_STAGES } from '../src/domain/defaults.js'
import { DEFAULT_ROLES, PERMISSIONS } from '../src/domain/permissions.js'
import { auditLog, roles, shareLinks, users } from '../src/db/schema.js'
import { createPasswordHasher } from '../src/lib/password.js'
import { patchOf } from '../src/lib/schemas.js'
import { TalentIndex } from '../src/lib/talent.js'
import { applyReschedule, applyRoundResult } from '../src/modules/candidates/logic.js'
import { PASSWORD, adminLogin, createEnv, json, login, userWithRole, type Session, type TestEnv } from './helpers.js'

describe('config', () => {
  const ok = { DATABASE_URL: 'postgres://x', JWT_ACCESS_SECRET: 'a'.repeat(32), UNSUBSCRIBE_SECRET: 'b'.repeat(32) }
  it('fails fast and lists every problem', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*UNSUBSCRIBE_SECRET/)
    expect(() => loadConfig({ ...ok, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/)
  })
  it('refuses unsafe production settings', () => {
    expect(() => loadConfig({ ...ok, NODE_ENV: 'production' })).toThrow(/CORS_ORIGINS[\s\S]*MAIL_PROVIDER/)
    expect(() => loadConfig({ ...ok, NODE_ENV: 'production', COOKIE_SECURE: 'false', CORS_ORIGINS: 'https://a.id', MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h' })).toThrow(/COOKIE_SECURE/)
    expect(() => loadConfig({ ...ok, NODE_ENV: 'production', JWT_ACCESS_SECRET: 'change-me'.padEnd(40, 'x'), CORS_ORIGINS: 'https://a.id', MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h' })).toThrow(/replace the example secrets/)
    expect(loadConfig({ ...ok, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.id, https://b.id', MAIL_PROVIDER: 'smtp', SMTP_HOST: 'h' }).CORS_ORIGINS).toEqual(['https://a.id', 'https://b.id'])
  })
  it('validates provider settings, windows and time zones', () => {
    expect(() => loadConfig({ ...ok, MAIL_PROVIDER: 'graph' })).toThrow(/GRAPH_/)
    expect(() => loadConfig({ ...ok, BROADCAST_TZ: 'Mars/Base' })).toThrow(/time zone/)
    expect(() => loadConfig({ ...ok, BROADCAST_WINDOW_START_HOUR: '18', BROADCAST_WINDOW_END_HOUR: '9' })).toThrow(/greater than/)
  })
})

describe('seed defaults mirror the frontend roles', () => {
  it('has the six roles and only known permissions', () => {
    expect(DEFAULT_ROLES.map((r) => r.key)).toEqual(['admin', 'hr', 'pm', 'hm', 'mkt', 'viewer'])
    for (const r of DEFAULT_ROLES) expect(Object.keys(r.permissions).sort()).toEqual([...PERMISSIONS].sort())
    const on = (k: string) => Object.entries(DEFAULT_ROLES.find((r) => r.key === k)?.permissions ?? {}).filter(([, v]) => v).map(([p]) => p).sort()
    expect(on('admin')).toHaveLength(PERMISSIONS.length)
    expect(on('viewer')).toEqual(['module.hr', 'module.pm'])
    expect(on('mkt')).toEqual(['mkt.edit', 'mkt.send', 'module.mkt'])
    expect(on('hr')).not.toContain('roles.manage')
    expect(on('hr')).toContain('salary.view')
  })
})

describe('pure logic', () => {
  it('TalentIndex follows the frontend findTalent rules', () => {
    const idx = new TalentIndex([
      { id: '1', name: 'Ana', email: 'ana@x.id', phone: '' },
      { id: '2', name: 'Budi', email: '', phone: '+62 812-3456-7890' },
      { id: '3', name: 'Cici', email: '', phone: '' },
    ])
    expect(idx.find({ name: 'x', email: ' ANA@x.id ', phone: '' })?.id).toBe('1')
    expect(idx.find({ name: 'x', email: '', phone: '0812' })).toBeUndefined() // under 6 digits is not a match
    expect(idx.find({ name: 'x', email: '', phone: '628123456 7890' })?.id).toBe('2')
    expect(idx.find({ name: 'cici', email: '', phone: '' })?.id).toBe('3')
    expect(idx.find({ name: 'cici', email: 'c@x.id', phone: '' })?.id).toBe('3') // pool entry has no email
    expect(idx.find({ name: 'ana', email: 'other@x.id', phone: '' })).toBeUndefined() // both have an email and they differ
  })

  it('patchOf drops defaults so a PATCH never rewrites untouched fields', () => {
    const create = z.object({ a: z.string().default('x'), b: z.number().default(1), c: z.string() })
    expect(create.partial().parse({})).toEqual({ a: 'x', b: 1 }) // the trap
    expect(patchOf(create).parse({})).toEqual({})
    expect(patchOf(create).parse({ b: 5 })).toEqual({ b: 5 })
    expect(() => patchOf(create).parse({ b: 'no' })).toThrow()
  })

  it('round result and reschedule are pure and match the app', () => {
    const stages = DEFAULT_HR_STAGES()
    const base = { stage: 'tech', nextStep: '', rounds: {} }
    expect(applyRoundResult(base, stages, 'tech', 'pass')).toMatchObject({ stage: 'user', nextStep: 'Schedule user interview' })
    expect(applyRoundResult(base, stages, 'hr', 'pass').stage).toBe('tech') // pass on an older round does not move them
    expect(applyRoundResult(base, stages, 'tech', 'no_show').stage).toBe('tech')
    expect(applyRoundResult(base, stages, 'tech', 'fail').stage).toBe('rejected')
    expect(applyReschedule(base, stages, 'tech', 'why', '2026-11-08')).toBeNull()
    const scheduled = { ...base, rounds: { tech: { date: '2026-11-10', time: '09:00', interviewer: 'Budi', result: 'no_show' as const, notes: 'n' } } }
    const r = applyReschedule(scheduled, stages, 'tech', 'Candidate asked to move', '2026-11-08')
    expect(r?.rounds.tech?.history?.[0]).toMatchObject({ result: 'no_show', reason: 'Candidate asked to move', at: '2026-11-08', date: '2026-11-10' })
    expect(r?.rounds.tech).toMatchObject({ date: '', result: 'pending', interviewer: 'Budi' })
  })
})

let env: TestEnv
let admin: Session
beforeAll(async () => { env = await createEnv(); admin = await adminLogin(env) })
afterAll(async () => { await env.close() })

describe('RBAC on every area', () => {
  it('rejects anonymous callers everywhere except the public routes', async () => {
    const spec = (await env.app.inject({ method: 'GET', url: '/docs/json' })).json<{ paths: Record<string, Record<string, { security?: unknown[] }>> }>()
    const open = new Set(['/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password', '/api/v1/public/share/{token}'])
    const uuid = '00000000-0000-4000-8000-000000000000'
    let checked = 0
    for (const [path, methods] of Object.entries(spec.paths)) {
      if (open.has(path)) continue
      for (const method of Object.keys(methods)) {
        const url = path.replace(/\{[^}]+\}/g, uuid).replace(`/occurrences/${uuid}`, '/occurrences/2026-01-01')
        const res = await env.app.inject({ method: method.toUpperCase() as 'GET', url, payload: method === 'get' || method === 'delete' ? undefined : {} })
        expect(res.statusCode, `${method.toUpperCase()} ${path}`).toBe(401)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(80)
  })

  const cases: { role: string; method: 'GET' | 'POST'; url: string; allowed: boolean }[] = [
    { role: 'viewer', method: 'GET', url: '/projects', allowed: true },
    { role: 'viewer', method: 'POST', url: '/projects', allowed: false },
    { role: 'viewer', method: 'GET', url: '/leads', allowed: false },
    { role: 'viewer', method: 'GET', url: '/users', allowed: false },
    { role: 'hr', method: 'GET', url: '/talents', allowed: true },
    { role: 'hr', method: 'GET', url: '/leads', allowed: false },
    { role: 'hr', method: 'GET', url: '/invoices', allowed: false },
    { role: 'hr', method: 'GET', url: '/roles', allowed: false },
    { role: 'pm', method: 'GET', url: '/invoices', allowed: false },
    { role: 'pm', method: 'GET', url: '/talents', allowed: true },
    { role: 'hm', method: 'GET', url: '/talents', allowed: true },
    { role: 'hm', method: 'GET', url: '/leads', allowed: false },
    { role: 'mkt', method: 'GET', url: '/leads', allowed: true },
    { role: 'mkt', method: 'GET', url: '/broadcasts', allowed: true },
    { role: 'mkt', method: 'GET', url: '/talents', allowed: false },
    { role: 'mkt', method: 'GET', url: '/projects', allowed: false },
    { role: 'admin', method: 'GET', url: '/users', allowed: true },
  ]
  for (const c of cases) {
    it(`${c.role} ${c.method} ${c.url} -> ${c.allowed ? 'allowed' : '403'}`, async () => {
      const s = await userWithRole(env, c.role)
      const r = await json(env, c.method, c.url, s, c.method === 'POST' ? {} : undefined)
      if (c.allowed) expect([200, 400, 201]).toContain(r.status)
      else expect(r.status).toBe(403)
    })
  }

  it('editing a role changes access immediately, but the Admin role is locked', async () => {
    const created = await json<{ id: string }>(env, 'POST', '/roles', admin, { name: 'Custom', permissions: { 'module.mkt': true } })
    const [custom] = [created.body]
    const hr = await userWithRole(env, 'hr')
    await env.db.update(users).set({ roleId: custom.id }).where(eq(users.id, hr.userId))
    expect((await json(env, 'GET', '/leads', hr)).status).toBe(200)
    expect((await json(env, 'POST', '/leads', hr, { name: 'x' })).status).toBe(403)
    await json(env, 'PATCH', `/roles/${custom.id}`, admin, { permissions: { 'mkt.edit': true } })
    expect((await json(env, 'POST', '/leads', hr, { name: 'x' })).status).toBe(201)
    const [adminRole] = await env.db.select().from(roles).where(eq(roles.key, 'admin'))
    expect((await json(env, 'PATCH', `/roles/${adminRole?.id}`, admin, { permissions: { 'roles.manage': false } })).status).toBe(403)
    expect((await json(env, 'DELETE', `/roles/${adminRole?.id}`, admin)).status).toBe(403)
    expect((await json(env, 'DELETE', `/roles/${custom.id}`, admin)).status).toBe(409) // still has a user
  })
})

describe('PM collections via the CRUD factory', () => {
  let projectId: string
  beforeAll(async () => { projectId = (await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'PM project' })).body.id })

  it('tasks: create, validate stage and milestone, filter, patch, delete', async () => {
    const pm = await userWithRole(env, 'pm')
    const bad = await json(env, 'POST', `/projects/${projectId}/tasks`, pm, { title: 'T', stage: 'nope' })
    expect(bad.status).toBe(400)
    const ms = await json<{ id: string }>(env, 'POST', `/projects/${projectId}/milestones`, pm, { title: 'Launch', date: '2026-12-01' })
    const t = await json<{ id: string; priority: string; milestoneId: string }>(env, 'POST', `/projects/${projectId}/tasks`, pm, { title: 'Build', stage: 'todo', milestoneId: ms.body.id })
    expect(t.status).toBe(201)
    expect(t.body.priority).toBe('medium')
    const other = await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Other' })
    const foreign = await json(env, 'POST', `/projects/${other.body.id}/tasks`, pm, { title: 'X', stage: 'todo', milestoneId: ms.body.id })
    expect(foreign.status).toBe(400)

    const list = await json<{ data: { id: string }[]; meta: { total: number } }>(env, 'GET', `/projects/${projectId}/tasks?stage=todo&q=bui`, pm)
    expect(list.body.data.map((x) => x.id)).toEqual([t.body.id])
    const patched = await json<{ priority: string; title: string }>(env, 'PATCH', `/tasks/${t.body.id}`, pm, { title: 'Build v2' })
    expect(patched.body).toMatchObject({ title: 'Build v2', priority: 'medium' })
    expect((await json(env, 'PATCH', `/tasks/${t.body.id}`, pm, { stage: 'ghost' })).status).toBe(400)
    expect((await json(env, 'DELETE', `/tasks/${t.body.id}`, pm)).status).toBe(200)
    expect((await json(env, 'GET', `/tasks/${t.body.id}`, pm)).status).toBe(404)
    expect((await json(env, 'POST', `/projects/00000000-0000-4000-8000-000000000000/tasks`, pm, { title: 'x', stage: 'todo' })).status).toBe(404)
  })

  it('read needs module.pm, write needs pm.edit, budget needs pm.edit or pm.invoice', async () => {
    const viewer = await userWithRole(env, 'viewer') // module.pm only
    const hm = await userWithRole(env, 'hm') // no module.pm
    expect((await json(env, 'GET', `/projects/${projectId}/risks`, viewer)).status).toBe(200)
    expect((await json(env, 'POST', `/projects/${projectId}/risks`, viewer, { title: 'r' })).status).toBe(403)
    expect((await json(env, 'GET', `/projects/${projectId}/risks`, hm)).status).toBe(403)
    expect((await json(env, 'GET', `/projects/${projectId}/budget-items`, viewer)).status).toBe(403)
    expect((await json(env, 'GET', `/projects/${projectId}/budget-items`, admin)).status).toBe(200)
  })

  it('validates ranges and writes every collection', async () => {
    expect((await json(env, 'POST', `/projects/${projectId}/risks`, admin, { title: 'r', probability: 9 })).status).toBe(400)
    const calls: [string, object][] = [
      ['risks', { title: 'Vendor slips', probability: 4, impact: 5 }],
      ['members', { name: 'Dewi', allocation: 50, email: 'dewi@x.id' }],
      ['budget-items', { category: 'Cloud', planned: 5_000_000 }],
      ['status-updates', { author: 'Rina', summary: 'ok' }],
      ['milestones', { title: 'Alpha' }],
    ]
    for (const [path, body] of calls) expect((await json(env, 'POST', `/projects/${projectId}/${path}`, admin, body)).status, path).toBe(201)
    const upd = await json<{ data: { date: string }[] }>(env, 'GET', `/projects/${projectId}/status-updates`, admin)
    expect(upd.body.data[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('writes an audit entry for mutations', async () => {
    const rows = await env.db.select().from(auditLog).where(eq(auditLog.action, 'task.create'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.actorId).toBeTruthy()
    expect(rows[0]?.requestId).toBeTruthy()
  })
})

describe('marketing', () => {
  it('leads: stage validated against the marketing pipeline, import dedupes by email', async () => {
    const mkt = await userWithRole(env, 'mkt')
    expect((await json(env, 'POST', '/leads', mkt, { name: 'A', stage: 'nowhere' })).status).toBe(400)
    expect((await json(env, 'POST', '/leads', mkt, { name: 'A', stage: 'qualified', email: 'A@co.id' })).status).toBe(201)
    const r = await json<{ created: number; skipped: number }>(env, 'POST', '/leads/import', mkt, {
      records: [{ name: 'A again', email: 'a@co.id' }, { name: 'B', email: 'b@co.id' }, { name: 'B2', email: 'B@co.id' }, { name: 'No mail' }],
    })
    expect(r.body).toMatchObject({ created: 2, skipped: 2 })
    const first = await json<{ data: { stage: string; source: string }[] }>(env, 'GET', '/leads?q=b@co.id', mkt)
    expect(first.body.data[0]).toMatchObject({ stage: 'new', source: 'Import' })
  })

  it('templates and custom columns are plain CRUD', async () => {
    const mkt = await userWithRole(env, 'mkt')
    const t = await json<{ id: string }>(env, 'POST', '/email-templates', mkt, { name: 'Intro', subject: 'Hi {{firstName}}', body: 'Hello' })
    expect(t.status).toBe(201)
    expect((await json(env, 'POST', '/lead-columns', mkt, { label: 'Industry', type: 'select', options: 'Tech,Retail' })).status).toBe(201)
    const stages = await json<{ stages: { id: string }[] }>(env, 'GET', '/settings/mkt-stages', mkt)
    expect(stages.body.stages[0]?.id).toBe('new')
    const hr = await userWithRole(env, 'hr')
    expect((await json(env, 'POST', '/email-templates', hr, { name: 'x' })).status).toBe(403)
  })
})

describe('share links', () => {
  let projectId: string
  let positionId: string
  const SECRET = 'link-pass-9'
  type ShareOut = { id: string; token: string; hasPassword: boolean }

  beforeAll(async () => {
    projectId = (await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'Shared' })).body.id
    positionId = (await json<{ id: string }>(env, 'POST', `/projects/${projectId}/positions`, admin, { title: 'Dev', salaryMin: 9_000_000, salaryMax: 12_000_000 })).body.id
    const other = (await json<{ id: string }>(env, 'POST', `/projects/${projectId}/positions`, admin, { title: 'Ops' })).body.id
    await json(env, 'POST', `/projects/${projectId}/candidates`, admin, { name: 'Visible', email: 'v@x.id', phone: '0811', positionId, salaryMin: 8_000_000, notes: 'internal note', rejectReason: 'secret reason' })
    await json(env, 'POST', `/projects/${projectId}/candidates`, admin, { name: 'Other pos', positionId: other })
  })

  const open = (token: string, body: object = {}) => env.app.inject({ method: 'POST', url: `/api/v1/public/share/${token}`, payload: body })

  it('stores only an argon2 hash, never returns it, and enforces the password', async () => {
    const r = await json<ShareOut>(env, 'POST', `/projects/${projectId}/share-links`, admin, { label: 'Client', access: 'password', password: SECRET })
    expect(r.status).toBe(201)
    expect(r.body.hasPassword).toBe(true)
    expect(JSON.stringify(r.body)).not.toContain(SECRET)
    const [row] = await env.db.select().from(shareLinks).where(eq(shareLinks.id, r.body.id))
    expect(row?.passwordHash?.startsWith('$argon2id$')).toBe(true)
    expect(JSON.stringify(row)).not.toContain(SECRET)

    const none = await open(r.body.token)
    expect(none.statusCode).toBe(401)
    expect(none.json().error.code).toBe('SHARE_PASSWORD_REQUIRED')
    const wrong = await open(r.body.token, { password: 'nope-nope' })
    expect(wrong.json().error.code).toBe('SHARE_PASSWORD_INVALID')
    const ok = await open(r.body.token, { password: SECRET })
    expect(ok.statusCode).toBe(200)
    const list = await json<{ data: ShareOut[] }>(env, 'GET', `/projects/${projectId}/share-links`, admin)
    expect(JSON.stringify(list.body)).not.toMatch(/argon2|passwordHash/)
  })

  it('public links leak only whitelisted fields; salary and contact appear only when enabled', async () => {
    const plain = await json<ShareOut>(env, 'POST', `/projects/${projectId}/share-links`, admin, { label: 'Open' })
    const res = await open(plain.body.token)
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toMatch(/internal note|secret reason|salary|8000000|9000000|0811|v@x\.id/)
    const body = res.json<{ candidates: { name: string }[]; positions: unknown[] }>()
    expect(body.candidates).toHaveLength(2)

    const rich = await json<ShareOut>(env, 'POST', `/projects/${projectId}/share-links`, admin, { showSalary: true, showContact: true })
    const r2 = (await open(rich.body.token)).json<{ candidates: { name: string; email?: string; salaryMin?: number }[]; positions: { salaryMin?: number }[] }>()
    const vis = r2.candidates.find((c) => c.name === 'Visible')
    expect(vis).toMatchObject({ email: 'v@x.id', salaryMin: 8_000_000 })
    expect(r2.positions.some((p) => p.salaryMin === 9_000_000)).toBe(true)
    expect((await open(rich.body.token)).body).not.toMatch(/internal note|secret reason/)
  })

  it('scopes to positions, can be disabled, rotated, and counts views', async () => {
    const scoped = await json<ShareOut & { views: number }>(env, 'POST', `/projects/${projectId}/share-links`, admin, { positionIds: [positionId] })
    const r = (await open(scoped.body.token)).json<{ candidates: { name: string }[]; positions: unknown[] }>()
    expect(r.candidates.map((c) => c.name)).toEqual(['Visible'])
    expect(r.positions).toHaveLength(1)
    const [row] = await env.db.select().from(shareLinks).where(eq(shareLinks.id, scoped.body.id))
    expect(row?.views).toBe(1)

    await json(env, 'PATCH', `/share-links/${scoped.body.id}`, admin, { enabled: false })
    expect((await open(scoped.body.token)).statusCode).toBe(404)
    await json(env, 'PATCH', `/share-links/${scoped.body.id}`, admin, { enabled: true })
    const rotated = await json<ShareOut>(env, 'POST', `/share-links/${scoped.body.id}/rotate`, admin)
    expect((await open(scoped.body.token)).statusCode).toBe(404)
    expect((await open(rotated.body.token)).statusCode).toBe(200)
    expect((await open('x'.repeat(30))).statusCode).toBe(404)
    // positions from another project are refused
    const foreign = (await json<{ id: string }>(env, 'POST', '/projects', admin, { name: 'F' })).body.id
    const fp = (await json<{ id: string }>(env, 'POST', `/projects/${foreign}/positions`, admin, { title: 'F' })).body.id
    expect((await json(env, 'PATCH', `/share-links/${scoped.body.id}`, admin, { positionIds: [fp] })).status).toBe(400)
  })

  it('switching to password needs a password; switching to public drops the hash', async () => {
    const link = await json<ShareOut>(env, 'POST', `/projects/${projectId}/share-links`, admin, {})
    expect((await json(env, 'PATCH', `/share-links/${link.body.id}`, admin, { access: 'password' })).status).toBe(400)
    expect((await json(env, 'POST', `/projects/${projectId}/share-links`, admin, { access: 'password' })).status).toBe(400)
    await json(env, 'PATCH', `/share-links/${link.body.id}`, admin, { access: 'password', password: SECRET })
    const back = await json<ShareOut>(env, 'PATCH', `/share-links/${link.body.id}`, admin, { access: 'public' })
    expect(back.body.hasPassword).toBe(false)
  })

  it('only share.manage may manage links, and salary publishing needs salary.view', async () => {
    const viewer = await userWithRole(env, 'viewer')
    expect((await json(env, 'GET', `/projects/${projectId}/share-links`, viewer)).status).toBe(403)
    const pm = await userWithRole(env, 'pm')
    expect((await json(env, 'POST', `/projects/${projectId}/share-links`, pm, {})).status).toBe(403)
    // custom role with share.manage but no salary.view
    const role = await json<{ id: string }>(env, 'POST', '/roles', admin, { name: 'Sharer', permissions: { 'share.manage': true } })
    await env.db.insert(users).values({ name: 'Sh', email: 'sharer@test.id', passwordHash: await createPasswordHasher(env.config).hash(PASSWORD), roleId: role.body.id, status: 'active' })
    const sh = await login(env, 'sharer@test.id')
    expect((await json(env, 'POST', `/projects/${projectId}/share-links`, sh, { showSalary: true })).status).toBe(403)
    expect((await json(env, 'POST', `/projects/${projectId}/share-links`, sh, { showSalary: false })).status).toBe(201)
  })

  it('rate limits password guessing per link', async () => {
    const limited = await createEnv({ AUTH_RATE_LIMIT_MAX: '4' })
    try {
      const a = await limited.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@test.id', password: PASSWORD } })
      const token = 'y'.repeat(24)
      const codes: number[] = []
      for (let i = 0; i < 6; i++) codes.push((await limited.app.inject({ method: 'POST', url: `/api/v1/public/share/${token}`, payload: { password: 'guess' } })).statusCode)
      expect(a.statusCode).toBe(200)
      expect(codes).toEqual([404, 404, 404, 404, 429, 429])
    } finally { await limited.close() }
  })
})
