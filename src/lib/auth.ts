// Client-side auth helpers. There is no backend yet, so this is a *demo-grade*
// login: passwords are salted + hashed (PBKDF2) before they are stored, but the
// data still lives in this browser and can be edited by anyone with devtools.
// Swap `useAuth` for real API calls when a backend exists.

export const DEMO_PASSWORD = 'hireflow123'
/** No mail server yet: show the reset code on screen. Set to false once reset codes are emailed. */
export const SHOW_RESET_CODE = true
export const RESET_TTL_MS = 10 * 60 * 1000
export const MAX_RESET_TRIES = 5
export const MAX_LOGIN_FAILS = 5
export const LOCK_MS = 60 * 1000
export const SESSION_SHORT_MS = 12 * 60 * 60 * 1000
export const SESSION_LONG_MS = 30 * 24 * 60 * 60 * 1000
const ITERATIONS = 100_000

const enc = new TextEncoder()
const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer), (x) => x.toString(16).padStart(2, '0')).join('')

export function randomHex(bytes = 16) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function hashSecret(secret: string, salt: string): Promise<string> {
  if (!crypto?.subtle) throw new Error('Secure crypto is unavailable. Open the app on localhost or over https.')
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: ITERATIONS }, key, 256)
  return toHex(bits)
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

export const normEmail = (e: string) => e.trim().toLowerCase()
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

export const PASSWORD_RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'letter', label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { id: 'num', label: 'A number', test: (p) => /\d/.test(p) },
]
export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p))
