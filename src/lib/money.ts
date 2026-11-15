import type { Currency } from '@/types'

export const CURRENCIES: { id: Currency; label: string; symbol: string; decimals: number }[] = [
  { id: 'IDR', label: 'Rupiah (IDR)', symbol: 'Rp', decimals: 0 },
  { id: 'USD', label: 'US dollar (USD)', symbol: 'US$', decimals: 2 },
  { id: 'JPY', label: 'Japanese yen (JPY)', symbol: '¥', decimals: 0 },
]
export const currencyOptions = CURRENCIES.map((c) => ({ value: c.id, label: c.label }))

const meta = (c: Currency = 'IDR') => CURRENCIES.find((x) => x.id === c) ?? CURRENCIES[0]
/** Records created before currencies existed have none: they are rupiah. */
export const curOf = (x: { currency?: Currency }): Currency => x.currency ?? 'IDR'
export const decimalsOf = (c: Currency = 'IDR') => meta(c).decimals

/** Round to the currency's smallest unit (cents for USD, whole rupiah / yen). Avoids 0.1 + 0.2 style drift. */
export const roundCur = (n: number, c: Currency = 'IDR') => { const f = 10 ** meta(c).decimals; return Math.round((n + Number.EPSILON) * f) / f }

/** Full amount with the currency sign: Rp 1.500.000 · US$ 1,200.50 · ¥ 150,000. */
export function fmtMoney(n: number | null | undefined, c: Currency = 'IDR'): string {
  if (n == null || Number.isNaN(n)) return '—'
  const m = meta(c)
  const body = Math.abs(n).toLocaleString(c === 'IDR' ? 'id-ID' : 'en-US', { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals })
  return `${n < 0 ? '-' : ''}${m.symbol} ${body}`
}

/** Compact form for dashboards: Rp 1,8 M / Rp 450 jt for rupiah, full amount for other currencies. */
export function fmtCompact(n: number | null | undefined, c: Currency = 'IDR'): string {
  if (n == null) return '—'
  if (c !== 'IDR') return fmtMoney(n, c)
  const a = Math.abs(n)
  if (a >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`
  if (a >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  return `Rp ${n.toLocaleString('id-ID')}`
}

export type Totals = Partial<Record<Currency, number>>

/** Add an amount to a per-currency total. Currencies are never mixed into one number. */
export const addTo = (t: Totals, c: Currency, n: number): Totals => ({ ...t, [c]: roundCur((t[c] ?? 0) + n, c) })

/** "Rp 10 jt + US$ 1,200.00", or a dash when empty. */
export function fmtTotals(t: Totals, compact = false): string {
  const parts = CURRENCIES.filter((c) => (t[c.id] ?? 0) !== 0).map((c) => (compact ? fmtCompact(t[c.id], c.id) : fmtMoney(t[c.id], c.id)))
  return parts.length ? parts.join(' + ') : (compact ? fmtCompact(0, 'IDR') : fmtMoney(0, 'IDR'))
}

export const sumBy = <T>(list: T[], cur: (x: T) => Currency, amount: (x: T) => number): Totals =>
  list.reduce<Totals>((t, x) => addTo(t, cur(x), amount(x)), {})
