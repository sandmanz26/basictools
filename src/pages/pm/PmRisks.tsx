import { Fragment } from 'react'
import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectCell, TextCell } from '@/components/pipeline/cells'
import { Card, PageHeader, th, td, pageCls, usePm } from '@/components/pm/ui'
import { riskScore, riskTone, todayStr } from '@/lib/pm'
import { cn } from '@/lib/utils'
import type { Risk } from '@/types'

const levels = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))
const KIND = [{ value: 'risk', label: 'Risk' }, { value: 'issue', label: 'Issue' }]
const STATUS = [{ value: 'open', label: 'Open' }, { value: 'mitigating', label: 'Mitigating' }, { value: 'closed', label: 'Closed' }]
const STATUS_TONE: Record<Risk['status'], string> = {
  open: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  mitigating: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  closed: 'bg-muted text-muted-foreground',
}

export default function PmRisks() {
  const { s, project, risks, canEdit } = usePm()
  const upd = (id: string, p: Partial<Risk>) => s.pmUpdate('risks', id, p)
  const live = risks.filter((r) => r.status !== 'closed')
  const sorted = [...risks].sort((a, b) => (a.status === 'closed' ? 1 : 0) - (b.status === 'closed' ? 1 : 0) || riskScore(b.probability, b.impact) - riskScore(a.probability, a.impact))

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title="Risks & issues"
          desc="Risks may happen; issues already did. Score = probability × impact (1–25)."
          actions={canEdit && <Button onClick={() => s.pmAdd('risks', { id: 'r-' + nanoid(5), projectId: project.id, kind: 'risk', title: 'New risk', probability: 3, impact: 3, status: 'open', owner: '', mitigation: '', dueDate: todayStr() })}><Plus /> Add</Button>}
        />

        <Card title="Heat map (open items)">
          <div className="flex items-end gap-4">
            <div className="grid grid-cols-[auto_repeat(5,2.75rem)] items-center gap-1 text-xs">
              {[5, 4, 3, 2, 1].map((p) => (
                <Fragment key={'row' + p}>
                  <div className="pr-1 text-right text-muted-foreground">P{p}</div>
                  {[1, 2, 3, 4, 5].map((i) => {
                    const n = live.filter((r) => r.probability === p && r.impact === i).length
                    return <div key={p + '-' + i} className={cn('grid h-9 place-items-center rounded font-semibold', riskTone(p * i), n === 0 && 'opacity-40')}>{n || ''}</div>
                  })}
                </Fragment>
              ))}
              <div />
              {[1, 2, 3, 4, 5].map((i) => <div key={'i' + i} className="text-center text-muted-foreground">I{i}</div>)}
            </div>
            <div className="space-y-1 pb-6 text-sm text-muted-foreground">
              <div><b className="text-foreground">{live.length}</b> open · <b className="text-foreground">{live.filter((r) => riskScore(r.probability, r.impact) >= 12).length}</b> high severity</div>
              <div>{risks.filter((r) => r.kind === 'issue' && r.status !== 'closed').length} open issues</div>
            </div>
          </div>
        </Card>

        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={cn(th, 'w-24')}>Type</th><th className={cn(th, 'w-72')}>Title</th><th className={cn(th, 'w-16')}>Prob.</th><th className={cn(th, 'w-16')}>Impact</th><th className={cn(th, 'w-16 text-center')}>Score</th>
                <th className={cn(th, 'w-32')}>Status</th><th className={cn(th, 'w-32')}>Owner</th><th className={cn(th, 'w-96')}>Mitigation / action</th><th className={cn(th, 'w-32')}>Due</th><th className="w-10 border-b bg-muted" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const sc = riskScore(r.probability, r.impact)
                return (
                  <tr key={r.id} className={cn('hover:bg-muted/30', r.status === 'closed' && 'opacity-50')}>
                    <td className={td}><SelectCell value={r.kind} options={KIND} readOnly={!canEdit} onChange={(v) => upd(r.id, { kind: v as Risk['kind'] })} /></td>
                    <td className={td}><TextCell value={r.title} readOnly={!canEdit} className="font-medium" onCommit={(v) => upd(r.id, { title: v })} /></td>
                    <td className={td}><SelectCell value={String(r.probability)} options={levels} readOnly={!canEdit} onChange={(v) => upd(r.id, { probability: Number(v) })} /></td>
                    <td className={td}><SelectCell value={String(r.impact)} options={levels} readOnly={!canEdit} onChange={(v) => upd(r.id, { impact: Number(v) })} /></td>
                    <td className={cn(td, 'text-center')}><span className={cn('inline-grid size-7 place-items-center rounded text-xs font-semibold', riskTone(sc))}>{sc}</span></td>
                    <td className={td}><SelectCell value={r.status} options={STATUS} readOnly={!canEdit} tone={STATUS_TONE[r.status]} onChange={(v) => upd(r.id, { status: v as Risk['status'] })} /></td>
                    <td className={td}><TextCell value={r.owner} readOnly={!canEdit} onCommit={(v) => upd(r.id, { owner: v })} /></td>
                    <td className={td}><TextCell value={r.mitigation} readOnly={!canEdit} placeholder="How will we reduce or fix this?" onCommit={(v) => upd(r.id, { mitigation: v })} /></td>
                    <td className={td}><TextCell type="date" value={r.dueDate} readOnly={!canEdit} onCommit={(v) => upd(r.id, { dueDate: v })} /></td>
                    <td className="border-b p-0 text-center">{canEdit && <Button variant="ghost" size="icon-xs" onClick={() => s.pmDelete('risks', r.id)}><Trash2 className="text-destructive" /></Button>}</td>
                  </tr>
                )
              })}
              {risks.length === 0 && <tr><td colSpan={10} className="py-12 text-center text-sm text-muted-foreground">Nothing logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
