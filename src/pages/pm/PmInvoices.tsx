import { useState } from 'react'
import { Link } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { BadgeCheck, CheckCircle2, Loader2, Plus, Send, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { useCan, useCurrentUser, useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { sendMail } from '@/lib/microsoft'
import { INVOICE_STATUS, effectiveStatus, invoiceEmail, invoiceSubtotal, invoiceTax, invoiceTotal, money, outstanding, todayStr } from '@/lib/pm'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Invoice, InvoiceStatus } from '@/types'

const rp = (n: number) => 'Rp ' + n.toLocaleString('id-ID')
const addDays = (d: string, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }

function StatusBadge({ inv }: { inv: Invoice }) {
  const st = INVOICE_STATUS[effectiveStatus(inv)]
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', st.tone)}>{st.label}</span>
}

export default function PmInvoices() {
  const { project, info } = usePm()
  const { invoices, addInvoice, updateInvoice, deleteInvoice, msConfig } = useStore()
  const { user } = useCurrentUser()
  const canInvoice = useCan()('pm.invoice')
  const ms = useMicrosoft()
  const [openId, setOpenId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')

  const list = invoices.filter((i) => i.projectId === project.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
  const open = invoices.find((i) => i.id === openId)
  const billed = list.filter((i) => i.status !== 'draft').reduce((a, i) => a + invoiceTotal(i), 0)
  const paid = list.filter((i) => i.status === 'paid').reduce((a, i) => a + invoiceTotal(i), 0)
  const overdue = list.filter((i) => effectiveStatus(i) === 'overdue')

  const nextNumber = () => {
    const year = new Date().getFullYear()
    const max = invoices.reduce((m, i) => Math.max(m, Number(i.number.match(/(\d+)$/)?.[1] ?? 0)), 0)
    return `INV-${year}-${String(max + 1).padStart(3, '0')}`
  }
  const create = () => {
    const t = todayStr()
    const id = 'inv-' + nanoid(6)
    addInvoice({
      id, projectId: project.id, number: nextNumber(), clientName: info.client, clientEmail: info.stakeholders.find((x) => x.contact.includes('@'))?.contact ?? '',
      issueDate: t, dueDate: addDays(t, 14), items: [{ id: nanoid(5), description: '', qty: 1, unitPrice: 0 }], taxPct: 11, status: 'draft', notes: '', sentAt: '',
    })
    setSendErr(''); setOpenId(id)
  }
  const upd = (id: string, p: Partial<Invoice>) => updateInvoice(id, p)

  const send = async (inv: Invoice) => {
    setSendErr(''); setSending(true)
    try {
      const { subject, body } = invoiceEmail(inv, project.name, user.name)
      await sendMail(msConfig, inv.clientEmail.trim(), subject, body)
      updateInvoice(inv.id, { sentAt: new Date().toISOString(), status: inv.status === 'draft' ? 'sent' : inv.status })
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e)) // status stays as it was: only a successful send marks it sent
    } finally { setSending(false) }
  }

  const blocked = !ms.configured ? 'config' : !ms.account ? 'signin' : null
  const sendable = (i: Invoice) => canInvoice && i.status !== 'paid'
  const badItems = open ? invoiceTotal(open) <= 0 || open.items.some((x) => !x.description.trim()) : false

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader
          title={`Invoices — ${project.name}`}
          desc={`Bill ${info.client || 'the client'} and email the invoice from your Microsoft account.`}
          actions={canInvoice && <Button onClick={create}><Plus /> New invoice</Button>}
        />
        {!canInvoice && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can view invoices but not create or send them.</div>}

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><div className="text-xs text-muted-foreground">Billed</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(billed)}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Paid</div><div className="mt-1 text-xl font-semibold text-emerald-600 tabular-nums">{money(paid)}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Outstanding</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(outstanding(list))}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Overdue</div><div className={cn('mt-1 text-xl font-semibold tabular-nums', overdue.length && 'text-red-600')}>{overdue.length}</div></Card>
        </div>

        {list.length === 0 ? <Empty>No invoices for this project yet.</Empty> : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th><th className="w-10" /></tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => { setSendErr(''); setOpenId(i.id) }}>
                    <td className="px-3 py-2.5 font-medium">{i.number}{i.sentAt && <div className="text-[11px] font-normal text-muted-foreground">emailed {new Date(i.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>}</td>
                    <td className="px-3 py-2.5">{i.clientName || '—'}<div className="text-xs text-muted-foreground">{i.clientEmail}</div></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(i.issueDate)}</td>
                    <td className={cn('px-3 py-2.5', effectiveStatus(i) === 'overdue' ? 'font-medium text-red-600' : 'text-muted-foreground')}>{fmtDate(i.dueDate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rp(invoiceTotal(i))}</td>
                    <td className="px-3 py-2.5"><StatusBadge inv={i} /></td>
                    <td className="px-1" onClick={(e) => e.stopPropagation()}>{canInvoice && i.status === 'sent' && <Button variant="ghost" size="icon-xs" title="Mark as paid" onClick={() => upd(i.id, { status: 'paid' })}><BadgeCheck /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">{open.number} <StatusBadge inv={open} /></SheetTitle>
                <SheetDescription>{project.name}{open.sentAt && ` · emailed ${new Date(open.sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Invoice number</Label><Input disabled={!canInvoice} value={open.number} onChange={(e) => upd(open.id, { number: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Status</Label><NativeSelect disabled={!canInvoice} className="w-full" value={open.status === 'overdue' ? 'sent' : open.status} onChange={(v) => upd(open.id, { status: v as InvoiceStatus })} options={[{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'paid', label: 'Paid' }]} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Client name</Label><Input disabled={!canInvoice} value={open.clientName} onChange={(e) => upd(open.id, { clientName: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Client email</Label><Input disabled={!canInvoice} type="email" value={open.clientEmail} onChange={(e) => upd(open.id, { clientEmail: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Issue date</Label><Input disabled={!canInvoice} type="date" value={open.issueDate} onChange={(e) => upd(open.id, { issueDate: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Due date</Label><Input disabled={!canInvoice} type="date" value={open.dueDate} onChange={(e) => upd(open.id, { dueDate: e.target.value })} /></div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Line items</Label>
                  {open.items.map((it) => {
                    const setIt = (p: Partial<typeof it>) => upd(open.id, { items: open.items.map((x) => (x.id === it.id ? { ...x, ...p } : x)) })
                    return (
                      <div key={it.id} className="grid grid-cols-[1fr_4rem_8rem_2rem] items-center gap-2">
                        <Input disabled={!canInvoice} placeholder="Description" value={it.description} onChange={(e) => setIt({ description: e.target.value })} />
                        <Input disabled={!canInvoice} type="number" min={1} value={it.qty} onChange={(e) => setIt({ qty: Number(e.target.value) || 0 })} />
                        <Input disabled={!canInvoice} type="number" min={0} placeholder="Unit price" value={it.unitPrice || ''} onChange={(e) => setIt({ unitPrice: Number(e.target.value) || 0 })} />
                        {canInvoice && <Button variant="ghost" size="icon-xs" disabled={open.items.length <= 1} onClick={() => upd(open.id, { items: open.items.filter((x) => x.id !== it.id) })}><Trash2 className="text-destructive" /></Button>}
                      </div>
                    )
                  })}
                  {canInvoice && <Button variant="outline" size="xs" onClick={() => upd(open.id, { items: [...open.items, { id: nanoid(5), description: '', qty: 1, unitPrice: 0 }] })}><Plus /> Add item</Button>}
                </div>

                <div className="ml-auto w-64 space-y-1 text-sm tabular-nums">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>{rp(invoiceSubtotal(open))}</div>
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-muted-foreground">Tax <Input disabled={!canInvoice} className="h-6 w-14 px-1.5 text-xs" type="number" min={0} value={open.taxPct} onChange={(e) => upd(open.id, { taxPct: Number(e.target.value) || 0 })} /> %</span>{rp(invoiceTax(open))}</div>
                  <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span>{rp(invoiceTotal(open))}</div>
                </div>

                <div className="space-y-1"><Label className="text-xs text-muted-foreground">Notes (shown in the email)</Label><Textarea disabled={!canInvoice} rows={3} placeholder="Payment instructions, bank account…" value={open.notes} onChange={(e) => upd(open.id, { notes: e.target.value })} /></div>

                {sendable(open) && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    {blocked && (
                      <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <div>{blocked === 'config' ? 'Microsoft is not set up yet.' : 'Connect your Microsoft account to send.'}{' '}
                          {blocked === 'signin' ? <Button size="xs" onClick={ms.connect} disabled={ms.busy}>Connect Microsoft</Button> : <Link to="/pm/settings" className="font-medium underline">Open Microsoft settings</Link>}
                          {ms.error && <div className="mt-1 text-xs">{ms.error}</div>}
                        </div>
                      </div>
                    )}
                    {sendErr && <div className="flex items-start gap-2 rounded bg-red-50 px-2 py-1.5 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"><TriangleAlert className="mt-0.5 size-4 shrink-0" /> Not sent: {sendErr}</div>}
                    {open.sentAt && !sendErr && <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Last emailed to {open.clientEmail}</div>}
                    <Button disabled={!!blocked || sending || !open.clientEmail.includes('@') || badItems} onClick={() => send(open)}>
                      {sending ? <Loader2 className="animate-spin" /> : <Send />} {open.sentAt ? 'Send again' : 'Send invoice'}
                    </Button>
                    {!blocked && !open.clientEmail.includes('@') && <div className="text-xs text-muted-foreground">Add the client’s email to send.</div>}
                    {!blocked && open.clientEmail.includes('@') && badItems && <div className="text-xs text-muted-foreground">Every item needs a description and the total must be above zero.</div>}
                  </div>
                )}
                {canInvoice && <Button variant="outline" onClick={() => { if (confirm(`Delete invoice ${open.number}?`)) { deleteInvoice(open.id); setOpenId(null) } }}><Trash2 className="text-destructive" /> Delete invoice</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
