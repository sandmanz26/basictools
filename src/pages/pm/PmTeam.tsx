import { nanoid } from 'nanoid'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberCell, TextCell } from '@/components/pipeline/cells'
import { Card, PageHeader, Progress, th, td, pageCls, usePm } from '@/components/pm/ui'
import { cn } from '@/lib/utils'
import type { Member } from '@/types'

export default function PmTeam() {
  const { s, project, members, canEdit } = usePm()
  const upd = (id: string, p: Partial<Member>) => s.pmUpdate('members', id, p)
  const fte = members.reduce((a, m) => a + m.allocation, 0) / 100

  // Hiring data comes straight from HR
  const positions = s.positions.filter((p) => p.projectId === project.id && p.status !== 'draft')
  const wonIds = new Set(project.stages.filter((x) => x.type === 'won').map((x) => x.id))
  const lostIds = new Set(project.stages.filter((x) => x.type === 'lost').map((x) => x.id))
  const cands = s.candidates.filter((c) => c.projectId === project.id && !c.archived)
  const hires = cands.filter((c) => wonIds.has(c.stage))

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title="Team & resources"
          desc={`${members.length} people · ${fte.toFixed(1)} FTE allocated`}
          actions={canEdit && <Button onClick={() => s.pmAdd('members', { id: 'mb-' + nanoid(5), projectId: project.id, name: 'New member', role: '', email: '', allocation: 50, startDate: project.info.startDate, endDate: project.info.endDate })}><Plus /> Add member</Button>}
        />

        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead><tr><th className={cn(th, 'w-48')}>Name</th><th className={cn(th, 'w-48')}>Role</th><th className={cn(th, 'w-56')}>Email</th><th className={cn(th, 'w-24')}>Allocation %</th><th className={cn(th, 'w-32')}>From</th><th className={cn(th, 'w-32')}>To</th><th className={cn(th, 'w-40')}>Load</th><th className="w-10 border-b bg-muted" /></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className={td}><TextCell value={m.name} readOnly={!canEdit} className="font-medium" onCommit={(v) => upd(m.id, { name: v })} /></td>
                  <td className={td}><TextCell value={m.role} readOnly={!canEdit} onCommit={(v) => upd(m.id, { role: v })} /></td>
                  <td className={td}><TextCell value={m.email} readOnly={!canEdit} onCommit={(v) => upd(m.id, { email: v })} /></td>
                  <td className={td}><NumberCell value={m.allocation} readOnly={!canEdit} onCommit={(v) => upd(m.id, { allocation: Math.max(0, Math.min(100, v ?? 0)) })} /></td>
                  <td className={td}><TextCell type="date" value={m.startDate} readOnly={!canEdit} onCommit={(v) => upd(m.id, { startDate: v })} /></td>
                  <td className={td}><TextCell type="date" value={m.endDate} readOnly={!canEdit} onCommit={(v) => upd(m.id, { endDate: v })} /></td>
                  <td className={cn(td, 'px-2')}><Progress value={m.allocation} tone={m.allocation >= 100 ? 'bg-amber-500' : 'bg-primary'} /></td>
                  <td className="border-b p-0 text-center">{canEdit && <Button variant="ghost" size="icon-xs" onClick={() => s.pmDelete('members', m.id)}><Trash2 className="text-destructive" /></Button>}</td>
                </tr>
              ))}
              {members.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">No team members yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <Card title="Hiring plan (shared with HR)" action={<Link to="/hr" className="text-xs text-muted-foreground hover:text-foreground">Open HR pipeline →</Link>}>
          <div className="space-y-3">
            {positions.map((p) => {
              const pc = cands.filter((c) => c.positionId === p.id)
              const hired = pc.filter((c) => wonIds.has(c.stage)).length
              const inFlight = pc.filter((c) => !wonIds.has(c.stage) && !lostIds.has(c.stage)).length
              return (
                <div key={p.id} className="grid items-center gap-3 sm:grid-cols-[14rem_1fr_16rem]">
                  <div><div className="text-sm font-medium">{p.title}</div><div className="text-xs text-muted-foreground">{p.level} · {p.status}</div></div>
                  <Progress value={p.headcount ? (hired / p.headcount) * 100 : 0} tone="bg-emerald-500" />
                  <div className="text-xs text-muted-foreground">{hired}/{p.headcount} hired · {inFlight} in pipeline</div>
                </div>
              )
            })}
            {positions.length === 0 && <p className="text-sm text-muted-foreground">No open positions for this project.</p>}
          </div>
          {hires.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Hired — ready to join the team</div>
              <div className="flex flex-wrap gap-2">
                {hires.map((h) => (
                  <span key={h.id} className="rounded-md border bg-muted/50 px-2 py-1 text-xs">{h.name} · {s.positions.find((p) => p.id === h.positionId)?.title ?? '—'}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
