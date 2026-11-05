import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useCan, useStore } from '@/store'
import { HEALTH, PRIORITY } from '@/lib/pm'
import type { Health, Priority } from '@/types'

/** Everything the PM pages need for the active project. */
export function usePm() {
  const s = useStore()
  const canEdit = useCan()('pm.edit')
  const project = s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0]
  const by = <T extends { projectId: string }>(a: T[]) => a.filter((x) => x.projectId === project.id)
  return {
    s, project, info: project.info, canEdit,
    tasks: by(s.tasks), milestones: by(s.milestones), risks: by(s.risks), members: by(s.members), budget: by(s.budget), updates: by(s.updates),
  }
}

export function PageHeader({ title, desc, actions }: { title: ReactNode; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  const h = HEALTH[health]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', h.tone, className)}>
      <span className={cn('size-1.5 rounded-full', h.dot)} /> {h.label}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', PRIORITY[priority].tone)}>{PRIORITY[priority].label}</span>
}

export function Progress({ value, tone = 'bg-primary' }: { value: number; tone?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1', className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>
)

export const pageCls = 'h-full overflow-y-auto p-6'
export const th = 'border-b border-r bg-muted px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground'
export const td = 'border-b border-r p-0 align-middle'
