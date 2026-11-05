import { useMemo, useState } from 'react'
import { CalendarDays, Columns3, Mail, Plus, Search, Table2, Trash2 } from 'lucide-react'
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
import { PageHeader } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { LEAD_SOURCES, fmtDate, idr, stageDot, stageTone, today } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

const th = 'border-b border-r bg-muted px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'
const td = 'border-b border-r p-0 align-middle'
const jt = (n: number) => (n >= 1e9 ? (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M' : (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt')

export default function MktPipeline() {
  const { leads, mktStages: stages, addLead, updateLead, deleteLead } = useStore()
  const canEdit = useCan()('mkt.edit')
  const canSend = useCan()('mkt.send')
  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [compose, setCompose] = useState<string[] | null>(null)
  const t = today()

  const rows = useMemo(() => leads.filter((l) =>
    (!q || `${l.name} ${l.company} ${l.email} ${l.tags}`.toLowerCase().includes(q.toLowerCase())) && (!source || l.source === source)), [leads, q, source])
  const open = leads.find((l) => l.id === openId)
  const stageOpts = stages.map((x) => ({ value: x.id, label: x.label }))
  const sourceOpts = LEAD_SOURCES.map((x) => ({ value: x, label: x }))
  const upd = (id: string, p: Partial<Lead>) => updateLead(id, p)
  const add = (stage?: string) => setOpenId(addLead(stage ? { stage } : {}))

  const openValue = rows.filter((l) => stages.find((s) => s.id === l.stage)?.type === 'active').reduce((a, l) => a + (l.value ?? 0), 0)
  const wonValue = rows.filter((l) => stages.find((s) => s.id === l.stage)?.type === 'won').reduce((a, l) => a + (l.value ?? 0), 0)

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <PageHeader
        title="Lead pipeline"
        desc="Track prospects from first touch to closed deal. Send email to a lead straight from its card."
        actions={canEdit && <Button onClick={() => add()}><Plus /> New lead</Button>}
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
                  <th className={cn(th, 'w-44')}>Company</th><th className={cn(th, 'w-40')}>Contact</th><th className={cn(th, 'w-52')}>Email</th>
                  <th className={cn(th, 'w-40')}>Stage</th><th className={cn(th, 'w-36')}>Value (Rp)</th><th className={cn(th, 'w-36')}>Source</th>
                  <th className={cn(th, 'w-56')}>Next action</th><th className={cn(th, 'w-32')}>Due</th><th className="w-20 border-b bg-muted" />
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/30">
                    <td className={td}><TextCell value={l.company} readOnly={!canEdit} className="font-medium" onCommit={(v) => upd(l.id, { company: v })} /></td>
                    <td className={td}><TextCell value={l.name} readOnly={!canEdit} onCommit={(v) => upd(l.id, { name: v })} /></td>
                    <td className={td}><TextCell value={l.email} readOnly={!canEdit} onCommit={(v) => upd(l.id, { email: v })} /></td>
                    <td className={td}><SelectCell value={l.stage} options={stageOpts} readOnly={!canEdit} tone={stageTone(stages.find((x) => x.id === l.stage))} onChange={(v) => upd(l.id, { stage: v })} /></td>
                    <td className={td}><NumberCell value={l.value} readOnly={!canEdit} onCommit={(v) => upd(l.id, { value: v })} /></td>
                    <td className={td}><SelectCell value={l.source} options={sourceOpts} readOnly={!canEdit} onChange={(v) => upd(l.id, { source: v })} /></td>
                    <td className={td}><TextCell value={l.nextAction} readOnly={!canEdit} onCommit={(v) => upd(l.id, { nextAction: v })} /></td>
                    <td className={td}><TextCell type="date" value={l.nextActionDate} readOnly={!canEdit} onCommit={(v) => upd(l.id, { nextActionDate: v })} /></td>
                    <td className="border-b p-0 text-center">
                      <Button variant="ghost" size="icon-xs" title="Details" onClick={() => setOpenId(l.id)}><Search /></Button>
                      {canEdit && <Button variant="ghost" size="icon-xs" onClick={() => confirm('Delete this lead?') && deleteLead(l.id)}><Trash2 className="text-destructive" /></Button>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="py-16 text-center text-sm text-muted-foreground">No leads match.</td></tr>}
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
                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea disabled={!canEdit} rows={4} value={open.notes} onChange={(e) => upd(open.id, { notes: e.target.value })} /></div>
                <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={open.unsubscribed} onCheckedChange={(v) => upd(open.id, { unsubscribed: v })} /> Unsubscribed (never email this lead)</label>
                {canEdit && <Button variant="outline" onClick={() => { deleteLead(open.id); setOpenId(null) }}><Trash2 className="text-destructive" /> Delete lead</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ComposeDialog open={!!compose} onClose={() => setCompose(null)} leadIds={compose ?? []} />
    </div>
  )
}
