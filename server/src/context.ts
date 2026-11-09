import type { Config } from './config.js'
import type { Db } from './db/client.js'
import type { PasswordHasher } from './lib/password.js'
import type { MailProvider } from './mail/provider.js'
import type { Permission } from './domain/permissions.js'
import type { BroadcastWorker } from './jobs/broadcast-worker.js'

export interface AuthUser {
  id: string
  name: string
  email: string
  roleId: string
  roleKey: string
  status: 'pending' | 'active' | 'disabled'
}

export interface AuthContext {
  user: AuthUser
  permissions: ReadonlySet<Permission>
  can: (p: Permission) => boolean
}

export interface AppContext {
  config: Config
  db: Db
  ping: () => Promise<void>
  hasher: PasswordHasher
  mail: MailProvider
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext
    /** Set when the sending worker runs inside this process. */
    worker?: BroadcastWorker
  }
  interface FastifyRequest {
    auth?: AuthContext
  }
}
