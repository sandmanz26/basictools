import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarCheck, CircleDollarSign, ListChecks } from 'lucide-react'
import { Card, HealthBadge, PageHeader, PriorityBadge, Progress, pageCls, usePm } from '@/components/pm/ui'
import { PHASES, daysBetween, fieldsOf, money, riskScore, riskTone, todayStr } from '@/lib/pm'
import { fmtDate, stageDot } from '@/lib/constants'
import { cn } from '@/lib/utils'

export default function PmOverview() {
  const { s, project, info, tasks, milestones, risks, budget, updates } = usePm()
  const fl = fieldsOf(project)
  const today = todayStr()
  const doneIds = new Set(project.pmStages.filter((x) => x.type === 'won').map((x) => x.id))
  const done = tasks.filter((t) => doneIds.has(t.stage)).length
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today && !doneIds.has(t.stage))

  const total = info.startDate && info.endDate ? daysBetween(info.startDate, info.endDate) : 0
  const elapsed = total ? Math.max(0, Math.min(total, daysBetween(info.startDate, today))) : 0
  const left = info.endDate ? daysBetween(today, info.endDate) : null

  const planned = budget.reduce((a, b) => a + b.planned, 0)
  const actual = budget.reduce((a, b) => a + b.actual, 0)
  const budgetCap = info.budget ?? planned
  const spentPct = budgetCap ? Math.round((actual / budgetCap) * 100) : 0

  const openRisks = risks.filter((r) => r.status !== 'closed')
  const topRisks = [...openRisks].sort((a, b) => riskScore(b.probability, b.impact) - riskScore(a.probability, a.impact)).slice(0, 4)
  const high = openRisks.filter((r) => riskScore(r.probability, r.impact) >= 12).length
  const upcoming = milestones.filter((m) => m.status !== 'done').sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4)
  const latest = [...updates].sort((a, b) => b.date.localeCompare(a.date))[0]

  // Shared with HR: positions and hires
  const positions = s.positions.filter((p) => p.projectId === project.id)
  const wonIds = new Set(project.stages.filter((x) => x.type === 'won').map((x) => x.id))
  const lostIds = new Set(project.stages.filter((x) => x.type === 'lost').map((x) => x.id))
  const cands = s.candidates.filter((c) => c.projectId === project.id && !c.archived)
  const hired = cands.filter((c) => wonIds.has(c.stage)).length
  const inFlight = cands.filter((c) => !wonIds.has(c.stage) && !lostIds.has(c.stage)).length
  const headcount = positions.filter((p) => p.status !== 'closed').reduce((a, p) => a + p.headcount, 0)

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title={<span className="flex flex-wrap items-center gap-3">{project.name} {fl.health && <HealthBadge health={info.health} />}</span>}
          desc={[fl.phase && `${PHASES.find((p) => p.value === info.phase)?.label} phase`, fl.methodology && info.methodology, fl.manager && `PM ${info.manager || '—'}`, !fl.endDate && fl.startDate && info.startDate && `Started ${fmtDate(info.startDate)}`].filter(Boolean).join(' · ') || undefined}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ListChecks className="size-4" /> Delivery progress</div>
            <div className="mt-1 text-2xl font-semibold">{progress}%</div>
            <Progress value={progress} />
            <div className="mt-2 text-xs text-muted-foreground">{done} of {tasks.length} tasks done{overdue.length > 0 && <span className="text-red-600"> · {overdue.length} overdue</span>}</div>
          </Card>
          {(fl.startDate || fl.endDate) && (
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarCheck className="size-4" /> Schedule</div>
            {fl.endDate && fl.startDate ? (
              <>
                <div className="mt-1 text-2xl font-semibold">{left == null ? '—' : left >= 0 ? `${left} days left` : `${-left} days over`}</div>
                <Progress value={total ? (elapsed / total) * 100 : 0} tone="bg-sky-500" />
                <div className="mt-2 text-xs text-muted-foreground">{fmtDate(info.startDate)} → {fmtDate(info.endDate)}</div>
              </>
            ) : fl.startDate ? (
              <>
                <div className="mt-1 text-2xl font-semibold">{info.startDate ? `Day ${Math.max(0, daysBetween(info.startDate, today)) + 1}` : '—'}</div>
                <div className="mt-2 text-xs text-muted-foreground">Started {fmtDate(info.startDate) || '—'}</div>
              </>
            ) : (
              <>
                <div className="mt-1 text-2xl font-semibold">{left == null ? '—' : left >= 0 ? `${left} days left` : `${-left} days over`}</div>
                <div className="mt-2 text-xs text-muted-foreground">Due {fmtDate(info.endDate) || '—'}</div>
              </>
            )}
          </Card>
          )}
          {fl.budget && (
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="size-4" /> Budget used</div>
            <div className="mt-1 text-2xl font-semibold">{spentPct}%</div>
            <Progress value={spentPct} tone={spentPct > 90 ? 'bg-red-500' : spentPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'} />
            <div className="mt-2 text-xs text-muted-foreground">{money(actual)} of {money(budgetCap)}</div>
          </Card>
          )}
          <Card>
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="size-4" /> Open risks & issues</div>
            <div className="mt-1 text-2xl font-semibold">{openRisks.length}</div>
            <div className="mt-3 text-xs text-muted-foreground">{high} high severity</div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Latest status update" action={<Link to="/pm/updates" className="text-xs text-muted-foreground hover:text-foreground">All updates →</Link>} className="lg:col-span-2">
            {latest ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><HealthBadge health={latest.health} /><span className="text-xs text-muted-foreground">{fmtDate(latest.date)} · {latest.author}</span></div>
                <p>{latest.summary}</p>
                {latest.blockers && <div><div className="text-xs font-medium text-muted-foreground">Blockers</div><pre className="font-sans text-sm whitespace-pre-wrap">{latest.blockers}</pre></div>}
                {latest.nextSteps && <div><div className="text-xs font-medium text-muted-foreground">Next steps</div><pre className="font-sans text-sm whitespace-pre-wrap">{latest.nextSteps}</pre></div>}
              </div>
            ) : <p className="text-sm text-muted-foreground">No updates yet.</p>}
          </Card>

          <Card title="Hiring (from HR)" action={<Link to="/hr" className="text-xs text-muted-foreground hover:text-foreground">Open pipeline →</Link>}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Open headcount</span><b>{headcount}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Hired</span><b>{hired}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">In pipeline</span><b>{inFlight}</b></div>
              <Progress value={headcount ? (hired / headcount) * 100 : 0} tone="bg-emerald-500" />
              <div className="pt-1 text-xs text-muted-foreground">{positions.length} positions · same data HR works with</div>
            </div>
          </Card>

          <Card title="Work by stage">
            <div className="space-y-2">
              {project.pmStages.map((st) => {
                const n = tasks.filter((t) => t.stage === st.id).length
                return (
                  <div key={st.id} className="flex items-center gap-2 text-sm">
                    <span className={cn('size-2 rounded-full', stageDot(st))} />
                    <span className="w-24 truncate">{st.label}</span>
                    <div className="flex-1"><Progress value={tasks.length ? (n / tasks.length) * 100 : 0} tone={stageDot(st)} /></div>
                    <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">{n}</span>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Upcoming milestones" action={<Link to="/pm/timeline" className="text-xs text-muted-foreground hover:text-foreground">Timeline →</Link>}>
            <div className="space-y-2">
              {upcoming.map((m) => {
                const d = daysBetween(today, m.date)
                return (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{m.title}</span>
                    <span className={cn('text-xs tabular-nums', d < 0 ? 'text-red-600' : 'text-muted-foreground')}>{fmtDate(m.date)} · {d < 0 ? `${-d}d late` : `in ${d}d`}</span>
                  </div>
                )
              })}
              {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nothing upcoming.</p>}
            </div>
          </Card>

          <Card title="Top risks" action={<Link to="/pm/risks" className="text-xs text-muted-foreground hover:text-foreground">Register →</Link>}>
            <div className="space-y-2">
              {topRisks.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm">
                  <span className={cn('grid size-6 shrink-0 place-items-center rounded text-xs font-semibold', riskTone(riskScore(r.probability, r.impact)))}>{riskScore(r.probability, r.impact)}</span>
                  <span className="flex-1 truncate">{r.title}</span>
                </div>
              ))}
              {topRisks.length === 0 && <p className="text-sm text-muted-foreground">No open risks.</p>}
            </div>
          </Card>
        </div>

        {overdue.length > 0 && (
          <Card title={`Overdue tasks (${overdue.length})`}>
            <div className="divide-y">
              {overdue.map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="flex-1">{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                  <span className="w-24 text-xs text-muted-foreground">{t.assignee || 'Unassigned'}</span>
                  <span className="w-20 text-right text-xs text-red-600">{fmtDate(t.dueDate)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
