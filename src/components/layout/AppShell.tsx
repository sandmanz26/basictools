import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BriefcaseBusiness, CalendarRange, ClipboardList, FolderCog, FolderKanban, Gauge, Info, LayoutGrid, Link2, LogOut,
  BellRing, CalendarCheck, CalendarClock, ChartGantt, Crown, FlaskConical, Lock, TriangleAlert, Mail, Megaphone, Receipt, Send, Settings, ShieldAlert, SlidersHorizontal, SquareKanban, UserSearch, Users, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCan, useCurrentUser, useStore } from '@/store'
import { useAutoDrafts, useBillingAlerts } from '@/lib/alerts'
import { useBroadcastAutoResume } from '@/lib/broadcast'
import { useStorageFailed } from '@/lib/safeStorage'
import { useAuth } from '@/auth'
import { useApiStatus } from '@/api/status'
import { canOpen } from '@/lib/access'
import { NativeSelect } from '@/components/NativeSelect'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Permission, PmFeature } from '@/types'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; feature?: PmFeature | 'any' }
interface Module {
  id: 'projects' | 'hr' | 'pm' | 'mkt'
  icon: LucideIcon // first-layer rail shows an icon only; the title is the tooltip
  title: string
  base: string
  perm: Permission | null
  needsProject: boolean
  sections: { label: string; items: NavItem[] }[]
}

export const MODULES: Module[] = [
  {
    id: 'projects', icon: Crown, title: 'Projects', base: '/projects', perm: null, needsProject: false,
    sections: [
      { label: 'Overview', items: [{ to: '/projects', label: 'Portfolio', icon: LayoutGrid, end: true }] },
      { label: 'Management', items: [{ to: '/projects/manage', label: 'Manage projects', icon: FolderCog }] },
    ],
  },
  {
    id: 'hr', icon: UserSearch, title: 'Hiring (HR)', base: '/hr', perm: 'module.hr', needsProject: true,
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
    id: 'pm', icon: SquareKanban, title: 'Project Management', base: '/pm', perm: 'module.pm', needsProject: true,
    sections: [
      { label: 'Overview', items: [
        { to: '/pm', label: 'All projects', icon: LayoutGrid, end: true },
        { to: '/pm/billing', label: 'Billing & reminders', icon: BellRing },
      ] },
      { label: 'Selected project', items: [
        { to: '/pm/info', label: 'Project info', icon: Info },
        { to: '/pm/progress', label: 'Progress timeline', icon: ChartGantt },
        { to: '/pm/meetings', label: 'Meetings', icon: CalendarClock },
        { to: '/pm/invoices', label: 'Invoices', icon: Receipt },
        { to: '/pm/dashboard', label: 'Dashboard', icon: Gauge, feature: 'any' },
        { to: '/pm/updates', label: 'Status updates', icon: Megaphone, feature: 'updates' },
        { to: '/pm/board', label: 'Work board', icon: ClipboardList, feature: 'board' },
        { to: '/pm/timeline', label: 'Timeline', icon: CalendarRange, feature: 'timeline' },
        { to: '/pm/risks', label: 'Risks & issues', icon: ShieldAlert, feature: 'risks' },
        { to: '/pm/team', label: 'Team', icon: UsersRound, feature: 'team' },
        { to: '/pm/budget', label: 'Budget', icon: Wallet, feature: 'budget' },
      ] },
      { label: 'Management', items: [{ to: '/pm/settings', label: 'PM settings', icon: SlidersHorizontal }] },
    ],
  },
  {
    id: 'mkt', icon: Megaphone, title: 'Marketing', base: '/mkt', perm: 'module.mkt', needsProject: false,
    sections: [
      { label: 'Sales', items: [
        { to: '/mkt', label: 'Lead pipeline', icon: FolderKanban, end: true },
        { to: '/mkt/email', label: 'Email outreach', icon: Mail },
        { to: '/mkt/broadcast', label: 'Broadcast', icon: Send },
        { to: '/mkt/meetings', label: 'Meetings & follow-up', icon: CalendarCheck },
      ] },
      { label: 'Management', items: [{ to: '/mkt/settings', label: 'Microsoft & stages', icon: SlidersHorizontal }, { to: '/mkt/test', label: 'Microsoft test lab', icon: FlaskConical }] },
    ],
  },
]

/** Label that appears to the right of a rail button on hover or keyboard focus. */
function RailTip({ label, children }: { label: React.ReactNode; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  const can = useCan()
  const { projects, activeProjectId, setProject } = useStore()
  const logout = useAuth((s) => s.logout)
  const { user, role } = useCurrentUser()
  const billingAlerts = useBillingAlerts()
  useAutoDrafts(can('pm.invoice'))
  useBroadcastAutoResume()
  const storageFailed = useStorageFailed()
  const syncError = useApiStatus((s) => s.error)
  const current = MODULES.find((m) => pathname === m.base || pathname.startsWith(m.base + '/'))
  // Every module stays in the rail; the ones this role can't open are shown locked.
  const locked = (path: string) => !canOpen(can, path)
  const features = (projects.find((p) => p.id === activeProjectId) ?? projects[0])?.pmFeatures
  const shown = (n: NavItem) => !n.feature || (n.feature === 'any' ? !!features && Object.values(features).some(Boolean) : !!features?.[n.feature])
  const sections = (current?.sections ?? []).map((sec) => ({ ...sec, items: sec.items.filter(shown) })).filter((sec) => sec.items.length)
  const initials = user.name.split(/[\s(]/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Layer 1: modules */}
      <aside className="flex w-14 shrink-0 flex-col items-center border-r bg-background py-3">
        <RailTip label="HireFlow">
          <div className="mb-3 grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FolderKanban className="size-4" />
          </div>
        </RailTip>
        <div className="mb-3 h-px w-6 bg-border" />
        <div className="flex flex-col gap-1.5">
          {MODULES.map((m) => (
            <RailTip key={m.id} label={<>{m.title}{locked(m.base) && ' (locked)'}{m.id === 'pm' && billingAlerts > 0 && ` · ${billingAlerts} billing item${billingAlerts === 1 ? '' : 's'} need action`}</>}>
              <button
                aria-label={m.title}
                onClick={() => nav(m.base)}
                className={cn(
                  'relative grid size-9 place-items-center rounded-lg transition-colors',
                  current?.id === m.id ? 'bg-primary/10 text-foreground ring-2 ring-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  locked(m.base) && 'opacity-50',
                )}
              >
                <m.icon className="size-[18px]" />
                {locked(m.base) && <Lock className="absolute -right-1 -bottom-1 size-3 rounded-full bg-background p-0.5 text-muted-foreground ring-1 ring-border" />}
                {m.id === 'pm' && billingAlerts > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-semibold text-white">{billingAlerts}</span>
                )}
              </button>
            </RailTip>
          ))}
        </div>
        <div className="mt-auto flex flex-col items-center gap-2">
          <RailTip label="Roles & Settings">
            <NavLink to="/settings" aria-label="Roles & Settings" className={({ isActive }) => cn('grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted', isActive && 'bg-muted text-foreground')}>
              <Settings className="size-[18px]" />
            </NavLink>
          </RailTip>
          <div className="my-1 h-px w-6 bg-border" />
          <DropdownMenu>
            <RailTip label={<>{user.name} · {role.name}</>}>
              <DropdownMenuTrigger render={<button aria-label={`Account menu for ${user.name}`} className="grid size-9 place-items-center rounded-full bg-muted text-xs font-semibold hover:bg-muted/70" />}>
                {initials}
              </DropdownMenuTrigger>
            </RailTip>
            <DropdownMenuContent side="right" align="end" className="min-w-56">
              <div className="px-2 py-1.5">
                <div className="text-sm font-medium">{user.name}</div>
                <div className="text-xs text-muted-foreground">{user.email} · {role.name}</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => nav('/settings?tab=account')}><Settings /> Account & password</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { logout(); nav('/login', { replace: true }) }}><LogOut /> Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            {sections.map((sec) => (
              <div key={sec.label} className="space-y-1">
                <div className="px-2 pb-1 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{sec.label}</div>
                {sec.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', locked(n.to) && 'opacity-60', isActive && 'bg-muted font-medium text-foreground')
                    }
                  >
                    <n.icon className="size-4" /> {n.label}
                    {locked(n.to) && <Lock className="ml-auto size-3.5 opacity-60" />}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">Mock data · stored in this browser</div>
        </aside>
      )}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {storageFailed && (
          <div role="alert" className="flex items-center gap-2 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <TriangleAlert className="size-4 shrink-0" />
            <span><b>Your browser storage is full or blocked.</b> Recent changes are not being saved and will be lost on reload. Export what you need (CSV) now; large lists need the server database.</span>
          </div>
        )}
        {syncError && (
          <div role="alert" className="flex items-center gap-2 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">{syncError}</span>
            <button type="button" onClick={() => useApiStatus.getState().clear()} className="rounded px-2 py-0.5 text-xs font-medium underline underline-offset-4">Dismiss</button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden"><Outlet /></div>
      </main>
    </div>
  )
}
