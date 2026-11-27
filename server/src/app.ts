import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'
import type { AppContext } from './context.js'
import { registerDocs } from './plugins/docs.js'
import { registerErrorHandling } from './plugins/errors.js'
import { registerSecurity } from './plugins/security.js'
import { authRoutes } from './modules/auth/routes.js'
import { userRoutes } from './modules/users/routes.js'
import { projectRoutes } from './modules/projects/routes.js'
import { positionRoutes } from './modules/positions/routes.js'
import { talentRoutes } from './modules/talents/routes.js'
import { candidateRoutes } from './modules/candidates/routes.js'
import { invoiceRoutes } from './modules/invoices/routes.js'
import { scheduleRoutes } from './modules/schedules/routes.js'
import { shareRoutes } from './modules/share/routes.js'
import { crudRoutes } from './modules/crud/routes.js'
import { broadcastRoutes } from './modules/broadcasts/routes.js'
import { cronRoutes } from './modules/cron/routes.js'
import { unsubscribeRoutes } from './modules/broadcasts/unsubscribe-routes.js'

export interface BuildOptions {
  /** false silences logs (tests). */
  logger?: boolean
}

const REQ_ID = /^[A-Za-z0-9._-]{8,64}$/

export async function buildApp(ctx: AppContext, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const { config } = ctx
  const isProd = config.NODE_ENV === 'production'

  const app = Fastify({
    logger:
      opts.logger === false
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
            ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: config.BODY_LIMIT_BYTES,
    // Signed unsubscribe tokens carry an email and an id: longer than the 100 char default.
    routerOptions: { maxParamLength: 600 },
    genReqId: (req) => {
      const h = req.headers['x-request-id']
      return typeof h === 'string' && REQ_ID.test(h) ? h : randomUUID()
    },
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.decorate('ctx', ctx)
  app.addHook('onSend', async (req, reply) => {
    void reply.header('x-request-id', req.id)
    // API responses carry personal data: never cache them.
    if (req.url.startsWith('/api/')) void reply.header('cache-control', 'no-store')
  })

  registerErrorHandling(app, isProd)
  await registerSecurity(app, config)
  await registerDocs(app, config.DOCS_ENABLED)

  // Also under /api so the same checks work behind the Vercel rewrite (/api/readyz).
  for (const base of ['', '/api']) {
    app.get(`${base}/healthz`, { schema: { hide: true } }, async () => ({ status: 'ok' }))
    app.get(`${base}/readyz`, { schema: { hide: true } }, async (req, reply) => {
      try {
        await ctx.ping()
        return { status: 'ready' }
      } catch (err) {
        req.log.error({ err }, 'readiness check failed')
        return reply.code(503).send({ status: 'unavailable' })
      }
    })
  }

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' })
      await api.register(userRoutes)
      await api.register(projectRoutes)
      await api.register(positionRoutes)
      await api.register(talentRoutes)
      await api.register(candidateRoutes)
      await api.register(invoiceRoutes)
      await api.register(scheduleRoutes)
      await api.register(shareRoutes)
      await api.register(crudRoutes)
      await api.register(broadcastRoutes)
      await api.register(unsubscribeRoutes)
      await api.register(cronRoutes)
    },
    { prefix: '/api/v1' },
  )

  return app
}
