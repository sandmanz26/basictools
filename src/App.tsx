import { useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import PortfolioPage from '@/pages/PortfolioPage'
import ProjectsPage from '@/pages/ProjectsPage'
import SettingsPage from '@/pages/SettingsPage'
import SharePage from '@/pages/SharePage'
import PipelinePage from '@/pages/hr/PipelinePage'
import TalentPage from '@/pages/hr/TalentPage'
import PositionsPage from '@/pages/hr/PositionsPage'
import SharingPage from '@/pages/hr/SharingPage'
import PipelineSettingsPage from '@/pages/hr/PipelineSettingsPage'
import PmOverview from '@/pages/pm/PmOverview'
import PmProjects from '@/pages/pm/PmProjects'
import PmInvoices from '@/pages/pm/PmInvoices'
import PmBilling from '@/pages/pm/PmBilling'
import PmInfo from '@/pages/pm/PmInfo'
import PmBoard from '@/pages/pm/PmBoard'
import PmTimeline from '@/pages/pm/PmTimeline'
import PmRisks from '@/pages/pm/PmRisks'
import PmTeam from '@/pages/pm/PmTeam'
import PmBudget from '@/pages/pm/PmBudget'
import PmUpdates from '@/pages/pm/PmUpdates'
import PmSettings from '@/pages/pm/PmSettings'
import MktPipeline from '@/pages/mkt/MktPipeline'
import MktEmail from '@/pages/mkt/MktEmail'
import MktBroadcast from '@/pages/mkt/MktBroadcast'
import MktSettings from '@/pages/mkt/MktSettings'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
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
    <TooltipProvider>
      <BrowserRouter>
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

            </Route>
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
