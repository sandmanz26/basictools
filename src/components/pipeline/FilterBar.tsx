import { Archive, CalendarClock, ChevronDown, EyeOff, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { activeCount, emptyFilters, type Filters } from '@/lib/filters'
import { ARRANGEMENTS, SOURCES } from '@/lib/constants'
import type { Position, Stage } from '@/types'

function Multi({
  label, options, value, onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant={value.length ? 'secondary' : 'outline'} size="sm" />}>
        {label}
        {value.length > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{value.length}</Badge>}
        <ChevronDown className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={value.includes(o.value)}
            closeOnClick={false}
            onCheckedChange={(on) => onChange(on ? [...value, o.value] : value.filter((x) => x !== o.value))}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function FilterBar({
  filters, onChange, positions, stages, owners, showSalary = true,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  positions: Position[]
  stages: Stage[]
  owners: string[]
  showSalary?: boolean
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })
  const n = activeCount(filters)
  const extra =
    filters.sources.length + filters.owners.length + (filters.salaryMin ? 1 : 0) + (filters.salaryMax ? 1 : 0) +
    (filters.upcoming ? 1 : 0) + (filters.hideClosed ? 1 : 0) + (filters.archived ? 1 : 0)
  const toggle = (label: string, icon: React.ReactNode, on: boolean, key: 'upcoming' | 'hideClosed' | 'archived') => (
    <button
      type="button"
      onClick={() => set(key, !on)}
      className={cn('flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted', on && 'border-primary bg-primary/5')}
    >
      <span className="flex items-center gap-2">{icon} {label}</span>
      <span className={cn('size-4 rounded-full border', on && 'border-primary bg-primary')} />
    </button>
  )
  // `contents` lets the parent toolbar lay these controls out in one wrapping row.
  return (
    <div className="contents">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.q} onChange={(e) => set('q', e.target.value)} placeholder="Search name, email, next step…" className="h-8 w-60 pl-8" />
      </div>
      <Multi label="Position" options={positions.map((p) => ({ value: p.id, label: p.title }))} value={filters.positions} onChange={(v) => set('positions', v)} />
      <Multi label="Stage" options={stages.map((s) => ({ value: s.id, label: s.label }))} value={filters.stages} onChange={(v) => set('stages', v as Filters['stages'])} />
      <Multi label="Work" options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} value={filters.arrangements} onChange={(v) => set('arrangements', v)} />
      <Popover>
        <PopoverTrigger render={<Button variant={extra ? 'secondary' : 'outline'} size="sm" />}>
          <SlidersHorizontal className="size-3.5" /> More filters
          {extra > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{extra}</Badge>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Quick views</div>
            <div className="grid gap-1.5">
              {toggle('Interview in the next 7 days', <CalendarClock className="size-3.5" />, filters.upcoming, 'upcoming')}
              {toggle('Hide rejected', <EyeOff className="size-3.5" />, filters.hideClosed, 'hideClosed')}
              {toggle('Archived only', <Archive className="size-3.5" />, filters.archived, 'archived')}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Source</div>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((s) => {
                const on = filters.sources.includes(s)
                return <Button key={s} size="xs" variant={on ? 'default' : 'outline'} onClick={() => set('sources', on ? filters.sources.filter((x) => x !== s) : [...filters.sources, s])}>{s}</Button>
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">HR owner</div>
            <div className="flex flex-wrap gap-1.5">
              {owners.map((s) => {
                const on = filters.owners.includes(s)
                return <Button key={s} size="xs" variant={on ? 'default' : 'outline'} onClick={() => set('owners', on ? filters.owners.filter((x) => x !== s) : [...filters.owners, s])}>{s}</Button>
              })}
            </div>
          </div>
          {showSalary && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Expected salary (million IDR)</div>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="Min" value={filters.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} className="h-8" />
                <span className="text-muted-foreground">–</span>
                <Input type="number" placeholder="Max" value={filters.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} className="h-8" />
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {n > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)}>
          <X className="size-3.5" /> Clear ({n})
        </Button>
      )}
    </div>
  )
}
