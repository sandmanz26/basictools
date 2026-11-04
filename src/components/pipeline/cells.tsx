import { useEffect, useState } from 'react'
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
  value, onCommit, readOnly, scale = 1, placeholder, format,
}: {
  value: number | null
  onCommit: (v: number | null) => void
  readOnly?: boolean
  scale?: number
  placeholder?: string
  format?: (n: number) => string
}) {
  const display = value == null ? '' : String(value / scale)
  const [v, setV] = useState(display)
  const [focus, setFocus] = useState(false)
  useEffect(() => setV(display), [display])
  const shown = value == null ? '' : format ? format(value) : String(value)
  if (readOnly) return <div className="px-2 py-1.5 text-right text-[13px] tabular-nums">{shown || <span className="text-muted-foreground/50">—</span>}</div>
  return (
    <input
      inputMode="numeric"
      value={focus ? v : shown}
      placeholder={placeholder}
      className={cn(base, 'text-right tabular-nums')}
      onFocus={() => setFocus(true)}
      onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))}
      onBlur={() => {
        setFocus(false)
        const n = v === '' ? null : Number(v) * scale
        if (n !== value) onCommit(n)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
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
    <div className="relative px-1 py-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full cursor-pointer appearance-none rounded-md px-1.5 py-0.5 text-xs font-medium outline-none hover:brightness-95 focus:ring-2 focus:ring-ring',
          tone ?? 'bg-transparent text-[13px] font-normal hover:bg-muted/60',
        )}
      >
        {!options.some((o) => o.value === value) && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-background text-foreground">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
