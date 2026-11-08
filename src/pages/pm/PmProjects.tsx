import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Download, Eye, CircleDollarSign, FileText, FolderKanban, Plus, Search, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/NumberInput'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, Field, HealthBadge, PageHeader, pageCls } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { PHASES, statusOptions, todayStr, effectiveStatus, fieldsOf, invoiceTotal, money, outstanding } from '@/lib/pm'
import { fmtDate } from '@/lib/constants'
import { ProjectPreview } from '@/components/pm/ProjectPreview'
import { downloadCsv } from '@/lib/csv'
import { exportName } from '@/lib/importExport'
import { buildAgenda, localToday, needsAction } from '@/lib/billing'
import { cn } from '@/lib/utils'

const th = 'border-b bg-muted px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'

export default function PmProjects() {
  const { statuses, schedules, scheduleEvents, projects, invoices, addProject, updateInfo, updateProject, deleteProject, setProject } = useStore()
  const canEdit = useCan()('pm.edit')
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('active')
  const [health, setHealth] = useState('')
  const [manager, setManager] = useState('')
  const [client, setClient] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState({ name: '', client: '', manager: '', startDate: '', endDate: '', budget: '' })

  const overdueIds = useMemo(() => new Set(invoices.filter((i) => effectiveStatus(i) === 'overdue').map((i) => i.projectId)), [invoices])
  const managers = useMemo(() => [...new Set(projects.map((p) => p.info.manager).filter(Boolean))].sort(), [projects])
  const clients = useMemo(() => [...new Set(projects.map((p) => p.info.client).filter(Boolean))].sort(), [projects])
  const rows = useMemo(() => projects.filter((p) =>
    (status === 'all' || p.status === status) && (!health || p.info.health === health) &&
    (!manager || p.info.manager === manager) && (!client || p.info.client === client) && (!onlyOverdue || overdueIds.has(p.id)) &&
    (!q || `${p.name} ${p.info.client} ${p.info.manager}`.toLowerCase().includes(q.toLowerCase()))), [projects, q, status, health, manager, client, onlyOverdue, overdueIds])
  const filtered = !!(q || health || manager || client || onlyOverdue || status !== 'active')
  const clearFilters = () => { setQ(''); setHealth(''); setManager(''); setClient(''); setOnlyOverdue(false); setStatus('active') }

  const exportRows = () => {
    const label = (id: string) => statuses.find((x) => x.id === id)?.label ?? id
    downloadCsv(exportName('projects'), [
      ['Project', 'State', 'Status', 'Phase', 'Client', 'PM', 'Start', 'End', 'Budget', 'Billed', 'Outstanding', 'Overdue invoices', 'Oldest overdue due date'],
      ...rows.map((p) => {
        const fl = fieldsOf(p)
        const inv = invoices.filter((i) => i.projectId === p.id)
        const late = inv.filter((i) => effectiveStatus(i) === 'overdue').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        return [
          p.name, p.status, fl.health ? label(p.info.health) : '', fl.phase ? PHASES.find((x) => x.value === p.info.phase)?.label ?? '' : '', fl.client ? p.info.client : '', fl.manager ? p.info.manager : '',
          fl.startDate ? p.info.startDate : '', fl.endDate ? p.info.endDate : '', fl.budget ? p.info.budget ?? '' : '',
          inv.filter((i) => i.status !== 'draft').reduce((a, i) => a + invoiceTotal(i), 0), outstanding(inv), late.length, late[0]?.dueDate ?? '',
        ]
      }),
    ])
  }

  // A column shows when at least one listed project uses that field; other rows show a dash.
  const used = (f: keyof ReturnType<typeof fieldsOf>) => rows.some((p) => fieldsOf(p)[f])
  const due = needsAction(buildAgenda(schedules, scheduleEvents, projects, localToday())).filter((a) => a.kind === 'release' || a.kind === 'collect')
  const toRelease = due.filter((a) => a.kind === 'release')
  const drafts = toRelease.filter((a) => a.event?.invoiceId && invoices.some((i) => i.id === a.event?.invoiceId && i.status === 'draft')).length
  const lateCollect = due.filter((a) => a.kind === 'collect' && a.state === 'overdue').length
  const live = projects.filter((p) => p.status === 'active')
  const attention = new Set(statuses.filter((x) => x.attention).map((x) => x.id))
  const trouble = live.filter((p) => attention.has(p.info.health)).length
  const totalBudget = live.reduce((a, p) => a + (p.info.budget ?? 0), 0)
  const liveIds = new Set(live.map((p) => p.id))
  const liveInvoices = invoices.filter((i) => liveIds.has(i.projectId))
  const owed = outstanding(liveInvoices)
  const overdueCount = liveInvoices.filter((i) => effectiveStatus(i) === 'overdue').length

  const open = (id: string, to: string) => { setProject(id); nav(to) }
  const create = () => {
    if (!f.name.trim()) return
    const id = addProject(f.name.trim(), '')
    updateInfo(id, { client: f.client, manager: f.manager, startDate: f.startDate || todayStr(), endDate: f.endDate, budget: f.budget ? Number(f.budget) : null })
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

        {(toRelease.length > 0 || lateCollect > 0) && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <TriangleAlert className="size-4 shrink-0" />
            <div className="flex-1">
              <b>Billing needs you.</b>{' '}
              {toRelease.length > 0 && <>{toRelease.length} invoice{toRelease.length > 1 ? 's' : ''} to release{drafts > 0 && ` (${drafts} draft${drafts > 1 ? 's' : ''} ready to review)`}. </>}
              {lateCollect > 0 && <>{lateCollect} payment{lateCollect > 1 ? 's' : ''} overdue.</>}
            </div>
            <Button size="sm" render={<Link to="/pm/billing" />}>Open billing & reminders</Button>
          </div>
        )}

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
          <NativeSelect value={health} onChange={setHealth} options={[{ value: '', label: 'Any status' }, ...statusOptions(statuses)]} />
          <NativeSelect value={manager} onChange={setManager} options={[{ value: '', label: 'Any PM' }, ...managers.map((m) => ({ value: m, label: m }))]} />
          <NativeSelect value={client} onChange={setClient} options={[{ value: '', label: 'Any client' }, ...clients.map((m) => ({ value: m, label: m }))]} />
          <Button variant={onlyOverdue ? 'secondary' : 'outline'} size="sm" onClick={() => setOnlyOverdue(!onlyOverdue)}><TriangleAlert className="size-3.5" /> Overdue invoices</Button>
          {filtered && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rows.length} of {projects.length} projects</span>
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportRows}><Download className="size-3.5" /> Export ({rows.length})</Button>
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
                  const lateList = inv.filter((i) => effectiveStatus(i) === 'overdue').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  const late = lateList.length
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
                            <div className={cn('text-xs', late ? 'font-medium text-red-600' : 'text-muted-foreground')}>{late ? <span className="inline-flex items-center gap-1"><TriangleAlert className="size-3" /> {late} overdue · due {fmtDate(lateList[0].dueDate)}{late > 1 && ' (oldest)'}</span> : `${money(billed)} billed`}</div></div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-xs" title="Quick preview" aria-label={`Preview ${p.name}`} onClick={() => setPreview(p.id)}><Eye /></Button>
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

      <ProjectPreview projectId={preview} onClose={() => setPreview(null)} />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>New project</DialogTitle><DialogDescription>The basics. You can fill in the rest on the project info page.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project name" className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Client"><Input value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} /></Field>
            <Field label="Project manager"><Input value={f.manager} onChange={(e) => setF({ ...f, manager: e.target.value })} /></Field>
            <Field label="Start"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
            <Field label="Target end"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
            <Field label="Budget (IDR)" className="sm:col-span-2"><NumberInput value={f.budget ? Number(f.budget) : null} onValueChange={(v) => setF({ ...f, budget: v == null ? '' : String(v) })} /></Field>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={!f.name.trim()} onClick={create}>Create project</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
