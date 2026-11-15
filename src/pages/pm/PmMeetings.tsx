import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { CalendarCheck, CalendarPlus, ExternalLink, FileText, Loader2, NotebookPen, Pencil, Plus, Trash2, TriangleAlert, Users, Video, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, Field, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { useCurrentUser } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { localToday } from '@/lib/billing'
import { cancelMeeting, createMeeting, friendlyMsError, listMeetings, type Meeting } from '@/lib/microsoft'
import { meetingFromOutlook, meetingNumbers, needsNotes, toUtcIso } from '@/lib/meetings'
import { validEmail } from '@/lib/auth'
import { safeUrl } from '@/lib/files'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { ProjectMeeting } from '@/types'

type Mode = 'log' | 'schedule' | 'edit'
const STATUS = { planned: { label: 'Planned', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' }, held: { label: 'Held', tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' }, cancelled: { label: 'Cancelled', tone: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300' } } as const
const times = (m: ProjectMeeting) => [m.startTime, m.endTime].filter(Boolean).join('–')
const people = (text: string) => text.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)

export default function PmMeetings() {
  const { s, project, info, members, canEdit } = usePm()
  const { user } = useCurrentUser()
  const ms = useMicrosoft()
  const today = localToday()
  const [editing, setEditing] = useState<{ m: ProjectMeeting; mode: Mode; isNew: boolean } | null>(null)
  const [attendeeText, setAttendeeText] = useState('')
  const [online, setOnline] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attach, setAttach] = useState<{ list: Meeting[] | null; busy: boolean; error: string } | null>(null)

  const all = useMemo(() => s.projectMeetings.filter((m) => m.projectId === project.id), [s.projectMeetings, project.id])
  const nums = useMemo(() => meetingNumbers(all), [all])
  const list = [...all].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
  const held = all.filter((m) => m.status === 'held')
  const ahead = all.filter((m) => m.status === 'planned' && m.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const everyone = new Set(all.filter((m) => m.status !== 'cancelled').flatMap((m) => m.attendees.map((a) => a.toLowerCase())))
  const lastHeld = held.reduce((d, m) => (m.date > d ? m.date : d), '')
  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null

  const blank = (mode: Mode): ProjectMeeting => ({
    id: 'mt-' + nanoid(6), projectId: project.id, title: '', date: today, startTime: mode === 'schedule' ? '10:00' : '', endTime: mode === 'schedule' ? '11:00' : '',
    attendees: [], summary: '', decisions: '', location: '', joinUrl: '', outlookId: '', status: mode === 'schedule' ? 'planned' : 'held', createdBy: user.name, createdAt: new Date().toISOString(),
  })
  const open = (m: ProjectMeeting, mode: Mode, isNew: boolean) => { setEditing({ m, mode, isNew }); setAttendeeText(m.attendees.join(', ')); setOnline(true); setError('') }

  const upd = (p: Partial<ProjectMeeting>) => setEditing((e) => (e ? { ...e, m: { ...e.m, ...p } } : e))
  const suggestions = [
    ...members.map((x) => ({ name: x.name, email: x.email })),
    ...info.stakeholders.map((x) => ({ name: x.name, email: x.contact.includes('@') ? x.contact : '' })),
  ].filter((x) => x.name && !people(attendeeText).some((p) => p.toLowerCase() === (x.email || x.name).toLowerCase() || p.toLowerCase() === x.name.toLowerCase()))
  const addPerson = (x: { name: string; email: string }) => setAttendeeText((t) => [...people(t), editing?.mode === 'schedule' ? x.email || x.name : x.name].join(', '))

  const save = async () => {
    if (!editing) return
    let m = { ...editing.m, title: editing.m.title.trim(), attendees: people(attendeeText) }
    setError('')
    if (editing.mode === 'schedule') {
      const bad = m.attendees.filter((a) => !validEmail(a))
      if (bad.length) { setError(`Outlook needs an email address for each invitee. Fix: ${bad.join(', ')}`); return }
      if (m.endTime <= m.startTime) { setError('The end time must be after the start time.'); return }
      setSaving(true)
      try {
        const r = await createMeeting(s.msConfig, { subject: m.title, startIso: toUtcIso(m.date, m.startTime), endIso: toUtcIso(m.date, m.endTime), attendees: m.attendees, body: m.summary, location: m.location, online })
        m = { ...m, outlookId: r.id, joinUrl: r.joinUrl || m.joinUrl, status: 'planned' }
      } catch (e) { setError(friendlyMsError(e instanceof Error ? e.message : String(e))); setSaving(false); return }
      setSaving(false)
    }
    if (editing.isNew) s.addProjectMeeting(m); else s.updateProjectMeeting(m.id, m)
    setEditing(null)
  }

  const cancel = async (m: ProjectMeeting) => {
    if (!confirm(`Cancel “${m.title}”?${m.outlookId ? ' The invitees get a cancellation from Outlook.' : ''}`)) return
    s.updateProjectMeeting(m.id, { status: 'cancelled' })
    if (m.outlookId && ms.account) {
      try { await cancelMeeting(s.msConfig, m.outlookId) } catch (e) { alert('Marked as cancelled here, but Outlook could not cancel it: ' + friendlyMsError(e instanceof Error ? e.message : String(e))) }
    }
  }

  const loadCalendar = async () => {
    setAttach({ list: null, busy: true, error: '' })
    try {
      const from = new Date(Date.now() - 45 * 864e5).toISOString(), to = new Date(Date.now() + 30 * 864e5).toISOString()
      const used = new Set(s.projectMeetings.filter((m) => m.projectId === project.id).map((m) => m.outlookId).filter(Boolean))
      const found = (await listMeetings(s.msConfig, from, to)).filter((m) => !m.cancelled && !used.has(m.id)).sort((a, b) => b.start.localeCompare(a.start))
      setAttach({ list: found, busy: false, error: '' })
    } catch (e) { setAttach({ list: null, busy: false, error: friendlyMsError(e instanceof Error ? e.message : String(e)) }) }
  }

  const sched = editing?.mode === 'schedule'
  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader
          title={`Meetings — ${project.name}`}
          desc="Every meeting about this project: how many there were, when, who joined and what was decided. Anyone opening the project can catch up here."
          actions={canEdit && <>
            <Button variant="outline" disabled={!!blocked} onClick={() => void loadCalendar()}><CalendarCheck /> Attach from calendar</Button>
            <Button variant="outline" onClick={() => open(blank('log'), 'log', true)}><NotebookPen /> Log a meeting</Button>
            <Button disabled={!!blocked} onClick={() => open(blank('schedule'), 'schedule', true)}><CalendarPlus /> Schedule in Outlook</Button>
          </>}
        />
        {canEdit && blocked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>{blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect your Microsoft account to schedule meetings and attach them from your calendar.'}{' '}
              {blocked === 'signin' ? <Button size="xs" onClick={ms.connect} disabled={ms.busy}>Connect Microsoft</Button> : <Link to="/pm/settings" className="font-medium underline">Open Microsoft settings</Link>}
              <span className="block text-xs">You can still log meetings by hand.</span></div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><div className="text-xs text-muted-foreground">Meetings held</div><div className="mt-1 text-xl font-semibold tabular-nums">{held.length}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Last meeting</div><div className="mt-1 text-xl font-semibold">{lastHeld ? fmtDate(lastHeld) : '—'}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Next planned</div><div className="mt-1 text-xl font-semibold">{ahead[0] ? fmtDate(ahead[0].date) : '—'}</div></Card>
          <Card><div className="text-xs text-muted-foreground">People involved</div><div className="mt-1 text-xl font-semibold tabular-nums">{everyone.size}</div></Card>
        </div>

        {list.length === 0 ? <Empty>No meetings yet. Log the first one, or schedule it in Outlook and it is recorded here for you.</Empty> : (
          <ol className="space-y-3">
            {list.map((m) => {
              const link = safeUrl(m.joinUrl)
              const notes = needsNotes(m, today)
              return (
                <li key={m.id} className={cn('rounded-xl border bg-card p-4', m.status === 'cancelled' && 'opacity-60')}>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {nums[m.id] && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">Meeting #{nums[m.id]}</span>}
                        <span className="font-medium">{m.title || 'Untitled meeting'}</span>
                        <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-medium', STATUS[m.status].tone)}>{STATUS[m.status].label}</span>
                        {m.outlookId && <span title="Linked to an Outlook calendar event" className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">Outlook</span>}
                        {notes && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Needs notes</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{fmtDate(m.date)}{times(m) && ` · ${times(m)}`}{m.location && ` · ${m.location}`}</div>
                      {m.attendees.length > 0 && <div className="flex flex-wrap items-center gap-1 pt-0.5"><Users className="size-3.5 text-muted-foreground" />{m.attendees.map((a) => <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{a}</span>)}</div>}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted"><Video className="size-4" /> Join</a>}
                        <Button size="icon-sm" variant="ghost" title="Edit" onClick={() => open(m, 'edit', false)}><Pencil /></Button>
                        {m.status === 'planned' && <Button size="icon-sm" variant="ghost" title="Cancel this meeting" onClick={() => void cancel(m)}><XCircle /></Button>}
                        <Button size="icon-sm" variant="ghost" title="Delete" onClick={() => confirm(`Delete “${m.title}” from the project history?`) && s.deleteProjectMeeting(m.id)}><Trash2 className="text-destructive" /></Button>
                      </div>
                    )}
                    {!canEdit && link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline"><ExternalLink className="size-3" /> Join</a>}
                  </div>
                  {(m.summary || m.decisions) && (
                    <div className="mt-3 grid gap-3 border-t pt-3 text-sm sm:grid-cols-2">
                      {m.summary && <div><div className="mb-0.5 flex items-center gap-1 text-xs font-medium text-muted-foreground"><FileText className="size-3" /> Discussed</div><p className="whitespace-pre-line">{m.summary}</p></div>}
                      {m.decisions && <div><div className="mb-0.5 text-xs font-medium text-muted-foreground">Decisions & next steps</div><p className="whitespace-pre-line">{m.decisions}</p></div>}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle>{sched ? 'Schedule a meeting' : editing.isNew ? 'Log a meeting' : 'Edit meeting'}</SheetTitle>
                <SheetDescription>{sched ? 'Creates the event in your Outlook calendar, emails the invitations, and records it in this project.' : 'Write down what happened so the next person can catch up quickly.'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-4 pb-6">
                <Field label="Title"><Input value={editing.m.title} placeholder="e.g. Weekly check-in" onChange={(e) => upd({ title: e.target.value })} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Date"><Input type="date" value={editing.m.date} onChange={(e) => upd({ date: e.target.value })} /></Field>
                  <Field label="From"><Input type="time" value={editing.m.startTime} onChange={(e) => upd({ startTime: e.target.value })} /></Field>
                  <Field label="Until"><Input type="time" value={editing.m.endTime} onChange={(e) => upd({ endTime: e.target.value })} /></Field>
                </div>
                <Field label={sched ? 'Invitees (email addresses, comma separated)' : 'Who attended (names or emails, comma separated)'}>
                  <Textarea rows={2} value={attendeeText} placeholder={sched ? 'budi@client.com, sari@company.com' : 'Budi (Client), Sari'} onChange={(e) => setAttendeeText(e.target.value)} />
                  {suggestions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {suggestions.slice(0, 10).map((x) => <button key={x.name + x.email} type="button" className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted" title={sched && !x.email ? 'No email on file for this person' : undefined} onClick={() => addPerson(x)}>+ {x.name}</button>)}
                    </div>
                  )}
                </Field>
                <Field label="Location"><Input value={editing.m.location} placeholder="Meeting room, client office…" onChange={(e) => upd({ location: e.target.value })} /></Field>
                {sched && <label className="flex items-center gap-2.5 text-sm"><Switch checked={online} onCheckedChange={setOnline} /> Add a Teams meeting link</label>}
                {!sched && <Field label="Meeting link (optional)"><Input value={editing.m.joinUrl} placeholder="https://teams.microsoft.com/…" onChange={(e) => upd({ joinUrl: e.target.value })} /></Field>}
                <Field label={sched ? 'Agenda / message in the invitation' : 'What was discussed'}><Textarea rows={4} value={editing.m.summary} placeholder={sched ? 'What this meeting is for' : 'Short summary of the discussion'} onChange={(e) => upd({ summary: e.target.value })} /></Field>
                {!sched && <Field label="Decisions & next steps"><Textarea rows={3} value={editing.m.decisions} placeholder="Who does what by when" onChange={(e) => upd({ decisions: e.target.value })} /></Field>}
                {!editing.isNew && <Field label="Status"><NativeSelect className="w-full" value={editing.m.status} onChange={(v) => upd({ status: v as ProjectMeeting['status'] })} options={[{ value: 'planned', label: 'Planned' }, { value: 'held', label: 'Held' }, { value: 'cancelled', label: 'Cancelled' }]} /></Field>}
                {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{error}</div>}
                <div className="flex gap-2">
                  <Button disabled={saving || !editing.m.title.trim() || !editing.m.date || (sched && !editing.m.startTime)} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : sched ? <CalendarPlus /> : <Plus />} {sched ? 'Schedule & send invites' : editing.isNew ? 'Add to project' : 'Save'}</Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!attach} onOpenChange={(o) => !o && setAttach(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Attach from your calendar</DialogTitle><DialogDescription>Outlook events from the last 45 days and next 30 days. Pick one to add it to “{project.name}”, then write the notes.</DialogDescription></DialogHeader>
          {attach?.busy && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading your calendar…</div>}
          {attach?.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{attach.error}</div>}
          {attach?.list && (
            <div className="max-h-96 space-y-1.5 overflow-y-auto">
              {attach.list.length === 0 && <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No other events found.</div>}
              {attach.list.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.subject}</div>
                    <div className="text-xs text-muted-foreground">{new Date(m.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date(m.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {m.attendees.length} invited</div>
                  </div>
                  <Button size="xs" onClick={() => { setAttach(null); open(meetingFromOutlook(m, project.id, user.name), 'edit', true) }}>Attach</Button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Outlook details are read once to fill the form. Only what you save here is kept.</p>
        </DialogContent>
      </Dialog>
    </div>
  )
}
