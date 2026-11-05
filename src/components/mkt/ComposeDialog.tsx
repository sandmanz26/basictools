import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { CheckCircle2, Loader2, Send, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { useCurrentUser, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { MERGE_FIELDS, merge, sendMail } from '@/lib/microsoft'
import { stageDot } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { Link } from 'react-router-dom'

const GAP_MS = 2200 // Graph allows ~30 messages/minute per mailbox
const MAX_BATCH = 50

type Result = { ok: boolean; error?: string }

/** Compose and send one email (merge fields filled per lead) to one or many leads through the connected Microsoft account. */
export function ComposeDialog({ open, onClose, leadIds }: { open: boolean; onClose: () => void; leadIds: string[] }) {
  const { leads, templates, mktStages, msConfig, logEmail } = useStore()
  const { user } = useCurrentUser()
  const ms = useMicrosoft()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [tplId, setTplId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<Record<string, Result>>({})
  const stop = useRef(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setPicked(new Set(leadIds)); setResults({}); setTplId(''); setSubject(''); setBody(''); stop.current = false
  }, [open, leadIds])

  const sendable = (l: (typeof leads)[number]) => !!l.email && !l.unsubscribed
  const choices = useMemo(() => (leadIds.length ? leads.filter((l) => leadIds.includes(l.id)) : leads), [leads, leadIds])
  const chosen = leads.filter((l) => picked.has(l.id) && sendable(l))
  const first = chosen[0] ?? choices[0]
  const done = Object.keys(results).length
  const okCount = Object.values(results).filter((r) => r.ok).length

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
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const send = async () => {
    setSending(true); stop.current = false; setResults({})
    for (let i = 0; i < chosen.length; i++) {
      if (stop.current) break
      const l = chosen[i]
      const subj = merge(subject, l), text = merge(body, l)
      let r: Result
      try { await sendMail(msConfig, l.email, subj, text); r = { ok: true } } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : String(e) } }
      logEmail({ id: 'em-' + nanoid(6), leadId: l.id, to: l.email, subject: subj, body: text, sentAt: new Date().toISOString(), sentBy: user.name, status: r.ok ? 'sent' : 'failed', error: r.error ?? '' })
      setResults((p) => ({ ...p, [l.id]: r }))
      if (i < chosen.length - 1 && !stop.current) await new Promise((res) => setTimeout(res, GAP_MS))
    }
    setSending(false)
  }

  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null
  const tooMany = chosen.length > MAX_BATCH
  const canSend = !blocked && !sending && chosen.length > 0 && !tooMany && subject.trim() && body.trim()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !sending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>Sent from your Microsoft account{ms.account ? ` (${ms.account.username})` : ''} and saved in its Sent Items. Each lead gets their own copy.</DialogDescription>
        </DialogHeader>

        {blocked && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              {blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect your Microsoft account to send.'}{' '}
              {blocked === 'signin' ? <Button size="xs" onClick={ms.connect} disabled={ms.busy}>Connect Microsoft</Button> : <Link to="/mkt/settings" onClick={onClose} className="font-medium underline">Open Microsoft settings</Link>}
              {ms.error && <div className="mt-1 text-xs">{ms.error}</div>}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Recipients ({chosen.length})</div>
            <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border p-1">
              {choices.map((l) => {
                const ok = sendable(l)
                const r = results[l.id]
                return (
                  <label key={l.id} className={cn('flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted', !ok && 'opacity-50')}>
                    <input type="checkbox" disabled={!ok || sending} checked={picked.has(l.id) && ok} onChange={() => toggle(l.id)} />
                    <span className={cn('size-2 shrink-0 rounded-full', stageDot(mktStages.find((s) => s.id === l.stage)))} />
                    <span className="min-w-0 flex-1 truncate">{l.name}<span className="block truncate text-[11px] text-muted-foreground">{!l.email ? 'No email' : l.unsubscribed ? 'Unsubscribed' : l.company}</span></span>
                    {r && (r.ok ? <CheckCircle2 className="size-4 text-emerald-600" /> : <span title={r.error}><TriangleAlert className="size-4 text-red-600" /></span>)}
                  </label>
                )
              })}
              {choices.length === 0 && <div className="p-3 text-xs text-muted-foreground">No leads.</div>}
            </div>
            {leadIds.length === 0 && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="xs" disabled={sending} onClick={() => setPicked(new Set(leads.filter(sendable).map((l) => l.id)))}>All</Button>
                <Button variant="outline" size="xs" disabled={sending} onClick={() => setPicked(new Set())}>None</Button>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <NativeSelect className="w-full" value={tplId} onChange={applyTpl} options={[{ value: '', label: 'Start from a template…' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
            <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sending} />
            <Textarea ref={bodyRef} rows={9} placeholder="Write your message…" value={body} onChange={(e) => setBody(e.target.value)} disabled={sending} />
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Insert:
              {MERGE_FIELDS.map((f) => <button key={f} type="button" onClick={() => insert(f)} className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-muted/70">{`{{${f}}}`}</button>)}
            </div>
            {first && (subject || body) && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Preview for {first.name}</div>
                <div className="font-medium">{merge(subject, first)}</div>
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{merge(body, first)}</div>
              </div>
            )}
          </div>
        </div>

        {tooMany && <div className="text-sm text-red-600">Send at most {MAX_BATCH} at a time to stay within Microsoft’s rate limits.</div>}
        {done > 0 && <div className="text-sm">{okCount} sent{done - okCount > 0 && <span className="text-red-600">, {done - okCount} failed (hover the red icon)</span>}{sending && ` · ${done}/${chosen.length}`}</div>}

        <DialogFooter>
          {sending ? <Button variant="outline" onClick={() => { stop.current = true }}>Stop after current</Button> : <Button variant="outline" onClick={onClose}>{done ? 'Close' : 'Cancel'}</Button>}
          <Button disabled={!canSend} onClick={send}>{sending ? <Loader2 className="animate-spin" /> : <Send />} Send to {chosen.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
