import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createEnv, type TestEnv } from './helpers.js'

const SECRET = 'cron-secret-cron-secret-cron-secret-12'
let env: TestEnv
let off: TestEnv

beforeAll(async () => {
  env = await createEnv({ CRON_SECRET: SECRET })
  off = await createEnv()
})
afterAll(async () => {
  await env.close()
  await off.close()
})

const call = (e: TestEnv, method: 'GET' | 'POST', auth?: string) =>
  e.app.inject({ method, url: '/api/v1/cron/broadcast', headers: auth ? { authorization: auth } : {} })

describe('scheduled broadcast tick', () => {
  it('rejects missing and wrong secrets', async () => {
    expect((await call(env, 'POST')).statusCode).toBe(401)
    expect((await call(env, 'POST', 'Bearer nope')).statusCode).toBe(401)
    expect((await call(env, 'GET', SECRET)).statusCode).toBe(401) // needs the Bearer prefix
  })

  it('is switched off when CRON_SECRET is not set', async () => {
    expect((await call(off, 'POST', `Bearer ${SECRET}`)).statusCode).toBe(401)
  })

  it('runs a tick with the right secret (POST and GET)', async () => {
    for (const m of ['POST', 'GET'] as const) {
      const r = await call(env, m, `Bearer ${SECRET}`)
      expect(r.statusCode).toBe(200)
      expect(r.json()).toMatchObject({ ticks: 1, sent: 0 })
    }
  })

  it('seed endpoint needs the secret and is idempotent', async () => {
    const url = '/api/v1/setup/seed'
    expect((await env.app.inject({ method: 'POST', url })).statusCode).toBe(401)
    const r = await env.app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${SECRET}` } })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ adminCreated: false }) // the test db already has the admin
  })
})
