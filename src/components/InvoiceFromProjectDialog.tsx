import { useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useStore } from '@/store'
import { money, nextInvoiceNumber, todayStr } from '@/lib/pm'
import { addDays } from '@/lib/billing'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Invoice } from '@/types'

interface Line { ref: string; group: string; description: string; qty: number; unitPrice: number; hint: string; billedIn?: string }

/** Build an invoice from what the project already knows: client, milestones, recurring fees, finished work. */
export function InvoiceFromProjectDialog({
  open, onOpenChange, projectId, onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: string
  onCreated: (id: string) => void
}) {
  const { projects, milestones, tasks, schedules, invoices, billingProfile, addInvoice } = useStore()
  const project = projects.find((p) => p.id === projectId)
  const [picked, setPicked] = useState<Record<string, Line>>({})
  const [rate, setRate] = useState(0)

  const doneIds = useMemo(() => new Set((project?.pmStages ?? []).filter((x) => x.type === 'won').map((x) => x.id)), [project])
  const billed = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of invoices.filter((x) => x.projectId === projectId)) for (const it of i.items) if (it.ref) m.set(it.ref, i.number)
    return m
  }, [invoices, projectId])

  const lines = useMemo<Line[]>(() => {
    if (!project) return []
    const ms = milestones.filter((m) => m.projectId === projectId).sort((a, b) => a.date.localeCompare(b.date))
    const share = project.info.budget && ms.length ? Math.round(project.info.budget / ms.length / 100_000) * 100_000 : 0
    const out: Line[] = []
    for (const m of ms) out.push({ ref: 'ms:' + m.id, group: 'Milestones', description: `Milestone: ${m.title}`, qty: 1, unitPrice: share, hint: `${m.status === 'done' ? 'Done' : 'Due'} ${fmtDate(m.date)}`, billedIn: billed.get('ms:' + m.id) })
    for (const s of schedules.filter((x) => x.kind === 'receivable' && x.projectId === projectId && x.active))
      out.push({ ref: 'sch:' + s.id, group: 'Recurring fees', description: s.title || 'Services', qty: 1, unitPrice: s.amount ?? 0, hint: s.frequency === 'once' ? 'One time' : 'Recurring fee' })
    for (const t of tasks.filter((x) => x.projectId === projectId && doneIds.has(x.stage) && x.estimateH))
      out.push({ ref: 'task:' + t.id, group: 'Finished work (hours)', description: `Task: ${t.title}`, qty: t.estimateH ?? 0, unitPrice: 0, hint: `${t.estimateH}h${t.assignee ? ' · ' + t.assignee : ''}`, billedIn: billed.get('task:' + t.id) })
    return out
  }, [project, milestones, tasks, schedules, doneIds, billed, projectId])

  useEffect(() => { if (open) { setPicked({}); setRate(0) } }, [open])

  if (!project) return null
  const groups = [...new Set(lines.map((l) => l.group))]
  const toggle = (l: Line) => setPicked((p) => { const n = { ...p }; if (n[l.ref]) delete n[l.ref]; else n[l.ref] = { ...l }; return n })
  const edit = (ref: string, patch: Partial<Line>) => setPicked((p) => (p[ref] ? { ...p, [ref]: { ...p[ref], ...patch } } : p))
  const price = (l: Line) => (l.group.startsWith('Finished') ? (picked[l.ref]?.unitPrice || rate) : picked[l.ref]?.unitPrice ?? l.unitPrice)
  const chosen = Object.values(picked).map((l) => ({ ...l, unitPrice: l.group.startsWith('Finished') ? l.unitPrice || rate : l.unitPrice }))
  const subtotal = chosen.reduce((a, l) => a + l.qty * l.unitPrice, 0)
  const incomplete = chosen.some((l) => l.unitPrice <= 0)

  const create = () => {
    const t = todayStr()
    const mine = invoices.filter((i) => i.projectId === projectId)
    const email = project.info.stakeholders.find((x) => x.contact.includes('@'))?.contact ?? mine.find((i) => i.clientEmail)?.clientEmail ?? ''
    const inv: Invoice = {
      id: 'inv-' + nanoid(6), projectId, number: nextInvoiceNumber(invoices, t), clientName: project.info.client, clientEmail: email,
      issueDate: t, dueDate: addDays(t, 14), status: 'draft', taxPct: 11, notes: billingProfile.paymentNote, sentAt: '',
      items: chosen.map((l) => ({ id: nanoid(5), description: l.description, qty: l.qty, unitPrice: l.unitPrice, ref: l.ref })),
    }
    addInvoice(inv)
    onOpenChange(false)
    onCreated(inv.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New invoice from “{project.name}”</DialogTitle>
          <DialogDescription>
            Client <b>{project.info.client || '(set in Project info)'}</b> is filled in automatically. Pick what to bill; amounts can be edited. Items already billed are marked so nothing is charged twice.
          </DialogDescription>
        </DialogHeader>

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            This project has no milestones, recurring fees or finished work with hours yet. Create a blank invoice instead, or add milestones in the PM timeline.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section key={g} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g}</h3>
                  {g.startsWith('Finished') && (
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">Rate per hour (Rp)
                      <Input type="number" min={0} className="h-7 w-32" value={rate || ''} onChange={(e) => setRate(Number(e.target.value) || 0)} />
                    </label>
                  )}
                </div>
                <div className="divide-y rounded-xl border">
                  {lines.filter((l) => l.group === g).map((l) => {
                    const on = !!picked[l.ref]
                    return (
                      <div key={l.ref} className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-sm', l.billedIn && !on && 'opacity-60')}>
                        <Checkbox checked={on} onCheckedChange={() => toggle(l)} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{l.description}</div>
                          <div className="text-xs text-muted-foreground">{l.hint}{l.billedIn && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">already billed in {l.billedIn}</span>}</div>
                        </div>
                        {on ? (
                          <div className="flex items-center gap-1.5">
                            {l.group.startsWith('Finished') && <Input type="number" min={0} className="h-7 w-16" value={picked[l.ref].qty} onChange={(e) => edit(l.ref, { qty: Number(e.target.value) || 0 })} />}
                            <Input type="number" min={0} className="h-7 w-36" placeholder="Unit price" value={price(l) || ''} onChange={(e) => edit(l.ref, { unitPrice: Number(e.target.value) || 0 })} />
                          </div>
                        ) : <span className="text-xs text-muted-foreground tabular-nums">{l.unitPrice ? money(l.qty * l.unitPrice) : ''}</span>}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">{chosen.length} selected · subtotal <b className="text-foreground">{money(subtotal)}</b>{incomplete && <span className="ml-2 text-amber-700">some lines have no price yet</span>}</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={chosen.length === 0} onClick={create}>Create draft invoice</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
