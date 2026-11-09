import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.js'
import { AppError } from '../lib/errors.js'

export async function registerSecurity(app: FastifyInstance, config: Config): Promise<void> {
  // CSP is relaxed only for the Swagger UI page, which needs inline styles/scripts.
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  })

  const allowed = new Set(config.CORS_ORIGINS)
  await app.register(cors, {
    // Strict allowlist. Requests without an Origin (curl, server to server) are not browser CORS requests.
    origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'x-request-id'],
    maxAge: 600,
  })

  await app.register(cookie)

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_SECONDS * 1000,
    keyGenerator: (req) => req.ip,
    allowList: (req) => req.url === '/healthz' || req.url === '/readyz',
    errorResponseBuilder: (_req, ctx) => new AppError(429, 'RATE_LIMITED', `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.`),
  })
}

/** Route level limit for credential endpoints and the public share link. */
export const strictLimit = (config: Config) => ({
  rateLimit: { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: config.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000 },
})
