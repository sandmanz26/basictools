import { useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { FileDown, ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/NativeSelect'
import { NumberInput } from '@/components/NumberInput'
import { Card, Field } from '@/components/pm/ui'
import { logoFromFile } from '@/lib/image'
import { currencyOptions } from '@/lib/money'
import { downloadInvoicePdf } from '@/lib/invoicePdf'
import { localToday, addDays } from '@/lib/billing'
import type { BankAccount, BillingProfile, Invoice } from '@/types'

const sample = (profile: BillingProfile): Invoice => {
  const t = localToday()
  return {
    id: 'sample', projectId: '', number: 'INV-SAMPLE-001', clientName: 'Sample Client Ltd', clientEmail: 'client@example.com', issueDate: t, dueDate: addDays(t, profile.defaultTermDays ?? 14),
    items: [{ id: 'a', description: 'Monthly service fee', qty: 1, unitPrice: 15_000_000 }, { id: 'b', description: 'Additional support', qty: 2, unitPrice: 1_250_000 }],
    taxPct: profile.defaultTaxPct ?? 11, status: 'sent', notes: profile.paymentNote, sentAt: '', period: 'November 2026', bankId: profile.banks?.[0]?.id,
  }
}

/** The invoice template: logo, company details, bank accounts and defaults. Edits a draft; the page's Save bar applies it. */
export function InvoiceTemplateCard({ bp, setBp, can }: { bp: BillingProfile; setBp: (p: Partial<BillingProfile>) => void; can: boolean }) {
  const file = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const banks = bp.banks ?? []
  const setBank = (id: string, p: Partial<BankAccount>) => setBp({ banks: banks.map((b) => (b.id === id ? { ...b, ...p } : b)) })

  const pick = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    try { setBp({ logo: await logoFromFile(f) }) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
  }
  const preview = async () => {
    setBusy(true)
    try { await downloadInvoicePdf(sample(bp), 'Sample project', bp) } catch (e) { setErr('Could not build the PDF: ' + (e instanceof Error ? e.message : String(e))) } finally { setBusy(false) }
  }

  return (
    <Card title="Invoice template" action={<Button size="sm" variant="outline" disabled={busy} onClick={() => void preview()}>{busy ? <Loader2 className="animate-spin" /> : <FileDown />} Download sample PDF</Button>}>
      <p className="mb-3 text-sm text-muted-foreground">Set this once. Every invoice PDF and email uses it: logo, company details, bank accounts and defaults. The sample PDF shows your unsaved changes.</p>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-20 w-48 place-items-center overflow-hidden rounded-lg border bg-white p-2">
            {bp.logo ? <img src={bp.logo} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo yet</span>}
          </div>
          <div className="space-y-1.5">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={!can} onClick={() => file.current?.click()}><ImagePlus /> {bp.logo ? 'Replace logo' : 'Upload logo'}</Button>
              {bp.logo && <Button size="sm" variant="ghost" disabled={!can} onClick={() => setBp({ logo: '' })}>Remove</Button>}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG or WebP. A wide logo on a transparent or white background looks best.</p>
            {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name"><Input disabled={!can} value={bp.company} onChange={(e) => setBp({ company: e.target.value })} /></Field>
          <Field label="Tax ID (NPWP)"><Input disabled={!can} value={bp.taxId} onChange={(e) => setBp({ taxId: e.target.value })} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea disabled={!can} rows={2} value={bp.address} onChange={(e) => setBp({ address: e.target.value })} /></Field>
          <Field label="Billing email"><Input disabled={!can} type="email" value={bp.email} onChange={(e) => setBp({ email: e.target.value })} /></Field>
          <Field label="Phone"><Input disabled={!can} value={bp.phone} onChange={(e) => setBp({ phone: e.target.value })} /></Field>
          <Field label="Website" className="sm:col-span-2"><Input disabled={!can} placeholder="www.example.com" value={bp.website ?? ''} onChange={(e) => setBp({ website: e.target.value })} /></Field>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between"><div className="text-sm font-semibold">Bank accounts</div>
            {can && <Button size="sm" variant="outline" onClick={() => setBp({ banks: [...banks, { id: nanoid(5), bank: '', number: '', holder: bp.company, currency: 'IDR' }] })}><Plus /> Add account</Button>}</div>
          <p className="text-xs text-muted-foreground">Clients pay into one of these. Choose which one on each invoice; if you do not, the first account in the invoice’s currency is printed.</p>
          {banks.length === 0 && <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">No bank account yet.</div>}
          {banks.map((b) => (
            <div key={b.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border p-2.5 sm:grid-cols-[7rem_1fr_1fr_9rem_2rem]">
              <Field label="Bank"><Input disabled={!can} placeholder="BCA" value={b.bank} onChange={(e) => setBank(b.id, { bank: e.target.value })} /></Field>
              <Field label="Account number"><Input disabled={!can} value={b.number} onChange={(e) => setBank(b.id, { number: e.target.value })} /></Field>
              <Field label="Account name"><Input disabled={!can} value={b.holder} onChange={(e) => setBank(b.id, { holder: e.target.value })} /></Field>
              <Field label="Currency"><NativeSelect disabled={!can} className="w-full" value={b.currency} onChange={(v) => setBank(b.id, { currency: v as BankAccount['currency'] })} options={currencyOptions} /></Field>
              {can ? <Button variant="ghost" size="icon-sm" title="Remove account" onClick={() => setBp({ banks: banks.filter((x) => x.id !== b.id) })}><Trash2 className="text-destructive" /></Button> : <span />}
              <Field label="SWIFT / BIC (foreign payments)" className="col-span-2 sm:col-span-2"><Input disabled={!can} value={b.swift ?? ''} onChange={(e) => setBank(b.id, { swift: e.target.value })} /></Field>
              <Field label="Branch" className="col-span-2 sm:col-span-2"><Input disabled={!can} value={b.branch ?? ''} onChange={(e) => setBank(b.id, { branch: e.target.value })} /></Field>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default tax (PPN %)"><NumberInput disabled={!can} min={0} max={100} decimals={2} value={bp.defaultTaxPct ?? 11} onValueChange={(v) => setBp({ defaultTaxPct: v ?? 0 })} /></Field>
          <Field label="Default payment term (days)"><NumberInput disabled={!can} min={0} value={bp.defaultTermDays ?? 14} onValueChange={(v) => setBp({ defaultTermDays: v ?? 0 })} /></Field>
          <Field label="Default invoice note" className="sm:col-span-2"><Textarea disabled={!can} rows={2} placeholder="e.g. Please pay within 14 days and include the invoice number in the transfer." value={bp.paymentNote} onChange={(e) => setBp({ paymentNote: e.target.value })} /></Field>
          <Field label="Footer (small print)" className="sm:col-span-2"><Input disabled={!can} placeholder="e.g. PT Example · Jl. Sudirman 1, Jakarta · Thank you for your business" value={bp.footer ?? ''} onChange={(e) => setBp({ footer: e.target.value })} /></Field>
          <Field label="Signed by (name)"><Input disabled={!can} value={bp.signerName ?? ''} onChange={(e) => setBp({ signerName: e.target.value })} /></Field>
          <Field label="Signer title"><Input disabled={!can} placeholder="Finance Manager" value={bp.signerTitle ?? ''} onChange={(e) => setBp({ signerTitle: e.target.value })} /></Field>
        </div>
      </div>
    </Card>
  )
}
