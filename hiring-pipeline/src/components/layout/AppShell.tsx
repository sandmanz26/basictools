import { NavLink, Outlet } from 'react-router-dom'
import { BriefcaseBusiness, FolderCog, FolderKanban, Link2, Settings, UserRoundCog } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentUser, useStore } from '@/store'
import { NativeSelect } from '@/components/NativeSelect'

const nav = [
  { to: '/', label: 'Pipeline', icon: FolderKanban, end: true },
  { to: '/projects', label: 'Projects & Pipeline', icon: FolderCog },
  { to: '/positions', label: 'Positions & Tests', icon: BriefcaseBusiness },
  { to: '/sharing', label: 'Share links', icon: Link2 },
  { to: '/settings', label: 'Roles & Settings', icon: Settings },
]

export function AppShell() {
  const { projects, activeProjectId, setProject, users, setUser, currentUserId } = useStore()
  const { role } = useCurrentUser()
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar p-3">
        <div className="mb-4 flex items-center gap-2 px-1 pt-1">
          <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground"><FolderKanban className="size-4" /></div>
          <span className="font-semibold tracking-tight">HireFlow</span>
        </div>
        <div className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Project</div>
        <NativeSelect
          className="mb-4 w-full"
          value={activeProjectId}
          onChange={setProject}
          options={projects.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }))}
        />
        <nav className="flex flex-col gap-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn('flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-sidebar-accent', isActive && 'bg-sidebar-accent font-medium')
              }
            >
              <n.icon className="size-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-1.5 rounded-lg border bg-background p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <UserRoundCog className="size-3.5" /> Viewing as
          </div>
          <NativeSelect className="w-full" value={currentUserId} onChange={setUser} options={users.map((u) => ({ value: u.id, label: u.name }))} />
          <div className="text-xs text-muted-foreground">Role: {role.name}</div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden"><Outlet /></main>
    </div>
  )
}
