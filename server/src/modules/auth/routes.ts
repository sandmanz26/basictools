import type { FastifyReply, FastifyRequest } from 'fastify'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { auth, authenticate } from '../../plugins/authz.js'
import { strictLimit } from '../../plugins/security.js'
import { forbidden } from '../../lib/errors.js'
import { changePasswordBody, forgotBody, loginBody, messageOut, meOut, registerBody, resetBody, sessionOut } from './schemas.js'
import { createAuthService, type IssuedSession } from './service.js'

export const REFRESH_COOKIE = 'hf_refresh'
const COOKIE_PATH = '/api/v1/auth'

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const { config } = app.ctx
  const svc = createAuthService(app.ctx)
  const limit = strictLimit(config)
  const tags = ['auth']

  const setCookie = (reply: FastifyReply, s: IssuedSession) =>
    reply.setCookie(REFRESH_COOKIE, s.refreshToken, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'strict',
      path: COOKIE_PATH,
      domain: config.COOKIE_DOMAIN,
      expires: s.refreshExpiresAt,
    })
  const clearCookie = (reply: FastifyReply) =>
    reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH, domain: config.COOKIE_DOMAIN, httpOnly: true, secure: config.COOKIE_SECURE, sameSite: 'strict' })

  const toBody = (s: IssuedSession) => ({
    accessToken: s.accessToken,
    tokenType: 'Bearer' as const,
    expiresIn: s.expiresIn,
    user: { ...s.auth.user, permissions: [...s.auth.permissions] },
  })

  /** Defence in depth on top of SameSite=Strict: cookie endpoints reject browser requests from unknown origins. */
  const checkOrigin = async (req: FastifyRequest) => {
    const origin = req.headers.origin
    if (origin && !config.CORS_ORIGINS.includes(origin)) throw forbidden('Origin not allowed.')
  }

  app.post('/register', { config: limit, schema: { tags, summary: 'Create an account (stays pending until an admin approves it)', security: [], body: registerBody, response: { 202: messageOut } } }, async (req, reply) => {
    await svc.register(req.body, req)
    return reply.code(202).send({ message: 'Thanks. Your account will be active once an admin approves it.' })
  })

  app.post('/login', { config: limit, schema: { tags, summary: 'Sign in', security: [], body: loginBody, response: { 200: sessionOut } } }, async (req, reply) => {
    const s = await svc.login(req.body, req)
    setCookie(reply, s)
    return toBody(s)
  })

  app.post('/refresh', { config: limit, onRequest: checkOrigin, schema: { tags, summary: 'Rotate the refresh cookie and get a new access token', security: [], response: { 200: sessionOut } } }, async (req, reply) => {
    try {
      const s = await svc.refresh(req.cookies[REFRESH_COOKIE], req)
      setCookie(reply, s)
      return toBody(s)
    } catch (err) {
      clearCookie(reply)
      throw err
    }
  })

  app.post('/logout', { config: limit, onRequest: checkOrigin, schema: { tags, summary: 'Revoke this login session', security: [], response: { 200: messageOut } } }, async (req, reply) => {
    await svc.logout(req.cookies[REFRESH_COOKIE], req)
    clearCookie(reply)
    return { message: 'Signed out.' }
  })

  app.post('/logout-all', { onRequest: authenticate, schema: { tags, summary: 'Sign out of every device', response: { 200: messageOut } } }, async (req, reply) => {
    await svc.logoutAll(auth(req).user.id, req)
    clearCookie(reply)
    return { message: 'Signed out everywhere.' }
  })

  app.get('/me', { onRequest: authenticate, schema: { tags, summary: 'Current user and permissions', response: { 200: meOut } } }, async (req) => {
    const a = auth(req)
    return { ...a.user, permissions: [...a.permissions] }
  })

  app.post('/change-password', { config: limit, onRequest: authenticate, schema: { tags, summary: 'Change password (signs out other devices)', body: changePasswordBody, response: { 200: sessionOut } } }, async (req, reply) => {
    const s = await svc.changePassword(auth(req).user.id, req.body.currentPassword, req.body.newPassword, req)
    setCookie(reply, s)
    return toBody(s)
  })

  app.post('/forgot-password', { config: limit, schema: { tags, summary: 'Email a reset link (always answers 202)', security: [], body: forgotBody, response: { 202: messageOut } } }, async (req, reply) => {
    await svc.forgotPassword(req.body.email, req)
    return reply.code(202).send({ message: 'If that email has an account, a reset link is on its way.' })
  })

  app.post('/reset-password', { config: limit, schema: { tags, summary: 'Set a new password with a reset token', security: [], body: resetBody, response: { 200: messageOut } } }, async (req) => {
    await svc.resetPassword(req.body.token, req.body.password, req)
    return { message: 'Password updated. You can sign in now.' }
  })
}
