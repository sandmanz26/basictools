import argon2 from 'argon2'
import type { Config } from '../config.js'

/** Same rules as the frontend src/lib/auth.ts PASSWORD_RULES. */
export const PASSWORD_RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'letter', label: 'A letter', test: (p) => /[A-Za-z]/.test(p) },
  { id: 'num', label: 'A number', test: (p) => /\d/.test(p) },
]
export const PASSWORD_MAX = 128
export const PASSWORD_MESSAGE = 'Password needs 8+ characters with a letter and a number.'
export const passwordOk = (p: string) => p.length <= PASSWORD_MAX && PASSWORD_RULES.every((r) => r.test(p))

export interface PasswordHasher {
  hash: (plain: string) => Promise<string>
  verify: (hash: string, plain: string) => Promise<boolean>
  /** Verify against a throwaway hash so unknown accounts cost the same time as wrong passwords. */
  burn: (plain: string) => Promise<void>
}

export function createPasswordHasher(config: Pick<Config, 'ARGON2_MEMORY_KIB' | 'ARGON2_TIME_COST'>): PasswordHasher {
  const opts: argon2.HashOptions = { type: argon2.argon2id, memoryCost: config.ARGON2_MEMORY_KIB, timeCost: config.ARGON2_TIME_COST, parallelism: 1 }
  let dummy: Promise<string> | undefined
  return {
    hash: (plain) => argon2.hash(plain, opts),
    verify: async (hash, plain) => {
      try {
        return await argon2.verify(hash, plain)
      } catch {
        return false
      }
    },
    burn: async (plain) => {
      dummy ??= argon2.hash('dummy-password-for-timing', opts)
      await argon2.verify(await dummy, plain).catch(() => false)
    },
  }
}
