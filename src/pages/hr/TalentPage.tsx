import { useMemo, useState } from 'react'
import { Download, Plus, Search, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/NativeSelect'
import { ImportDialog } from '@/components/ImportDialog'
import { NumberCell, SelectCell, TextCell } from '@/components/pipeline/cells'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import { ARRANGEMENTS, SOURCES, fmtDate } from '@/lib/constants'
import { downloadCsv } from '@/lib/csv'
import { exportName, talentsToTable } from '@/lib/importExport'
import type { Talent } from '@/types'

const th = 'border-b border-r bg-muted px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'
const td = 'border-b border-r p-0 align-middle'
const jt = (n: number) => (n / 1_000_000).toLocaleString('id-ID') + ' jt'

export default function TalentPage() {
  const { talents, candidates, projects, activeProjectId, updateTalent, addTalent, deleteTalent, addTalentsToProject, positions } = useStore()
  const can = useCan()
  const ro = !can('candidates.edit')
  const showSalary = can('salary.view')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [target, setTarget] = useState(activeProjectId)
  const [targetPos, setTargetPos] = useState('')
  const [notice, setNotice] = useState('')

  const membership = useMemo(() => {
    const m = new Map<string, { projectId: string; stage: string }[]>()
    for (const c of candidates) if (c.talentId) m.set(c.talentId, [...(m.get(c.talentId) ?? []), { projectId: c.projectId, stage: c.stage }])
    return m
  }, [candidates])

  const rows = useMemo(() => {
    const needle = q.toLowerCase()
    return talents.filter((t) => {
      if (needle && !`${t.name} ${t.email} ${t.skills} ${t.phone}`.toLowerCase().includes(needle)) return false
      const ids = (membership.get(t.id) ?? []).map((x) => x.projectId)
      if (filter === 'none') return ids.length === 0
      if (filter.startsWith('in:')) return ids.includes(filter.slice(3))
      if (filter.startsWith('not:')) return !ids.includes(filter.slice(4))
      return true
    })
  }, [talents, q, filter, membership])

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = rows.length > 0 && rows.every((t) => sel.has(t.id))
  const projPositions = positions.filter((p) => p.projectId === target)
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''

  const exportRows = sel.size ? rows.filter((t) => sel.has(t.id)) : rows

  const patch = (t: Talent, p: Partial<Talent>) => updateTalent(t.id, p)

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Talent Pool</h1>
          <p className="text-sm text-muted-foreground">Everyone you’ve ever imported or added, across all projects. {talents.length} people.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCsv(exportName('talent-pool'), talentsToTable(exportRows, candidates, projects, showSalary))}>
            <Download /> Export ({exportRows.length})
          </Button>
          {!ro && <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import</Button>}
          {!ro && <Button onClick={() => addTalent()}><Plus /> Add talent</Button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, skills…" className="h-8 w-64 pl-8" />
        </div>
        <NativeSelect
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All talents' },
            { value: 'none', label: 'Not in any project' },
            { value: 'not:' + activeProjectId, label: `Not in ${projectName(activeProjectId)}` },
            ...projects.map((p) => ({ value: 'in:' + p.id, label: `In ${p.name}` })),
          ]}
        />
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rows.length} of {talents.length}</span>
      </div>

      {!ro && sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{sel.size} selected</span>
          <span className="text-muted-foreground">Add to</span>
          <NativeSelect value={target} onChange={(v) => { setTarget(v); setTargetPos('') }} options={projects.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }))} />
          <NativeSelect value={targetPos} onChange={setTargetPos} options={[{ value: '', label: 'No position yet' }, ...projPositions.map((p) => ({ value: p.id, label: p.title }))]} />
          <Button size="sm" onClick={() => {
            const n = addTalentsToProject(target, [...sel], targetPos)
            setNotice(`${n} added to ${projectName(target)}${n < sel.size ? ` (${sel.size - n} already there)` : ''}`)
            setSel(new Set())
            setTimeout(() => setNotice(''), 4000)
          }}>Add to project</Button>
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
        </div>
      )}
      {notice && <div className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-800">{notice}</div>}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={cn(th, 'sticky left-0 z-30 w-10 text-center')}>
                <Checkbox checked={allSelected} onCheckedChange={() => setSel(allSelected ? new Set() : new Set(rows.map((t) => t.id)))} />
              </th>
              <th className={cn(th, 'sticky left-10 z-30 w-52')}>Name</th>
              <th className={cn(th, 'w-56')}>Email</th>
              <th className={cn(th, 'w-40')}>Phone</th>
              <th className={cn(th, 'w-56')}>Skills</th>
              <th className={cn(th, 'w-28')}>Source</th>
              {showSalary && <th className={cn(th, 'w-72')}>Expected Salary (min – max)</th>}
              <th className={cn(th, 'w-28')}>Working</th>
              <th className={cn(th, 'w-80')}>Projects</th>
              <th className={cn(th, 'w-24')}>Added</th>
              <th className="w-12 border-b bg-muted" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const inProj = membership.get(t.id) ?? []
              return (
                <tr key={t.id} className="group hover:bg-muted/30">
                  <td className={cn(td, 'sticky left-0 z-10 bg-background text-center group-hover:bg-muted')}>
                    <Checkbox checked={sel.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                  </td>
                  <td className={cn(td, 'sticky left-10 z-10 bg-background group-hover:bg-muted')}><TextCell value={t.name} readOnly={ro} className="font-medium" onCommit={(v) => patch(t, { name: v })} /></td>
                  <td className={td}><TextCell value={t.email} readOnly={ro} placeholder="email@domain.com" onCommit={(v) => patch(t, { email: v })} /></td>
                  <td className={td}><TextCell value={t.phone} readOnly={ro} onCommit={(v) => patch(t, { phone: v })} /></td>
                  <td className={td}><TextCell value={t.skills} readOnly={ro} placeholder="React, Go, Figma…" onCommit={(v) => patch(t, { skills: v })} /></td>
                  <td className={td}><SelectCell value={t.source} options={[...new Set([...SOURCES, t.source].filter(Boolean))].map((s) => ({ value: s, label: s }))} readOnly={ro} onChange={(v) => patch(t, { source: v })} /></td>
                  {showSalary && (
                    <td className={td}>
                      <div className="flex items-center">
                        <NumberCell value={t.salaryMin} readOnly={ro} scale={1_000_000} format={jt} placeholder="Min (jt)" onCommit={(v) => patch(t, { salaryMin: v })} />
                        <span className="text-muted-foreground">–</span>
                        <NumberCell value={t.salaryMax} readOnly={ro} scale={1_000_000} format={jt} placeholder="Max (jt)" onCommit={(v) => patch(t, { salaryMax: v })} />
                      </div>
                    </td>
                  )}
                  <td className={td}><SelectCell value={t.arrangement} options={ARRANGEMENTS.map((a) => ({ value: a, label: a }))} readOnly={ro} onChange={(v) => patch(t, { arrangement: v as Talent['arrangement'] })} /></td>
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
                  <td className={cn(td, 'px-2 text-xs text-muted-foreground')}>{fmtDate(t.createdAt)}</td>
                  <td className="border-b p-0 text-center">
                    {can('candidates.delete') && (
                      <Button variant="ghost" size="icon-xs" title="Delete from pool" onClick={() => confirm(`Remove ${t.name} from the Talent Pool? Their candidate rows in projects stay.`) && deleteTalent(t.id)}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={11} className="py-16 text-center text-sm text-muted-foreground">No talents match.</td></tr>}
          </tbody>
        </table>
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} kind="pool" />
    </div>
  )
}
