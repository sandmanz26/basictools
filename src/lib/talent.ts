import type { Talent } from '@/types'

const norm = (s: string) => s.trim().toLowerCase()
const digits = (s: string) => s.replace(/\D/g, '')

/** Find an existing pool entry for a person: email first, then phone, then same name when one side has no email. */
export function findTalent(talents: Talent[], p: { name: string; email: string; phone: string }): Talent | undefined {
  if (p.email) {
    const t = talents.find((x) => x.email && norm(x.email) === norm(p.email))
    if (t) return t
  }
  if (digits(p.phone).length >= 6) {
    const t = talents.find((x) => digits(x.phone) === digits(p.phone))
    if (t) return t
  }
  if (p.name) {
    return talents.find((x) => norm(x.name) === norm(p.name) && (!x.email || !p.email))
  }
  return undefined
}
