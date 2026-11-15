import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Paperclip, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/NativeSelect'
import { formatNumber } from '@/components/NumberInput'
import { Empty } from '@/components/pm/ui'
import { useStore } from '@/store'
import { addDays, localToday } from '@/lib/billing'
import { downloadCsv } from '@/lib/csv'
import { filterEmails, type HistoryCtx } from '@/components/mkt/sentFilter'

const PAGE = 50
type Preset = 'today' | '7' | '30' | 'all'

const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Everything sent, newest first, with date range / status / type / search filters, paging and CSV export. */
export function SentHistory() {
  const { emails, leads, broadcasts } = useStore()
  const [preset, setPreset] = useState<Preset>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])
  const bcName = useMemo(() => new Map(broadcasts.map((b) => [b.id, b.name])), [broadcasts])
  const ctx = useMemo<HistoryCtx>(() => ({
    company: (e) => leadById.get(e.leadId)?.company ?? '',
    typeLabel: (e) => (e.broadcastId ? `Broadcast: ${bcName.get(e.broadcastId) ?? 'deleted broadcast'}` : 'Single'),
  }), [leadById, bcName])
  const usedBroadcasts = useMemo(() => {
    const ids = [...new Set(emails.map((e) => e.broadcastId).filter((x): x is string => !!x))]
    return ids.map((id) => ({ value: id, label: bcName.get(id) ?? 'Deleted broadcast' }))
  }, [emails, bcName])

  const rows = useMemo(() => filterEmails(emails, { from, to, status, type, q }, ctx).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt)), [emails, from, to, status, type, q, ctx])
  const failed = rows.filter((e) => e.status === 'failed').length
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE)
  const anyFilter = !!(from || to || status || type || q.trim())

  const setRange = (p: Preset) => {
    setPreset(p); setPage(0)
    const today = localToday()
    setTo(p === 'all' ? '' : today)
    setFrom(p === 'today' ? today : p === '7' ? addDays(today, -6) : p === '30' ? addDays(today, -29) : '')
  }
  const touch = (fn: () => void) => { fn(); setPage(0) }
  const exportCsv = () => downloadCsv(`sent-emails-${localToday()}.csv`, [
    ['Sent at', 'To', 'Lead', 'Company', 'Subject', 'Type', 'Status', 'Error', 'Attachments', 'Sent by'],
    ...rows.map((e) => [stamp(e.sentAt), e.to, leadById.get(e.leadId)?.name ?? '', ctx.company(e), e.subject, ctx.typeLabel(e), e.status, e.error, (e.attachments ?? []).join('; '), e.sentBy]),
  ])

  if (emails.length === 0) return <Empty>Nothing sent yet. Emails you send from here, a broadcast or a lead card show up in this history.</Empty>

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1" role="group" aria-label="Quick date range">
          {([['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All']] as const).map(([k, label]) => (
            <Button key={k} size="sm" variant={preset === k ? 'default' : 'outline'} aria-pressed={preset === k} onClick={() => setRange(k)}>{label}</Button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">From
          <Input type="date" className="mt-0.5 h-8 w-36" value={from} max={to || undefined} onChange={(e) => touch(() => { setFrom(e.target.value); setPreset('all') })} />
        </label>
        <label className="text-xs text-muted-foreground">To
          <Input type="date" className="mt-0.5 h-8 w-36" value={to} min={from || undefined} onChange={(e) => touch(() => { setTo(e.target.value); setPreset('all') })} />
        </label>
        <NativeSelect ariaLabel="Status" value={status} onChange={(v) => touch(() => setStatus(v))} options={[{ value: '', label: 'Any status' }, { value: 'sent', label: 'Sent' }, { value: 'failed', label: 'Failed' }]} />
        <NativeSelect ariaLabel="Type" value={type} onChange={(v) => touch(() => setType(v))} options={[{ value: '', label: 'All types' }, { value: 'single', label: 'Single emails' }, { value: 'broadcast', label: 'Any broadcast' }, ...usedBroadcasts]} />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" aria-label="Search sent emails" placeholder="Search to, subject, company…" value={q} onChange={(e) => touch(() => setQ(e.target.value))} />
        </div>
        {anyFilter && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); setPreset('all'); setStatus(''); setType(''); setQ(''); setPage(0) }}>Reset</Button>}
        <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={exportCsv}><Download /> Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground tabular-nums" aria-live="polite">
        <span><b className="text-foreground">{formatNumber(rows.length)}</b> emails</span>
        <span><b className="text-emerald-700">{formatNumber(rows.length - failed)}</b> sent</span>
        <span className={failed ? 'font-medium text-red-600' : ''}>{formatNumber(failed)} failed</span>
      </div>

      {rows.length === 0 ? <Empty>No emails match these filters.</Empty> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                {['Sent at', 'To', 'Lead / company', 'Subject', 'Type', 'Status', 'Attachments', 'Sent by'].map((h) => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => {
                const lead = leadById.get(e.leadId)
                return (
                  <tr key={e.id} className="border-t align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{stamp(e.sentAt)}</td>
                    <td className="px-3 py-2">{e.to}</td>
                    <td className="px-3 py-2">{lead ? <><div>{lead.name}</div><div className="text-xs text-muted-foreground">{lead.company}</div></> : <span className="text-muted-foreground">{e.leadId ? 'Deleted lead' : '—'}</span>}</td>
                    <td className="max-w-64 px-3 py-2"><div className="truncate" title={e.subject}>{e.subject}</div></td>
                    <td className="px-3 py-2 text-xs">{ctx.typeLabel(e)}</td>
                    <td className="px-3 py-2">
                      {e.status === 'sent' ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Sent</span> : (
                        <details>
                          <summary title={e.error} className="flex cursor-pointer items-center gap-1 text-xs font-medium text-red-600"><TriangleAlert className="size-3.5" /> Failed</summary>
                          <div className="mt-1 max-w-56 text-xs text-red-600">{e.error || 'No error message'}</div>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">{e.attachments?.length ? <span className="flex items-start gap-1" title={e.attachments.join(', ')}><Paperclip className="mt-0.5 size-3 shrink-0" /> {e.attachments.length}: {e.attachments.join(', ')}</span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{e.sentBy}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">Rows {formatNumber(cur * PAGE + 1)}–{formatNumber(Math.min(rows.length, cur * PAGE + PAGE))} of {formatNumber(rows.length)}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-xs" disabled={cur <= 0} onClick={() => setPage(cur - 1)} aria-label="Previous page"><ChevronLeft /></Button>
            <span className="px-1 tabular-nums">Page {cur + 1} of {pages}</span>
            <Button variant="outline" size="icon-xs" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
