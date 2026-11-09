import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** URL-safe random token with `bytes` of entropy. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** Fast hash for high-entropy tokens (refresh, reset). Not for passwords. */
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}
