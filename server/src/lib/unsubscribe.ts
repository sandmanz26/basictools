import { hmacSign, safeEqual } from './crypto.js'

export interface UnsubscribePayload {
  email: string
  broadcastId: string
}

/** Signed, tamper-proof token: base64url(json).hmac. No expiry on purpose: an unsubscribe link must keep working. */
export function signUnsubscribeToken(secret: string, p: UnsubscribePayload): string {
  const body = Buffer.from(JSON.stringify({ e: p.email.toLowerCase(), b: p.broadcastId })).toString('base64url')
  return `${body}.${hmacSign(secret, `unsub:${body}`)}`
}

export function verifyUnsubscribeToken(secret: string, token: string): UnsubscribePayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig || !safeEqual(sig, hmacSign(secret, `unsub:${body}`))) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { e?: unknown; b?: unknown }
    return typeof parsed.e === 'string' && typeof parsed.b === 'string' ? { email: parsed.e, broadcastId: parsed.b } : null
  } catch {
    return null
  }
}
