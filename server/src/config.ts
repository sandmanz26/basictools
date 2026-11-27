import { z } from 'zod'

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1')

const csv = z.string().default('').transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const opt = <T extends z.ZodType>(s: T) => z.preprocess(emptyToUndefined, s.optional())

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    TRUST_PROXY: bool.default(false),

    DATABASE_URL: z.string().min(1),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    DB_SSL: bool.default(false),
    DB_SSL_REJECT_UNAUTHORIZED: bool.default(true),

    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TTL_SECONDS: z.coerce.number().int().min(30).default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    REFRESH_TTL_SHORT_HOURS: z.coerce.number().int().min(1).default(12),
    COOKIE_SECURE: bool.default(true),
    COOKIE_DOMAIN: opt(z.string()),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).default(30),
    LOGIN_MAX_FAILS: z.coerce.number().int().min(1).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
    ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(19456),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),

    CORS_ORIGINS: csv,
    BODY_LIMIT_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
    APP_URL: z.string().url().default('http://localhost:5173'),
    PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
    DOCS_ENABLED: bool.default(true),

    BOOTSTRAP_ADMIN_EMAIL: opt(z.string().email()),
    BOOTSTRAP_ADMIN_NAME: z.string().default('Admin'),
    BOOTSTRAP_ADMIN_PASSWORD: opt(z.string()),

    MAIL_PROVIDER: z.enum(['console', 'smtp', 'graph']).default('console'),
    MAIL_FROM: z.string().default('HireFlow <no-reply@example.com>'),
    SMTP_HOST: opt(z.string()),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: opt(z.string()),
    SMTP_PASSWORD: opt(z.string()),
    GRAPH_TENANT_ID: opt(z.string()),
    GRAPH_CLIENT_ID: opt(z.string()),
    GRAPH_CLIENT_SECRET: opt(z.string()),
    GRAPH_SENDER: opt(z.string()),

    /** Shared secret for the scheduled tick (/api/v1/cron/broadcast). Unset = that endpoint is switched off. */
    CRON_SECRET: opt(z.string().min(32, 'CRON_SECRET must be at least 32 characters')),
    WORKER_ENABLED: bool.default(true),
    WORKER_POLL_MS: z.coerce.number().int().min(100).default(5000),
    BROADCAST_PER_MINUTE: z.coerce.number().int().min(1).default(30),
    BROADCAST_PER_DAY: z.coerce.number().int().min(1).default(1000),
    BROADCAST_WINDOW_START_HOUR: z.coerce.number().int().min(0).max(24).default(0),
    BROADCAST_WINDOW_END_HOUR: z.coerce.number().int().min(0).max(24).default(24),
    BROADCAST_TZ: z.string().default('Asia/Jakarta'),
    BROADCAST_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(4),
    BROADCAST_BACKOFF_BASE_SECONDS: z.coerce.number().int().min(1).default(60),
    BROADCAST_STALE_SENDING_SECONDS: z.coerce.number().int().min(10).default(300),
    UNSUBSCRIBE_SECRET: z.string().min(32, 'UNSUBSCRIBE_SECRET must be at least 32 characters'),
    BROADCAST_FOOTER_ADDRESS: z.string().default(''),
  })
  .superRefine((c, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (c.NODE_ENV === 'production') {
      if (!c.COOKIE_SECURE) fail('COOKIE_SECURE', 'must be true in production')
      if (c.CORS_ORIGINS.length === 0) fail('CORS_ORIGINS', 'must list at least one origin in production')
      if (c.MAIL_PROVIDER === 'console') fail('MAIL_PROVIDER', 'console provider is for development only')
      if (/change-me/.test(c.JWT_ACCESS_SECRET) || /change-me/.test(c.UNSUBSCRIBE_SECRET)) {
        fail('JWT_ACCESS_SECRET', 'replace the example secrets before running in production')
      }
    }
    if (c.MAIL_PROVIDER === 'smtp' && !c.SMTP_HOST) fail('SMTP_HOST', 'required when MAIL_PROVIDER=smtp')
    if (c.MAIL_PROVIDER === 'graph' && !(c.GRAPH_TENANT_ID && c.GRAPH_CLIENT_ID && c.GRAPH_CLIENT_SECRET && c.GRAPH_SENDER)) {
      fail('GRAPH_CLIENT_ID', 'GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET and GRAPH_SENDER are required when MAIL_PROVIDER=graph')
    }
    if (c.BROADCAST_WINDOW_START_HOUR >= c.BROADCAST_WINDOW_END_HOUR && !(c.BROADCAST_WINDOW_START_HOUR === 0 && c.BROADCAST_WINDOW_END_HOUR === 0)) {
      fail('BROADCAST_WINDOW_END_HOUR', 'must be greater than BROADCAST_WINDOW_START_HOUR')
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: c.BROADCAST_TZ })
    } catch {
      fail('BROADCAST_TZ', 'is not a valid IANA time zone')
    }
  })

export type Config = z.infer<typeof schema>

/** Parse and validate the environment. Throws a readable error listing every problem so the process fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return parsed.data
}
