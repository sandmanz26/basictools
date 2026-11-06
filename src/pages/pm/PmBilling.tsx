import { useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { Link } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, Download, Mail, Pencil, Plus, SkipForward, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { BillingImportDialog } from '@/components/BillingImportDialog'
import { Card, Empty, PageHeader, pageCls } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { sendMail } from '@/lib/microsoft'
import { KIND_META, buildAgenda, eventKey, localToday, nextOccurrence, needsAction, occurrenceDates, repeatLabel, addDays, type AgendaItem } from '@/lib/billing'
import { schedulesToTable } from '@/lib/billingIO'
import { downloadCsv } from '@/lib/csv'
import { enableAlerts, alertsEnabled } from '@/lib/alerts'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Schedule } from '@/types'

const rp = (n: number | null) => (n == null ? '' : 'Rp ' + n.toLocaleString('id-ID'))
const when = (it: AgendaItem) =>
  it.daysLeft < 0 ? `${-it.daysLeft} day${it.daysLeft === -1 ? '' : 's'} overdue` : it.daysLeft === 0 ? 'Today' : it.daysLeft === 1 ? 'Tomorrow' : `in ${it.daysLeft} days`
const stateTone = { overdue: 'text-red-600', today: 'text-amber-600', soon: 'text-amber-600', later: 'text-muted-foreground' }
const DAY_OPTS = [{ value: '0', label: 'End of month' }, ...Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` }))]

type Mark = { item: AgendaItem; mode: 'release' | 'paid' }

export default function PmBilling() {
  const { schedules, scheduleEvents, projects, addSchedule, updateSchedule, deleteSchedule, setScheduleEvent, msConfig } = useStore()
  const canEdit = useCan()('pm.invoice')
  const ms = useMicrosoft()
  const today = localToday()
  const [kindFilter, setKindFilter] = useState('')
  const [picFilter, setPicFilter] = useState('')
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mark, setMark] = useState<Mark | null>(null)
  const [markDate, setMarkDate] = useState(today)
  const [markNo, setMarkNo] = useState('')
  const [importing, setImporting] = useState(false)
  const [mailMsg, setMailMsg] = useState('')
  const [alertsOn, setAlertsOn] = useState(alertsEnabled())

  const agenda = useMemo(() => buildAgenda(schedules, scheduleEvents, projects, today), [schedules, scheduleEvents, projects, today])
  const urgent = needsAction(agenda)
  const pics = useMemo(() => [...new Set(schedules.map((s) => s.pic).filter(Boolean))].sort(), [schedules])
  const shown = agenda.filter((a) => (!kindFilter || a.kind === kindFilter) && (!picFilter || a.pic === picFilter))
  const projName = (id: string) => projects.find((p) => p.id === id)?.name ?? ''

  const in30 = (k: AgendaItem['kind']) => agenda.filter((a) => a.kind === k && a.daysLeft <= 30).reduce((n, a) => n + (a.amount ?? 0), 0)
  const groups: { id: string; title: string; items: AgendaItem[] }[] = [
    { id: 'overdue', title: 'Overdue', items: shown.filter((a) => a.state === 'overdue') },
    { id: 'now', title: 'Today & due soon', items: shown.filter((a) => a.state === 'today' || a.state === 'soon') },
    { id: 'later', title: 'Coming up', items: shown.filter((a) => a.state === 'later') },
  ]

  const startMark = (item: AgendaItem, mode: Mark['mode']) => { setMark({ item, mode }); setMarkDate(today); setMarkNo(item.event?.invoiceNo ?? '') }
  const confirmMark = () => {
    if (!mark?.item.schedule || !mark.item.scheduleDate) return
    const key = eventKey(mark.item.schedule.id, mark.item.scheduleDate)
    setScheduleEvent(key, mark.mode === 'release' ? { issuedAt: markDate, invoiceNo: markNo.trim() } : { paidAt: markDate })
    setMark(null)
  }
  const skip = (it: AgendaItem) => {
    if (it.schedule && it.scheduleDate && confirm(`Skip “${it.title}” on ${fmtDate(it.scheduleDate)}? It won't be reminded again.`)) setScheduleEvent(eventKey(it.schedule.id, it.scheduleDate), { skipped: true })
  }

  const openNew = (kind: Schedule['kind']) => {
    const p = projects.find((x) => x.status === 'active')
    setIsNew(true)
    setEditing({ id: 'sc-' + nanoid(6), kind, projectId: '', party: '', title: '', amount: null, frequency: 'monthly', day: 0, startDate: today, endDate: '', leadDays: kind === 'receivable' ? 5 : 3, termDays: 14, pic: p?.info.manager ?? '', notes: '', active: true })
  }
  const pickProject = (id: string) => {
    if (!editing) return
    const p = projects.find((x) => x.id === id)
    setEditing({ ...editing, projectId: id, ...(p ? { party: editing.party || p.info.client, pic: editing.pic || p.info.manager, startDate: p.info.startDate || editing.startDate, endDate: p.info.endDate || editing.endDate } : {}) })
  }
  const saveEditing = () => {
    if (!editing) return
    if (isNew) addSchedule(editing); else updateSchedule(editing.id, editing)
    setEditing(null)
  }
  const preview = editing ? occurrenceDates(editing, today, addDays(today, 800)).slice(0, 5) : []

  const emailMe = async () => {
    if (!ms.account) return
    setMailMsg('Sending…')
    const lines = urgent.map((a) => `• ${fmtDate(a.date)} (${when(a)}) — ${KIND_META[a.kind].label}: ${a.party ? a.party + ' · ' : ''}${a.title}${a.amount ? ' · ' + rp(a.amount) : ''}${a.pic ? ' · PIC ' + a.pic : ''}`)
    try {
      await sendMail(msConfig, ms.account.username, `Billing reminders: ${urgent.length} need action`, `Hi,\n\nHere is what needs action now:\n\n${lines.join('\n') || 'Nothing is due right now.'}\n\nSent from HireFlow.`)
      setMailMsg(`Sent to ${ms.account.username}`)
    } catch (e) { setMailMsg(e instanceof Error ? e.message : 'Could not send') }
  }

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title="Billing & reminders"
          desc="Know when to release each client’s invoice, when money should come in, and when to pay vendors. Nothing slips because it isn’t written down."
          actions={<>
            <Button variant="outline" onClick={() => downloadCsv(`billing-schedules-${today}.csv`, schedulesToTable(schedules, projects))}><Download /> Export</Button>
            {canEdit && <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import Excel</Button>}
            {canEdit && <Button variant="outline" onClick={() => openNew('payable')}><Plus /> Vendor bill</Button>}
            {canEdit && <Button onClick={() => openNew('receivable')}><Plus /> Client invoice</Button>}
          </>}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Needs action now" value={String(urgent.length)} tone={urgent.length ? 'text-amber-600' : ''} />
          <Stat label="Overdue" value={String(agenda.filter((a) => a.state === 'overdue' && a.kind !== 'project_start' && a.kind !== 'project_end').length)} tone="text-red-600" />
          <Stat label="To invoice, next 30 days" value={rp(in30('release')) || 'Rp 0'} />
          <Stat label="To pay vendors, next 30 days" value={rp(in30('pay')) || 'Rp 0'} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <BellRing className="size-4 text-muted-foreground" />
          <span className="text-muted-foreground">Get nudged:</span>
          <Button size="sm" variant="outline" disabled={alertsOn} onClick={async () => setAlertsOn(await enableAlerts())}><Bell /> {alertsOn ? 'Desktop alerts on' : 'Turn on desktop alerts'}</Button>
          <Button size="sm" variant="outline" disabled={!ms.account || urgent.length === 0} onClick={() => void emailMe()}><Mail /> Email me this list</Button>
          {!ms.account && <span className="text-xs text-muted-foreground">Connect Microsoft in <Link to="/mkt/settings" className="underline">settings</Link> to email yourself.</span>}
          {mailMsg && <span className="text-xs text-muted-foreground">{mailMsg}</span>}
          <span className="ml-auto text-xs text-muted-foreground">Alerts and the red badge on PM work while this app is open.</span>
        </div>

        <Tabs defaultValue="reminders">
          <TabsList>
            <TabsTrigger value="reminders">Reminders ({shown.length})</TabsTrigger>
            <TabsTrigger value="schedules">Schedules ({schedules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="reminders" className="space-y-4 pt-4">
            <div className="flex flex-wrap gap-2">
              <NativeSelect value={kindFilter} onChange={setKindFilter} options={[{ value: '', label: 'Everything' }, { value: 'release', label: 'Invoices to release' }, { value: 'collect', label: 'Awaiting payment' }, { value: 'pay', label: 'Bills to pay' }, { value: 'project_start', label: 'Project starts' }, { value: 'project_end', label: 'Project ends' }]} />
              <NativeSelect value={picFilter} onChange={setPicFilter} options={[{ value: '', label: 'Any PIC' }, ...pics.map((p) => ({ value: p, label: p }))]} />
            </div>
            {shown.length === 0 && <Empty>Nothing coming up. Add a client invoice or vendor bill schedule, or import your Excel tracker.</Empty>}
            {groups.filter((g) => g.items.length).map((g) => (
              <section key={g.id} className="space-y-2">
                <h2 className={cn('text-sm font-semibold', g.id === 'overdue' && 'text-red-600')}>{g.title} <span className="font-normal text-muted-foreground">({g.items.length})</span></h2>
                <div className="overflow-hidden rounded-xl border">
                  {g.items.map((it) => (
                    <div key={it.key + it.kind} className="flex flex-wrap items-center gap-3 border-b px-3 py-2.5 text-sm last:border-0">
                      <div className="w-24 shrink-0">
                        <div className="font-medium tabular-nums">{fmtDate(it.date)}</div>
                        <div className={cn('text-xs', stateTone[it.state])}>{when(it)}</div>
                      </div>
                      <span className={cn('w-36 shrink-0 rounded-md px-2 py-0.5 text-center text-xs font-medium', KIND_META[it.kind].tone)}>{KIND_META[it.kind].label}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{it.party || projName(it.projectId) || '—'} <span className="font-normal text-muted-foreground">· {it.title}</span></div>
                        <div className="truncate text-xs text-muted-foreground">{[projName(it.projectId), it.pic && `PIC ${it.pic}`, it.event?.invoiceNo && `Invoice ${it.event.invoiceNo}`].filter(Boolean).join(' · ')}</div>
                      </div>
                      {it.amount != null && <div className="w-32 text-right tabular-nums">{rp(it.amount)}</div>}
                      {canEdit && it.schedule && (
                        <div className="flex gap-1.5">
                          <Button size="sm" onClick={() => startMark(it, it.kind === 'release' ? 'release' : 'paid')}><CheckCheck /> {it.kind === 'release' ? 'Mark released' : it.kind === 'collect' ? 'Mark received' : 'Mark paid'}</Button>
                          <Button size="icon-sm" variant="ghost" title="Skip this one" onClick={() => skip(it)}><SkipForward /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </TabsContent>

          <TabsContent value="schedules" className="pt-4">
            {schedules.length === 0 ? <Empty>No schedules yet.</Empty> : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                    <tr><th className="px-3 py-2">Type</th><th className="px-3 py-2">Client / vendor</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Repeats</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Next</th><th className="px-3 py-2">PIC</th><th className="px-3 py-2">On</th><th className="w-20" /></tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={s.id} className={cn('border-t', !s.active && 'opacity-50')}>
                        <td className="px-3 py-2"><span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', KIND_META[s.kind === 'receivable' ? 'release' : 'pay'].tone)}>{s.kind === 'receivable' ? 'Invoice' : 'Bill'}</span></td>
                        <td className="px-3 py-2"><div className="font-medium">{s.party || '—'}</div><div className="text-xs text-muted-foreground">{[s.title, projName(s.projectId)].filter(Boolean).join(' · ')}</div></td>
                        <td className="px-3 py-2 tabular-nums">{rp(s.amount)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{repeatLabel(s)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(s.startDate)} → {s.endDate ? fmtDate(s.endDate) : 'open'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(nextOccurrence(s, today)) || '—'}</td>
                        <td className="px-3 py-2">{s.pic}</td>
                        <td className="px-3 py-2"><Switch disabled={!canEdit} checked={s.active} onCheckedChange={(v) => updateSchedule(s.id, { active: v })} /></td>
                        <td className="px-2">{canEdit && <div className="flex"><Button variant="ghost" size="icon-xs" onClick={() => { setIsNew(false); setEditing(s) }}><Pencil /></Button><Button variant="ghost" size="icon-xs" onClick={() => confirm(`Delete schedule “${s.title}”?`) && deleteSchedule(s.id)}><Trash2 className="text-destructive" /></Button></div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle>{isNew ? 'New schedule' : 'Edit schedule'}</SheetTitle>
                <SheetDescription>{editing.kind === 'receivable' ? 'An invoice you release to a client on a repeating date.' : 'A bill you pay to a vendor on a repeating date.'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Type</Label><NativeSelect className="w-full" value={editing.kind} onChange={(v) => setEditing({ ...editing, kind: v as Schedule['kind'] })} options={[{ value: 'receivable', label: 'Client invoice (we release)' }, { value: 'payable', label: 'Vendor bill (we pay)' }]} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Project (optional)</Label><NativeSelect className="w-full" value={editing.projectId} onChange={pickProject} options={[{ value: '', label: 'None' }, ...projects.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }))]} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">{editing.kind === 'receivable' ? 'Client' : 'Vendor'}</Label><Input value={editing.party} onChange={(e) => setEditing({ ...editing, party: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Title</Label><Input value={editing.title} placeholder={editing.kind === 'receivable' ? 'e.g. Monthly service fee' : 'e.g. Subscription'} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Amount (Rp)</Label><Input type="number" value={editing.amount ?? ''} onChange={(e) => setEditing({ ...editing, amount: e.target.value ? Number(e.target.value) : null })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">PIC</Label><Input value={editing.pic} onChange={(e) => setEditing({ ...editing, pic: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Repeats</Label><NativeSelect className="w-full" value={editing.frequency} onChange={(v) => setEditing({ ...editing, frequency: v as Schedule['frequency'] })} options={[{ value: 'monthly', label: 'Every month' }, { value: 'quarterly', label: 'Every 3 months' }, { value: 'yearly', label: 'Every year' }, { value: 'once', label: 'One time' }]} /></div>
                  {editing.frequency !== 'once' && <div className="space-y-1"><Label className="text-xs text-muted-foreground">On</Label><NativeSelect className="w-full" value={String(editing.day)} onChange={(v) => setEditing({ ...editing, day: Number(v) })} options={DAY_OPTS} /></div>}
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">{editing.frequency === 'once' ? 'Date' : 'Starts'}</Label><Input type="date" value={editing.startDate} onChange={(e) => setEditing({ ...editing, startDate: e.target.value })} /></div>
                  {editing.frequency !== 'once' && <div className="space-y-1"><Label className="text-xs text-muted-foreground">Ends (blank = open)</Label><Input type="date" value={editing.endDate} onChange={(e) => setEditing({ ...editing, endDate: e.target.value })} /></div>}
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Remind me (days before)</Label><Input type="number" min={0} value={editing.leadDays} onChange={(e) => setEditing({ ...editing, leadDays: Math.max(0, Number(e.target.value) || 0) })} /></div>
                  {editing.kind === 'receivable' && <div className="space-y-1"><Label className="text-xs text-muted-foreground">Client pays within (days)</Label><Input type="number" min={0} value={editing.termDays} onChange={(e) => setEditing({ ...editing, termDays: Math.max(0, Number(e.target.value) || 0) })} /></div>}
                </div>
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea rows={3} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Next dates</div>
                  {preview.length ? preview.map((d) => <div key={d} className="tabular-nums">{new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div>) : <div className="text-muted-foreground">No upcoming dates. Check the start and end dates.</div>}
                </div>
                <div className="flex gap-2">
                  <Button disabled={!editing.party.trim() && !editing.title.trim()} onClick={saveEditing}>{isNew ? 'Add schedule' : 'Save'}</Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!mark} onOpenChange={(o) => !o && setMark(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mark?.mode === 'release' ? 'Invoice released' : mark?.item.kind === 'pay' ? 'Bill paid' : 'Payment received'}</DialogTitle>
            <DialogDescription>{mark?.item.party} · {mark?.item.title}{mark?.mode === 'release' && mark.item.schedule ? `. Payment will then be expected in ${mark.item.schedule.termDays} days.` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Date</Label><Input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)} /></div>
            {mark?.mode === 'release' && <div className="space-y-1"><Label className="text-xs text-muted-foreground">Invoice number (optional)</Label><Input value={markNo} onChange={(e) => setMarkNo(e.target.value)} /></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMark(null)}>Cancel</Button>
            <Button disabled={!markDate} onClick={confirmMark}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillingImportDialog open={importing} onOpenChange={setImporting} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <Card><div className="text-xs text-muted-foreground">{label}</div><div className={cn('mt-1 text-xl font-semibold tabular-nums', tone)}>{value}</div></Card>
}
