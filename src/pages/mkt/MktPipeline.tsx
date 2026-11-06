import { useMemo, useState } from 'react'
import { CalendarDays, Columns3, Download, Mail, Plus, Search, SlidersHorizontal, Table2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { NumberCell, SelectCell, TextCell } from '@/components/pipeline/cells'
import { ComposeDialog } from '@/components/mkt/ComposeDialog'
import { ColumnManager } from '@/components/mkt/ColumnManager'
import { LeadImportDialog } from '@/components/mkt/LeadImportDialog'
import { PageHeader } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { LEAD_BUILTIN_COLUMNS, LEAD_SOURCES, fmtDate, idr, stageDot, stageTone, today } from '@/lib/constants'
import { downloadCsv } from '@/lib/csv'
import { leadsToTable } from '@/lib/leadsIO'
import { cn } from '@/lib/utils'
import type { FieldDef, Lead } from '@/types'

const th = 'border-b border-r bg-muted px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'
const td = 'border-b border-r p-0 align-middle'
const jt = (n: number) => (n >= 1e9 ? (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M' : (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt')

export default function MktPipeline() {
  const { leads, mktStages: stages, mktFields, mktColumns, addLead, updateLead, deleteLead } = useStore()
  const canEdit = useCan()('mkt.edit')
  const canSend = useCan()('mkt.send')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [compose, setCompose] = useState<string[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const t = today()

  const rows = useMemo(() => leads.filter((l) =>
    (!q || `${l.name} ${l.company} ${l.email} ${l.tags}`.toLowerCase().includes(q.toLowerCase())) && (!source || l.source === source)), [leads, q, source])
  const open = leads.find((l) => l.id === openId)
  const stageOpts = stages.map((x) => ({ value: x.id, label: x.label }))
  const sourceOpts = LEAD_SOURCES.map((x) => ({ value: x, label: x }))
  const upd = (id: string, p: Partial<Lead>) => updateLead(id, p)
  const setCustom = (l: Lead, f: FieldDef, v: string) => updateLead(l.id, { custom: { ...(l.custom ?? {}), [f.id]: v } })
  const cols = mktColumns
    .map((k) => (k.startsWith('cf:') ? (() => { const f = mktFields.find((x) => 'cf:' + x.id === k); return f ? { key: k, label: f.label, field: f } : null })() : (() => { const c = LEAD_BUILTIN_COLUMNS.find((x) => x.key === k); return c ? { key: k, label: c.label, field: undefined } : null })()))
    .filter((c): c is { key: string; label: string; field: FieldDef | undefined } => !!c)
  const exportCsv = () => downloadCsv(`leads-${today()}.csv`, leadsToTable(rows, stages, mktFields))
  const cell = (l: Lead, key: string, field?: FieldDef) => {
    const ro = !canEdit
    if (field) {
      const v = l.custom?.[field.id] ?? ''
      if (field.type === 'select') return <SelectCell value={v} readOnly={ro} options={[{ value: '', label: '—' }, ...field.options.split(',').map((x) => x.trim()).filter(Boolean).map((x) => ({ value: x, label: x }))]} onChange={(n) => setCustom(l, field, n)} />
      if (field.type === 'number') return <NumberCell value={v === '' || isNaN(Number(v)) ? null : Number(v)} readOnly={ro} onCommit={(n) => setCustom(l, field, n == null ? '' : String(n))} />
      return <TextCell type={field.type === 'date' ? 'date' : 'text'} value={v} readOnly={ro} onCommit={(n) => setCustom(l, field, n)} />
    }
    switch (key) {
      case 'stage': return <SelectCell value={l.stage} options={stageOpts} readOnly={ro} tone={stageTone(stages.find((x) => x.id === l.stage))} onChange={(v) => upd(l.id, { stage: v })} />
      case 'source': return <SelectCell value={l.source} options={sourceOpts} readOnly={ro} onChange={(v) => upd(l.id, { source: v })} />
      case 'value': return <NumberCell value={l.value} readOnly={ro} onCommit={(v) => upd(l.id, { value: v })} />
      case 'nextActionDate': case 'lastContactAt': case 'createdAt': return <TextCell type="date" value={l[key]} readOnly={ro} onCommit={(v) => upd(l.id, { [key]: v })} />
      case 'company': return <TextCell value={l.company} readOnly={ro} className="font-medium" onCommit={(v) => upd(l.id, { company: v })} />
      default: return <TextCell value={String(l[key as keyof Lead] ?? '')} readOnly={ro} onCommit={(v) => upd(l.id, { [key]: v })} />
    }
  }
  const add = (stage?: string) => setOpenId(addLead(stage ? { stage } : {}))

  const openValue = rows.filter((l) => stages.find((s) => s.id === l.stage)?.type === 'active').reduce((a, l) => a + (l.value ?? 0), 0)
  const wonValue = rows.filter((l) => stages.find((s) => s.id === l.stage)?.type === 'won').reduce((a, l) => a + (l.value ?? 0), 0)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <PageHeader
        title="Lead pipeline"
        desc="Track prospects from first touch to closed deal. Send email to a lead straight from its card."
        actions={<>
          <Button variant="outline" onClick={exportCsv}><Download /> Export ({rows.length})</Button>
          {canEdit && <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import</Button>}
          {canEdit && <Button onClick={() => add()}><Plus /> New lead</Button>}
        </>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as 'board' | 'list')}>
          <TabsList>
            <TabsTrigger value="board"><Columns3 className="size-3.5" /> Board</TabsTrigger>
            <TabsTrigger value="list"><Table2 className="size-3.5" /> List</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 w-56 pl-8" placeholder="Search leads…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <NativeSelect value={source} onChange={setSource} options={[{ value: '', label: 'All sources' }, ...sourceOpts]} />
        {view === 'list' && <Button variant="outline" size="sm" onClick={() => setColumnsOpen(true)}><SlidersHorizontal /> Columns</Button>}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {rows.length} leads · open {jt(openValue)} · won {jt(wonValue)}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        {view === 'board' ? (
          <div className="flex h-full gap-3 overflow-x-auto pb-2">
            {stages.map((st) => {
              const items = rows.filter((l) => l.stage === st.id)
              const sum = items.reduce((a, l) => a + (l.value ?? 0), 0)
              return (
                <div
                  key={st.id}
                  onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(st.id) } }}
                  onDragLeave={() => setOver((o) => (o === st.id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || dragId; if (id && canEdit) upd(id, { stage: st.id }); setOver(null); setDragId(null) }}
                  className={cn('flex w-72 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors', over === st.id && 'border-primary bg-primary/5')}
                >
                  <div className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn('size-2 rounded-full', stageDot(st))} />
                      <span className="text-sm font-semibold">{st.label}</span>
                      <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{items.length}</span>
                      {canEdit && <Button variant="ghost" size="icon-xs" onClick={() => add(st.id)}><Plus /></Button>}
                    </div>
                    {sum > 0 && <div className="mt-0.5 pl-4 text-[11px] text-muted-foreground tabular-nums">Rp {jt(sum)}</div>}
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                    {items.map((l) => {
                      const late = l.nextActionDate && l.nextActionDate < t && st.type === 'active'
                      return (
                        <div
                          key={l.id}
                          draggable={canEdit}
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); setDragId(l.id) }}
                          onDragEnd={() => { setDragId(null); setOver(null) }}
                          onClick={() => setOpenId(l.id)}
                          className={cn('cursor-pointer rounded-lg border bg-card p-3 text-sm shadow-xs hover:shadow-md', canEdit && 'cursor-grab active:cursor-grabbing', dragId === l.id && 'opacity-40')}
                        >
                          <div className="font-medium">{l.company || l.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{l.company ? `${l.name}${l.title ? ' · ' + l.title : ''}` : l.title}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {l.value != null && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">Rp {jt(l.value)}</span>}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{l.source}</span>
                            {l.unsubscribed && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">Unsubscribed</span>}
                          </div>
                          {l.nextAction && (
                            <div className={cn('mt-2 flex items-center gap-1 text-xs text-muted-foreground', late && 'font-medium text-red-600')}>
                              <CalendarDays className="size-3 shrink-0" /><span className="truncate">{l.nextAction}</span>{l.nextActionDate && <span className="ml-auto shrink-0">{fmtDate(l.nextActionDate)}</span>}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {items.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">No leads</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="h-full overflow-auto rounded-lg border bg-background">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  {cols.map((c) => <th key={c.key} className={cn(th, c.key === 'notes' || c.key === 'nextAction' ? 'w-56' : 'w-40')}>{c.label}</th>)}
                  <th className="w-20 border-b bg-muted" />
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    {cols.map((c) => <td key={c.key} className={td}>{cell(l, c.key, c.field)}</td>)}
                    <td className="border-b p-0 text-center">
                      <Button variant="ghost" size="icon-xs" title="Details" onClick={() => setOpenId(l.id)}><Search /></Button>
                      {canEdit && <Button variant="ghost" size="icon-xs" onClick={() => confirm('Delete this lead?') && deleteLead(l.id)}><Trash2 className="text-destructive" /></Button>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={cols.length + 1} className="py-16 text-center text-sm text-muted-foreground">No leads match.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{open.company || open.name}</SheetTitle>
                <SheetDescription>{open.lastContactAt ? `Last contacted ${fmtDate(open.lastContactAt)}` : 'Not contacted yet'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                {canSend && (
                  <Button disabled={!open.email || open.unsubscribed} onClick={() => setCompose([open.id])}>
                    <Mail /> {open.unsubscribed ? 'Unsubscribed' : open.email ? 'Send email' : 'Add an email to send'}
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {([['Contact name', 'name'], ['Company', 'company'], ['Job title', 'title'], ['Phone', 'phone'], ['Email', 'email'], ['Owner', 'owner']] as const).map(([label, key]) => (
                    <div key={key} className={cn('space-y-1', key === 'email' && 'col-span-2')}>
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input disabled={!canEdit} value={open[key]} onChange={(e) => upd(open.id, { [key]: e.target.value })} />
                    </div>
                  ))}
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Stage</Label><NativeSelect disabled={!canEdit} className="w-full" value={open.stage} onChange={(v) => upd(open.id, { stage: v })} options={stageOpts} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Source</Label><NativeSelect disabled={!canEdit} className="w-full" value={open.source} onChange={(v) => upd(open.id, { source: v })} options={sourceOpts} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Deal value (Rp)</Label><Input disabled={!canEdit} type="number" value={open.value ?? ''} onChange={(e) => upd(open.id, { value: e.target.value ? Number(e.target.value) : null })} />{open.value != null && <div className="text-[11px] text-muted-foreground">Rp {idr(open.value)}</div>}</div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Tags (comma separated)</Label><Input disabled={!canEdit} value={open.tags} onChange={(e) => upd(open.id, { tags: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Next action</Label><Input disabled={!canEdit} value={open.nextAction} onChange={(e) => upd(open.id, { nextAction: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Due</Label><Input disabled={!canEdit} type="date" value={open.nextActionDate} onChange={(e) => upd(open.id, { nextActionDate: e.target.value })} /></div>
                </div>
                {mktFields.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 border-t pt-3">
                    {mktFields.map((f) => (
                      <div key={f.id} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{f.label}</Label>
                        {f.type === 'select'
                          ? <NativeSelect disabled={!canEdit} className="w-full" value={open.custom?.[f.id] ?? ''} onChange={(v) => setCustom(open, f, v)} options={[{ value: '', label: '—' }, ...f.options.split(',').map((x) => x.trim()).filter(Boolean).map((x) => ({ value: x, label: x }))]} />
                          : <Input disabled={!canEdit} type={f.type} value={open.custom?.[f.id] ?? ''} onChange={(e) => setCustom(open, f, e.target.value)} />}
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea disabled={!canEdit} rows={4} value={open.notes} onChange={(e) => upd(open.id, { notes: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={open.unsubscribed} onCheckedChange={(v) => upd(open.id, { unsubscribed: v })} /> Unsubscribed (never email this lead)</label>
                {canEdit && <Button variant="outline" onClick={() => { deleteLead(open.id); setOpenId(null) }}><Trash2 className="text-destructive" /> Delete lead</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <LeadImportDialog open={importing} onOpenChange={setImporting} />
      <ColumnManager open={columnsOpen} onOpenChange={setColumnsOpen} canEdit={canEdit} />
      <ComposeDialog open={!!compose} onClose={() => setCompose(null)} leadIds={compose ?? []} />
    </div>
  )
}
