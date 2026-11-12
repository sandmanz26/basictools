import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { CheckCircle2, Loader2, Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { useCurrentUser, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { fill, sendMail, type Meeting, type MeetingPerson } from '@/lib/microsoft'
import { cn } from '@/lib/utils'

const GAP_MS = 2200 // Graph allows ~30 messages/minute per mailbox
const FIELDS = ['name', 'firstName', 'company', 'meeting', 'date', 'owner']

export const DEFAULT_SUBJECT = 'Follow-up: {{meeting}}'
export const DEFAULT_BODY = `Hi {{firstName}},

Thank you for your time on {{date}}. It was great talking about {{meeting}}.

Quick recap and next steps:
-
-

Please let me know if I missed anything or if you have questions.

Best regards,
{{owner}}`

type Result = { ok: boolean; error?: string }

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
const domainOf = (a: string) => a.split('@')[1] ?? ''
const nameOf = (p: MeetingPerson) => p.name && !p.name.includes('@') ? p.name : (p.address.split('@')[0] ?? '').replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
const niceDomain = (a: string) => { const d = domainOf(a).split('.')[0] ?? ''; return d ? d[0].toUpperCase() + d.slice(1) : '' }

/** Write and send a follow-up email to the people who attended a meeting. One separate copy per person. */
export function FollowUpDialog({ meeting, myAddress, onClose, onSent }: { meeting: Meeting | null; myAddress: string; onClose: () => void; onSent: (sent: number) => void }) {
  const { leads, templates, msConfig, logEmail, updateLead } = useStore()
  const { user } = useCurrentUser()
  const ms = useMicrosoft()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [tplId, setTplId] = useState('')
  const [subject, setSubject] = useState(DEFAULT_SUBJECT)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<Record<string, Result>>({})
  const stop = useRef(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const me = myAddress.toLowerCase()
  const myDomain = domainOf(me)
  const people = useMemo(
    () => (meeting?.attendees ?? []).filter((a) => a.type !== 'resource' && a.address !== me),
    [meeting, me],
  )
  const external = (p: MeetingPerson) => domainOf(p.address) !== myDomain
  const leadFor = (addr: string) => leads.find((l) => l.email.trim().toLowerCase() === addr)

  useEffect(() => {
    if (!meeting) return
    setPicked(new Set(people.filter(external).map((p) => p.address)))
    setResults({}); setTplId(''); setSubject(DEFAULT_SUBJECT); setBody(DEFAULT_BODY); stop.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting?.id])

  if (!meeting) return null

  const varsFor = (p: MeetingPerson): Record<string, string> => {
    const l = leadFor(p.address)
    const name = l?.name || nameOf(p)
    return { name, firstName: name.split(/\s+/)[0] ?? name, company: l?.company || niceDomain(p.address), meeting: meeting.subject, date: fmtDate(meeting.start), owner: user.name }
  }
  const chosen = people.filter((p) => picked.has(p.address))
  const first = chosen[0] ?? people[0]
  const done = Object.keys(results).length
  const okCount = Object.values(results).filter((r) => r.ok).length
  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null
  const canSend = !blocked && !sending && chosen.length > 0 && subject.trim() && body.trim()

  const toggle = (a: string) => setPicked((s) => { const n = new Set(s); n.has(a) ? n.delete(a) : n.add(a); return n })
  const applyTpl = (id: string) => {
    setTplId(id)
    const t = templates.find((x) => x.id === id)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }
  const insert = (f: string) => {
    const el = bodyRef.current
    const tag = `{{${f}}}`
    if (!el) return setBody((b) => b + tag)
    const a = el.selectionStart, z = el.selectionEnd
    setBody(body.slice(0, a) + tag + body.slice(z))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length) })
  }

  const send = async () => {
    setSending(true); stop.current = false; setResults({})
    let sent = 0
    for (let i = 0; i < chosen.length; i++) {
      if (stop.current) break
      const p = chosen[i]
      const v = varsFor(p)
      const subj = fill(subject, v), text = fill(body, v)
      let r: Result
      try { await sendMail(msConfig, p.address, subj, text); r = { ok: true }; sent++ } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : String(e) } }
      const lead = leadFor(p.address)
      logEmail({ id: 'em-' + nanoid(6), leadId: lead?.id ?? '', to: p.address, subject: subj, body: text, sentAt: new Date().toISOString(), sentBy: user.name, status: r.ok ? 'sent' : 'failed', error: r.error ?? '' })
      if (r.ok && lead) updateLead(lead.id, { lastContactAt: new Date().toISOString().slice(0, 10) })
      setResults((prev) => ({ ...prev, [p.address]: r }))
      if (i < chosen.length - 1 && !stop.current) await new Promise((res) => setTimeout(res, GAP_MS))
    }
    setSending(false)
    if (sent > 0) onSent(sent)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Follow-up: {meeting.subject}</DialogTitle>
          <DialogDescription>{new Date(meeting.start).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · sent from {ms.account?.username ?? 'your Microsoft account'}, each person gets their own copy.</DialogDescription>
        </DialogHeader>

        {blocked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>{blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect your Microsoft account to send.'} <Link to="/mkt/settings" onClick={onClose} className="font-medium underline">Open Microsoft settings</Link></div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Send to ({chosen.length})</div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-1">
              {people.map((p) => {
                const r = results[p.address]
                const lead = leadFor(p.address)
                return (
                  <label key={p.address} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" disabled={sending} checked={picked.has(p.address)} onChange={() => toggle(p.address)} />
                    <span className="min-w-0 flex-1 truncate">{nameOf(p)}
                      <span className="block truncate text-[11px] text-muted-foreground">{p.address}</span>
                      <span className={cn('text-[10px] font-medium', external(p) ? 'text-blue-600' : 'text-muted-foreground')}>{external(p) ? 'Outside' : 'Internal'}{lead && ` · lead: ${lead.company || lead.name}`}</span>
                    </span>
                    {r && (r.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <span title={r.error}><TriangleAlert className="size-4 text-red-600" /></span>)}
                  </label>
                )
              })}
              {people.length === 0 && <div className="p-3 text-xs text-muted-foreground">No other attendees on this meeting.</div>}
            </div>
            <p className="text-[11px] text-muted-foreground">Outside people are ticked by default. Colleagues are not.</p>
          </div>

          <div className="space-y-3">
            <NativeSelect className="w-full" value={tplId} onChange={applyTpl} options={[{ value: '', label: 'Built-in follow-up (or pick a template)…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sending} />
            <Textarea ref={bodyRef} rows={11} value={body} onChange={(e) => setBody(e.target.value)} disabled={sending} />
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Insert:
              {FIELDS.map((f) => <button key={f} type="button" onClick={() => insert(f)} className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70">{`{{${f}}}`}</button>)}
            </div>
            {first && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview for {nameOf(first)}</div>
                <div className="font-medium">{fill(subject, varsFor(first))}</div>
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{fill(body, varsFor(first))}</div>
              </div>
            )}
          </div>
        </div>

        {done > 0 && <div className="text-sm">{okCount} sent{done - okCount > 0 && <span className="text-red-600">, {done - okCount} failed (hover the red icon)</span>}{sending && ` · ${done}/${chosen.length}`}</div>}

        <DialogFooter>
          {sending ? <Button variant="outline" onClick={() => { stop.current = true }}>Stop after current</Button> : <Button variant="outline" onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>}
          <Button disabled={!canSend} onClick={() => { if (confirm(`Send this follow-up to ${chosen.length} ${chosen.length === 1 ? 'person' : 'people'}?`)) void send() }}>{sending ? <Loader2 className="animate-spin" /> : <Send />} Send to {chosen.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
