import { Link } from 'react-router-dom'
import { Card, HealthBadge, PageHeader, Progress, PriorityBadge, pageCls } from '@/components/pm/ui'
import { useStore } from '@/store'
import { PHASES, money } from '@/lib/pm'
import { fmtDate } from '@/lib/constants'

/** All projects at a glance — the shared view for HR and PM. */
export default function PortfolioPage() {
  const { projects, candidates, positions, tasks, risks, budget, setProject } = useStore()
  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader title="Portfolio" desc="Every project with its delivery health and hiring progress. HR and PM both work from these projects." />
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const doneIds = new Set(p.pmStages.filter((x) => x.type === 'won').map((x) => x.id))
            const pt = tasks.filter((t) => t.projectId === p.id)
            const prog = pt.length ? Math.round((pt.filter((t) => doneIds.has(t.stage)).length / pt.length) * 100) : 0
            const won = new Set(p.stages.filter((x) => x.type === 'won').map((x) => x.id))
            const lost = new Set(p.stages.filter((x) => x.type === 'lost').map((x) => x.id))
            const cs = candidates.filter((c) => c.projectId === p.id && !c.archived)
            const pos = positions.filter((x) => x.projectId === p.id && x.status !== 'closed')
            const headcount = pos.reduce((a, x) => a + x.headcount, 0)
            const hired = cs.filter((c) => won.has(c.stage)).length
            const flight = cs.filter((c) => !won.has(c.stage) && !lost.has(c.stage)).length
            const openRisks = risks.filter((r) => r.projectId === p.id && r.status !== 'closed').length
            const planned = budget.filter((b) => b.projectId === p.id).reduce((a, b) => a + b.planned, 0)
            const actual = budget.filter((b) => b.projectId === p.id).reduce((a, b) => a + b.actual, 0)
            return (
              <Card key={p.id} className={p.status === 'archived' ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{PHASES.find((x) => x.value === p.info.phase)?.label} · PM {p.info.manager || '—'} · {fmtDate(p.info.startDate)} → {fmtDate(p.info.endDate)}</div>
                  </div>
                  <div className="flex items-center gap-2"><PriorityBadge priority={p.info.priority} /><HealthBadge health={p.info.health} /></div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">PM · delivery</div>
                    <div className="flex justify-between text-sm"><span>Progress</span><b>{prog}%</b></div>
                    <Progress value={prog} />
                    <div className="text-xs text-muted-foreground">{pt.length} tasks · {openRisks} open risks · {money(actual)} / {money(planned)}</div>
                  </div>
                  <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                    <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">HR · hiring</div>
                    <div className="flex justify-between text-sm"><span>Hired</span><b>{hired}/{headcount}</b></div>
                    <Progress value={headcount ? (hired / headcount) * 100 : 0} tone="bg-emerald-500" />
                    <div className="text-xs text-muted-foreground">{flight} in pipeline · {cs.length} candidates · {pos.length} positions</div>
                  </div>
                </div>
                <div className="mt-4 flex gap-3 text-sm">
                  <Link className="font-medium underline-offset-4 hover:underline" to="/pm" onClick={() => setProject(p.id)}>Open PM dashboard</Link>
                  <Link className="font-medium underline-offset-4 hover:underline" to="/hr" onClick={() => setProject(p.id)}>Open hiring pipeline</Link>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
