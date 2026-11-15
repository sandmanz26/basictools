import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { BadgeCheck, BellRing, CalendarClock, CheckCircle2, Download, FileDown, Loader2, Plus, Repeat, Send, Trash2, TriangleAlert, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumberInput } from '@/components/NumberInput'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { useCan, useCurrentUser, useStore } from '@/store'
import { InvoiceFromProjectDialog } from '@/components/InvoiceFromProjectDialog'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { downloadInvoicePdf, buildInvoicePdf } from '@/lib/invoicePdf'
import { addDays, eventKey, localToday, nextOccurrence, repeatLabel, daysBetween } from '@/lib/billing'
import { sendMail } from '@/lib/microsoft'
import { INVOICE_STATUS, balanceDue, billedTotals, effectiveStatus, invoiceEmail, invoiceSubtotal, invoiceTax, invoiceTotal, isPartlyPaid, lastPaymentDate, nextInvoiceNumber, outstanding, paidTotals, receivedTotal, todayStr, withheldTotal } from '@/lib/pm'
import { curOf, currencyOptions, decimalsOf, fmtMoney, fmtTotals } from '@/lib/money'
import { defaultBankId } from '@/store'
import { FilesCard } from '@/components/FilesCard'
import { InvoiceSteps, InvoicesGantt } from '@/components/pm/InvoiceTimeline'
import { bankFor } from '@/lib/invoicePdf'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Invoice, InvoiceStatus } from '@/types'

const rp = (n: number, c: Invoice['currency'] = 'IDR') => fmtMoney(n, c)
const addBack = (d: string) => addDays(d, -7) // include a just-missed date

function StatusBadge({ inv }: { inv: Invoice }) {
  const st = INVOICE_STATUS[effectiveStatus(inv)]
  return <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', st.tone)}>{st.label}</span>
}

export default function PmInvoices() {
  const { project, info } = usePm()
  const { invoices, schedules, scheduleEvents, billingProfile, addInvoice, updateInvoice, deleteInvoice, createInvoiceFromSchedule, addPayment, removePayment, msConfig } = useStore()
  const [params, setParams] = useSearchParams()
  const { user } = useCurrentUser()
  const canInvoice = useCan()('pm.invoice')
  const ms = useMicrosoft()
  const [openId, setOpenId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [fromProject, setFromProject] = useState(false)
  const [pdfBusy, setPdfBusy] = useState('')
  const [reminded, setReminded] = useState('')
  const [view, setView] = useState<'table' | 'timeline'>('table')
  const [pay, setPay] = useState({ date: localToday(), amount: null as number | null, withheld: null as number | null, note: '' })
  const today = localToday()

  // Deep link from the billing reminders: /pm/invoices?open=<invoiceId>
  useEffect(() => {
    const id = params.get('open')
    if (id && invoices.some((i) => i.id === id)) { setOpenId(id); setParams({}, { replace: true }) }
  }, [params, invoices, setParams])

  const list = invoices.filter((i) => i.projectId === project.id).sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
  const open = invoices.find((i) => i.id === openId)
  const billed = billedTotals(list)
  const paid = paidTotals(list)
  const overdue = list.filter((i) => effectiveStatus(i) === 'overdue')

  const nextNumber = () => nextInvoiceNumber(invoices)
  const create = () => {
    const t = todayStr()
    const id = 'inv-' + nanoid(6)
    addInvoice({
      id, projectId: project.id, number: nextNumber(), clientName: info.client, clientEmail: info.stakeholders.find((x) => x.contact.includes('@'))?.contact ?? '',
      issueDate: t, dueDate: addDays(t, billingProfile.defaultTermDays ?? 14), items: [{ id: nanoid(5), description: '', qty: 1, unitPrice: 0 }], taxPct: billingProfile.defaultTaxPct ?? 11, status: 'draft', notes: billingProfile.paymentNote, sentAt: '',
      currency: 'IDR', bankId: defaultBankId(billingProfile.banks, 'IDR'),
    })
    setSendErr(''); setOpenId(id)
  }
  const upd = (id: string, p: Partial<Invoice>) => updateInvoice(id, p)

  const download = async (inv: Invoice) => {
    setPdfBusy(inv.id)
    try { await downloadInvoicePdf(inv, project.name, billingProfile) } catch (e) { alert('Could not build the PDF: ' + (e instanceof Error ? e.message : String(e))) } finally { setPdfBusy('') }
  }

  const remind = async (inv: Invoice) => {
    setSendErr(''); setSending(true)
    try {
      const late = daysBetween(inv.dueDate, today)
      const body = `Dear ${inv.clientName || 'Sir/Madam'},\n\nThis is a friendly reminder that invoice ${inv.number} for ${project.name} (${rp(balanceDue(inv) || invoiceTotal(inv), curOf(inv))}) was due on ${fmtDate(inv.dueDate)}${late > 0 ? ` (${late} day${late === 1 ? '' : 's'} ago)` : ''}.\n\nIf you have already paid, please ignore this message. Otherwise we would appreciate your payment at your earliest convenience. The invoice is attached again for reference.\n\nThank you,\n${user.name}`
      const pdf = await buildInvoicePdf(inv, project.name, billingProfile)
      await sendMail(msConfig, inv.clientEmail.trim(), `Payment reminder: invoice ${inv.number}`, body, [{ name: pdf.filename, contentType: 'application/pdf', base64: pdf.base64 }])
      setReminded(inv.id)
    } catch (e) { setSendErr(e instanceof Error ? e.message : String(e)) } finally { setSending(false) }
  }

  const send = async (inv: Invoice) => {
    setSendErr(''); setSending(true)
    try {
      const { subject, body } = invoiceEmail(inv, project.name, user.name)
      const pdf = await buildInvoicePdf(inv, project.name, billingProfile)
      await sendMail(msConfig, inv.clientEmail.trim(), subject, body, [{ name: pdf.filename, contentType: 'application/pdf', base64: pdf.base64 }])
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
          desc={`Bill ${info.client || 'the client'}, download the PDF, or email it from your Microsoft account.`}
          actions={canInvoice && <>
            <Button variant="outline" onClick={() => setFromProject(true)}><WandSparkles /> From project data</Button>
            <Button onClick={create}><Plus /> Blank invoice</Button>
          </>}
        />
        {!canInvoice && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can view invoices but not create or send them.</div>}

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><div className="text-xs text-muted-foreground">Billed</div><div className="mt-1 text-xl font-semibold tabular-nums">{fmtTotals(billed, true)}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Paid</div><div className="mt-1 text-xl font-semibold text-emerald-600 tabular-nums">{fmtTotals(paid, true)}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Outstanding</div><div className="mt-1 text-xl font-semibold tabular-nums">{fmtTotals(outstanding(list), true)}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Overdue</div><div className={cn('mt-1 text-xl font-semibold tabular-nums', overdue.length && 'text-red-600')}>{overdue.length}</div></Card>
        </div>


        {(() => {
          const mine = schedules.filter((x) => x.kind === 'receivable' && x.projectId === project.id && x.active)
          if (!mine.length) return null
          return (
            <Card title={<span className="flex items-center gap-2"><Repeat className="size-4" /> Recurring invoices</span>} action={<Link to="/pm/billing" className="text-xs text-muted-foreground hover:text-foreground">Manage schedules →</Link>}>
              <div className="divide-y">
                {mine.map((sc) => {
                  const date = nextOccurrence(sc, addBack(today))
                  const ev = date ? scheduleEvents[eventKey(sc.id, date)] : undefined
                  const inv = ev?.invoiceId ? invoices.find((i) => i.id === ev.invoiceId) : undefined
                  const left = date ? daysBetween(today, date) : 0
                  return (
                    <div key={sc.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{sc.title || 'Invoice'} <span className="font-normal text-muted-foreground">· {repeatLabel(sc)}</span></div>
                        <div className="text-xs text-muted-foreground">{date ? `Next: ${fmtDate(date)} (${left < 0 ? `${-left} days overdue` : left === 0 ? 'today' : `in ${left} days`})` : 'No upcoming date'}{sc.amount ? ` · ${rp(sc.amount)}` : ''}</div>
                      </div>
                      {inv ? (
                        <Button size="sm" variant={inv.status === 'draft' ? 'default' : 'outline'} onClick={() => setOpenId(inv.id)}>{inv.status === 'draft' ? 'Review draft' : 'Open'} {inv.number}</Button>
                      ) : date && canInvoice ? (
                        <Button size="sm" variant="outline" onClick={() => { const id = createInvoiceFromSchedule(sc.id, date); if (id) setOpenId(id) }}><CalendarClock /> Prepare invoice now</Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })()}

        {list.length > 0 && (
          <div className="flex gap-1" role="group" aria-label="Invoice view">
            <Button size="sm" variant={view === 'table' ? 'default' : 'outline'} aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</Button>
            <Button size="sm" variant={view === 'timeline' ? 'default' : 'outline'} aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>Timeline</Button>
          </div>
        )}
        {view === 'timeline' && list.length > 0 && <InvoicesGantt invoices={list} onOpen={(id) => { setSendErr(''); setOpenId(id) }} />}
        {view === 'table' && (list.length === 0 ? <Empty>No invoices for this project yet. Use “From project data” to build one from milestones and finished work.</Empty> : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr><th className="px-3 py-2">Invoice</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Status</th><th className="w-16" /></tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => { setSendErr(''); setOpenId(i.id) }}>
                    <td className="px-3 py-2.5 font-medium">{i.number}{i.scheduleKey && <span title="Created by a recurring schedule" className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-700"><Repeat className="size-2.5" />{i.period}</span>}{i.sentAt && <div className="text-[11px] font-normal text-muted-foreground">emailed {new Date(i.sentAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</div>}</td>
                    <td className="px-3 py-2.5">{i.clientName || '—'}<div className="text-xs text-muted-foreground">{i.clientEmail}</div></td>
                    <td className="px-3 py-2.5 text-muted-foreground">{fmtDate(i.issueDate)}</td>
                    <td className={cn('px-3 py-2.5', effectiveStatus(i) === 'overdue' ? 'font-medium text-red-600' : 'text-muted-foreground')}>{fmtDate(i.dueDate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rp(invoiceTotal(i), curOf(i))}{(i.payments?.length ?? 0) > 0 && <div className="text-[11px] text-muted-foreground">{i.status !== 'paid' && balanceDue(i) > 0 ? `${rp(balanceDue(i), curOf(i))} left` : `paid ${fmtDate(lastPaymentDate(i))}`}</div>}</td>
                    <td className="px-3 py-2.5"><StatusBadge inv={i} />{isPartlyPaid(i) && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">partial</span>}</td>
                    <td className="whitespace-nowrap px-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon-xs" title="Download PDF" disabled={pdfBusy === i.id} onClick={() => void download(i)}>{pdfBusy === i.id ? <Loader2 className="animate-spin" /> : <Download />}</Button>
                      {canInvoice && i.status === 'sent' && <Button variant="ghost" size="icon-xs" title="Mark as paid" onClick={() => upd(i.id, { status: 'paid' })}><BadgeCheck /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <InvoiceFromProjectDialog open={fromProject} onOpenChange={setFromProject} projectId={project.id} onCreated={(id) => { setSendErr(''); setOpenId(id) }} />

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">{open.number} <StatusBadge inv={open} /></SheetTitle>
                <SheetDescription>{project.name}{open.period && ` · ${open.period}`}{open.sentAt && ` · emailed ${new Date(open.sentAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Invoice number</Label><Input disabled={!canInvoice} value={open.number} onChange={(e) => upd(open.id, { number: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Status</Label><NativeSelect disabled={!canInvoice} className="w-full" value={open.status === 'overdue' ? 'sent' : open.status} onChange={(v) => upd(open.id, { status: v as InvoiceStatus })} options={[{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'paid', label: 'Paid' }]} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Client name</Label><Input disabled={!canInvoice} value={open.clientName} onChange={(e) => upd(open.id, { clientName: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Client email</Label><Input disabled={!canInvoice} type="email" value={open.clientEmail} onChange={(e) => upd(open.id, { clientEmail: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Issue date</Label><Input disabled={!canInvoice} type="date" value={open.issueDate} onChange={(e) => upd(open.id, { issueDate: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Due date</Label><Input disabled={!canInvoice} type="date" value={open.dueDate} onChange={(e) => upd(open.id, { dueDate: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Currency</Label><NativeSelect disabled={!canInvoice || (open.payments?.length ?? 0) > 0} className="w-full" value={curOf(open)} onChange={(v) => upd(open.id, { currency: v as Invoice['currency'], bankId: defaultBankId(billingProfile.banks, v as Invoice['currency']) })} options={currencyOptions} /></div>
                  <div className="space-y-1"><Label className="text-xs text-muted-foreground">Client pays into</Label>
                    <NativeSelect disabled={!canInvoice} className="w-full" value={bankFor(open, billingProfile)?.id ?? ''} onChange={(v) => upd(open.id, { bankId: v })} options={(billingProfile.banks ?? []).length ? (billingProfile.banks ?? []).map((b) => ({ value: b.id, label: `${b.bank} ${b.number} (${b.currency})` })) : [{ value: '', label: 'No bank account yet' }]} /></div>
                </div>
                {!(billingProfile.banks ?? []).length && <p className="text-xs text-muted-foreground">Add your bank accounts in <Link to="/pm/settings" className="underline">PM settings → Invoice template</Link>.</p>}

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Line items</Label>
                  {open.items.map((it) => {
                    const setIt = (p: Partial<typeof it>) => upd(open.id, { items: open.items.map((x) => (x.id === it.id ? { ...x, ...p } : x)) })
                    return (
                      <div key={it.id} className="grid grid-cols-[1fr_4rem_8rem_2rem] items-center gap-2">
                        <Input disabled={!canInvoice} placeholder="Description" value={it.description} onChange={(e) => setIt({ description: e.target.value })} />
                        <NumberInput disabled={!canInvoice} min={1} value={it.qty} onValueChange={(v) => setIt({ qty: v ?? 0 })} />
                        <NumberInput disabled={!canInvoice} min={0} decimals={decimalsOf(curOf(open))} placeholder="Unit price" value={it.unitPrice || null} onValueChange={(v) => setIt({ unitPrice: v ?? 0 })} />
                        {canInvoice && <Button variant="ghost" size="icon-xs" disabled={open.items.length <= 1} onClick={() => upd(open.id, { items: open.items.filter((x) => x.id !== it.id) })}><Trash2 className="text-destructive" /></Button>}
                      </div>
                    )
                  })}
                  {canInvoice && <Button variant="outline" size="xs" onClick={() => upd(open.id, { items: [...open.items, { id: nanoid(5), description: '', qty: 1, unitPrice: 0 }] })}><Plus /> Add item</Button>}
                </div>

                <div className="ml-auto w-64 space-y-1 text-sm tabular-nums">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span>{rp(invoiceSubtotal(open), curOf(open))}</div>
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-muted-foreground">Tax <NumberInput disabled={!canInvoice} className="h-6 w-14 px-1.5 text-xs" min={0} value={open.taxPct} onValueChange={(v) => upd(open.id, { taxPct: v ?? 0 })} /> %</span>{rp(invoiceTax(open), curOf(open))}</div>
                  <div className="flex justify-between border-t pt-1 font-semibold"><span>Total</span>{rp(invoiceTotal(open), curOf(open))}</div>
                </div>

                {open.status !== 'draft' && (() => {
                  const cur = curOf(open), dec = decimalsOf(cur), left = balanceDue(open)
                  const add = () => {
                    const amount = pay.amount ?? 0, withheld = pay.withheld ?? 0
                    if (amount <= 0 && withheld <= 0) return
                    addPayment(open.id, { id: nanoid(6), date: pay.date, amount, withheld, note: pay.note.trim() })
                    setPay({ date: localToday(), amount: null, withheld: null, note: '' })
                  }
                  return (
                    <div className="space-y-2 rounded-lg border p-3">
                      <div className="flex items-center justify-between"><Label className="text-sm font-semibold">Payments received</Label>
                        <span className={cn('text-xs font-medium', left > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>{left > 0 ? `${rp(left, cur)} still due` : 'Paid in full'}</span></div>
                      <p className="text-xs text-muted-foreground">Clients often pay late and a little less, because they withhold income tax (PPh). Record what arrived and what was withheld; the invoice closes when both together cover the total.</p>
                      {(open.payments ?? []).map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
                          <span className="w-24 shrink-0 tabular-nums">{fmtDate(p.date)}</span>
                          <span className="tabular-nums">{rp(p.amount, cur)}</span>
                          {p.withheld > 0 && <span className="text-xs text-muted-foreground">+ {rp(p.withheld, cur)} PPh</span>}
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{p.note}</span>
                          {canInvoice && <Button variant="ghost" size="icon-xs" title="Remove this payment" onClick={() => removePayment(open.id, p.id)}><Trash2 className="text-destructive" /></Button>}
                        </div>
                      ))}
                      {(open.payments?.length ?? 0) > 0 && <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground tabular-nums"><span>Received {rp(receivedTotal(open), cur)}</span><span>Withheld {rp(withheldTotal(open), cur)}</span></div>}
                      {canInvoice && (
                        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[8rem_1fr_1fr]">
                          <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Date received</Label><Input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
                          <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Amount received</Label><NumberInput min={0} decimals={dec} value={pay.amount} onValueChange={(v) => setPay({ ...pay, amount: v })} /></div>
                          <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Tax withheld (PPh)</Label><NumberInput min={0} decimals={dec} value={pay.withheld} onValueChange={(v) => setPay({ ...pay, withheld: v })} /></div>
                          <div className="col-span-2 space-y-1 sm:col-span-3"><Label className="text-[11px] text-muted-foreground">Note (optional)</Label><Input value={pay.note} placeholder="e.g. Transfer from BCA, bukti potong to follow" onChange={(e) => setPay({ ...pay, note: e.target.value })} /></div>
                          <div className="col-span-2 flex gap-2 sm:col-span-3">
                            <Button size="sm" disabled={(pay.amount ?? 0) <= 0 && (pay.withheld ?? 0) <= 0} onClick={add}><BadgeCheck /> Record payment</Button>
                            {left > 0 && <Button size="sm" variant="outline" onClick={() => setPay({ ...pay, amount: left })}>Fill the balance</Button>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

                <div className="space-y-2"><Label className="text-sm font-semibold">Timeline</Label><InvoiceSteps invoice={open} /></div>

                <FilesCard title="Documents" files={open.attachments ?? []} onChange={(f) => upd(open.id, { attachments: f })} categories={['invoice', 'tax', 'other']} folder={[project.name, 'Invoices', open.number]} canEdit={canInvoice} hint="Signed copy, purchase order, tax withholding slip (bukti potong) …" />

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
                    {open.sentAt && !sendErr && <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="size-4" /> Last emailed to {open.clientEmail} with the PDF attached</div>}
                    <Button disabled={!!blocked || sending || !open.clientEmail.includes('@') || badItems} onClick={() => send(open)}>
                      {sending ? <Loader2 className="animate-spin" /> : <Send />} {open.sentAt ? 'Send again' : 'Send invoice'}
                    </Button>
                    {!blocked && !open.clientEmail.includes('@') && <div className="text-xs text-muted-foreground">Add the client’s email to send.</div>}
                    {!blocked && open.clientEmail.includes('@') && badItems && <div className="text-xs text-muted-foreground">Every item needs a description and the total must be above zero.</div>}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={pdfBusy === open.id} onClick={() => void download(open)}>{pdfBusy === open.id ? <Loader2 className="animate-spin" /> : <FileDown />} Download PDF</Button>
                  {canInvoice && effectiveStatus(open) === 'overdue' && (
                    <Button variant="outline" disabled={!!blocked || sending || !open.clientEmail.includes('@')} onClick={() => void remind(open)}><BellRing /> {reminded === open.id ? 'Reminder sent' : 'Send payment reminder'}</Button>
                  )}
                  {canInvoice && <Button variant="outline" onClick={() => { if (confirm(`Delete invoice ${open.number}?`)) { deleteInvoice(open.id); setOpenId(null) } }}><Trash2 className="text-destructive" /> Delete</Button>}
                </div>
                {!billingProfile.company && <p className="text-xs text-muted-foreground">Tip: add your company and bank details in <Link to="/pm/settings" className="underline">PM settings → Billing profile</Link> so they appear on the PDF.</p>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
