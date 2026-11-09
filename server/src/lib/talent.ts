export interface PersonKey {
  name: string
  email: string
  phone: string
}

const norm = (s: string) => s.trim().toLowerCase()
const digits = (s: string) => s.replace(/\D/g, '')

/**
 * Pool lookup with the same semantics as the frontend findTalent (src/lib/talent.ts):
 * email first, then phone (6+ digits), then same name when one side has no email.
 * Backed by maps so importing thousands of rows stays linear.
 */
export class TalentIndex<T extends PersonKey> {
  private byEmail = new Map<string, T>()
  private byPhone = new Map<string, T>()
  private byName = new Map<string, T[]>()

  constructor(items: Iterable<T> = []) {
    for (const t of items) this.add(t)
  }

  add(t: T): void {
    if (t.email && !this.byEmail.has(norm(t.email))) this.byEmail.set(norm(t.email), t)
    const d = digits(t.phone)
    if (d && !this.byPhone.has(d)) this.byPhone.set(d, t)
    const n = norm(t.name)
    if (n) this.byName.set(n, [...(this.byName.get(n) ?? []), t])
  }

  find(p: PersonKey): T | undefined {
    if (p.email) {
      const t = this.byEmail.get(norm(p.email))
      if (t) return t
    }
    if (digits(p.phone).length >= 6) {
      const t = this.byPhone.get(digits(p.phone))
      if (t) return t
    }
    if (p.name) return this.byName.get(norm(p.name))?.find((x) => !x.email || !p.email)
    return undefined
  }
}
