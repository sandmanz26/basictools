import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberCell, TextCell } from '@/components/pipeline/cells'
import { Card, PageHeader, Progress, th, td, pageCls, usePm } from '@/components/pm/ui'
import { money } from '@/lib/pm'
import { cn } from '@/lib/utils'
import type { BudgetItem } from '@/types'

const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n)

export default function PmBudget() {
  const { s, project, info, budget, canEdit } = usePm()
  const upd = (id: string, p: Partial<BudgetItem>) => s.pmUpdate('budget', id, p)
  const planned = budget.reduce((a, b) => a + b.planned, 0)
  const actual = budget.reduce((a, b) => a + b.actual, 0)
  const cap = info.budget ?? planned
  const cats = [...new Set(budget.map((b) => b.category))]

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader
          title="Budget"
          desc="Planned vs actual spend by category. The approved total is set in Project info."
          actions={canEdit && <Button onClick={() => s.pmAdd('budget', { id: 'b-' + nanoid(5), projectId: project.id, category: 'General', description: 'New line', planned: 0, actual: 0 })}><Plus /> Add line</Button>}
        />

        <div className="grid gap-3 sm:grid-cols-4">
          <Card><div className="text-xs text-muted-foreground">Approved budget</div><div className="mt-1 text-xl font-semibold">{money(info.budget)}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Planned (allocated)</div><div className="mt-1 text-xl font-semibold">{money(planned)}</div><div className="text-xs text-muted-foreground">{info.budget ? `${money(info.budget - planned)} unallocated` : ''}</div></Card>
          <Card><div className="text-xs text-muted-foreground">Actual spent</div><div className="mt-1 text-xl font-semibold">{money(actual)}</div><div className="text-xs text-muted-foreground">{cap ? Math.round((actual / cap) * 100) : 0}% of budget</div></Card>
          <Card><div className="text-xs text-muted-foreground">Remaining</div><div className={cn('mt-1 text-xl font-semibold', cap - actual < 0 && 'text-red-600')}>{money(cap - actual)}</div></Card>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead><tr><th className={cn(th, 'w-40')}>Category</th><th className={cn(th, 'w-80')}>Description</th><th className={cn(th, 'w-44 text-right')}>Planned (IDR)</th><th className={cn(th, 'w-44 text-right')}>Actual (IDR)</th><th className={cn(th, 'w-44 text-right')}>Variance</th><th className={cn(th, 'w-40')}>Used</th><th className="w-10 border-b bg-muted" /></tr></thead>
            <tbody>
              {budget.map((b) => {
                const used = b.planned ? (b.actual / b.planned) * 100 : 0
                const v = b.planned - b.actual
                return (
                  <tr key={b.id} className="hover:bg-muted/30">
                    <td className={td}><TextCell value={b.category} readOnly={!canEdit} className="font-medium" onCommit={(x) => upd(b.id, { category: x })} /></td>
                    <td className={td}><TextCell value={b.description} readOnly={!canEdit} onCommit={(x) => upd(b.id, { description: x })} /></td>
                    <td className={td}><NumberCell value={b.planned} readOnly={!canEdit} format={fmt} onCommit={(x) => upd(b.id, { planned: x ?? 0 })} /></td>
                    <td className={td}><NumberCell value={b.actual} readOnly={!canEdit} format={fmt} onCommit={(x) => upd(b.id, { actual: x ?? 0 })} /></td>
                    <td className={cn(td, 'px-2 text-right tabular-nums', v < 0 && 'text-red-600')}>{fmt(v)}</td>
                    <td className={cn(td, 'px-2')}><Progress value={used} tone={used > 100 ? 'bg-red-500' : used > 80 ? 'bg-amber-500' : 'bg-emerald-500'} /></td>
                    <td className="border-b p-0 text-center">{canEdit && <Button variant="ghost" size="icon-xs" onClick={() => s.pmDelete('budget', b.id)}><Trash2 className="text-destructive" /></Button>}</td>
                  </tr>
                )
              })}
              <tr className="bg-muted/40 font-medium"><td className="px-2 py-2" colSpan={2}>Total</td><td className="px-2 py-2 text-right tabular-nums">{fmt(planned)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(actual)}</td><td className="px-2 py-2 text-right tabular-nums">{fmt(planned - actual)}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        </div>

        {cats.length > 0 && (
          <Card title="By category">
            <div className="space-y-2">
              {cats.map((c) => {
                const p = budget.filter((b) => b.category === c).reduce((a, b) => a + b.planned, 0)
                const a = budget.filter((b) => b.category === c).reduce((x, b) => x + b.actual, 0)
                return (
                  <div key={c} className="grid items-center gap-3 sm:grid-cols-[10rem_1fr_14rem]">
                    <span className="text-sm">{c}</span>
                    <Progress value={p ? (a / p) * 100 : 0} tone="bg-sky-500" />
                    <span className="text-xs text-muted-foreground">{money(a)} of {money(p)}</span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
