import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { CalendarClock, Check, ChevronLeft, ChevronRight, CircleAlert, Eye, Info, Paperclip, Pause, Play, RotateCcw, Search, Send, Trash2, TriangleAlert, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { NumberInput, formatNumber } from '@/components/NumberInput'
import { AttachmentPicker } from '@/components/AttachmentPicker'
import { Card, Empty, Field, PageHeader, pageCls, Progress } from '@/components/pm/ui'
import { useCan, useCurrentUser, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { MERGE_FIELDS, merge, sendMail } from '@/lib/microsoft'
import { DAILY_LIMIT, FOOTER, GAP_MS, counts, daysNeeded, inWindow, pauseBroadcast, runBroadcast, useRunningId } from '@/lib/broadcast'
import { stageDot } from '@/lib/constants'
import { loadAttachments, removeAttachment, saveAttachments } from '@/lib/attachments'
import { cn } from '@/lib/utils'
import type { AttachmentMeta, Broadcast, Lead } from '@/types'

const PAGE = 50
const fmtDur = (s: number) => (s < 90 ? `${Math.round(s)} sec` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} hours`)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const dayLabel = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }) }
const hours = Array.from({ length: 25 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))

function Pager({ page, pages, onPage, total }: { page: number; pages: number; onPage: (p: number) => void; total: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{formatNumber(total)} people</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-xs" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
        <span className="px-1 tabular-nums">Page {page + 1} of {Math.max(1, pages)}</span>
        <Button variant="outline" size="icon-xs" disabled={page >= pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  )
}

export default function MktBroadcast() {
  const { leads, templates, mktStages, emails, broadcasts, addBroadcast, deleteBroadcast, msConfig } = useStore()
  const canSend = useCan()('mkt.send')
  const { user } = useCurrentUser()
  const ms = useMicrosoft()
  const runningId = useRunningId()
  const [tab, setTab] = useState('new')

  // audience
  const [name, setName] = useState('')
  const [stageSel, setStageSel] = useState<Set<string>>(new Set())
  const [source, setSource] = useState('')
  const [owner, setOwner] = useState('')
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [contact, setContact] = useState('')
  const [skipRecent, setSkipRecent] = useState(true)
  const [recentDays, setRecentDays] = useState<number | null>(30)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [listQ, setListQ] = useState('')
  const [page, setPage] = useState(0)
  // message
  const [tplId, setTplId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [footer, setFooter] = useState(true)
  const [previewAt, setPreviewAt] = useState(0)
  const [testMsg, setTestMsg] = useState('')
  const [testOk, setTestOk] = useState(false)
  const [atts, setAtts] = useState<AttachmentMeta[]>([])
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  // delivery plan
  const [cap, setCap] = useState<number | null>(400)
  const [useWindow, setUseWindow] = useState(true)
  const [wStart, setWStart] = useState(9)
  const [wEnd, setWEnd] = useState(17)
  // history
  const [viewId, setViewId] = useState<string | null>(null)

  const reset = (fn: () => void) => { fn(); setExcluded(new Set()); setPage(0) }
  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(), [leads])
  const owners = useMemo(() => [...new Set(leads.map((l) => l.owner).filter(Boolean))].sort(), [leads])
  const matched = useMemo(() => leads.filter((l) =>
    (stageSel.size === 0 || stageSel.has(l.stage)) && (!source || l.source === source) && (!owner || l.owner === owner) &&
    (!tag.trim() || l.tags.toLowerCase().split(',').some((t) => t.trim() === tag.trim().toLowerCase())) &&
    (!contact || (contact === 'never' ? !l.lastContactAt : !!l.lastContactAt)) &&
    (!q.trim() || `${l.name} ${l.company} ${l.title} ${l.email} ${l.tags}`.toLowerCase().includes(q.trim().toLowerCase()))), [leads, stageSel, source, owner, tag, q, contact])

  // People we already emailed recently are skipped, so a re-run or overlapping list never double-sends.
  const recentSet = useMemo(() => {
    const cut = Date.now() - (recentDays ?? 0) * 864e5
    return new Set(emails.filter((e) => e.status === 'sent' && Date.parse(e.sentAt) >= cut).map((e) => e.leadId))
  }, [emails, recentDays])
  const valid = useMemo(() => {
    const seen = new Set<string>()
    return matched.filter((l) => {
      const e = l.email.trim().toLowerCase()
      if (!e.includes('@') || l.unsubscribed || seen.has(e)) return false // no address, unsubscribed, or the same address twice
      seen.add(e)
      return true
    })
  }, [matched])
  const noEmail = matched.filter((l) => !l.email.includes('@')).length
  const unsub = matched.filter((l) => l.unsubscribed).length
  const dupes = matched.length - noEmail - unsub - valid.length
  const recently = skipRecent && recentDays ? valid.filter((l) => recentSet.has(l.id)).length : 0
  const recipients = valid.filter((l) => !excluded.has(l.id) && !(skipRecent && recentDays && recentSet.has(l.id)))

  const listed = useMemo(() => (listQ.trim() ? valid.filter((l) => `${l.name} ${l.company} ${l.email}`.toLowerCase().includes(listQ.trim().toLowerCase())) : valid), [valid, listQ])
  const pages = Math.ceil(listed.length / PAGE)
  const pageRows = listed.slice(page * PAGE, page * PAGE + PAGE)
  const anyFilter = stageSel.size > 0 || !!(source || owner || tag.trim() || q.trim() || contact)

  // delivery plan
  const windowLen = useWindow ? Math.max(0, wEnd - wStart) : 24
  const fits = Math.floor((windowLen * 3600) / (GAP_MS / 1000)) // emails that fit in one day's window
  const effCap = Math.min(cap && cap > 0 ? cap : Infinity, fits)
  const days = Number.isFinite(effCap) ? daysNeeded(recipients.length, effCap) : 1
  const firstDay = Math.min(recipients.length, Number.isFinite(effCap) ? effCap : recipients.length)
  const startsToday = !useWindow || inWindow({ windowStart: wStart, windowEnd: wEnd })
  const startOffset = startsToday ? 0 : new Date().getHours() < wStart ? 0 : 1
  const used24h = emails.filter((e) => e.status === 'sent' && Date.now() - Date.parse(e.sentAt) < 864e5).length
  const overLimit = used24h + firstDay > DAILY_LIMIT
  const bigWithoutCap = recipients.length > 1000 && !(cap && cap > 0)
  const aggressive = recipients.length > 1500 && !!cap && cap > 500

  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null
  const busy = !!runningId
  const spammy = subject.length > 8 && subject === subject.toUpperCase()
  const first = recipients[previewAt % Math.max(1, recipients.length)] as Lead | undefined
  const filterLabel = [
    stageSel.size ? `stage: ${[...stageSel].map((id) => mktStages.find((s) => s.id === id)?.label ?? id).join(', ')}` : 'all stages',
    q.trim() && `search: “${q.trim()}”`, contact && (contact === 'never' ? 'never contacted' : 'already contacted'), source && `source: ${source}`, owner && `owner: ${owner}`, tag.trim() && `tag: ${tag.trim()}`,
    excluded.size && `${excluded.size} unticked`, recently > 0 && `${recently} skipped (emailed in last ${recentDays} days)`,
  ].filter(Boolean).join(' · ')

  const toggleStage = (id: string) => reset(() => setStageSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }))
  const toggle = (id: string) => setExcluded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const applyTpl = (id: string) => { setTplId(id); const t = templates.find((x) => x.id === id); if (t) { setSubject(t.subject); setBody(t.body); setTestOk(false) } }
  const insert = (f: string) => {
    const el = bodyRef.current, tagText = `{{${f}}}`
    if (!el) return setBody((b) => b + tagText)
    const a = el.selectionStart, z = el.selectionEnd
    setBody(body.slice(0, a) + tagText + body.slice(z))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tagText.length, a + tagText.length) })
  }

  const sendTest = async () => {
    if (!ms.account || !first) return
    setTestMsg('Sending…')
    try {
      const files = await loadAttachments(atts)
      await sendMail(msConfig, ms.account.username, `[TEST] ${merge(subject, first)}`, merge(body, first) + (footer ? FOOTER : ''), files)
      setTestMsg(`Test sent to ${ms.account.username}. Check how it looks in your inbox.`); setTestOk(true)
    } catch (e) { setTestMsg(e instanceof Error ? e.message : 'Could not send the test'); setTestOk(false) }
  }

  const removeBroadcast = (b: Broadcast) => { deleteBroadcast(b.id); b.attachments?.forEach((a) => void removeAttachment(a)) }

  const start = () => {
    const b: Broadcast = {
      id: 'bc-' + nanoid(6), name: name.trim() || `Broadcast ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`,
      subject, body, footer, audience: filterLabel, recipients: Object.fromEntries(recipients.map((l) => [l.id, 'pending' as const])),
      status: 'paused', createdAt: new Date().toISOString(), finishedAt: '', createdBy: user.name,
      attachments: atts.length ? atts : undefined,
      dailyCap: cap && cap > 0 ? cap : undefined, windowStart: useWindow ? wStart : undefined, windowEnd: useWindow ? wEnd : undefined,
    }
    addBroadcast(b)
    setAtts([]) // now owned by the broadcast
    setTab('history')
    void runBroadcast(b.id)
  }

  const checks = [
    { ok: !!ms.account, label: 'Microsoft account connected' },
    { ok: !!subject.trim(), label: 'Subject written' },
    { ok: body.trim().length > 20, label: 'Message written' },
    { ok: footer, label: 'Unsubscribe line included', soft: true },
    { ok: testOk, label: atts.length ? `Test email sent to you (with ${atts.length} file${atts.length > 1 ? 's' : ''})` : 'Test email sent to you', soft: true },
    { ok: !bigWithoutCap && !aggressive, label: 'Pace is safe for this list size', soft: true },
  ]
  const canStart = canSend && !blocked && !busy && !overLimit && recipients.length > 0 && !!subject.trim() && !!body.trim()

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title="Broadcast" desc="Send one message to many leads, paced over days so it lands in inboxes, not spam folders. Each lead gets their own personal email." />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="new">New broadcast</TabsTrigger>
            <TabsTrigger value="history">History ({broadcasts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="pt-4">
            {!canSend && <div className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t send marketing email.</div>}
            <div className="grid items-start gap-4 lg:grid-cols-[1fr_21rem]">
              <div className="min-w-0 space-y-4">
                <Card title="1. Audience">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs font-medium text-muted-foreground">Stage</span>
                      {mktStages.map((st) => (
                        <button key={st.id} onClick={() => toggleStage(st.id)} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', stageSel.has(st.id) ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}>
                          <span className={cn('size-1.5 rounded-full', stageDot(st))} /> {st.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                        <Input className="h-8 w-56 pl-8" placeholder="Search name, company, email…" value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
                      </div>
                      <NativeSelect value={contact} onChange={(v) => reset(() => setContact(v))} options={[{ value: '', label: 'Any contact history' }, { value: 'never', label: 'Never contacted' }, { value: 'contacted', label: 'Already contacted' }]} />
                      <NativeSelect value={source} onChange={(v) => reset(() => setSource(v))} options={[{ value: '', label: 'Any source' }, ...sources.map((x) => ({ value: x, label: x }))]} />
                      <NativeSelect value={owner} onChange={(v) => reset(() => setOwner(v))} options={[{ value: '', label: 'Any owner' }, ...owners.map((x) => ({ value: x, label: x }))]} />
                      <Input className="h-8 w-40" placeholder="Tag, e.g. enterprise" value={tag} onChange={(e) => reset(() => setTag(e.target.value))} />
                      {anyFilter && <Button variant="ghost" size="sm" onClick={() => reset(() => { setStageSel(new Set()); setSource(''); setOwner(''); setTag(''); setQ(''); setContact('') })}>Reset filters</Button>}
                    </div>
                    <label className="flex flex-wrap items-center gap-2 text-sm">
                      <Switch checked={skipRecent} onCheckedChange={setSkipRecent} /> Skip anyone I already emailed in the last
                      <NumberInput className="h-7 w-16" min={1} max={365} value={recentDays} onValueChange={setRecentDays} disabled={!skipRecent} /> days
                      {recently > 0 && <span className="text-xs text-muted-foreground">({formatNumber(recently)} skipped)</span>}
                    </label>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span><b className="tabular-nums">{formatNumber(recipients.length)}</b> will receive it</span>
                      <span className="text-xs text-muted-foreground">
                        {formatNumber(matched.length)} match{noEmail > 0 && ` · ${formatNumber(noEmail)} no email`}{unsub > 0 && ` · ${formatNumber(unsub)} unsubscribed`}{dupes > 0 && ` · ${formatNumber(dupes)} duplicate address`}
                      </span>
                    </div>

                    <details className="group rounded-lg border" onToggle={() => setPage(0)}>
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium">
                        <span>Review the list ({formatNumber(valid.length)}){excluded.size > 0 && <span className="ml-2 font-normal text-amber-700">{formatNumber(excluded.size)} unticked</span>}</span>
                        <span className="text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
                      </summary>
                      <div className="space-y-2 border-t p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative flex-1">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input className="h-8 pl-8" placeholder="Find someone to untick…" value={listQ} onChange={(e) => { setListQ(e.target.value); setPage(0) }} />
                          </div>
                          <Button variant="outline" size="xs" onClick={() => setExcluded((x) => { const n = new Set(x); listed.forEach((l) => n.delete(l.id)); return n })}>Tick all {listQ.trim() ? 'found' : ''}</Button>
                          <Button variant="outline" size="xs" onClick={() => setExcluded((x) => { const n = new Set(x); listed.forEach((l) => n.add(l.id)); return n })}>Untick all {listQ.trim() ? 'found' : ''}</Button>
                        </div>
                        <div className="rounded-lg border">
                          {pageRows.map((l) => (
                            <label key={l.id} className="flex cursor-pointer items-center gap-2.5 border-b px-2.5 py-1.5 text-sm last:border-0 hover:bg-muted/50">
                              <Checkbox checked={!excluded.has(l.id)} onCheckedChange={() => toggle(l.id)} />
                              <span className="min-w-0 flex-1 truncate">{l.name}<span className="text-muted-foreground"> · {l.company}</span></span>
                              {skipRecent && recentSet.has(l.id) && <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">emailed recently</span>}
                              <span className="hidden text-xs text-muted-foreground sm:inline">{l.email}</span>
                            </label>
                          ))}
                          {pageRows.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No sendable leads match these filters.</div>}
                        </div>
                        <Pager page={page} pages={pages} onPage={setPage} total={listed.length} />
                      </div>
                    </details>
                  </div>
                </Card>

                <Card title="2. Message">
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Broadcast name (for your history)"><Input placeholder="e.g. November product update" value={name} onChange={(e) => setName(e.target.value)} /></Field>
                      <Field label="Start from a template"><NativeSelect className="w-full" value={tplId} onChange={applyTpl} options={[{ value: '', label: 'Choose…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} /></Field>
                    </div>
                    <Input placeholder="Subject" value={subject} onChange={(e) => { setSubject(e.target.value); setTestOk(false) }} />
                    {spammy && <p className="flex items-center gap-1.5 text-xs text-amber-700"><CircleAlert className="size-3.5" /> A subject in ALL CAPS often lands in spam.</p>}
                    <Textarea ref={bodyRef} rows={8} placeholder="Write your message…" value={body} onChange={(e) => { setBody(e.target.value); setTestOk(false) }} />
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      Insert:
                      {MERGE_FIELDS.map((f) => <button key={f} type="button" onClick={() => insert(f)} className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70">{`{{${f}}}`}</button>)}
                      <span className="ml-auto tabular-nums">{body.length} characters</span>
                    </div>
                    <AttachmentPicker
                      items={atts}
                      onAdd={async (files) => { const m = await saveAttachments(files); setAtts((a) => [...a, ...m]); setTestOk(false) }}
                      onRemove={(aid) => { const m = atts.find((x) => x.id === aid); if (m) void removeAttachment(m); setAtts((a) => a.filter((x) => x.id !== aid)); setTestOk(false) }}
                    />
                    <label className="flex items-center gap-2 text-sm"><Switch checked={footer} onCheckedChange={setFooter} /> Add an unsubscribe line at the bottom</label>
                    {first && (subject || body) && (
                      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <div className="mb-1 flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          <Eye className="size-3.5" /> Preview as {first.name}
                          <span className="ml-auto flex items-center gap-1 normal-case">
                            <Button variant="ghost" size="icon-xs" aria-label="Previous recipient" onClick={() => setPreviewAt((i) => (i - 1 + recipients.length) % recipients.length)}><ChevronLeft /></Button>
                            <span className="tabular-nums">{(previewAt % recipients.length) + 1}/{formatNumber(recipients.length)}</span>
                            <Button variant="ghost" size="icon-xs" aria-label="Next recipient" onClick={() => setPreviewAt((i) => (i + 1) % recipients.length)}><ChevronRight /></Button>
                          </span>
                        </div>
                        <div className="font-medium">{merge(subject, first)}</div>
                        <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{merge(body, first)}{footer && FOOTER}</div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" size="sm" disabled={!ms.account || !first || !subject.trim() || !body.trim()} onClick={() => void sendTest()}><UserRound /> Send a test to me</Button>
                      {testMsg && <span className={cn('text-xs', testOk ? 'text-emerald-700' : 'text-muted-foreground')}>{testMsg}</span>}
                    </div>
                  </div>
                </Card>

                <Card title="3. Delivery pace">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      <Info className="mt-0.5 size-4 shrink-0" />
                      <div>Sending thousands at once gets a mailbox flagged. Spread the list over several days. Microsoft allows about 30 emails per minute and {formatNumber(DAILY_LIMIT)} per day per mailbox, and we send one every {(GAP_MS / 1000).toFixed(1)} seconds. The app must stay open to send; it continues by itself each day.</div>
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <Field label="Emails per day"><NumberInput className="w-32" min={1} placeholder="No limit" value={cap} onValueChange={setCap} /></Field>
                      <label className="flex items-center gap-2 pb-1.5 text-sm"><Switch checked={useWindow} onCheckedChange={setUseWindow} /> Only send between</label>
                      <NativeSelect disabled={!useWindow} value={String(wStart)} onChange={(v) => setWStart(Number(v))} options={hours.slice(0, 24)} />
                      <span className="pb-1.5 text-sm text-muted-foreground">and</span>
                      <NativeSelect disabled={!useWindow} value={String(wEnd)} onChange={(v) => setWEnd(Number(v))} options={hours.slice(1)} />
                    </div>
                    {useWindow && wEnd <= wStart && <p className="text-xs text-red-600">The end hour must be after the start hour.</p>}
                    {useWindow && cap && cap > fits && <p className="text-xs text-amber-700">Only {formatNumber(fits)} emails fit in that window at this speed, so the daily amount is capped at {formatNumber(fits)}.</p>}
                    {bigWithoutCap && <p className="flex items-start gap-1.5 text-xs text-red-700"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {formatNumber(recipients.length)} emails in one go is risky. Set a daily limit (we suggest 300–500 a day).</p>}
                    {aggressive && <p className="flex items-start gap-1.5 text-xs text-amber-700"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> For a list this size and a mailbox that does not usually send in bulk, start with 300–500 a day and raise it if bounces stay low.</p>}
                  </div>
                </Card>
              </div>

              <aside className="space-y-3 lg:sticky lg:top-4">
                <Card title="Summary">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-baseline justify-between"><span className="text-muted-foreground">Recipients</span><b className="text-xl tabular-nums">{formatNumber(recipients.length)}</b></div>
                    <div className="space-y-1.5 rounded-lg bg-muted/40 p-2.5 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-foreground"><CalendarClock className="size-3.5" /> {days} day{days > 1 ? 's' : ''} · finishes {dayLabel(startOffset + days - 1)}</div>
                      <div className="text-muted-foreground">About {formatNumber(firstDay)} a day, {fmtDur(firstDay * (GAP_MS / 1000))} of sending each day.</div>
                      <ol className="space-y-0.5 text-muted-foreground tabular-nums">
                        {Array.from({ length: Math.min(days, 4) }, (_, i) => (
                          <li key={i} className="flex justify-between"><span>{dayLabel(startOffset + i)}</span><span>{formatNumber(Math.min(Number.isFinite(effCap) ? effCap : recipients.length, recipients.length - i * (Number.isFinite(effCap) ? effCap : 0)))}</span></li>
                        ))}
                        {days > 4 && <li>… and {days - 4} more day{days - 4 > 1 ? 's' : ''}</li>}
                      </ol>
                    </div>
                    <ul className="space-y-1">
                      {checks.map((c) => (
                        <li key={c.label} className="flex items-center gap-2 text-xs">
                          {c.ok ? <Check className="size-3.5 text-emerald-600" /> : <span className={cn('size-3.5 rounded-full border', c.soft ? 'border-amber-500' : 'border-red-500')} />}
                          <span className={c.ok ? '' : 'text-muted-foreground'}>{c.label}{!c.ok && c.soft && ' (recommended)'}</span>
                        </li>
                      ))}
                    </ul>
                    {overLimit && <div className="flex items-start gap-2 rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> Today’s batch would put you over Microsoft’s daily limit ({formatNumber(used24h)} already sent in 24h).</div>}
                    {busy && <div className="text-xs text-muted-foreground">Another broadcast is sending. Wait for it or pause it in History.</div>}
                    {blocked && (
                      <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        <div>{blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect your Microsoft account to send.'}{' '}
                          {blocked === 'signin' ? <Button size="xs" onClick={ms.connect} disabled={ms.busy}>Connect Microsoft</Button> : <Link to="/mkt/settings" className="font-medium underline">Open Microsoft settings</Link>}
                          {ms.error && <div className="mt-1">{ms.error}</div>}
                        </div>
                      </div>
                    )}
                    <Button className="w-full" disabled={!canStart || (useWindow && wEnd <= wStart)} onClick={() => confirm(`Start “${subject}” for ${formatNumber(recipients.length)} leads?\n\nIt will send about ${formatNumber(firstDay)} per day over ${days} day${days > 1 ? 's' : ''}.`) && start()}>
                      <Send /> Start broadcast
                    </Button>
                  </div>
                </Card>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-3 pt-4">
            {broadcasts.length === 0 && <Empty>No broadcasts yet.</Empty>}
            {broadcasts.map((b) => {
              const c = counts(b)
              const live = runningId === b.id
              const status = b.status === 'running' && !live ? 'paused' : b.status // 'running' left over from a closed tab
              const remaining = c.total - c.sent
              const pct = c.total ? (c.sent / c.total) * 100 : 0
              const todaySent = emails.filter((e) => e.broadcastId === b.id && e.status === 'sent' && Date.parse(e.sentAt) >= new Date().setHours(0, 0, 0, 0)).length
              const leftDays = b.dailyCap ? daysNeeded(remaining, b.dailyCap) : 1
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
                      {!!b.attachments?.length && <div className="flex items-center gap-1 text-xs text-muted-foreground"><Paperclip className="size-3" /> {b.attachments.map((a) => a.name).join(', ')}</div>}
                      <div className="text-xs text-muted-foreground">{b.audience} · by {b.createdBy} · {when(b.createdAt)}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setViewId(b.id)}><Eye /> Recipients</Button>
                      {live && <Button size="sm" variant="outline" onClick={pauseBroadcast}><Pause /> Pause</Button>}
                      {!live && remaining > 0 && canSend && (
                        <Button size="sm" variant="outline" disabled={busy || !!blocked} onClick={() => void runBroadcast(b.id)}>
                          {c.failed ? <RotateCcw /> : <Play />} {c.sent === 0 && c.failed === 0 ? 'Start' : c.pending === 0 ? `Retry ${formatNumber(c.failed)} failed` : `Resume (${formatNumber(remaining)} left)`}
                        </Button>
                      )}
                      {!live && canSend && <Button size="icon-sm" variant="ghost" title="Delete from history" onClick={() => confirm(`Remove “${b.name}” from history? Sent emails stay in your Sent Items.`) && removeBroadcast(b)}><Trash2 className="text-destructive" /></Button>}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Progress value={pct} tone={status === 'done' && !c.failed ? 'bg-emerald-500' : 'bg-primary'} />
                    <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground tabular-nums">
                      <span><b className="text-foreground">{formatNumber(c.sent)}</b> sent</span>
                      <span className={cn(c.failed > 0 && 'font-medium text-red-600')}>{formatNumber(c.failed)} failed</span>
                      <span>{formatNumber(c.pending)} waiting</span>
                      <span>of {formatNumber(c.total)}</span>
                      {b.dailyCap ? <span>today {formatNumber(todaySent)}/{formatNumber(b.dailyCap)}</span> : null}
                      {status !== 'done' && remaining > 0 && b.dailyCap ? <span>~{leftDays} day{leftDays > 1 ? 's' : ''} left</span> : null}
                      {b.finishedAt && <span className="ml-auto">finished {when(b.finishedAt)}</span>}
                    </div>
                    {status === 'paused' && b.pausedReason && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                        <CalendarClock className="size-3.5" /> {b.pausedReason}.{b.resumeAt && ` Continues ${when(b.resumeAt)} if the app is open.`}
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </TabsContent>
        </Tabs>
      </div>

      <RecipientsSheet id={viewId} onClose={() => setViewId(null)} />
    </div>
  )
}

/** Everyone in a broadcast with their status. Paged, filterable, with a summary of why sends failed. */
function RecipientsSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { broadcasts, leads, emails } = useStore()
  const b = broadcasts.find((x) => x.id === id)
  const [f, setF] = useState('all')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const byId = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const rows = useMemo(() => {
    if (!b) return []
    const needle = q.trim().toLowerCase()
    return Object.entries(b.recipients)
      .filter(([, st]) => f === 'all' || st === f)
      .map(([lid, st]) => ({ lead: byId.get(lid), st }))
      .filter((r) => r.lead && (!needle || `${r.lead.name} ${r.lead.company} ${r.lead.email}`.toLowerCase().includes(needle)))
  }, [b, f, q, byId])
  const errors = useMemo(() => {
    const m = new Map<string, number>()
    emails.filter((e) => e.broadcastId === id && e.status === 'failed' && e.error).forEach((e) => m.set(e.error, (m.get(e.error) ?? 0) + 1))
    return [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 3)
  }, [emails, id])
  const pages = Math.ceil(rows.length / PAGE)

  return (
    <Sheet open={!!b} onOpenChange={(o) => { if (!o) { onClose(); setF('all'); setQ(''); setPage(0) } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {b && (
          <>
            <SheetHeader>
              <SheetTitle>{b.name}</SheetTitle>
              <SheetDescription>{formatNumber(Object.keys(b.recipients).length)} recipients</SheetDescription>
            </SheetHeader>
            <div className="space-y-3 px-4 pb-6">
              {errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <div className="mb-1 font-medium">Most common errors</div>
                  {errors.map(([msg, n]) => <div key={msg}><b className="tabular-nums">{n}×</b> {msg}</div>)}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-8 pl-8" placeholder="Search recipients…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
                </div>
                <NativeSelect value={f} onChange={(v) => { setF(v); setPage(0) }} options={[{ value: 'all', label: 'All' }, { value: 'sent', label: 'Sent' }, { value: 'failed', label: 'Failed' }, { value: 'pending', label: 'Waiting' }]} />
              </div>
              <div className="rounded-lg border">
                {rows.slice(page * PAGE, page * PAGE + PAGE).map(({ lead, st }) => (
                  <div key={lead!.id} className="flex items-center gap-2 border-b px-2.5 py-1.5 text-sm last:border-0">
                    <span className="min-w-0 flex-1 truncate">{lead!.name}<span className="text-muted-foreground"> · {lead!.email}</span></span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', st === 'sent' ? 'bg-emerald-100 text-emerald-700' : st === 'failed' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground')}>{st === 'pending' ? 'waiting' : st}</span>
                  </div>
                ))}
                {rows.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nobody matches.</div>}
              </div>
              <Pager page={page} pages={pages} onPage={setPage} total={rows.length} />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
