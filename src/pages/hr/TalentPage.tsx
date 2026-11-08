import { useMemo, useState } from 'react'
import { ArrowRightCircle, Download, ExternalLink, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dropdown } from '@/components/Dropdown'
import { ColumnsMenu } from '@/components/ColumnsMenu'
import { ImportDialog } from '@/components/ImportDialog'
import { NumberInput } from '@/components/NumberInput'
import { ProcessTalentDialog } from '@/components/ProcessTalentDialog'
import { Multi } from '@/components/pipeline/FilterBar'
import { RangeCell, SelectCell, TextCell } from '@/components/pipeline/cells'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import { ARRANGEMENTS, SOURCES, fmtDate } from '@/lib/constants'
import { downloadCsv } from '@/lib/csv'
import { safeUrl } from '@/lib/files'
import { exportName, talentsToTable } from '@/lib/importExport'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import type { Talent } from '@/types'

const th = 'border-b border-r bg-muted px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'
const td = 'border-b border-r p-0 align-middle'

const COLUMNS = [
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'skills', label: 'Skills' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'source', label: 'Source' },
  { id: 'salary', label: 'Expected salary' },
  { id: 'work', label: 'Working' },
  { id: 'projects', label: 'Projects' },
  { id: 'added', label: 'Added' },
]

/** Centres a checkbox in its cell so header and rows line up. */
const Tick = (p: React.ComponentProps<typeof Checkbox>) => (
  <div className="flex h-full min-h-9 items-center justify-center"><Checkbox {...p} /></div>
)

export default function TalentPage() {
  const { talents, candidates, projects, activeProjectId, updateTalent, addTalent, deleteTalent } = useStore()
  const can = useCan()
  const ro = !can('candidates.edit')
  const showSalary = can('salary.view')
  const cols = useColumnPrefs('talent', {})
  const [q, setQ] = useState('')
  const [project, setProject] = useState('all')
  const [sources, setSources] = useState<string[]>([])
  const [arrangements, setArrangements] = useState<string[]>([])
  const [hasPortfolio, setHasPortfolio] = useState(false)
  const [salaryMin, setSalaryMin] = useState<number | null>(null)
  const [salaryMax, setSalaryMax] = useState<number | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [processing, setProcessing] = useState<string[]>([])

  const membership = useMemo(() => {
    const m = new Map<string, { projectId: string; stage: string }[]>()
    for (const c of candidates) if (c.talentId) m.set(c.talentId, [...(m.get(c.talentId) ?? []), { projectId: c.projectId, stage: c.stage }])
    return m
  }, [candidates])

  const rows = useMemo(() => {
    const needle = q.toLowerCase()
    const min = salaryMin != null ? salaryMin * 1_000_000 : null
    const max = salaryMax != null ? salaryMax * 1_000_000 : null
    return talents.filter((t) => {
      if (needle && !`${t.name} ${t.email} ${t.skills} ${t.phone}`.toLowerCase().includes(needle)) return false
      if (sources.length && !sources.includes(t.source)) return false
      if (arrangements.length && !arrangements.includes(t.arrangement)) return false
      if (hasPortfolio && !safeUrl(t.portfolio ?? '')) return false
      if (min != null && (t.salaryMax ?? t.salaryMin ?? 0) < min) return false
      if (max != null && (t.salaryMin ?? t.salaryMax ?? Infinity) > max) return false
      const ids = (membership.get(t.id) ?? []).map((x) => x.projectId)
      if (project === 'none') return ids.length === 0
      if (project.startsWith('in:')) return ids.includes(project.slice(3))
      if (project.startsWith('not:')) return !ids.includes(project.slice(4))
      return true
    })
  }, [talents, q, project, sources, arrangements, hasPortfolio, salaryMin, salaryMax, membership])

  const activeFilters = (q ? 1 : 0) + (project !== 'all' ? 1 : 0) + sources.length + arrangements.length + (hasPortfolio ? 1 : 0) + (salaryMin != null ? 1 : 0) + (salaryMax != null ? 1 : 0)
  const clear = () => { setQ(''); setProject('all'); setSources([]); setArrangements([]); setHasPortfolio(false); setSalaryMin(null); setSalaryMax(null) }
  const extra = (hasPortfolio ? 1 : 0) + (salaryMin != null ? 1 : 0) + (salaryMax != null ? 1 : 0)

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = rows.length > 0 && rows.every((t) => sel.has(t.id))
  const someSelected = !allSelected && rows.some((t) => sel.has(t.id))
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''
  const exportRows = sel.size ? rows.filter((t) => sel.has(t.id)) : rows
  const patch = (t: Talent, p: Partial<Talent>) => updateTalent(t.id, p)
  const show = (id: string) => cols.shown(id) && (id !== 'salary' || showSalary)
  const visibleCols = COLUMNS.filter((c) => c.id !== 'salary' || showSalary)
  const colCount = 3 + COLUMNS.filter((c) => show(c.id)).length

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Talent Pool</h1>
          <p className="text-sm text-muted-foreground">Everyone you’ve ever imported or added, across all projects. {talents.length} people.</p>
        </div>
        <div className="flex gap-2">
          {!ro && <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import</Button>}
          {!ro && <Button onClick={() => addTalent()}><Plus /> Add talent</Button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, skills…" className="h-8 w-60 pl-8" />
        </div>
        <Dropdown
          value={project}
          onChange={setProject}
          options={[
            { value: 'all', label: 'All talents' },
            { value: 'none', label: 'Not in any project' },
            { value: 'not:' + activeProjectId, label: `Not in ${projectName(activeProjectId)}` },
            ...projects.map((p) => ({ value: 'in:' + p.id, label: `In ${p.name}` })),
          ]}
        />
        <Multi label="Source" options={SOURCES.map((s) => ({ value: s, label: s }))} value={sources} onChange={setSources} />
        <Multi label="Working" options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} value={arrangements} onChange={setArrangements} />
        <Popover>
          <PopoverTrigger render={<Button variant={extra ? 'secondary' : 'outline'} size="sm" />}>
            <SlidersHorizontal className="size-3.5" /> More filters{extra > 0 && <Badge className="h-4 min-w-4 px-1 text-[10px]">{extra}</Badge>}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3">
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={hasPortfolio} onCheckedChange={(v) => setHasPortfolio(!!v)} /> Has a portfolio link</label>
            {showSalary && (
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Expected salary (million IDR)</div>
                <div className="flex items-center gap-2">
                  <NumberInput className="h-8" placeholder="Min" value={salaryMin} onValueChange={setSalaryMin} />
                  <span className="text-muted-foreground">–</span>
                  <NumberInput className="h-8" placeholder="Max" value={salaryMax} onValueChange={setSalaryMax} />
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={clear}><X className="size-3.5" /> Clear ({activeFilters})</Button>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{rows.length} of {talents.length}</span>
          <ColumnsMenu columns={visibleCols} shown={cols.shown} onToggle={cols.set} onReset={cols.reset} />
          <Button variant="outline" size="sm" onClick={() => downloadCsv(exportName('talent-pool'), talentsToTable(exportRows, candidates, projects, showSalary))}>
            <Download className="size-3.5" /> Export ({exportRows.length})
          </Button>
        </div>
      </div>

      {!ro && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <Button size="sm" onClick={() => setProcessing([...sel])}><ArrowRightCircle /> Process to pipeline</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear selection</Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={cn(th, 'sticky left-0 z-30 w-11 px-0')}>
                <Tick checked={allSelected} indeterminate={someSelected} onCheckedChange={() => setSel(allSelected ? new Set() : new Set(rows.map((t) => t.id)))} aria-label="Select all" />
              </th>
              <th className={cn(th, 'sticky left-11 z-30 w-52')}>Name</th>
              {show('email') && <th className={cn(th, 'w-56')}>Email</th>}
              {show('phone') && <th className={cn(th, 'w-40')}>Phone</th>}
              {show('skills') && <th className={cn(th, 'w-56')}>Skills</th>}
              {show('portfolio') && <th className={cn(th, 'w-64')}>Portfolio</th>}
              {show('source') && <th className={cn(th, 'w-28')}>Source</th>}
              {show('salary') && <th className={cn(th, 'w-48')}>Expected Salary</th>}
              {show('work') && <th className={cn(th, 'w-28')}>Working</th>}
              {show('projects') && <th className={cn(th, 'w-80')}>Projects</th>}
              {show('added') && <th className={cn(th, 'w-24')}>Added</th>}
              <th className="sticky right-0 z-30 w-36 border-b border-l bg-muted" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const inProj = membership.get(t.id) ?? []
              const link = safeUrl(t.portfolio ?? '')
              return (
                <tr key={t.id} className={cn('group hover:bg-muted/30', sel.has(t.id) && 'bg-primary/5')}>
                  <td className={cn(td, 'sticky left-0 z-10 bg-background group-hover:bg-muted')}>
                    <Tick checked={sel.has(t.id)} onCheckedChange={() => toggle(t.id)} aria-label={`Select ${t.name}`} />
                  </td>
                  <td className={cn(td, 'sticky left-11 z-10 bg-background group-hover:bg-muted')}><TextCell value={t.name} readOnly={ro} className="font-medium" onCommit={(v) => patch(t, { name: v })} /></td>
                  {show('email') && <td className={td}><TextCell value={t.email} readOnly={ro} placeholder="email@domain.com" onCommit={(v) => patch(t, { email: v })} /></td>}
                  {show('phone') && <td className={td}><TextCell value={t.phone} readOnly={ro} onCommit={(v) => patch(t, { phone: v })} /></td>}
                  {show('skills') && <td className={td}><TextCell value={t.skills} readOnly={ro} placeholder="React, Go, Figma…" onCommit={(v) => patch(t, { skills: v })} /></td>}
                  {show('portfolio') && (
                    <td className={td}>
                      <div className="flex items-center pr-1">
                        <div className="min-w-0 flex-1"><TextCell value={t.portfolio ?? ''} readOnly={ro} placeholder="https://…" onCommit={(v) => patch(t, { portfolio: v })} /></div>
                        {link && (
                          <a href={link} target="_blank" rel="noopener noreferrer" title={`Open ${link}`} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  )}
                  {show('source') && <td className={td}><SelectCell value={t.source} options={[...new Set([...SOURCES, t.source].filter(Boolean))].map((s) => ({ value: s, label: s }))} readOnly={ro} onChange={(v) => patch(t, { source: v })} /></td>}
                  {show('salary') && <td className={td}><RangeCell min={t.salaryMin} max={t.salaryMax} readOnly={ro} onCommit={(mn, mx) => patch(t, { salaryMin: mn, salaryMax: mx })} /></td>}
                  {show('work') && <td className={td}><SelectCell value={t.arrangement} options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} readOnly={ro} onChange={(v) => patch(t, { arrangement: v as Talent['arrangement'] })} /></td>}
                  {show('projects') && (
                    <td className={cn(td, 'px-2 py-1.5')}>
                      {inProj.length === 0 ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Not in any project</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {inProj.map((m) => {
                            const proj = projects.find((p) => p.id === m.projectId)
                            const st = proj?.stages.find((s) => s.id === m.stage)
                            return (
                              <span key={m.projectId} className={cn('rounded-md border bg-muted/50 px-1.5 py-0.5 text-[11px]', proj?.status === 'archived' && 'opacity-50')}>
                                {proj?.name} <span className="text-muted-foreground">· {st?.label ?? '—'}</span>
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  )}
                  {show('added') && <td className={cn(td, 'px-2 text-xs text-muted-foreground')}>{fmtDate(t.createdAt)}</td>}
                  <td className="sticky right-0 z-10 border-b border-l bg-background p-0 group-hover:bg-muted">
                    <div className="flex items-center justify-end gap-1 px-1.5">
                      {!ro && (
                        <Button size="xs" variant={inProj.length === 0 ? 'default' : 'outline'} onClick={() => setProcessing([t.id])}>
                          <ArrowRightCircle /> Process
                        </Button>
                      )}
                      {can('candidates.delete') && (
                        <Button variant="ghost" size="icon-xs" title="Delete from pool" onClick={() => confirm(`Remove ${t.name} from the Talent Pool? Their candidate rows in projects stay.`) && deleteTalent(t.id)}>
                          <Trash2 className="text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={colCount} className="py-16 text-center text-sm text-muted-foreground">No talents match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} kind="pool" />
      <ProcessTalentDialog talentIds={processing} onClose={() => setProcessing([])} onDone={() => setSel(new Set())} />
    </div>
  )
}
