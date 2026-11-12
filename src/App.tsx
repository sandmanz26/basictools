import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
const PortfolioPage = lazy(() => import('@/pages/PortfolioPage'))
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const SharePage = lazy(() => import('@/pages/SharePage'))
const PipelinePage = lazy(() => import('@/pages/hr/PipelinePage'))
const TalentPage = lazy(() => import('@/pages/hr/TalentPage'))
const PositionsPage = lazy(() => import('@/pages/hr/PositionsPage'))
const SharingPage = lazy(() => import('@/pages/hr/SharingPage'))
const PipelineSettingsPage = lazy(() => import('@/pages/hr/PipelineSettingsPage'))
const PmOverview = lazy(() => import('@/pages/pm/PmOverview'))
const PmProjects = lazy(() => import('@/pages/pm/PmProjects'))
const PmInvoices = lazy(() => import('@/pages/pm/PmInvoices'))
const PmBilling = lazy(() => import('@/pages/pm/PmBilling'))
const PmInfo = lazy(() => import('@/pages/pm/PmInfo'))
const PmBoard = lazy(() => import('@/pages/pm/PmBoard'))
const PmTimeline = lazy(() => import('@/pages/pm/PmTimeline'))
const PmRisks = lazy(() => import('@/pages/pm/PmRisks'))
const PmTeam = lazy(() => import('@/pages/pm/PmTeam'))
const PmBudget = lazy(() => import('@/pages/pm/PmBudget'))
const PmUpdates = lazy(() => import('@/pages/pm/PmUpdates'))
const PmSettings = lazy(() => import('@/pages/pm/PmSettings'))
const MktPipeline = lazy(() => import('@/pages/mkt/MktPipeline'))
const MktEmail = lazy(() => import('@/pages/mkt/MktEmail'))
const MktBroadcast = lazy(() => import('@/pages/mkt/MktBroadcast'))
const MktSettings = lazy(() => import('@/pages/mkt/MktSettings'))
const MktTest = lazy(() => import('@/pages/mkt/MktTest'))
const MktMeetings = lazy(() => import('@/pages/mkt/MktMeetings'))
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
import { useAuth, useSessionUser } from '@/auth'
import { useStore, useCan } from '@/store'
import { Locked } from '@/components/Locked'
import { canOpen, homeFor } from '@/lib/access'
import type { PmFeature } from '@/types'

/** Everything except login/register/share links needs a valid session. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useSessionUser()
  const hasSession = useAuth((s) => !!s.session)
  const logout = useAuth((s) => s.logout)
  const loc = useLocation()
  // Expired session, or the account was disabled/deleted: clear it.
  useEffect(() => { if (hasSession && !user) logout() }, [hasSession, user, logout])
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

/** Locks the page (shows <Locked/>) when the role can't open this route. Rules live in lib/access.ts. */
function Gate({ children }: { children: React.ReactNode }) {
  const can = useCan()
  const { pathname } = useLocation()
  return canOpen(can, pathname) ? <>{children}</> : <Locked />
}

/** Land on the first page the role may open. */
function Home() {
  const can = useCan()
  return <Navigate to={homeFor(can)} replace />
}

/** Optional PM tools only open when the active project has them switched on. */
function Feature({ id, children }: { id: PmFeature | 'any'; children: React.ReactNode }) {
  const f = useStore((s) => (s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0])?.pmFeatures)
  const on = !!f && (id === 'any' ? Object.values(f).some(Boolean) : f[id])
  return on ? <>{children}</> : <Navigate to="/pm" replace />
}

export default function App() {
  return (
    <ErrorBoundary>
    <TooltipProvider>
      <BrowserRouter>
        <Suspense fallback={<div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>}>
        <Routes>
          <Route path="/s/:token" element={<SharePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route element={<Gate><Outlet /></Gate>}>
            <Route index element={<Home />} />
            <Route path="projects" element={<PortfolioPage />} />
            <Route path="projects/manage" element={<ProjectsPage />} />

            <Route path="hr" element={<PipelinePage />} />
            <Route path="hr/talent" element={<TalentPage />} />
            <Route path="hr/positions" element={<PositionsPage />} />
            <Route path="hr/sharing" element={<SharingPage />} />
            <Route path="hr/settings" element={<PipelineSettingsPage />} />

            <Route path="pm" element={<PmProjects />} />
            <Route path="pm/dashboard" element={<Feature id="any"><PmOverview /></Feature>} />
            <Route path="pm/info" element={<PmInfo />} />
            <Route path="pm/billing" element={<PmBilling />} />
            <Route path="pm/invoices" element={<PmInvoices />} />
            <Route path="pm/updates" element={<Feature id="updates"><PmUpdates /></Feature>} />
            <Route path="pm/board" element={<Feature id="board"><PmBoard /></Feature>} />
            <Route path="pm/timeline" element={<Feature id="timeline"><PmTimeline /></Feature>} />
            <Route path="pm/risks" element={<Feature id="risks"><PmRisks /></Feature>} />
            <Route path="pm/team" element={<Feature id="team"><PmTeam /></Feature>} />
            <Route path="pm/budget" element={<Feature id="budget"><PmBudget /></Feature>} />
            <Route path="pm/settings" element={<PmSettings />} />

            <Route path="mkt" element={<MktPipeline />} />
            <Route path="mkt/email" element={<MktEmail />} />
            <Route path="mkt/broadcast" element={<MktBroadcast />} />
            <Route path="mkt/settings" element={<MktSettings />} />
            <Route path="mkt/test" element={<MktTest />} />
            <Route path="mkt/meetings" element={<MktMeetings />} />

            </Route>
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
    </ErrorBoundary>
  )
}
