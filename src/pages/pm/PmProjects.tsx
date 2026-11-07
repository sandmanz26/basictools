import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, CircleDollarSign, FileText, FolderKanban, Plus, Search, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, Field, HealthBadge, PageHeader, pageCls } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { HEALTH, PHASES, effectiveStatus, fieldsOf, invoiceTotal, money, outstanding } from '@/lib/pm'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Health } from '@/types'

const th = 'border-b bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'

export default function PmProjects() {
  const { projects, invoices, addProject, updateInfo, updateProject, deleteProject, setProject } = useStore()
  const canEdit = useCan()('pm.edit')
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [health, setHealth] = useState('')
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ name: '', client: '', manager: '', startDate: '', endDate: '', budget: '' })

  const rows = useMemo(() => projects.filter((p) =>
    (status === 'all' || p.status === status) && (!health || p.info.health === health) &&
    (!q || `${p.name} ${p.info.client} ${p.info.manager}`.toLowerCase().includes(q.toLowerCase()))), [projects, q, status, health])

  // A column shows when at least one listed project uses that field; other rows show a dash.
  const used = (f: keyof ReturnType<typeof fieldsOf>) => rows.some((p) => fieldsOf(p)[f])
  const live = projects.filter((p) => p.status === 'active')
  const trouble = live.filter((p) => p.info.health === 'at_risk' || p.info.health === 'off_track').length
  const totalBudget = live.reduce((a, p) => a + (p.info.budget ?? 0), 0)
  const liveIds = new Set(live.map((p) => p.id))
  const liveInvoices = invoices.filter((i) => liveIds.has(i.projectId))
  const owed = outstanding(liveInvoices)
  const overdueCount = liveInvoices.filter((i) => effectiveStatus(i) === 'overdue').length

  const open = (id: string, to: string) => { setProject(id); nav(to) }
  const create = () => {
    if (!f.name.trim()) return
    const id = addProject(f.name.trim(), '')
    updateInfo(id, { client: f.client, manager: f.manager, startDate: f.startDate || new Date().toISOString().slice(0, 10), endDate: f.endDate, budget: f.budget ? Number(f.budget) : null })
    setCreating(false); setF({ name: '', client: '', manager: '', startDate: '', endDate: '', budget: '' })
    nav('/pm/info')
  }

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader
          title="All projects"
          desc="Monitor every project in one place: status, budget and what clients still owe."
          actions={canEdit && <Button onClick={() => setCreating(true)}><Plus /> New project</Button>}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card><div className="flex items-center gap-2 text-xs text-muted-foreground"><FolderKanban className="size-4" /> Active projects</div><div className="mt-1 text-2xl font-semibold tabular-nums">{live.length}</div><div className="mt-1 text-xs text-muted-foreground">{projects.length - live.length} archived</div></Card>
          <Card><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldAlert className="size-4" /> Need attention</div><div className={cn('mt-1 text-2xl font-semibold tabular-nums', trouble > 0 && 'text-amber-600')}>{trouble}</div><div className="mt-1 text-xs text-muted-foreground">at risk or off track</div></Card>
          <Card><div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="size-4" /> Total budget</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(totalBudget)}</div><div className="mt-1 text-xs text-muted-foreground">across active projects</div></Card>
          <Card><div className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="size-4" /> Invoices outstanding</div><div className="mt-1 text-2xl font-semibold tabular-nums">{money(owed)}</div><div className={cn('mt-1 text-xs', overdueCount ? 'font-medium text-red-600' : 'text-muted-foreground')}>{overdueCount ? `${overdueCount} overdue` : 'none overdue'}</div></Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 w-60 pl-8" placeholder="Search project, client, PM…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <NativeSelect value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All statuses' }]} />
          <NativeSelect value={health} onChange={setHealth} options={[{ value: '', label: 'Any health' }, ...(Object.keys(HEALTH) as Health[]).map((k) => ({ value: k, label: HEALTH[k].label }))]} />
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rows.length} of {projects.length} projects</span>
        </div>

        {rows.length === 0 ? <Empty>No projects match.</Empty> : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[60rem] text-sm">
              <thead><tr>
                <th className={th}>Project</th>
                {used('client') && <th className={th}>Client</th>}
                {used('health') && <th className={th}>Status</th>}
                {used('phase') && <th className={th}>Phase</th>}
                {(used('startDate') || used('endDate')) && <th className={th}>Dates</th>}
                {used('budget') && <th className={cn(th, 'text-right')}>Budget</th>}
                <th className={cn(th, 'text-right')}>Invoices</th><th className={th} />
              </tr></thead>
              <tbody>
                {rows.map((p) => {
                  const inv = invoices.filter((i) => i.projectId === p.id)
                  const owedP = outstanding(inv)
                  const late = inv.filter((i) => effectiveStatus(i) === 'overdue').length
                  const fl = fieldsOf(p)
                  const dash = <span className="text-muted-foreground">—</span>
                  const billed = inv.filter((i) => i.status !== 'draft').reduce((a, i) => a + invoiceTotal(i), 0)
                  return (
                    <tr key={p.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => open(p.id, '/pm/info')}>
                      <td className="px-3 py-2.5"><div className="font-medium">{p.name}{p.status === 'archived' && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">archived</span>}</div>{fl.manager && <div className="text-xs text-muted-foreground">PM {p.info.manager || '—'}</div>}</td>
                      {used('client') && <td className="px-3 py-2.5">{fl.client ? p.info.client || dash : dash}</td>}
                      {used('health') && <td className="px-3 py-2.5">{fl.health ? <HealthBadge health={p.info.health} /> : dash}</td>}
                      {used('phase') && <td className="px-3 py-2.5">{fl.phase ? PHASES.find((x) => x.value === p.info.phase)?.label : dash}</td>}
                      {(used('startDate') || used('endDate')) && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {!fl.startDate && !fl.endDate ? dash : fl.startDate && fl.endDate ? `${fmtDate(p.info.startDate) || '—'} → ${fmtDate(p.info.endDate) || '—'}` : fl.startDate ? `From ${fmtDate(p.info.startDate) || '—'}` : `Until ${fmtDate(p.info.endDate) || '—'}`}
                        </td>
                      )}
                      {used('budget') && <td className="px-3 py-2.5 text-right tabular-nums">{fl.budget ? money(p.info.budget) : dash}</td>}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {inv.length === 0 ? <span className="text-muted-foreground">—</span> : (
                          <div><div>{money(owedP)} <span className="text-xs text-muted-foreground">owed</span></div>
                            <div className={cn('text-xs', late ? 'font-medium text-red-600' : 'text-muted-foreground')}>{late ? <span className="inline-flex items-center gap-1"><TriangleAlert className="size-3" /> {late} overdue</span> : `${money(billed)} billed`}</div></div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="xs" onClick={() => open(p.id, '/pm/invoices')}><FileText /> Invoices</Button>
                        {canEdit && (
                          <>
                            <Button variant="ghost" size="icon-xs" title={p.status === 'active' ? 'Archive' : 'Restore'} onClick={() => updateProject(p.id, { status: p.status === 'active' ? 'archived' : 'active' })}>{p.status === 'active' ? <Archive /> : <ArchiveRestore />}</Button>
                            <Button variant="ghost" size="icon-xs" title="Delete" onClick={() => confirm(`Delete “${p.name}” and all its data (candidates, tasks, invoices…)? This can’t be undone.`) && deleteProject(p.id)}><Trash2 className="text-destructive" /></Button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle><DialogDescription>The basics. You can fill in the rest on the project info page.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project name" className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Client"><Input value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} /></Field>
            <Field label="Project manager"><Input value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })} /></Field>
            <Field label="Start"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
            <Field label="Target end"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
            <Field label="Budget (IDR)" className="sm:col-span-2"><Input type="number" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={!f.name.trim()} onClick={create}>Create project</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
