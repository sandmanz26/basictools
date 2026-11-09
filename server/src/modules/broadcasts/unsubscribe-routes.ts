import { and, eq, sql } from 'drizzle-orm'
import type { FastifyPluginAsync } from 'fastify'
import { broadcastRecipients, emailSuppressions, leads } from '../../db/schema.js'
import { audit } from '../../lib/audit.js'
import { verifyUnsubscribeToken } from '../../lib/unsubscribe.js'
import { strictLimit } from '../../plugins/security.js'

const page = (title: string, body: string, form = '') =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#111}button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#111;color:#fff;cursor:pointer}</style></head>
<body><h1 style="font-size:20px">${title}</h1><p>${body}</p>${form}</body></html>`

/**
 * Public one-click unsubscribe.
 *  - POST performs it (RFC 8058: mail clients POST "List-Unsubscribe=One-Click" with no login).
 *  - GET only shows a confirm button, so link scanners that prefetch URLs cannot unsubscribe people by accident.
 */
export const unsubscribeRoutes: FastifyPluginAsync = async (app) => {
  const { db, config } = app.ctx
  const limit = strictLimit(config)
  // Mail clients send form-encoded bodies; we do not need their content.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, _body, done) => done(null, {}))

  const invalid = (reply: { code: (n: number) => { type: (t: string) => { send: (b: string) => unknown } } }) =>
    reply.code(400).type('text/html').send(page('Link not valid', 'This unsubscribe link is not valid. Reply to the email and we will remove you by hand.'))

  app.get('/unsubscribe/:token', { config: limit, schema: { hide: true } }, async (req, reply) => {
    const { token } = req.params as { token: string }
    const p = verifyUnsubscribeToken(config.UNSUBSCRIBE_SECRET, token)
    if (!p) return invalid(reply)
    const form = `<form method="post" action="/api/v1/unsubscribe/${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`
    return reply.type('text/html').send(page('Unsubscribe', 'Confirm that you no longer want to receive these emails.', form))
  })

  app.post('/unsubscribe/:token', { config: limit, schema: { hide: true } }, async (req, reply) => {
    const { token } = req.params as { token: string }
    const p = verifyUnsubscribeToken(config.UNSUBSCRIBE_SECRET, token)
    if (!p) return invalid(reply)
    const email = p.email.toLowerCase()
    await db.transaction(async (tx) => {
      await tx.insert(emailSuppressions).values({ email, reason: 'unsubscribe', broadcastId: /^[0-9a-f-]{36}$/i.test(p.broadcastId) ? p.broadcastId : null }).onConflictDoNothing()
      await tx.update(leads).set({ unsubscribed: true }).where(sql`lower(${leads.email}) = ${email}`)
      // Anything still queued for this address, in any broadcast, is dropped.
      await tx
        .update(broadcastRecipients)
        .set({ status: 'skipped', error: 'Unsubscribed.' })
        .where(and(eq(broadcastRecipients.email, email), eq(broadcastRecipients.status, 'pending')))
    })
    await audit(db, req, { action: 'email.unsubscribe', entity: 'suppression', entityId: email, meta: { broadcastId: p.broadcastId } })
    return reply.type('text/html').send(page('You are unsubscribed', 'You will not receive more emails from us.'))
  })
}
