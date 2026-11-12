import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Loader2, Mail, RefreshCw, Undo2, Video, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/NativeSelect'
import { FollowUpDialog } from '@/components/mkt/FollowUpDialog'
import { Card, PageHeader, pageCls } from '@/components/pm/ui'
import { useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { friendlyMsError, listMeetings, type Meeting } from '@/lib/microsoft'
import { cn } from '@/lib/utils'

const domainOf = (a: string) => a.split('@')[1] ?? ''
const when = (m: Meeting) => {
  const s = new Date(m.start), e = new Date(m.end)
  const d = s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const t = (x: Date) => x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${d} · ${t(s)}–${t(e)}`
}

export default function MktMeetings() {
  const cfg = useStore((s) => s.msConfig)
  const leads = useStore((s) => s.leads)
  const followups = useStore((s) => s.meetingFollowups)
  const setFollowup = useStore((s) => s.setMeetingFollowup)
  const ms = useMicrosoft()
  const me = (ms.account?.username ?? '').toLowerCase()
  const myDomain = domainOf(me)

  const [days, setDays] = useState('14')
  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [withoutOutside, setWithoutOutside] = useState(false)
  const [open, setOpen] = useState<Meeting | null>(null)

  const load = async () => {
    setBusy(true); setError('')
    try {
      const from = new Date(Date.now() - Number(days) * 86400000).toISOString()
      const to = new Date(Date.now() + 7 * 86400000).toISOString()
      setMeetings(await listMeetings(cfg, from, to))
    } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))) }
    setBusy(false)
  }

  const outside = (m: Meeting) => m.attendees.filter((a) => a.type !== 'resource' && a.address !== me && domainOf(a.address) !== myDomain)
  const leadFor = (addr: string) => leads.find((l) => l.email.trim().toLowerCase() === addr)

  const groups = useMemo(() => {
    const now = Date.now()
    const list = (meetings ?? []).filter((m) => !m.cancelled && (withoutOutside || outside(m).length > 0))
    return {
      need: list.filter((m) => new Date(m.end).getTime() <= now && !followups[m.id]).sort((a, b) => b.end.localeCompare(a.end)),
      upcoming: list.filter((m) => new Date(m.end).getTime() > now).sort((a, b) => a.start.localeCompare(b.start)),
      handled: list.filter((m) => new Date(m.end).getTime() <= now && followups[m.id]).sort((a, b) => b.end.localeCompare(a.end)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, followups, withoutOutside, me])

  const row = (m: Meeting, kind: 'need' | 'upcoming' | 'handled') => {
    const out = outside(m)
    const f = followups[m.id]
    return (
      <div key={m.id} className="flex flex-wrap items-start gap-3 rounded-lg border bg-background px-3 py-2.5">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{m.subject}</span>
            {m.online && <Video className="size-3.5 shrink-0 text-muted-foreground" aria-label="Online meeting" />}
          </div>
          <div className="text-xs text-muted-foreground">{when(m)}{m.location && !m.online ? ` · ${m.location}` : ''}</div>
          <div className="flex flex-wrap gap-1">
            {(out.length ? out : m.attendees.filter((a) => a.type !== 'resource' && a.address !== me)).slice(0, 6).map((a) => {
              const l = leadFor(a.address)
              return <span key={a.address} title={a.address} className={cn('rounded-full px-2 py-0.5 text-[11px]', domainOf(a.address) !== myDomain ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-muted text-muted-foreground')}>{a.name || a.address}{l && ` · ${l.company || 'lead'}`}</span>
            })}
            {m.attendees.length > 6 && <span className="text-[11px] text-muted-foreground">+{m.attendees.length - 6}</span>}
          </div>
          {f && <div className="text-xs text-muted-foreground">{f.status === 'done' ? `Follow-up sent to ${f.sent ?? 0}` : 'Skipped'} · {new Date(f.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}
        </div>
        <div className="flex gap-1.5">
          {kind === 'need' && (
            <>
              <Button size="sm" onClick={() => setOpen(m)}><Mail /> Write follow-up</Button>
              <Button size="sm" variant="ghost" onClick={() => setFollowup(m.id, { status: 'skipped', at: new Date().toISOString() })}>Skip</Button>
            </>
          )}
          {kind === 'handled' && (
            <>
              <Button size="sm" variant="outline" onClick={() => setOpen(m)}><Mail /> Send again</Button>
              <Button size="sm" variant="ghost" onClick={() => setFollowup(m.id, null)}><Undo2 /> Undo</Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const section = (title: string, desc: string, items: Meeting[], kind: 'need' | 'upcoming' | 'handled') => (
    <Card title={`${title} (${items.length})`}>
      <p className="mb-3 text-xs text-muted-foreground">{desc}</p>
      <div className="space-y-2">
        {items.length === 0 ? <div className="rounded-lg border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">Nothing here.</div> : items.map((m) => row(m, kind))}
      </div>
    </Card>
  )

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="Meetings & follow-up" desc="See meetings from your Outlook calendar. When one has ended, send a follow-up email to the people who attended." />

        {!ms.account ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>Connect Microsoft first in <Link to="/mkt/settings" className="font-medium underline underline-offset-4">Microsoft & stages</Link>. To read your calendar you also need the <b>Calendars.Read</b> permission (see the setup guide there).</div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Look back</div>
                <NativeSelect className="w-40" value={days} onChange={setDays} options={[{ value: '3', label: 'Last 3 days' }, { value: '7', label: 'Last 7 days' }, { value: '14', label: 'Last 14 days' }, { value: '30', label: 'Last 30 days' }]} />
              </div>
              <Button disabled={busy} onClick={load}>{busy ? <Loader2 className="animate-spin" /> : meetings ? <RefreshCw /> : <CalendarCheck />} {meetings ? 'Refresh' : 'Load meetings'}</Button>
              <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground"><input type="checkbox" checked={withoutOutside} onChange={(e) => setWithoutOutside(e.target.checked)} /> Include internal-only meetings</label>
            </div>
            <p className="text-xs text-muted-foreground">Read-only. Calendar details stay in this page and are not saved; only “follow-up done/skipped” is remembered per meeting. The first time, Microsoft asks you to allow <code className="rounded bg-muted px-1">Calendars.Read</code>.</p>
            {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}

            {meetings && (
              <>
                {section('Needs follow-up', 'Meetings that have ended with people from outside your company, and no follow-up yet.', groups.need, 'need')}
                {section('Upcoming (next 7 days)', 'They move to “Needs follow-up” once they end. Press Refresh to update.', groups.upcoming, 'upcoming')}
                {section('Done or skipped', 'Meetings you already handled.', groups.handled, 'handled')}
              </>
            )}
          </>
        )}
      </div>
      <FollowUpDialog
        meeting={open}
        myAddress={me}
        onClose={() => setOpen(null)}
        onSent={(n) => open && setFollowup(open.id, { status: 'done', at: new Date().toISOString(), sent: n })}
      />
    </div>
  )
}
