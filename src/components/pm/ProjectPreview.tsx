import { useNavigate } from 'react-router-dom'
import { ArrowRight, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { HealthBadge, PriorityBadge, Progress } from '@/components/pm/ui'
import { useStore } from '@/store'
import { INVOICE_STATUS, PHASES, daysBetween, effectiveStatus, fieldsOf, billedTotals, invoiceTotal, money, outstanding, riskScore, riskTone, todayStr } from '@/lib/pm'
import { curOf, fmtCompact, fmtTotals } from '@/lib/money'
import { fmtDate } from '@/lib/constants'
import { cn } from '@/lib/utils'

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium">{children}</span></div>
)

/** Quick look at a project from the list, without leaving the page. */
export function ProjectPreview({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const { projects, invoices, tasks, risks, milestones, updates, candidates, positions, setProject } = useStore()
  const nav = useNavigate()
  const p = projects.find((x) => x.id === projectId)
  const go = (to: string) => { if (p) { setProject(p.id); onClose(); nav(to) } }

  return (
    <Sheet open={!!p} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {p && (() => {
          const fl = fieldsOf(p)
          const today = todayStr()
          const inv = invoices.filter((i) => i.projectId === p.id)
          const overdue = inv.filter((i) => effectiveStatus(i) === 'overdue').sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          const billed = billedTotals(inv)
          const done = new Set(p.pmStages.filter((x) => x.type === 'won').map((x) => x.id))
          const pt = tasks.filter((t) => t.projectId === p.id)
          const prog = pt.length ? Math.round((pt.filter((t) => done.has(t.stage)).length / pt.length) * 100) : 0
          const openRisks = risks.filter((r) => r.projectId === p.id && r.status !== 'closed').sort((a, b) => riskScore(b.probability, b.impact) - riskScore(a.probability, a.impact)).slice(0, 3)
          const nextMs = milestones.filter((m) => m.projectId === p.id && m.status !== 'done').sort((a, b) => a.date.localeCompare(b.date))[0]
          const latest = updates.filter((u) => u.projectId === p.id).sort((a, b) => b.date.localeCompare(a.date))[0]
          const won = new Set(p.stages.filter((x) => x.type === 'won').map((x) => x.id))
          const lost = new Set(p.stages.filter((x) => x.type === 'lost').map((x) => x.id))
          const cs = candidates.filter((c) => c.projectId === p.id && !c.archived)
          const headcount = positions.filter((x) => x.projectId === p.id && x.status !== 'closed').reduce((a, x) => a + x.headcount, 0)
          return (
            <>
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">{p.name} {fl.health && <HealthBadge health={p.info.health} />}{fl.priority && <PriorityBadge priority={p.info.priority} />}</SheetTitle>
                <SheetDescription>{[fl.phase && PHASES.find((x) => x.value === p.info.phase)?.label, fl.client && p.info.client, p.status === 'archived' && 'archived'].filter(Boolean).join(' · ') || 'Project preview'}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                {overdue.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                    <div className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4" /> {overdue.length} overdue invoice{overdue.length > 1 ? 's' : ''}</div>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {overdue.map((i) => <li key={i.id}>{i.number} · {money(invoiceTotal(i))} · due {fmtDate(i.dueDate)} ({daysBetween(i.dueDate, today)} days late)</li>)}
                    </ul>
                  </div>
                )}

                <section className="divide-y rounded-xl border px-3">
                  {fl.manager && <Row k="Project manager">{p.info.manager || '—'}</Row>}
                  {fl.sponsor && <Row k="Sponsor">{p.info.sponsor || '—'}</Row>}
                  {(fl.startDate || fl.endDate) && <Row k="Dates">{fl.startDate ? fmtDate(p.info.startDate) || '—' : ''}{fl.startDate && fl.endDate ? ' → ' : ''}{fl.endDate ? fmtDate(p.info.endDate) || '—' : ''}</Row>}
                  {fl.budget && <Row k="Budget">{money(p.info.budget)}</Row>}
                  {fl.methodology && <Row k="Methodology">{p.info.methodology}</Row>}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Delivery</h3>
                  <div className="flex items-center gap-3"><div className="flex-1"><Progress value={prog} /></div><span className="w-10 text-right text-sm font-medium tabular-nums">{prog}%</span></div>
                  <div className="text-xs text-muted-foreground">{pt.filter((t) => done.has(t.stage)).length} of {pt.length} tasks done{nextMs && ` · next milestone: ${nextMs.title} (${fmtDate(nextMs.date)})`}</div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Invoices</h3>
                  {inv.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="rounded-lg bg-muted/50 p-2"><div className="text-xs text-muted-foreground">Billed</div><div className="font-semibold tabular-nums">{fmtTotals(billed, true)}</div></div>
                        <div className="rounded-lg bg-muted/50 p-2"><div className="text-xs text-muted-foreground">Outstanding</div><div className="font-semibold tabular-nums">{fmtTotals(outstanding(inv), true)}</div></div>
                        <div className="rounded-lg bg-muted/50 p-2"><div className="text-xs text-muted-foreground">Overdue</div><div className={cn('font-semibold tabular-nums', overdue.length && 'text-red-600')}>{overdue.length}</div></div>
                      </div>
                      <div className="divide-y rounded-xl border text-sm">
                        {[...inv].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).slice(0, 5).map((i) => {
                          const st = INVOICE_STATUS[effectiveStatus(i)]
                          return (
                            <div key={i.id} className="flex items-center gap-2 px-3 py-2">
                              <span className="font-medium">{i.number}</span>
                              <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', st.tone)}>{st.label}</span>
                              <span className="ml-auto text-xs text-muted-foreground">due {fmtDate(i.dueDate)}</span>
                              <span className="w-28 text-right tabular-nums">{fmtCompact(invoiceTotal(i), curOf(i))}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </section>

                {openRisks.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Top risks</h3>
                    {openRisks.map((r) => (
                      <div key={r.id} className="flex items-center gap-2 text-sm"><span className={cn('grid size-6 shrink-0 place-items-center rounded text-xs font-semibold', riskTone(riskScore(r.probability, r.impact)))}>{riskScore(r.probability, r.impact)}</span><span className="truncate">{r.title}</span></div>
                    ))}
                  </section>
                )}

                {latest && (
                  <section className="space-y-1">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Latest update · {fmtDate(latest.date)}</h3>
                    <p className="text-sm">{latest.summary}</p>
                  </section>
                )}

                <section className="text-sm text-muted-foreground">Hiring: {cs.filter((c) => won.has(c.stage)).length} of {headcount} hired · {cs.filter((c) => !won.has(c.stage) && !lost.has(c.stage)).length} in pipeline</section>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button onClick={() => go('/pm/dashboard')}>Open dashboard <ArrowRight /></Button>
                  <Button variant="outline" onClick={() => go('/pm/invoices')}>Invoices</Button>
                  <Button variant="outline" onClick={() => go('/pm/info')}>Project info</Button>
                </div>
              </div>
            </>
          )
        })()}
      </SheetContent>
    </Sheet>
  )
}
