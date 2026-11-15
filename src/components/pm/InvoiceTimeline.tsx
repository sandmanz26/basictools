import { useMemo } from 'react'
import { Check, Circle, Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/constants'
import { localToday } from '@/lib/billing'
import { curOf, fmtMoney } from '@/lib/money'
import { effectiveStatus, INVOICE_STATUS, invoiceTotal, isPartlyPaid } from '@/lib/pm'
import { ganttBar, ganttScale, invoiceSteps, type StepState } from '@/lib/timeline'
import { GanttGrid, GanttHeader } from '@/components/pm/ProjectGantt'
import type { Invoice, InvoiceStatus } from '@/types'

const STEP: Record<StepState, { ring: string; icon: typeof Check }> = {
  done: { ring: 'bg-emerald-500 text-white', icon: Check },
  current: { ring: 'bg-sky-500 text-white', icon: Clock },
  upcoming: { ring: 'border-2 border-border bg-card text-muted-foreground', icon: Circle },
  late: { ring: 'bg-red-500 text-white', icon: AlertTriangle },
}

/** Vertical lifecycle of one invoice: issued, emailed, due date, payments, result. */
export function InvoiceSteps({ invoice }: { invoice: Invoice }) {
  const today = localToday()
  const steps = useMemo(() => invoiceSteps(invoice, today), [invoice, today])
  return (
    <ol className="space-y-0" aria-label={`Progress of invoice ${invoice.number}`}>
      {steps.map((s, i) => {
        const { ring, icon: Icon } = STEP[s.state]
        return (
          <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0" aria-current={s.state === 'current' ? 'step' : undefined}>
            {i < steps.length - 1 && <span className={cn('absolute top-6 bottom-0 left-[11px] w-px', s.state === 'done' ? 'bg-emerald-400' : 'bg-border')} aria-hidden />}
            <span className={cn('relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full', ring)}><Icon className="size-3.5" /></span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={cn('font-medium', s.state === 'late' && 'text-red-600 dark:text-red-400', s.state === 'upcoming' && 'text-muted-foreground')}>{s.label}</span>
                <span className="text-xs text-muted-foreground">{s.date ? `${fmtDate(s.date)}${s.time ? ` · ${s.time}` : ''}` : ''}</span>
              </div>
              {s.received && <div className="text-xs">Received <b className="font-semibold">{s.received}</b>{s.withheld && <> · tax withheld (PPh) <b className="font-semibold">{s.withheld}</b></>}</div>}
              {s.detail && <div className="text-xs break-words text-muted-foreground">{s.detail}</div>}
              {s.balance && <div className={cn('text-xs', s.state === 'late' ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground')}>Balance still due {s.balance}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const BAR: Record<InvoiceStatus, string> = { draft: 'bg-slate-400', sent: 'bg-sky-500', paid: 'bg-emerald-500', overdue: 'bg-red-500' }

/** One bar per invoice from issue date to due date, with payment markers. */
export function InvoicesGantt({ invoices, onOpen }: { invoices: Invoice[]; onOpen: (invoiceId: string) => void }) {
  const today = localToday()
  const rows = useMemo(() => [...invoices].sort((a, b) => a.issueDate.localeCompare(b.issueDate)), [invoices])
  const scale = useMemo(() => ganttScale([...rows.map((i) => ({ start: i.issueDate, end: i.dueDate })), ...rows.flatMap((i) => (i.payments ?? []).map((p) => ({ start: p.date })))], today), [rows, today])
  if (rows.length === 0) return <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No invoices yet.</div>

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="min-w-[640px]">
        <GanttHeader scale={scale} left="w-0 border-r-0 p-0" />
        {rows.map((i) => {
          const st = effectiveStatus(i, today)
          const bar = ganttBar(scale, i.issueDate, i.dueDate)
          const label = `${i.number} · ${fmtMoney(invoiceTotal(i), curOf(i))}`
          const tip = `${label} · ${INVOICE_STATUS[st].label} · issued ${fmtDate(i.issueDate)}, due ${fmtDate(i.dueDate)}`
          return (
            <div key={i.id} className="relative h-12 border-b last:border-b-0 hover:bg-muted/30">
              <GanttGrid scale={scale} todayLabel={false} />
              {bar.kind !== 'none' && (
                <button type="button" onClick={() => onOpen(i.id)} title={tip} aria-label={tip}
                  className={cn('absolute top-2 z-[4] flex h-6 min-w-6 items-center gap-1.5 overflow-hidden rounded px-1.5 text-[11px] font-medium whitespace-nowrap text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1', BAR[st], bar.kind === 'dot' && 'rounded-full')}
                  style={{ left: `${bar.left}%`, width: bar.kind === 'dot' ? undefined : `${bar.width}%` }}>
                  <span className="truncate">{label}</span>
                  {isPartlyPaid(i) && <span className="shrink-0 rounded bg-white/25 px-1 text-[10px]">partial</span>}
                </button>
              )}
              {(i.payments ?? []).filter((p) => scale.inWindow(p.date)).map((p) => (
                <span key={p.id} title={`Payment ${fmtDate(p.date)}: ${fmtMoney(p.amount, curOf(i))}${p.withheld ? ` + ${fmtMoney(p.withheld, curOf(i))} withheld` : ''}`}
                  className="absolute bottom-1 z-[6] size-2.5 -translate-x-1/2 rotate-45 bg-emerald-400 ring-1 ring-white dark:ring-slate-900" style={{ left: `${scale.pct(p.date)}%` }} />
              ))}
              {bar.kind === 'none' && <span className="absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">{label}: dates outside the view</span>}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        {(['sent', 'paid', 'overdue', 'draft'] as const).map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-4 rounded-sm', BAR[k])} />{INVOICE_STATUS[k].label}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-emerald-400" />Payment</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 border-l-2 border-red-500" />Today</span>
      </div>
    </div>
  )
}
