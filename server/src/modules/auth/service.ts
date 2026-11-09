import { and, eq, isNull, sql } from 'drizzle-orm'
import type { FastifyRequest } from 'fastify'
import type { AppContext, AuthContext } from '../../context.js'
import { DEFAULT_REGISTER_ROLE_KEY } from '../../domain/permissions.js'
import { passwordResets, refreshTokens, roles, users } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { randomToken, sha256Hex } from '../../lib/crypto.js'
import { AppError, unauthorized } from '../../lib/errors.js'
import { signAccessToken } from '../../lib/jwt.js'
import { loadAuth } from '../../plugins/authz.js'

const GENERIC_LOGIN_ERROR = 'Incorrect email or password.'
const invalidLogin = () => new AppError(401, 'INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR)

export interface IssuedSession {
  accessToken: string
  expiresIn: number
  refreshToken: string
  refreshExpiresAt: Date
  auth: AuthContext
}

export function createAuthService(ctx: AppContext) {
  const { db, config, hasher, mail } = ctx

  async function issue(userId: string, remember: boolean, req: FastifyRequest, familyId?: string): Promise<IssuedSession & { rowId: string }> {
    const auth = await loadAuth(db, userId)
    if (!auth) throw unauthorized()
    const raw = randomToken(32)
    const ttlMs = remember ? config.REFRESH_TTL_DAYS * 86_400_000 : config.REFRESH_TTL_SHORT_HOURS * 3_600_000
    const expiresAt = new Date(Date.now() + ttlMs)
    const [row] = await db
      .insert(refreshTokens)
      .values({
        userId,
        familyId: familyId ?? crypto.randomUUID(),
        tokenHash: sha256Hex(raw),
        remember,
        expiresAt: expiresAt.toISOString(),
        ip: req.ip,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 400),
      })
      .returning({ id: refreshTokens.id })
    if (!row) throw new Error('refresh token insert failed')
    const accessToken = await signAccessToken(config.JWT_ACCESS_SECRET, userId, config.ACCESS_TTL_SECONDS)
    return { accessToken, expiresIn: config.ACCESS_TTL_SECONDS, refreshToken: raw, refreshExpiresAt: expiresAt, auth, rowId: row.id }
  }

  const revokeFamily = (familyId: string) =>
    db.update(refreshTokens).set({ revokedAt: new Date().toISOString() }).where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))

  const revokeAllForUser = (userId: string) =>
    db.update(refreshTokens).set({ revokedAt: new Date().toISOString() }).where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)))

  return {
    revokeAllForUser,

    /** Always answers the same way so the endpoint cannot be used to find out which emails exist. */
    async register(input: { name: string; email: string; password: string }, req: FastifyRequest): Promise<void> {
      const passwordHash = await hasher.hash(input.password) // always hash: same timing whether or not the email is taken
      const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, DEFAULT_REGISTER_ROLE_KEY)).limit(1)
      if (!role) throw new Error('Default role missing: run the seed script.')
      const [created] = await db
        .insert(users)
        .values({ name: input.name, email: input.email, passwordHash, roleId: role.id, status: 'pending', passwordChangedAt: new Date().toISOString() })
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id })
      await audit(db, req, { action: created ? 'auth.register' : 'auth.register_duplicate', actorId: created?.id, entity: 'user', entityId: created?.id, meta: { email: input.email } })
    },

    async login(input: { email: string; password: string; remember: boolean }, req: FastifyRequest): Promise<IssuedSession> {
      const [u] = await db.select().from(users).where(eq(users.email, input.email)).limit(1)
      if (!u) {
        await hasher.burn(input.password)
        await audit(db, req, { action: 'auth.login_failed', meta: { email: input.email, reason: 'unknown_email' } })
        throw invalidLogin()
      }
      if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) {
        await hasher.burn(input.password)
        await audit(db, req, { action: 'auth.login_blocked_locked', actorId: u.id, entity: 'user', entityId: u.id })
        throw invalidLogin() // same answer as a wrong password so lockout state does not leak
      }
      if (!(await hasher.verify(u.passwordHash, input.password))) {
        const [after] = await db
          .update(users)
          .set({ failedLogins: sql`${users.failedLogins} + 1` })
          .where(eq(users.id, u.id))
          .returning({ n: users.failedLogins })
        const locked = (after?.n ?? 0) >= config.LOGIN_MAX_FAILS
        if (locked) {
          await db
            .update(users)
            .set({ failedLogins: 0, lockedUntil: new Date(Date.now() + config.LOGIN_LOCK_MINUTES * 60_000).toISOString() })
            .where(eq(users.id, u.id))
        }
        await audit(db, req, { action: locked ? 'auth.account_locked' : 'auth.login_failed', actorId: u.id, entity: 'user', entityId: u.id, meta: { reason: 'bad_password' } })
        throw invalidLogin()
      }
      // Status is only revealed to someone who proved they know the password.
      if (u.status === 'pending') throw new AppError(403, 'ACCOUNT_PENDING', 'Your account is waiting for an admin to approve it.')
      if (u.status === 'disabled') throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled. Ask an admin to re-enable it.')

      await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() }).where(eq(users.id, u.id))
      const session = await issue(u.id, input.remember, req)
      await audit(db, req, { action: 'auth.login', actorId: u.id, entity: 'user', entityId: u.id })
      return session
    },

    /** Rotate the refresh token. Presenting an already-used token revokes the whole login session. */
    async refresh(rawToken: string | undefined, req: FastifyRequest): Promise<IssuedSession> {
      if (!rawToken) throw unauthorized()
      const hash = sha256Hex(rawToken)
      const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).limit(1)
      if (!row) throw unauthorized()
      if (row.revokedAt) {
        await revokeFamily(row.familyId)
        await audit(db, req, { action: 'auth.refresh_reuse_detected', actorId: row.userId, entity: 'user', entityId: row.userId, meta: { familyId: row.familyId } })
        throw unauthorized('Session expired. Sign in again.')
      }
      if (Date.parse(row.expiresAt) < Date.now()) throw unauthorized('Session expired. Sign in again.')

      // Claim the token atomically; if a concurrent request already did, treat it as reuse.
      const claimed = await db
        .update(refreshTokens)
        .set({ revokedAt: new Date().toISOString() })
        .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id })
      if (claimed.length === 0) {
        await revokeFamily(row.familyId)
        await audit(db, req, { action: 'auth.refresh_reuse_detected', actorId: row.userId, entity: 'user', entityId: row.userId, meta: { familyId: row.familyId, race: true } })
        throw unauthorized('Session expired. Sign in again.')
      }
      try {
        const next = await issue(row.userId, row.remember, req, row.familyId)
        await db.update(refreshTokens).set({ replacedBy: next.rowId }).where(eq(refreshTokens.id, row.id))
        return next
      } catch (err) {
        await revokeFamily(row.familyId) // user disabled or deleted meanwhile
        throw err
      }
    },

    async logout(rawToken: string | undefined, req: FastifyRequest): Promise<void> {
      if (!rawToken) return
      const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256Hex(rawToken))).limit(1)
      if (!row) return
      await revokeFamily(row.familyId)
      await audit(db, req, { action: 'auth.logout', actorId: row.userId, entity: 'user', entityId: row.userId })
    },

    async logoutAll(userId: string, req: FastifyRequest): Promise<void> {
      await revokeAllForUser(userId)
      await audit(db, req, { action: 'auth.logout_all', actorId: userId, entity: 'user', entityId: userId })
    },

    async changePassword(userId: string, current: string, next: string, req: FastifyRequest): Promise<IssuedSession> {
      const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
      if (!u) throw unauthorized()
      if (!(await hasher.verify(u.passwordHash, current))) {
        await audit(db, req, { action: 'auth.change_password_failed', actorId: userId, entity: 'user', entityId: userId })
        throw new AppError(400, 'WRONG_PASSWORD', 'Current password is wrong.')
      }
      if (current === next) throw new AppError(400, 'SAME_PASSWORD', 'Choose a different password than the current one.')
      await db.update(users).set({ passwordHash: await hasher.hash(next), passwordChangedAt: new Date().toISOString() }).where(eq(users.id, userId))
      await revokeAllForUser(userId) // every other device must sign in again
      await audit(db, req, { action: 'auth.change_password', actorId: userId, entity: 'user', entityId: userId })
      return issue(userId, false, req)
    },

    /** Always succeeds from the caller's point of view. */
    async forgotPassword(email: string, req: FastifyRequest): Promise<void> {
      const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      if (!u || u.status === 'disabled') {
        await audit(db, req, { action: 'auth.forgot_password', meta: { email, known: false } })
        return
      }
      const raw = randomToken(32)
      // One live token per user.
      await db.update(passwordResets).set({ usedAt: new Date().toISOString() }).where(and(eq(passwordResets.userId, u.id), isNull(passwordResets.usedAt)))
      await db.insert(passwordResets).values({
        userId: u.id,
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + config.PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString(),
      })
      await audit(db, req, { action: 'auth.forgot_password', actorId: u.id, entity: 'user', entityId: u.id })
      const link = `${config.APP_URL.replace(/\/$/, '')}/reset-password?token=${raw}`
      try {
        await mail.send({
          to: u.email,
          subject: 'Reset your HireFlow password',
          text: `Hi ${u.name},\n\nUse this link to choose a new password. It works once and expires in ${config.PASSWORD_RESET_TTL_MINUTES} minutes:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
        })
      } catch (err) {
        req.log.error({ err }, 'could not send password reset email')
      }
    },

    async resetPassword(token: string, password: string, req: FastifyRequest): Promise<void> {
      const now = new Date().toISOString()
      // Single use: the UPDATE only matches an unused, unexpired token.
      const [row] = await db
        .update(passwordResets)
        .set({ usedAt: now })
        .where(and(eq(passwordResets.tokenHash, sha256Hex(token)), isNull(passwordResets.usedAt), sql`${passwordResets.expiresAt} > now()`))
        .returning({ userId: passwordResets.userId })
      if (!row) throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is not valid or has expired. Request a new one.')
      await db
        .update(users)
        .set({ passwordHash: await hasher.hash(password), passwordChangedAt: now, failedLogins: 0, lockedUntil: null })
        .where(eq(users.id, row.userId))
      await revokeAllForUser(row.userId)
      await audit(db, req, { action: 'auth.reset_password', actorId: row.userId, entity: 'user', entityId: row.userId })
    },
  }
}

export type AuthService = ReturnType<typeof createAuthService>
