import { Archive, CalendarClock, ChevronDown, EyeOff, Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  filters, onChange, positions, stages, owners, showSalary = true, total, shown,
}: {
  filters: Filters
  onChange: (f: Filters) => void
  positions: Position[]
  stages: Stage[]
  owners: string[]
  showSalary?: boolean
  total: number
  shown: number
}) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v })
  const n = activeCount(filters)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          placeholder="Search name, email, next step…"
          className="h-7 w-64 pl-8"
        />
      </div>
      <Multi label="Position" options={positions.map((p) => ({ value: p.id, label: p.title }))} value={filters.positions} onChange={(v) => set('positions', v)} />
      <Multi label="Stage" options={stages.map((s) => ({ value: s.id, label: s.label }))} value={filters.stages} onChange={(v) => set('stages', v as Filters['stages'])} />
      <Multi label="Work" options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} value={filters.arrangements} onChange={(v) => set('arrangements', v)} />
      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <SlidersHorizontal className="size-3.5" /> More
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Source</div>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((s) => {
                const on = filters.sources.includes(s)
                return (
                  <Button key={s} size="xs" variant={on ? 'default' : 'outline'} onClick={() => set('sources', on ? filters.sources.filter((x) => x !== s) : [...filters.sources, s])}>
                    {s}
                  </Button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">HR owner</div>
            <div className="flex flex-wrap gap-1.5">
              {owners.map((s) => {
                const on = filters.owners.includes(s)
                return (
                  <Button key={s} size="xs" variant={on ? 'default' : 'outline'} onClick={() => set('owners', on ? filters.owners.filter((x) => x !== s) : [...filters.owners, s])}>
                    {s}
                  </Button>
                )
              })}
            </div>
          </div>
          {showSalary && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Expected salary (million IDR)</div>
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="Min" value={filters.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} className="h-7" />
                <span className="text-muted-foreground">–</span>
                <Input type="number" placeholder="Max" value={filters.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} className="h-7" />
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <Button variant={filters.upcoming ? 'secondary' : 'outline'} size="sm" onClick={() => set('upcoming', !filters.upcoming)}>
        <CalendarClock className="size-3.5" /> Interview ≤ 7 days
      </Button>
      <Button variant={filters.hideClosed ? 'secondary' : 'outline'} size="sm" onClick={() => set('hideClosed', !filters.hideClosed)}>
        <EyeOff className="size-3.5" /> Hide rejected
      </Button>
      <Button variant={filters.archived ? 'secondary' : 'outline'} size="sm" onClick={() => set('archived', !filters.archived)}>
        <Archive className="size-3.5" /> Archived
      </Button>
      {n > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)}>
          <X className="size-3.5" /> Clear ({n})
        </Button>
      )}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {shown} of {total} candidates
      </span>
    </div>
  )
}
