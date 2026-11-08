import { useEffect, useState } from 'react'
import { Dropdown } from '@/components/Dropdown'
import { NumberInput, formatNumber } from '@/components/NumberInput'
import { cn } from '@/lib/utils'

const base =
  'w-full min-w-0 bg-transparent px-2 py-1.5 text-[13px] outline-none rounded-sm transition-colors hover:bg-muted/60 focus:bg-background focus:ring-2 focus:ring-ring focus:ring-inset'

export function TextCell({
  value, onCommit, readOnly, placeholder, className, type = 'text',
}: {
  value: string
  onCommit: (v: string) => void
  readOnly?: boolean
  placeholder?: string
  className?: string
  type?: 'text' | 'date' | 'time'
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  if (readOnly) return <div className={cn('px-2 py-1.5 text-[13px] truncate', className)}>{value || <span className="text-muted-foreground/50">—</span>}</div>
  return (
    <input
      type={type}
      value={v}
      placeholder={placeholder}
      className={cn(base, type !== 'text' && 'tabular-nums', className)}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setV(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

export function NumberCell({
  value, onCommit, readOnly, scale = 1, placeholder, format, align = 'right',
}: {
  value: number | null
  onCommit: (v: number | null) => void
  readOnly?: boolean
  scale?: number // 1_000_000 = the cell shows/edits millions
  placeholder?: string
  format?: (n: number) => string
  align?: 'right' | 'center'
}) {
  const [focus, setFocus] = useState(false)
  const [draft, setDraft] = useState<number | null>(null)
  const shown = value == null ? '' : format ? format(value) : formatNumber(value)
  const alignCls = align === 'center' ? 'text-center' : 'text-right'
  if (readOnly) return <div className={cn('px-2 py-1.5 text-[13px] tabular-nums', alignCls)}>{shown || <span className="text-muted-foreground/50">—</span>}</div>
  if (!focus)
    return (
      <input
        readOnly
        value={shown}
        placeholder={placeholder}
        className={cn(base, 'cursor-text tabular-nums', alignCls)}
        onFocus={() => { setDraft(value == null ? null : value / scale); setFocus(true) }}
      />
    )
  return (
    <NumberInput
      bare
      autoFocus
      decimals={scale > 1 ? 2 : 0}
      value={draft}
      onValueChange={setDraft}
      placeholder={placeholder}
      className={cn(base, alignCls)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(value == null ? null : value / scale); (e.target as HTMLInputElement).blur() } }}
      onBlur={() => {
        setFocus(false)
        const n = draft == null ? null : Math.round(draft * scale)
        if (n !== value) onCommit(n)
      }}
    />
  )
}

export function SelectCell({
  value, options, onChange, readOnly, tone, placeholder = '—',
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  readOnly?: boolean
  tone?: string // pill classes
  placeholder?: string
}) {
  const label = options.find((o) => o.value === value)?.label
  if (readOnly)
    return (
      <div className="px-2 py-1.5">
        <span className={cn('inline-block rounded-md px-1.5 py-0.5 text-xs font-medium', tone)}>{label ?? placeholder}</span>
      </div>
    )
  return (
    <div className="px-1 py-1">
      <Dropdown
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        hideChevron={!!tone}
        triggerClassName={cn(
          'flex w-full cursor-pointer items-center justify-between gap-1 rounded-md px-1.5 py-0.5 text-left outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring',
          tone ?? 'bg-transparent text-[13px] font-normal hover:bg-muted/60',
          tone && 'text-xs font-medium',
        )}
      />
    </div>
  )
}

const jt = (n: number) => (n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'

/** Expected salary as "min – max" in million IDR, kept compact so the two numbers sit together. */
export function RangeCell({
  min, max, onCommit, readOnly,
}: {
  min: number | null
  max: number | null
  onCommit: (min: number | null, max: number | null) => void
  readOnly?: boolean
}) {
  if (readOnly) {
    const t = min == null && max == null ? '' : min != null && max != null && min !== max ? `${jt(min)} – ${jt(max)}` : jt((min ?? max)!)
    return <div className="px-2 py-1.5 text-center text-[13px] tabular-nums whitespace-nowrap">{t || <span className="text-muted-foreground/50">—</span>}</div>
  }
  return (
    <div className="flex items-center justify-center gap-0.5 px-1">
      <div className="w-[4.75rem]">
        <NumberCell align="center" value={min} scale={1_000_000} format={jt} placeholder="Min" onCommit={(v) => onCommit(v, max != null && v != null && max < v ? v : max)} />
      </div>
      <span className="text-muted-foreground">–</span>
      <div className="w-[4.75rem]">
        <NumberCell align="center" value={max} scale={1_000_000} format={jt} placeholder="Max" onCommit={(v) => onCommit(min != null && v != null && min > v ? v : min, v)} />
      </div>
    </div>
  )
}
