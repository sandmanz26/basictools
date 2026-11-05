import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BriefcaseBusiness, CalendarRange, ClipboardList, FolderCog, FolderKanban, Gauge, Info, LayoutGrid, Link2, LogOut,
  Mail, Megaphone, Settings, ShieldAlert, SlidersHorizontal, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCan, useCurrentUser, useStore } from '@/store'
import { NativeSelect } from '@/components/NativeSelect'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Permission } from '@/types'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
interface Module {
  id: 'projects' | 'hr' | 'pm' | 'mkt'
  short: string
  title: string
  base: string
  perm: Permission | null
  needsProject: boolean
  sections: { label: string; items: NavItem[] }[]
}

export const MODULES: Module[] = [
  {
    id: 'projects', short: 'PRJ', title: 'Projects', base: '/projects', perm: null, needsProject: false,
    sections: [
      { label: 'Overview', items: [{ to: '/projects', label: 'Portfolio', icon: LayoutGrid, end: true }] },
      { label: 'Management', items: [{ to: '/projects/manage', label: 'Manage projects', icon: FolderCog }] },
    ],
  },
  {
    id: 'hr', short: 'HR', title: 'Hiring (HR)', base: '/hr', perm: 'module.hr', needsProject: true,
    sections: [
      { label: 'Recruitment', items: [
        { to: '/hr', label: 'Pipeline', icon: FolderKanban, end: true },
        { to: '/hr/talent', label: 'Talent Pool', icon: Users },
        { to: '/hr/positions', label: 'Positions & Tests', icon: BriefcaseBusiness },
      ] },
      { label: 'Management', items: [
        { to: '/hr/sharing', label: 'Share links', icon: Link2 },
        { to: '/hr/settings', label: 'Pipeline settings', icon: SlidersHorizontal },
      ] },
    ],
  },
  {
    id: 'pm', short: 'PM', title: 'Project Management', base: '/pm', perm: 'module.pm', needsProject: true,
    sections: [
      { label: 'Overview', items: [
        { to: '/pm', label: 'Dashboard', icon: Gauge, end: true },
        { to: '/pm/info', label: 'Project info', icon: Info },
        { to: '/pm/updates', label: 'Status updates', icon: Megaphone },
      ] },
      { label: 'Delivery', items: [
        { to: '/pm/board', label: 'Work board', icon: ClipboardList },
        { to: '/pm/timeline', label: 'Timeline', icon: CalendarRange },
        { to: '/pm/risks', label: 'Risks & issues', icon: ShieldAlert },
      ] },
      { label: 'Resources', items: [
        { to: '/pm/team', label: 'Team', icon: UsersRound },
        { to: '/pm/budget', label: 'Budget', icon: Wallet },
      ] },
      { label: 'Management', items: [{ to: '/pm/settings', label: 'Workflow settings', icon: SlidersHorizontal }] },
    ],
  },
  {
    id: 'mkt', short: 'MKT', title: 'Marketing', base: '/mkt', perm: 'module.mkt', needsProject: false,
    sections: [
      { label: 'Sales', items: [
        { to: '/mkt', label: 'Lead pipeline', icon: FolderKanban, end: true },
        { to: '/mkt/email', label: 'Email outreach', icon: Mail },
      ] },
      { label: 'Management', items: [{ to: '/mkt/settings', label: 'Microsoft & stages', icon: SlidersHorizontal }] },
    ],
  },
]

export function AppShell() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const can = useCan()
  const { projects, activeProjectId, setProject, users, setUser, currentUserId } = useStore()
  const { user, role } = useCurrentUser()
  const current = MODULES.find((m) => pathname === m.base || pathname.startsWith(m.base + '/'))
  const visible = MODULES.filter((m) => !m.perm || can(m.perm))
  const initials = user.name.split(/[\s(]/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Layer 1: modules */}
      <aside className="flex w-[76px] shrink-0 flex-col items-center border-r bg-background py-3">
        <div className="mb-3 grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground" title="HireFlow">
          <FolderKanban className="size-5" />
        </div>
        <div className="mb-3 h-px w-8 bg-border" />
        <div className="flex flex-col gap-2">
          {visible.map((m) => (
            <button
              key={m.id}
              title={m.title}
              onClick={() => nav(m.base)}
              className={cn(
                'grid h-11 w-12 place-items-center rounded-xl text-[13px] font-bold transition-colors',
                current?.id === m.id ? 'bg-primary/10 text-foreground ring-2 ring-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {m.short}
            </button>
          ))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-2">
          <NavLink to="/settings" title="Roles & Settings" className={({ isActive }) => cn('grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted', isActive && 'bg-muted text-foreground')}>
            <Settings className="size-5" />
          </NavLink>
          <div className="my-1 h-px w-8 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger render={<button title={`${user.name} · ${role.name}`} className="grid size-11 place-items-center rounded-full bg-muted text-sm font-semibold hover:bg-muted/70" />}>
              {initials}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="min-w-56">
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Viewing as · {role.name}</div>
              <DropdownMenuRadioGroup value={currentUserId} onValueChange={(v) => setUser(v as string)}>
                {users.map((u) => (
                  <DropdownMenuRadioItem key={u.id} value={u.id}>{u.name}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <LogOut className="hidden" />
        </div>
      </aside>

      {/* Layer 2: pages of the selected module */}
      {current && (
        <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
          <div className="border-b px-4 py-4">
            <div className="text-[15px] font-semibold tracking-tight">{current.title}</div>
            {current.needsProject && (
              <NativeSelect
                className="mt-2 w-full"
                value={activeProjectId}
                onChange={setProject}
                options={projects.filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }))}
              />
            )}
          </div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
            {current.sections.map((sec) => (
              <div key={sec.label} className="space-y-1">
                <div className="px-2 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{sec.label}</div>
                {sec.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', isActive && 'bg-muted font-medium text-foreground')
                    }
                  >
                    <n.icon className="size-4" /> {n.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">Mock data · stored in this browser</div>
        </aside>
      )}
      <main className="min-w-0 flex-1 overflow-hidden"><Outlet /></main>
    </div>
  )
}
