import type { BankAccount, BillingProfile, Invoice } from '@/types'
import { INVOICE_STATUS, balanceDue, effectiveStatus, invoiceSubtotal, invoiceTax, invoiceTotal, receivedTotal, withheldTotal } from '@/lib/pm'
import { curOf, fmtMoney } from '@/lib/money'
import { imageSize } from '@/lib/image'

/** The bank account printed on an invoice: the one chosen on it, else the first one in its currency, else the first. */
export function bankFor(inv: Invoice, profile: BillingProfile): BankAccount | undefined {
  const banks = profile.banks ?? []
  return banks.find((b) => b.id === inv.bankId) ?? banks.find((b) => b.currency === curOf(inv)) ?? banks[0]
}
const longDate = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '-')

export const invoiceFileName = (i: Invoice, projectName: string) =>
  `${i.number} - ${projectName}`.replace(/[\\/:*?"<>|]+/g, '-').trim() + '.pdf'

/** Build the invoice as a real A4 PDF. jsPDF is loaded on demand so it stays out of the main bundle. */
export async function buildInvoicePdf(inv: Invoice, projectName: string, profile: BillingProfile) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableMod.default
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const M = 48
  const ink = [24, 24, 27] as const
  const muted = [113, 113, 122] as const
  const rp = (n: number) => fmtMoney(n, curOf(inv))
  let y = M

  // Header: logo + company on the left, document title on the right
  let textX = M
  if (profile.logo) {
    try {
      const { w, h } = await imageSize(profile.logo)
      if (w && h) {
        const lh = Math.min(48, (140 * h) / w), lw = (lh * w) / h
        doc.addImage(profile.logo, profile.logo.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', M, y - 6, lw, lh)
        y += lh + 2 - 14
      }
    } catch { /* a bad logo must never block the invoice */ }
  }
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ink)
  doc.text(profile.company || 'Your company', textX, y + 22)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted)
  const from = [profile.address, [profile.phone, profile.email, profile.website].filter(Boolean).join('  |  '), profile.taxId && `NPWP ${profile.taxId}`].filter(Boolean) as string[]
  from.flatMap((l) => doc.splitTextToSize(l, 270) as string[]).forEach((l, i) => doc.text(l, textX, y + 38 + i * 12))
  const top = M

  doc.setFont('helvetica', 'bold').setFontSize(24).setTextColor(...ink)
  doc.text('INVOICE', W - M, top + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...muted)
  const status = INVOICE_STATUS[effectiveStatus(inv)].label
  ;[['No.', inv.number], ['Issued', longDate(inv.issueDate)], ['Due', longDate(inv.dueDate)], ['Status', status]].forEach(([k, v], i) => {
    doc.setTextColor(...muted).text(k, W - M - 150, top + 32 + i * 14)
    doc.setTextColor(...ink).text(v, W - M, top + 32 + i * 14, { align: 'right' })
  })
  y = Math.max(y + 38 + from.flatMap((l) => doc.splitTextToSize(l, 270) as string[]).length * 12, top + 100) + 16

  // Bill to + project
  doc.setDrawColor(228, 228, 231).line(M, y - 14, W - M, y - 14)
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...muted).text('BILL TO', M, y)
  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...ink).text(inv.clientName || '-', M, y + 15)
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...muted).text(inv.clientEmail || '', M, y + 29)
  doc.setFont('helvetica', 'bold').setFontSize(8).text('PROJECT', W / 2 + 20, y)
  doc.setFont('helvetica', 'normal').setFontSize(11).setTextColor(...ink).text(projectName, W / 2 + 20, y + 15)
  if (inv.period) doc.setFontSize(9).setTextColor(...muted).text(`Period: ${inv.period}`, W / 2 + 20, y + 29)
  y += 52

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body: inv.items.map((x) => [x.description || '-', String(x.qty), rp(x.unitPrice), rp(x.qty * x.unitPrice)]),
    margin: { left: M, right: M },
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 7, textColor: [24, 24, 27], lineColor: [228, 228, 231] },
    headStyles: { fillColor: [244, 244, 245], textColor: [113, 113, 122], fontStyle: 'bold', fontSize: 9 },
    columnStyles: { 1: { halign: 'right', cellWidth: 50 }, 2: { halign: 'right', cellWidth: 100 }, 3: { halign: 'right', cellWidth: 110 } },
    theme: 'grid',
    didParseCell: (d) => { if (d.section === 'head' && d.column.index >= 1) d.cell.styles.halign = 'right' },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18

  // Totals
  const row = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(bold ? 12 : 10).setTextColor(bold ? 24 : 113, bold ? 24 : 113, bold ? 27 : 122)
    doc.text(label, W - M - 180, y)
    doc.setTextColor(...ink).text(value, W - M, y, { align: 'right' })
    y += bold ? 20 : 15
  }
  row('Subtotal', rp(invoiceSubtotal(inv)))
  if (inv.taxPct) row(`Tax (${inv.taxPct}%)`, rp(invoiceTax(inv)))
  doc.setDrawColor(...ink).line(W - M - 180, y - 8, W - M, y - 8)
  y += 4
  row('Total', rp(invoiceTotal(inv)), true)
  if ((inv.payments ?? []).length) {
    row('Received', '- ' + rp(receivedTotal(inv)))
    if (withheldTotal(inv)) row('Tax withheld (PPh)', '- ' + rp(withheldTotal(inv)))
    row('Balance due', rp(balanceDue(inv)), true)
  }
  y += 12

  // Payment details + notes
  const acct = bankFor(inv, profile)
  const bank = acct ? [`Bank: ${acct.bank}${acct.branch ? ' (' + acct.branch + ')' : ''}`, `Account: ${acct.number}  (${acct.currency})`, `Account name: ${acct.holder}`, acct.swift && `SWIFT: ${acct.swift}`].filter(Boolean) as string[] : []
  if (bank.length) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...muted).text('PAYMENT DETAILS', M, y)
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...ink)
    bank.forEach((l, i) => doc.text(l, M, y + 14 + i * 13))
    y += 14 + bank.length * 13 + 12
  }
  if (inv.notes.trim()) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(...muted).text('NOTES', M, y)
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...ink)
    const lines = doc.splitTextToSize(inv.notes, W - M * 2) as string[]
    lines.forEach((l, i) => doc.text(l, M, y + 14 + i * 13))
    y += 14 + lines.length * 13 + 12
  }
  if (profile.signerName) {
    if (y > doc.internal.pageSize.getHeight() - 150) { doc.addPage(); y = M }
    doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...muted).text('Sincerely,', W - M - 150, y + 6)
    doc.setDrawColor(...ink).line(W - M - 150, y + 56, W - M, y + 56)
    doc.setFont('helvetica', 'bold').setTextColor(...ink).text(profile.signerName, W - M - 150, y + 70)
    if (profile.signerTitle) doc.setFont('helvetica', 'normal').setTextColor(...muted).text(profile.signerTitle, W - M - 150, y + 83)
  }

  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...muted)
  const pageH = doc.internal.pageSize.getHeight()
  if (profile.footer) (doc.splitTextToSize(profile.footer, W - M * 2) as string[]).slice(0, 2).forEach((l, i) => doc.text(l, M, pageH - 44 + i * 10))
  doc.text(`${inv.number} · generated ${new Date().toLocaleDateString('en-GB')}`, M, pageH - 24)

  const blob = doc.output('blob') as Blob
  const base64 = (doc.output('datauristring') as string).split(',')[1]
  return { blob, base64, filename: invoiceFileName(inv, projectName) }
}

export async function downloadInvoicePdf(inv: Invoice, projectName: string, profile: BillingProfile) {
  const { blob, filename } = await buildInvoicePdf(inv, projectName, profile)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
