import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** Format a number the Indonesian way: 1.250.000 (and 1.250,5 with decimals). */
export const formatNumber = (n: number | null | undefined, decimals = 0) =>
  n == null || Number.isNaN(n) ? '' : n.toLocaleString('id-ID', { maximumFractionDigits: decimals, useGrouping: true })

function parse(text: string): number | null {
  const t = text.replace(/\./g, '').replace(',', '.')
  if (t === '' || t === '-' || t === '.' || t === '-.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Number field that formats as you type (thousands separators) and keeps the caret where it was.
 * Use this for every numeric input in the app; never `<input type="number">`.
 */
export function NumberInput({
  value, onValueChange, min, max, decimals = 0, className, disabled, placeholder, 'aria-label': ariaLabel, id, bare, autoFocus, onBlur: onBlurProp, onKeyDown,
}: {
  value: number | null | undefined
  onValueChange: (v: number | null) => void
  min?: number
  max?: number
  decimals?: number
  className?: string
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
  id?: string
  bare?: boolean // render a plain <input> (for table cells) instead of the styled field
  autoFocus?: boolean
  onBlur?: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [text, setText] = useState(formatNumber(value, decimals))
  const ref = useRef<HTMLInputElement>(null)
  const caret = useRef<number | null>(null)

  // Follow outside changes (reset, other field) without fighting what the user is typing.
  useEffect(() => { if (parse(text) !== (value ?? null)) setText(formatNumber(value, decimals)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (caret.current != null && ref.current) { ref.current.setSelectionRange(caret.current, caret.current); caret.current = null }
  })

  const allowNeg = (min ?? 0) < 0
  // "1,250,500.75" (US format) pasted into an Indonesian-format field must not turn into 1.25050075.
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const t = e.clipboardData.getData('text').trim()
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) || /^-?\d+\.\d{1,2}$/.test(t)) {
      e.preventDefault()
      const n = Number(t.replace(/,/g, ''))
      if (Number.isFinite(n)) { const v = decimals > 0 ? Math.round(n * 10 ** decimals) / 10 ** decimals : Math.round(n); setText(formatNumber(v, decimals)); onValueChange(v) }
    }
  }
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const pos = e.target.selectionStart ?? raw.length
    const sig = (s: string) => s.replace(/[^\d,-]/g, '').length // characters that matter (not the separators)
    const before = sig(raw.slice(0, pos))

    let cleaned = raw.replace(/[^\d,-]/g, '')
    const neg = allowNeg && cleaned.startsWith('-')
    cleaned = cleaned.replace(/-/g, '')
    let [int = '', ...rest] = cleaned.split(',')
    const hasComma = decimals > 0 && cleaned.includes(',')
    const frac = rest.join('').slice(0, decimals)
    int = int.replace(/^0+(?=\d)/, '')
    const next = (neg ? '-' : '') + group(int) + (hasComma ? ',' + frac : '')

    // put the caret after the same number of meaningful characters
    let seen = 0, at = 0
    while (at < next.length && seen < before + (neg ? 0 : 0)) { if (/[\d,-]/.test(next[at])) seen++; at++ }
    caret.current = at
    setText(next)
    onValueChange(parse(next))
  }

  const onBlur = () => {
    const n = parse(text)
    if (n == null) { setText(''); onBlurProp?.(); return }
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
    if (c !== n) onValueChange(c)
    setText(formatNumber(c, decimals))
    onBlurProp?.()
  }

  const common = {
    ref, id, inputMode: (decimals > 0 ? 'decimal' : 'numeric') as 'decimal' | 'numeric', autoComplete: 'off', value: text, onChange, onBlur, onKeyDown, onPaste,
    disabled, placeholder, autoFocus, 'aria-label': ariaLabel,
  }
  return bare ? <input {...common} className={cn('tabular-nums', className)} /> : <Input {...common} className={cn('tabular-nums', className)} />
}
