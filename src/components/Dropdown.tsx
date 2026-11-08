import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface DropdownOption { value: string; label: string; hint?: string }

/** Lists with more options than this get a search box. */
export const SEARCH_AFTER = 4

/**
 * The app's single select control. Always a custom popover list (never the browser's native select),
 * with a search box when there are more than 4 options. Fully keyboard operable.
 */
export function Dropdown({
  value, onChange, options, className, triggerClassName, disabled, placeholder = 'Select…', hideChevron, align = 'start', ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: DropdownOption[]
  className?: string
  triggerClassName?: string // replaces the default input-like look, e.g. for status pills inside tables
  disabled?: boolean
  placeholder?: string
  hideChevron?: boolean
  align?: 'start' | 'center' | 'end'
  ariaLabel?: string
}) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const searchable = options.length > SEARCH_AFTER

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
  }, [options, query])
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  const pick = (o: DropdownOption) => { onChange(o.value); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1) }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]) }
  }

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          triggerClassName ?? 'flex h-8 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
          'cursor-pointer disabled:cursor-not-allowed',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>{selected?.label ?? placeholder}</span>
        {!hideChevron && <ChevronDown className="size-3.5 shrink-0 opacity-60" />}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto min-w-[max(11rem,var(--anchor-width))] max-w-80 gap-0 p-1"
        initialFocus={searchable ? searchRef : listRef}
        onKeyDown={onKey}
      >
        {searchable && (
          <div className="relative p-1 pb-1.5">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-[60%] text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search options"
              role="combobox"
              aria-expanded
              aria-controls={uid + '-list'}
              aria-activedescendant={shown[active] ? `${uid}-${active}` : undefined}
              className="h-8 w-full rounded-md border bg-transparent pr-2 pl-8 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        )}
        <div ref={listRef} id={uid + '-list'} role="listbox" tabIndex={-1} aria-activedescendant={!searchable && shown[active] ? `${uid}-${active}` : undefined} className="max-h-64 overflow-y-auto outline-none">
          {shown.map((o, i) => (
            <button
              key={o.value}
              id={`${uid}-${i}`}
              type="button"
              role="option"
              aria-selected={o.value === value}
              data-active={i === active}
              tabIndex={-1}
              onMouseMove={() => active !== i && setActive(i)}
              onClick={() => pick(o)}
              className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', i === active && 'bg-muted')}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}{o.hint && <span className="ml-2 text-xs text-muted-foreground">{o.hint}</span>}</span>
              {o.value === value && <Check className="size-3.5 shrink-0" />}
            </button>
          ))}
          {shown.length === 0 && <div className="px-2 py-3 text-center text-sm text-muted-foreground">No matches</div>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
