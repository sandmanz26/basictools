import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { Info, Search, Pause, Play, RotateCcw, Send, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, Field, PageHeader, pageCls, Progress } from '@/components/pm/ui'
import { useCan, useCurrentUser, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { MERGE_FIELDS, merge } from '@/lib/microsoft'
import { DAILY_LIMIT, FOOTER, GAP_MS, counts, pauseBroadcast, runBroadcast, useRunningId } from '@/lib/broadcast'
import { stageDot } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Broadcast } from '@/types'

const fmtDur = (s: number) => (s < 90 ? `${Math.round(s)} sec` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} hours`)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function MktBroadcast() {
  const { leads, templates, mktStages, emails, broadcasts, addBroadcast, deleteBroadcast } = useStore()
  const canSend = useCan()('mkt.send')
  const { user } = useCurrentUser()
  const ms = useMicrosoft()
  const runningId = useRunningId()
  const [tab, setTab] = useState('new')

  const [name, setName] = useState('')
  const [stageSel, setStageSel] = useState<Set<string>>(new Set())
  const [source, setSource] = useState('')
  const [owner, setOwner] = useState('')
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [contact, setContact] = useState('')
  const [listQ, setListQ] = useState('')
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [tplId, setTplId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState(true)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(), [leads])
  const owners = useMemo(() => [...new Set(leads.map((l) => l.owner).filter(Boolean))].sort(), [leads])
  const matched = useMemo(() => leads.filter((l) =>
    (stageSel.size === 0 || stageSel.has(l.stage)) && (!source || l.source === source) && (!owner || l.owner === owner) &&
    (!tag.trim() || l.tags.toLowerCase().split(',').some((t) => t.trim() === tag.trim().toLowerCase())) &&
    (!contact || (contact === 'never' ? !l.lastContactAt : !!l.lastContactAt)) &&
    (!q.trim() || `${l.name} ${l.company} ${l.title} ${l.email} ${l.tags}`.toLowerCase().includes(q.trim().toLowerCase()))), [leads, stageSel, source, owner, tag, q, contact])
  const valid = matched.filter((l) => l.email.includes('@') && !l.unsubscribed)
  const noEmail = matched.filter((l) => !l.email.includes('@')).length
  const unsub = matched.filter((l) => l.unsubscribed).length
  const recipients = valid.filter((l) => !excluded.has(l.id))
  const shown = listQ.trim() ? valid.filter((l) => `${l.name} ${l.company} ${l.email}`.toLowerCase().includes(listQ.trim().toLowerCase())) : valid
  const anyFilter = stageSel.size > 0 || !!(source || owner || tag.trim() || q.trim() || contact)
  const resetFilters = () => { setStageSel(new Set()); setSource(''); setOwner(''); setTag(''); setQ(''); setContact(''); setExcluded(new Set()) }

  const used24h = emails.filter((e) => e.status === 'sent' && Date.now() - Date.parse(e.sentAt) < 864e5).length
  const afterRun = used24h + recipients.length
  const overLimit = afterRun > DAILY_LIMIT
  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null
  const busy = !!runningId
  const first = recipients[0]
  const filterLabel = [
    stageSel.size ? `stage: ${[...stageSel].map((id) => mktStages.find((s) => s.id === id)?.label ?? id).join(', ')}` : 'all stages',
    q.trim() && `search: “${q.trim()}”`, contact && (contact === 'never' ? 'never contacted' : 'already contacted'), source && `source: ${source}`, owner && `owner: ${owner}`, tag.trim() && `tag: ${tag.trim()}`, excluded.size && `${excluded.size} unticked`,
  ].filter(Boolean).join(' · ')

  const toggleStage = (id: string) => { setStageSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }); setExcluded(new Set()) }
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const applyTpl = (id: string) => { setTplId(id); const t = templates.find((x) => x.id === id); if (t) { setSubject(t.subject); setBody(t.body) } }
  const insert = (f: string) => {
    const el = bodyRef.current, tagText = `{{${f}}}`
    if (!el) return setBody((b) => b + tagText)
    const a = el.selectionStart, z = el.selectionEnd
    setBody(body.slice(0, a) + tagText + body.slice(z))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tagText.length, a + tagText.length) })
  }

  const start = () => {
    const b: Broadcast = {
      id: 'bc-' + nanoid(6), name: name.trim() || `Broadcast ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
      subject, body, footer, audience: filterLabel, recipients: Object.fromEntries(recipients.map((l) => [l.id, 'pending' as const])),
      status: 'paused', createdAt: new Date().toISOString(), finishedAt: '', createdBy: user.name,
    }
    addBroadcast(b)
    setTab('history')
    void runBroadcast(b.id)
  }
  const canStart = canSend && !blocked && !busy && !overLimit && recipients.length > 0 && subject.trim() && body.trim()

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-5xl space-y-4">
        <PageHeader title="Broadcast" desc="Send one message to many leads. Each lead gets their own personal email, sent one by one from your Microsoft account." />
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>This is not a newsletter tool. Microsoft allows about 30 emails per minute and 10,000 recipients per day per mailbox (personal Outlook accounts much less), so we send slowly, about one every {(GAP_MS / 1000).toFixed(1)} seconds. Keep the tab open while sending. Only email people who expect to hear from you.</div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="new">New broadcast</TabsTrigger>
            <TabsTrigger value="history">History ({broadcasts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4 pt-4">
            {!canSend && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t send marketing email.</div>}
            <Card title="1. Audience">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-xs font-medium text-muted-foreground">Stage</span>
                  {mktStages.map((st) => (
                    <button key={st.id} onClick={() => toggleStage(st.id)} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', stageSel.has(st.id) ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}>
                      <span className={cn('size-1.5 rounded-full', stageDot(st))} /> {st.label}
                    </button>
                  ))}
                  {stageSel.size > 0 && <button className="text-xs text-muted-foreground underline" onClick={() => { setStageSel(new Set()); setExcluded(new Set()) }}>clear</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-8 w-56 pl-8" placeholder="Search name, company, email…" value={q} onChange={(e) => { setQ(e.target.value); setExcluded(new Set()) }} />
                  </div>
                  <NativeSelect value={contact} onChange={(v) => { setContact(v); setExcluded(new Set()) }} options={[{ value: '', label: 'Any contact history' }, { value: 'never', label: 'Never contacted' }, { value: 'contacted', label: 'Already contacted' }]} />
                  <NativeSelect value={source} onChange={(v) => { setSource(v); setExcluded(new Set()) }} options={[{ value: '', label: 'Any source' }, ...sources.map((x) => ({ value: x, label: x }))]} />
                  <NativeSelect value={owner} onChange={(v) => { setOwner(v); setExcluded(new Set()) }} options={[{ value: '', label: 'Any owner' }, ...owners.map((x) => ({ value: x, label: x }))]} />
                  <Input className="h-8 w-40" placeholder="Tag, e.g. enterprise" value={tag} onChange={(e) => { setTag(e.target.value); setExcluded(new Set()) }} />
                  {anyFilter && <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <b className="tabular-nums">{recipients.length}</b> will receive it
                  <span className="text-xs text-muted-foreground">· {matched.length} match{noEmail > 0 && ` · ${noEmail} skipped (no email)`}{unsub > 0 && ` · ${unsub} skipped (unsubscribed)`}</span>
                  <span className="ml-auto flex gap-1.5">
                    <Button variant="outline" size="xs" onClick={() => setExcluded((x) => { const n = new Set(x); shown.forEach((l) => n.delete(l.id)); return n })}>Tick {listQ.trim() ? 'shown' : 'all'}</Button>
                    <Button variant="outline" size="xs" onClick={() => setExcluded((x) => { const n = new Set(x); shown.forEach((l) => n.add(l.id)); return n })}>Untick {listQ.trim() ? 'shown' : 'all'}</Button>
                  </span>
                </div>
                {valid.length > 8 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input className="h-8 pl-8" placeholder="Find someone in this list to untick…" value={listQ} onChange={(e) => setListQ(e.target.value)} />
                  </div>
                )}
                <div className="max-h-52 overflow-y-auto rounded-lg border">
                  {shown.map((l) => (
                    <label key={l.id} className="flex cursor-pointer items-center gap-2 border-b px-2.5 py-1.5 text-sm last:border-0 hover:bg-muted/50">
                      <input type="checkbox" checked={!excluded.has(l.id)} onChange={() => toggle(l.id)} />
                      <span className="min-w-0 flex-1 truncate">{l.name}<span className="text-muted-foreground"> · {l.company}</span></span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">{l.email}</span>
                    </label>
                  ))}
                  {shown.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No sendable leads match these filters.</div>}
                </div>
              </div>
            </Card>

            <Card title="2. Message">
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Broadcast name (for your history)"><Input placeholder="e.g. November product update" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                  <Field label="Start from a template"><NativeSelect className="w-full" value={tplId} onChange={applyTpl} options={[{ value: '', label: 'Choose…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} /></Field>
                </div>
                <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <Textarea ref={bodyRef} rows={8} placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} />
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  Insert:
                  {MERGE_FIELDS.map((f) => <button key={f} type="button" onClick={() => insert(f)} className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70">{`{{${f}}}`}</button>)}
                </div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={footer} onCheckedChange={setFooter} /> Add an unsubscribe line at the bottom</label>
                {first && (subject || body) && (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview for {first.name}</div>
                    <div className="font-medium">{merge(subject, first)}</div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{merge(body, first)}{footer && FOOTER}</div>
                  </div>
                )}
                {footer && <p className="text-xs text-muted-foreground">Replies saying STOP are handled by you: open the lead and switch on “Unsubscribed” so they are skipped from now on.</p>}
              </div>
            </Card>

            <Card title="3. Send">
              <div className="space-y-3">
                <div className="text-sm">
                  <b className="tabular-nums">{recipients.length}</b> emails · about {fmtDur(recipients.length * (GAP_MS / 1000))} to send · last 24h from this app: <b className="tabular-nums">{used24h}</b> of ~{DAILY_LIMIT.toLocaleString('en-US')} daily limit
                </div>
                {overLimit && <div className="flex items-start gap-2 rounded bg-red-50 px-2.5 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> This would bring you to {afterRun.toLocaleString('en-US')} emails in 24 hours, over Microsoft’s daily limit. Narrow the audience.</div>}
                {!overLimit && afterRun > DAILY_LIMIT * 0.8 && <div className="flex items-start gap-2 rounded bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Close to the daily limit ({afterRun.toLocaleString('en-US')} of {DAILY_LIMIT.toLocaleString('en-US')}). Personal Outlook accounts allow far fewer.</div>}
                {busy && <div className="text-sm text-muted-foreground">Another broadcast is sending. Wait for it to finish or pause it in History.</div>}
                {blocked && (
                  <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <div>{blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect your Microsoft account to send.'}{' '}
                      {blocked === 'signin' ? <Button size="xs" onClick={ms.connect} disabled={ms.busy}>Connect Microsoft</Button> : <Link to="/mkt/settings" className="font-medium underline">Open Microsoft settings</Link>}
                      {ms.error && <div className="mt-1 text-xs">{ms.error}</div>}
                    </div>
                  </div>
                )}
                <Button disabled={!canStart} onClick={() => confirm(`Send “${subject}” to ${recipients.length} leads now?`) && start()}><Send /> Send to {recipients.length}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-3 pt-4">
            {broadcasts.length === 0 && <Empty>No broadcasts yet.</Empty>}
            {broadcasts.map((b) => {
              const c = counts(b)
              const live = runningId === b.id
              const status = b.status === 'running' && !live ? 'paused' : b.status // 'running' left over from a closed tab
              const remaining = c.total - c.sent
              const pct = c.total ? (c.sent / c.total) * 100 : 0
              return (
                <Card key={b.id}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{b.name}</span>
                        <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : status === 'running' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300')}>
                          {status === 'done' ? (c.failed ? 'Finished with failures' : 'Done') : status === 'running' ? 'Sending…' : 'Paused'}
                        </span>
                      </div>
                      <div className="truncate text-sm text-muted-foreground">{b.subject}</div>
                      <div className="text-xs text-muted-foreground">{b.audience} · by {b.createdBy} · {when(b.createdAt)}</div>
                    </div>
                    <div className="flex gap-1.5">
                      {live && <Button size="sm" variant="outline" onClick={pauseBroadcast}><Pause /> Pause</Button>}
                      {!live && remaining > 0 && canSend && (
                        <Button size="sm" variant="outline" disabled={busy || !!blocked} onClick={() => void runBroadcast(b.id)}>
                          {c.failed ? <RotateCcw /> : <Play />} {c.sent === 0 && c.failed === 0 ? 'Start' : c.pending === 0 ? `Retry ${c.failed} failed` : `Resume (${remaining} left)`}
                        </Button>
                      )}
                      {!live && canSend && <Button size="icon-sm" variant="ghost" title="Delete from history" onClick={() => confirm(`Remove “${b.name}” from history? Sent emails stay in your Sent Items.`) && deleteBroadcast(b.id)}><Trash2 className="text-destructive" /></Button>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Progress value={pct} tone={status === 'done' && !c.failed ? 'bg-emerald-500' : 'bg-primary'} />
                    <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground tabular-nums">
                      <span><b className="text-foreground">{c.sent}</b> sent</span>
                      <span className={cn(c.failed > 0 && 'font-medium text-red-600')}>{c.failed} failed</span>
                      <span>{c.pending} waiting</span>
                      <span>of {c.total}</span>
                      {b.finishedAt && <span className="ml-auto">finished {when(b.finishedAt)}</span>}
                    </div>
                    {status === 'paused' && c.failed >= 3 && !live && <div className="text-xs text-amber-700 dark:text-amber-300">Sending stops by itself after 3 failures in a row. Check the Sent log for the error (expired sign-in or a Microsoft limit are common), then resume.</div>}
                  </div>
                </Card>
              )
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
