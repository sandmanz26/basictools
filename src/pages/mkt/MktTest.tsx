import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Loader2, Play, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Field, PageHeader, pageCls } from '@/components/pm/ui'
import { useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { burstSend, friendlyMsError, listInbox, type BurstItem, type BurstRow, type InboxMessage } from '@/lib/microsoft'
import { cn } from '@/lib/utils'

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const MAX_BATCH = 30
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

/** Split pasted text on commas, semicolons, spaces and newlines; keep valid unique addresses. */
function parseRecipients(text: string) {
  const parts = text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
  const seen = new Set<string>()
  const valid: string[] = []
  const invalid: string[] = []
  for (const p of parts) {
    const k = p.toLowerCase()
    if (!EMAIL_RE.test(p)) { invalid.push(p); continue }
    if (!seen.has(k)) { seen.add(k); valid.push(p) }
  }
  return { valid, invalid }
}

function BurstCard({ to }: { to: string }) {
  const cfg = useStore((s) => s.msConfig)
  const [mode, setMode] = useState<'self' | 'people'>('self')
  const [count, setCount] = useState(10)
  const [people, setPeople] = useState('')
  const [subject, setSubject] = useState('Test message from HireFlow')
  const [message, setMessage] = useState('Hi,\n\nThis is a test message sent from HireFlow. No action is needed.\n\nThanks!')
  const [parallel, setParallel] = useState('4')
  const [rows, setRows] = useState<BurstRow[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [total, setTotal] = useState<number | null>(null)
  const parsed = useMemo(() => parseRecipients(people), [people])
  const tooMany = mode === 'people' && parsed.valid.length > MAX_BATCH

  const run = async () => {
    let items: BurstItem[]
    if (mode === 'self') {
      const n = Math.min(Math.max(Math.round(count) || 1, 1), MAX_BATCH)
      setCount(n)
      const id = Date.now().toString(36)
      items = Array.from({ length: n }, (_, i) => ({ to, subject: `HireFlow burst test ${id} (${i + 1}/${n})`, body: `Test message ${i + 1} of ${n} from HireFlow. Safe to delete.` }))
    } else {
      if (!parsed.valid.length || tooMany || parsed.invalid.length) return
      const list = parsed.valid.slice(0, 8).join('\n') + (parsed.valid.length > 8 ? `\n…and ${parsed.valid.length - 8} more` : '')
      if (!confirm(`This sends a REAL email from ${to} to ${parsed.valid.length} ${parsed.valid.length === 1 ? 'person' : 'people'}:\n\n${list}\n\nSubject: ${subject}\n\nContinue?`)) return
      items = parsed.valid.map((r) => ({ to: r, subject, body: message }))
    }
    setError(''); setTotal(null); setRunning(true)
    setRows(items.map((it, i) => ({ n: i + 1, to: it.to, status: 'queued' as const, tries: 0 })))
    const t0 = performance.now()
    try {
      await burstSend(cfg, items, Number(parallel), (row) => setRows((rs) => rs.map((r) => (r.n === row.n ? row : r))))
    } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))) }
    setTotal(Math.round(performance.now() - t0))
    setRunning(false)
  }

  const sent = rows.filter((r) => r.status === 'sent').length
  const failed = rows.filter((r) => r.status === 'failed').length
  const retried = rows.filter((r) => r.tries > 1).length
  const done = rows.length > 0 && !running
  const avg = useMemo(() => { const m = rows.filter((r) => r.ms).map((r) => r.ms!); return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : 0 }, [rows])
  const canRun = !running && (mode === 'self' || (parsed.valid.length > 0 && !tooMany && parsed.invalid.length === 0 && !!subject.trim()))

  return (
    <Card title="Send many emails at once">
      <div className="space-y-4">
        <div className="inline-flex rounded-lg border p-0.5 text-sm">
          {([['self', 'To myself'], ['people', 'To real recipients']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={cn('rounded-md px-3 py-1', mode === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
          ))}
        </div>

        {mode === 'self' ? (
          <p className="text-sm text-muted-foreground">Sends test messages <b>to yourself</b> ({to}), several in parallel. Each lands in your Inbox and Sent Items; delete them afterwards.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Sends <b>one real email to each address</b> from <b>{to}</b>. Use it to test a small broadcast with colleagues who know about it. Everyone receives only their own copy (nobody sees the other addresses).</p>
            <Field label={`Recipients (up to ${MAX_BATCH}): paste emails separated by commas, spaces or new lines`}>
              <Textarea rows={4} value={people} placeholder={'anna@company.id\nbudi@company.id, citra@company.id'} onChange={(e) => setPeople(e.target.value)} />
            </Field>
            <div className="text-xs">
              <span className="text-muted-foreground">{parsed.valid.length} valid address{parsed.valid.length === 1 ? '' : 'es'}</span>
              {parsed.invalid.length > 0 && <span className="ml-3 text-red-600">Not valid: {parsed.invalid.slice(0, 5).join(', ')}{parsed.invalid.length > 5 ? '…' : ''}</span>}
              {tooMany && <span className="ml-3 text-red-600">Too many: split into batches of {MAX_BATCH} or fewer.</span>}
            </div>
            <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field label="Message (plain text)"><Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3">
          {mode === 'self' && <Field label="How many (1–30)"><Input type="number" min={1} max={MAX_BATCH} className="w-28" value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>}
          <Field label="At the same time">
            <NativeSelect className="w-40" value={parallel} onChange={setParallel} options={[1, 2, 3, 4, 6, 10].map((n) => ({ value: String(n), label: n === 1 ? '1 (one by one)' : `${n} in parallel` }))} />
          </Field>
          <Button disabled={!canRun} onClick={run}>{running ? <Loader2 className="animate-spin" /> : <Play />} {running ? 'Sending…' : mode === 'self' ? 'Send test batch' : `Send to ${parsed.valid.length || ''} recipient${parsed.valid.length === 1 ? '' : 's'}`}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Microsoft allows about 4 requests at once and about 30 messages per minute per mailbox. Above that you will see “retried” rows (the app waits and retries up to 3 times) or failures. Real broadcasts to leads are in <b>Broadcast</b>; they pace themselves automatically.</p>
        {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

        {rows.length > 0 && (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span><b className="text-emerald-600">{sent}</b> sent</span>
              <span><b className={failed ? 'text-red-600' : ''}>{failed}</b> failed</span>
              <span><b>{retried}</b> retried</span>
              {done && total !== null && <span>Took <b>{(total / 1000).toFixed(1)}s</b> · avg {avg} ms · about {Math.round((sent / Math.max(total, 1)) * 60000)}/min</span>}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground"><tr><th className="px-3 py-1.5">#</th><th className="px-3 py-1.5">To</th><th className="px-3 py-1.5">Status</th><th className="px-3 py-1.5">Time</th><th className="px-3 py-1.5">Tries</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n} className="border-t align-top">
                      <td className="px-3 py-1.5">{r.n}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.to}</td>
                      <td className={cn('px-3 py-1.5', r.status === 'sent' && 'text-emerald-600', r.status === 'failed' && 'text-red-600')}>
                        {r.status}{r.error && <div className="text-xs whitespace-pre-line">{r.error.split('\n\nDetails:')[0]}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.ms ? `${r.ms} ms` : ''}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{r.tries > 1 ? `${r.tries} (retried)` : r.tries || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function InboxCard() {
  const cfg = useStore((s) => s.msConfig)
  const [msgs, setMsgs] = useState<InboxMessage[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = async (search = q) => {
    setBusy(true); setError('')
    try { setMsgs(await listInbox(cfg, 15, search)); setOpen(null) } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))) }
    setBusy(false)
  }

  return (
    <Card title="Read my inbox (read-only)">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Shows your 15 newest inbox messages (sender, subject, a short preview). It only reads. Nothing is saved: the list disappears when you leave this page. The first time, Microsoft asks you to allow <code className="rounded bg-muted px-1">Mail.Read</code>.</p>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search your inbox (optional)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
          </div>
          <Button disabled={busy} onClick={() => load()}>{busy ? <Loader2 className="animate-spin" /> : <Inbox />} Load inbox</Button>
          <Button variant="outline" disabled={busy} onClick={() => { setQ('HireFlow burst test'); load('HireFlow burst test') }}>Only my test emails</Button>
        </div>
        {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
        {msgs && msgs.length === 0 && <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No messages found.</div>}
        {msgs && msgs.length > 0 && (
          <div className="divide-y rounded-lg border">
            {msgs.map((m) => (
              <button key={m.id} type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="block w-full px-3 py-2 text-left hover:bg-muted/50">
                <div className="flex items-baseline gap-2">
                  {!m.read && <span className="size-2 shrink-0 rounded-full bg-blue-600" title="Unread" />}
                  <span className={cn('min-w-0 flex-1 truncate text-sm', !m.read && 'font-semibold')}>{m.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmt(m.received)}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.fromName || m.from} {m.fromName && m.from && `<${m.from}>`}</div>
                {open === m.id && <div className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{m.preview || '(no preview)'}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

export default function MktTest() {
  const ms = useMicrosoft()
  const to = ms.account?.username ?? ''
  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="Microsoft test lab" desc="Try parallel sending and inbox reading with your own mailbox. For testing only." />
        {!ms.account ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>Connect Microsoft first in <Link to="/mkt/settings" className="font-medium underline underline-offset-4">Microsoft & stages</Link>. To read the inbox you also need the <b>Mail.Read</b> permission (see the setup guide there).</div>
          </div>
        ) : (
          <>
            <BurstCard to={to} />
            <InboxCard />
          </>
        )}
      </div>
    </div>
  )
}
