import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import { useStore } from '@/store'
import { USERS } from '@/data/mock'
import type { User } from '@/types'
import {
  DEMO_PASSWORD, LOCK_MS, MAX_LOGIN_FAILS, MAX_RESET_TRIES, RESET_TTL_MS, SESSION_LONG_MS, SESSION_SHORT_MS, SHOW_RESET_CODE,
  hashSecret, normEmail, passwordOk, randomCode, randomHex, safeEqual, validEmail,
} from '@/lib/auth'

interface Cred { userId: string; email: string; salt: string; hash: string }
interface Session { userId: string; expiresAt: number }
interface ResetReq { salt: string; hash: string; expiresAt: number; tries: number }
type Result = { ok: true } | { ok: false; error: string }

interface AuthState {
  creds: Cred[]
  session: Session | null
  resets: Record<string, ResetReq>
  fails: Record<string, { count: number; until: number }>
  seeded: boolean

  login: (email: string, password: string, remember: boolean) => Promise<Result>
  register: (name: string, email: string, password: string) => Promise<Result>
  logout: () => void
  changePassword: (current: string, next: string) => Promise<Result>
  requestReset: (email: string) => Promise<{ code?: string }>
  confirmReset: (email: string, code: string, next: string) => Promise<Result>
}

const BAD = 'Incorrect email or password.'
const bad = (error: string): Result => ({ ok: false, error })

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      creds: [],
      session: null,
      resets: {},
      fails: {},
      seeded: false,

      login: async (rawEmail, password, remember) => {
        await ready
        const email = normEmail(rawEmail)
        const f = get().fails[email]
        if (f && f.until > Date.now()) return bad(`Too many attempts. Try again in ${Math.ceil((f.until - Date.now()) / 1000)}s.`)

        const cred = get().creds.find((c) => c.email === email)
        // Always hash so a missing account takes as long as a wrong password.
        const hash = await hashSecret(password, cred?.salt ?? 'x'.repeat(32))
        const user = cred && useStore.getState().users.find((u) => u.id === cred.userId)
        if (!cred || !user || !safeEqual(hash, cred.hash)) {
          const count = (f?.count ?? 0) + 1
          set((s) => ({ fails: { ...s.fails, [email]: count >= MAX_LOGIN_FAILS ? { count: 0, until: Date.now() + LOCK_MS } : { count, until: 0 } } }))
          return bad(BAD)
        }
        if (user.status === 'pending') return bad('Your account is waiting for an admin to approve it.')
        if (user.status === 'disabled') return bad('This account is disabled. Ask an admin to re-enable it.')

        set((s) => {
          const fails = { ...s.fails }
          delete fails[email]
          return { fails, session: { userId: user.id, expiresAt: Date.now() + (remember ? SESSION_LONG_MS : SESSION_SHORT_MS) } }
        })
        return { ok: true }
      },

      register: async (rawName, rawEmail, password) => {
        await ready
        const name = rawName.trim()
        const email = normEmail(rawEmail)
        if (!name) return bad('Enter your name.')
        if (!validEmail(email)) return bad('Enter a valid email address.')
        if (!passwordOk(password)) return bad('Password needs 8+ characters with a letter and a number.')
        const taken = get().creds.some((c) => c.email === email) || useStore.getState().users.some((u) => normEmail(u.email) === email)
        if (taken) return bad('An account with this email already exists. Try signing in instead.')

        const salt = randomHex()
        const hash = await hashSecret(password, salt)
        const user: User = { id: 'u-' + nanoid(6), name, email, roleId: 'r-viewer', status: 'pending' }
        useStore.getState().addUser(user)
        set((s) => ({ creds: [...s.creds, { userId: user.id, email, salt, hash }] }))
        return { ok: true }
      },

      logout: () => set({ session: null }),

      changePassword: async (current, next) => {
        const uid = get().session?.userId
        const cred = get().creds.find((c) => c.userId === uid)
        if (!cred) return bad('You are not signed in.')
        if (!safeEqual(await hashSecret(current, cred.salt), cred.hash)) return bad('Current password is wrong.')
        if (!passwordOk(next)) return bad('Password needs 8+ characters with a letter and a number.')
        if (current === next) return bad('Choose a different password than the current one.')
        const salt = randomHex()
        const hash = await hashSecret(next, salt)
        set((s) => ({ creds: s.creds.map((c) => (c.userId === uid ? { ...c, salt, hash } : c)) }))
        return { ok: true }
      },

      requestReset: async (rawEmail) => {
        await ready
        const email = normEmail(rawEmail)
        if (!get().creds.some((c) => c.email === email)) return {}
        const code = randomCode()
        const salt = randomHex()
        const hash = await hashSecret(code, salt)
        set((s) => ({ resets: { ...s.resets, [email]: { salt, hash, expiresAt: Date.now() + RESET_TTL_MS, tries: 0 } } }))
        // TODO(backend): email the code instead of returning it.
        return SHOW_RESET_CODE ? { code } : {}
      },

      confirmReset: async (rawEmail, code, next) => {
        const email = normEmail(rawEmail)
        const r = get().resets[email]
        const dropReset = () => set((s) => { const resets = { ...s.resets }; delete resets[email]; return { resets } })
        const invalid = 'That code is not valid. Check it or request a new one.'
        if (!r) return bad(invalid)
        if (r.expiresAt < Date.now()) { dropReset(); return bad('That code has expired. Request a new one.') }
        if (!passwordOk(next)) return bad('Password needs 8+ characters with a letter and a number.')
        if (!safeEqual(await hashSecret(code.trim(), r.salt), r.hash)) {
          if (r.tries + 1 >= MAX_RESET_TRIES) { dropReset(); return bad('Too many wrong codes. Request a new one.') }
          set((s) => ({ resets: { ...s.resets, [email]: { ...r, tries: r.tries + 1 } } }))
          return bad(invalid)
        }
        const salt = randomHex()
        const hash = await hashSecret(next, salt)
        set((s) => {
          const resets = { ...s.resets }
          delete resets[email]
          const fails = { ...s.fails }
          delete fails[email]
          return { resets, fails, creds: s.creds.map((c) => (c.email === email ? { ...c, salt, hash } : c)) }
        })
        return { ok: true }
      },
    }),
    { name: 'hireflow-auth-v1' },
  ),
)

/** Give the demo accounts a known password the first time the app runs. */
const ready: Promise<void> = (async () => {
  if (useAuth.getState().seeded) return
  const creds: Cred[] = []
  for (const u of USERS) {
    const salt = randomHex()
    creds.push({ userId: u.id, email: normEmail(u.email), salt, hash: await hashSecret(DEMO_PASSWORD, salt) })
  }
  useAuth.setState((s) => ({ seeded: true, creds: [...s.creds.filter((c) => !creds.some((d) => d.email === c.email)), ...creds] }))
})().catch(() => undefined)

/** The signed-in user, or null when there is no valid session. */
export function useSessionUser(): User | null {
  const session = useAuth((s) => s.session)
  const user = useStore((s) => (session ? s.users.find((u) => u.id === session.userId) : undefined))
  if (!session || session.expiresAt < Date.now() || !user || (user.status && user.status !== 'active')) return null
  return user
}

// Keep the rest of the app (permissions, "owner" fields) pointed at whoever is signed in.
const sync = () => {
  const id = useAuth.getState().session?.userId
  if (id && useStore.getState().currentUserId !== id) useStore.setState({ currentUserId: id })
}
useAuth.subscribe(sync)
sync()
