import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Loader2, Play, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Field, PageHeader, pageCls } from '@/components/pm/ui'
import { useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { burstSend, friendlyMsError, listInbox, type BurstRow, type InboxMessage } from '@/lib/microsoft'
import { cn } from '@/lib/utils'

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function BurstCard({ to }: { to: string }) {
  const cfg = useStore((s) => s.msConfig)
  const [count, setCount] = useState(10)
  const [parallel, setParallel] = useState('4')
  const [rows, setRows] = useState<BurstRow[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [total, setTotal] = useState<number | null>(null)
  const runId = useRef('')

  const run = async () => {
    const n = Math.min(Math.max(Math.round(count) || 1, 1), 30)
    setCount(n); setError(''); setTotal(null); setRunning(true)
    setRows(Array.from({ length: n }, (_, i) => ({ n: i + 1, status: 'queued' as const, tries: 0 })))
    runId.current = Date.now().toString(36)
    const t0 = performance.now()
    try {
      await burstSend(cfg, to, n, Number(parallel), (row) => setRows((rs) => rs.map((r) => (r.n === row.n ? row : r))), runId.current)
    } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))) }
    setTotal(Math.round(performance.now() - t0))
    setRunning(false)
  }

  const sent = rows.filter((r) => r.status === 'sent').length
  const failed = rows.filter((r) => r.status === 'failed').length
  const retried = rows.filter((r) => r.tries > 1).length
  const done = rows.length > 0 && !running
  const avg = useMemo(() => { const m = rows.filter((r) => r.ms).map((r) => r.ms!); return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : 0 }, [rows])

  return (
    <Card title="Send many emails at once">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Sends test messages <b>to yourself only</b> ({to}), several in parallel, so you can see how Microsoft handles it. Each one lands in your Inbox and Sent Items; delete them afterwards.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="How many (1–30)"><Input type="number" min={1} max={30} className="w-28" value={count} onChange={(e) => setCount(Number(e.target.value))} /></Field>
          <Field label="At the same time">
            <NativeSelect className="w-40" value={parallel} onChange={setParallel} options={[1, 2, 3, 4, 6, 10].map((n) => ({ value: String(n), label: n === 1 ? '1 (one by one)' : `${n} in parallel` }))} />
          </Field>
          <Button disabled={running} onClick={run}>{running ? <Loader2 className="animate-spin" /> : <Play />} {running ? 'Sending…' : 'Send test batch'}</Button>
        </div>
        <p className="text-xs text-muted-foreground">Microsoft allows about 4 requests at once and about 30 messages per minute per mailbox. Above that you will see “retried” rows (the app waits and retries up to 3 times) or failures. That is the point of this test.</p>
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
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground"><tr><th className="px-3 py-1.5">#</th><th className="px-3 py-1.5">Status</th><th className="px-3 py-1.5">Time</th><th className="px-3 py-1.5">Tries</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.n} className="border-t align-top">
                      <td className="px-3 py-1.5">{r.n}</td>
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
