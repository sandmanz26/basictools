import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditLog, passwordResets, refreshTokens, users } from '../src/db/schema.js'
import { sha256Hex } from '../src/lib/crypto.js'
import { PASSWORD, adminLogin, createEnv, json, login, type TestEnv } from './helpers.js'

let env: TestEnv
beforeAll(async () => { env = await createEnv({ LOGIN_MAX_FAILS: '3', LOGIN_LOCK_MINUTES: '15' }) })
afterAll(async () => { await env.close() })

const post = (url: string, payload: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  env.app.inject({ method: 'POST', url: `/api/v1${url}`, payload: payload as object, headers, cookies: cookie ? { hf_refresh: cookie } : undefined })

describe('register and approval', () => {
  it('creates a pending account that cannot sign in until an admin approves it', async () => {
    const reg = await post('/auth/register', { name: 'Nia', email: 'Nia@Test.ID', password: PASSWORD })
    expect(reg.statusCode).toBe(202)
    const [u] = await env.db.select().from(users).where(eq(users.email, 'nia@test.id'))
    expect(u?.status).toBe('pending')
    expect(u?.passwordHash.startsWith('$argon2id$')).toBe(true)

    const blocked = await post('/auth/login', { email: 'nia@test.id', password: PASSWORD })
    expect(blocked.statusCode).toBe(403)
    expect(blocked.json().error.code).toBe('ACCOUNT_PENDING')

    const admin = await adminLogin(env)
    const list = await json<{ data: { id: string }[] }>(env, 'GET', '/users?status=pending', admin)
    expect(list.body.data.map((x) => x.id)).toContain(u?.id)
    const approve = await json<{ status: string }>(env, 'POST', `/users/${u?.id}/approve`, admin, {})
    expect(approve.status).toBe(200)
    expect(approve.body.status).toBe('active')
    expect((await post('/auth/login', { email: 'nia@test.id', password: PASSWORD })).statusCode).toBe(200)
  })

  it('answers identically for a taken email (no account enumeration) and keeps the original password', async () => {
    const first = await post('/auth/register', { name: 'Dup', email: 'dup@test.id', password: PASSWORD })
    const second = await post('/auth/register', { name: 'Other', email: 'dup@test.id', password: 'Different1pass' })
    expect(second.statusCode).toBe(first.statusCode)
    expect(second.json()).toEqual(first.json())
    const rows = await env.db.select().from(users).where(eq(users.email, 'dup@test.id'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.name).toBe('Dup')
  })

  it('rejects weak passwords with the frontend rules', async () => {
    for (const password of ['short1', 'longenoughbutnodigits', '1234567890']) {
      const r = await post('/auth/register', { name: 'Weak', email: 'weak@test.id', password })
      expect(r.statusCode).toBe(400)
      expect(r.json().error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('new accounts get the least privileged role', async () => {
    const admin = await adminLogin(env)
    const list = await json<{ data: { email: string; roleId: string }[] }>(env, 'GET', '/users?q=dup@test.id', admin)
    const roles = await json<{ data: { id: string; key: string }[] }>(env, 'GET', '/roles', admin)
    expect(roles.body.data.find((r) => r.id === list.body.data[0]?.roleId)?.key).toBe('viewer')
  })
})

describe('login', () => {
  it('uses one generic message for unknown email and wrong password', async () => {
    const a = await post('/auth/login', { email: 'nobody@test.id', password: PASSWORD })
    const b = await post('/auth/login', { email: 'admin@test.id', password: 'Wrong-pass-1' })
    expect(a.statusCode).toBe(401)
    expect(b.statusCode).toBe(401)
    expect(a.json().error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: b.json().error.message })
  })

  it('sets a hardened refresh cookie and never returns hashes', async () => {
    const res = await post('/auth/login', { email: 'admin@test.id', password: PASSWORD, remember: true })
    const c = res.cookies.find((x) => x.name === 'hf_refresh')
    expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' })
    expect(c?.expires).toBeInstanceOf(Date)
    expect(res.body).not.toMatch(/argon2|passwordHash|password_hash/)
    const body = res.json()
    expect(body.user.permissions).toContain('roles.manage')
    expect(body.tokenType).toBe('Bearer')
  })

  it('marks the cookie Secure when configured', async () => {
    const secure = await createEnv({ COOKIE_SECURE: 'true' })
    try {
      const res = await secure.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@test.id', password: PASSWORD } })
      expect(res.cookies.find((x) => x.name === 'hf_refresh')?.secure).toBe(true)
    } finally { await secure.close() }
  })

  it('locks the account after repeated failures, even for the right password, then recovers', async () => {
    await post('/auth/register', { name: 'Lock', email: 'lock@test.id', password: PASSWORD })
    const [u] = await env.db.select().from(users).where(eq(users.email, 'lock@test.id'))
    await env.db.update(users).set({ status: 'active' }).where(eq(users.id, u?.id ?? ''))
    for (let i = 0; i < 3; i++) expect((await post('/auth/login', { email: 'lock@test.id', password: 'Nope-nope-1' })).statusCode).toBe(401)
    const locked = await post('/auth/login', { email: 'lock@test.id', password: PASSWORD })
    expect(locked.statusCode).toBe(401) // locked: same generic answer
    const audit = await env.db.select().from(auditLog).where(eq(auditLog.action, 'auth.account_locked'))
    expect(audit.length).toBeGreaterThan(0)
    await env.db.update(users).set({ lockedUntil: new Date(Date.now() - 1000).toISOString() }).where(eq(users.id, u?.id ?? ''))
    expect((await post('/auth/login', { email: 'lock@test.id', password: PASSWORD })).statusCode).toBe(200)
  })

  it('rate limits the login route per IP', async () => {
    const limited = await createEnv({ AUTH_RATE_LIMIT_MAX: '3' })
    try {
      const codes: number[] = []
      for (let i = 0; i < 5; i++) {
        const r = await limited.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'x@test.id', password: 'whatever1' } })
        codes.push(r.statusCode)
      }
      expect(codes.slice(0, 3)).toEqual([401, 401, 401])
      expect(codes.slice(3)).toEqual([429, 429])
    } finally { await limited.close() }
  })
})

describe('tokens', () => {
  it('requires a valid bearer token', async () => {
    expect((await env.app.inject({ method: 'GET', url: '/api/v1/auth/me' })).statusCode).toBe(401)
    expect((await env.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: 'Bearer nonsense' } })).statusCode).toBe(401)
    const s = await adminLogin(env)
    const me = await json<{ email: string }>(env, 'GET', '/auth/me', s)
    expect(me.body.email).toBe('admin@test.id')
  })

  it('stores only a hash of the refresh token', async () => {
    const s = await adminLogin(env)
    const rows = await env.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256Hex(s.cookie)))
    expect(rows).toHaveLength(1)
    const all = JSON.stringify(await env.db.select().from(refreshTokens))
    expect(all).not.toContain(s.cookie)
  })

  it('rotates the refresh token and detects reuse by revoking the whole family', async () => {
    const s = await adminLogin(env)
    const r1 = await post('/auth/refresh', {}, s.cookie)
    expect(r1.statusCode).toBe(200)
    const c2 = r1.cookies.find((x) => x.name === 'hf_refresh')?.value ?? ''
    expect(c2).not.toBe(s.cookie)

    // The old token is replayed (stolen): the request fails and the new token dies with it.
    const replay = await post('/auth/refresh', {}, s.cookie)
    expect(replay.statusCode).toBe(401)
    const afterReplay = await post('/auth/refresh', {}, c2)
    expect(afterReplay.statusCode).toBe(401)
    const reuse = await env.db.select().from(auditLog).where(eq(auditLog.action, 'auth.refresh_reuse_detected'))
    expect(reuse.length).toBeGreaterThan(0)
  })

  it('rejects refresh without a cookie or from a foreign origin', async () => {
    expect((await post('/auth/refresh', {})).statusCode).toBe(401)
    const s = await adminLogin(env)
    const evil = await post('/auth/refresh', {}, s.cookie, { origin: 'https://evil.example' })
    expect(evil.statusCode).toBe(403)
    const ok = await post('/auth/refresh', {}, s.cookie, { origin: 'http://localhost:5173' })
    expect(ok.statusCode).toBe(200)
  })

  it('logout revokes the session', async () => {
    const s = await adminLogin(env)
    expect((await post('/auth/logout', {}, s.cookie)).statusCode).toBe(200)
    expect((await post('/auth/refresh', {}, s.cookie)).statusCode).toBe(401)
  })

  it('an expired refresh token cannot be used', async () => {
    const s = await adminLogin(env)
    await env.db.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(refreshTokens.tokenHash, sha256Hex(s.cookie)))
    expect((await post('/auth/refresh', {}, s.cookie)).statusCode).toBe(401)
  })
})

describe('password change', () => {
  it('needs the current password, enforces rules, and signs other sessions out', async () => {
    await post('/auth/register', { name: 'Chg', email: 'chg@test.id', password: PASSWORD })
    await env.db.update(users).set({ status: 'active' }).where(eq(users.email, 'chg@test.id'))
    const a = await login(env, 'chg@test.id')
    const other = await login(env, 'chg@test.id')

    expect((await json(env, 'POST', '/auth/change-password', a, { currentPassword: 'Wrong-pass-1', newPassword: 'Brand-new-pass1' })).status).toBe(400)
    expect((await json(env, 'POST', '/auth/change-password', a, { currentPassword: PASSWORD, newPassword: 'weak' })).status).toBe(400)
    expect((await json(env, 'POST', '/auth/change-password', a, { currentPassword: PASSWORD, newPassword: PASSWORD })).status).toBe(400)
    const ok = await json(env, 'POST', '/auth/change-password', a, { currentPassword: PASSWORD, newPassword: 'Brand-new-pass1' })
    expect(ok.status).toBe(200)

    expect((await post('/auth/refresh', {}, other.cookie)).statusCode).toBe(401)
    expect((await post('/auth/login', { email: 'chg@test.id', password: PASSWORD })).statusCode).toBe(401)
    expect((await post('/auth/login', { email: 'chg@test.id', password: 'Brand-new-pass1' })).statusCode).toBe(200)
  })
})

describe('forgot and reset password', () => {
  const tokenFromMail = () => {
    const last = env.mail.outbox.at(-1)
    return /token=([\w-]+)/.exec(last?.text ?? '')?.[1] ?? ''
  }

  it('always answers 202 and only emails real accounts', async () => {
    const before = env.mail.outbox.length
    expect((await post('/auth/forgot-password', { email: 'ghost@test.id' })).statusCode).toBe(202)
    expect(env.mail.outbox.length).toBe(before)
    expect((await post('/auth/forgot-password', { email: 'admin@test.id' })).statusCode).toBe(202)
    expect(env.mail.outbox.length).toBe(before + 1)
  })

  it('stores only a hash, works once, and revokes sessions', async () => {
    const s = await adminLogin(env)
    await post('/auth/forgot-password', { email: 'admin@test.id' })
    const token = tokenFromMail()
    expect(token.length).toBeGreaterThan(20)
    const rows = await env.db.select().from(passwordResets)
    expect(JSON.stringify(rows)).not.toContain(token)
    expect(rows.some((r) => r.tokenHash === sha256Hex(token))).toBe(true)

    expect((await post('/auth/reset-password', { token, password: 'weak' })).statusCode).toBe(400)
    const ok = await post('/auth/reset-password', { token, password: 'Reset-pass-9' })
    expect(ok.statusCode).toBe(200)
    expect((await post('/auth/reset-password', { token, password: 'Reset-pass-10' })).statusCode).toBe(400) // single use
    expect((await post('/auth/refresh', {}, s.cookie)).statusCode).toBe(401)
    expect((await post('/auth/login', { email: 'admin@test.id', password: 'Reset-pass-9' })).statusCode).toBe(200)

    // put the bootstrap password back for the other tests
    await post('/auth/forgot-password', { email: 'admin@test.id' })
    expect((await post('/auth/reset-password', { token: tokenFromMail(), password: PASSWORD })).statusCode).toBe(200)
  })

  it('refuses an expired token and an invalidated older token', async () => {
    await post('/auth/forgot-password', { email: 'admin@test.id' })
    const first = tokenFromMail()
    await post('/auth/forgot-password', { email: 'admin@test.id' })
    const second = tokenFromMail()
    expect((await post('/auth/reset-password', { token: first, password: 'Reset-pass-9' })).statusCode).toBe(400)
    await env.db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(passwordResets.tokenHash, sha256Hex(second)))
    expect((await post('/auth/reset-password', { token: second, password: 'Reset-pass-9' })).statusCode).toBe(400)
  })
})

describe('admin user management', () => {
  it('disable ends sessions and blocks login; enable restores; self-lockout is prevented', async () => {
    await post('/auth/register', { name: 'Tmp', email: 'tmp@test.id', password: PASSWORD })
    const admin = await adminLogin(env)
    const [u] = await env.db.select().from(users).where(eq(users.email, 'tmp@test.id'))
    await json(env, 'POST', `/users/${u?.id}/approve`, admin, {})
    const s = await login(env, 'tmp@test.id')

    expect((await json(env, 'POST', `/users/${admin.userId}/disable`, admin)).status).toBe(403)
    expect((await json(env, 'POST', `/users/${u?.id}/disable`, admin)).status).toBe(200)
    expect((await json(env, 'GET', '/auth/me', s)).status).toBe(401) // access token dies at once (status checked per request)
    expect((await post('/auth/refresh', {}, s.cookie)).statusCode).toBe(401)
    const blocked = await post('/auth/login', { email: 'tmp@test.id', password: PASSWORD })
    expect(blocked.json().error.code).toBe('ACCOUNT_DISABLED')
    expect((await json(env, 'POST', `/users/${u?.id}/enable`, admin)).status).toBe(200)
    expect((await post('/auth/login', { email: 'tmp@test.id', password: PASSWORD })).statusCode).toBe(200)
  })

  it('changing a role takes effect on the next request and is audited', async () => {
    const admin = await adminLogin(env)
    const roles = await json<{ data: { id: string; key: string }[] }>(env, 'GET', '/roles', admin)
    const mkt = roles.body.data.find((r) => r.key === 'mkt')
    const [u] = await env.db.select().from(users).where(eq(users.email, 'tmp@test.id'))
    const s = await login(env, 'tmp@test.id')
    expect((await json(env, 'GET', '/leads', s)).status).toBe(403)
    expect((await json(env, 'PUT', `/users/${u?.id}/role`, admin, { roleId: mkt?.id })).status).toBe(200)
    expect((await json(env, 'GET', '/leads', s)).status).toBe(200)
    const a = await env.db.select().from(auditLog).where(eq(auditLog.action, 'user.change_role'))
    expect(a.length).toBe(1)
  })

  it('non admins cannot manage users', async () => {
    const s = await login(env, 'tmp@test.id')
    expect((await json(env, 'GET', '/users', s)).status).toBe(403)
  })
})

describe('http hardening', () => {
  it('sends security headers, request ids and a uniform error body', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/nope', headers: { 'x-request-id': 'req-12345678' } })
    expect(res.statusCode).toBe(404)
    expect(res.headers['x-request-id']).toBe('req-12345678')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['strict-transport-security']).toBeDefined()
    expect(res.json().error).toMatchObject({ code: 'NOT_FOUND', requestId: 'req-12345678' })
  })

  it('only allows configured CORS origins', async () => {
    const ok = await env.app.inject({ method: 'OPTIONS', url: '/api/v1/auth/login', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST' } })
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(ok.headers['access-control-allow-credentials']).toBe('true')
    const bad = await env.app.inject({ method: 'OPTIONS', url: '/api/v1/auth/login', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } })
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('rejects oversized bodies', async () => {
    const small = await createEnv({ BODY_LIMIT_BYTES: '2048' })
    try {
      const r = await small.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'a@b.id', password: 'x'.repeat(5000) } })
      expect(r.statusCode).toBe(413)
    } finally { await small.close() }
  })

  it('health endpoints work and the docs are served', async () => {
    expect((await env.app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200)
    expect((await env.app.inject({ method: 'GET', url: '/readyz' })).statusCode).toBe(200)
    const spec = await env.app.inject({ method: 'GET', url: '/docs/json' })
    expect(spec.statusCode).toBe(200)
    expect(Object.keys(spec.json().paths).length).toBeGreaterThan(60)
  })
})
