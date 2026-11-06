import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import { useStore, useCan } from '@/store'
import type { Permission, PmFeature } from '@/types'

/** Redirect to the portfolio when the current role can't open a module. */
function Guard({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const can = useCan()
  return can(perm) ? <>{children}</> : <Navigate to="/projects" replace />
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
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/projects" replace />} />
            <Route path="projects" element={<PortfolioPage />} />
            <Route path="projects/manage" element={<ProjectsPage />} />

            <Route path="hr" element={<Guard perm="module.hr"><PipelinePage /></Guard>} />
            <Route path="hr/talent" element={<Guard perm="module.hr"><TalentPage /></Guard>} />
            <Route path="hr/positions" element={<Guard perm="module.hr"><PositionsPage /></Guard>} />
            <Route path="hr/sharing" element={<Guard perm="module.hr"><SharingPage /></Guard>} />
            <Route path="hr/settings" element={<Guard perm="module.hr"><PipelineSettingsPage /></Guard>} />

            <Route path="pm" element={<Guard perm="module.pm"><PmProjects /></Guard>} />
            <Route path="pm/dashboard" element={<Guard perm="module.pm"><Feature id="any"><PmOverview /></Feature></Guard>} />
            <Route path="pm/info" element={<Guard perm="module.pm"><PmInfo /></Guard>} />
            <Route path="pm/billing" element={<Guard perm="module.pm"><PmBilling /></Guard>} />
            <Route path="pm/invoices" element={<Guard perm="module.pm"><PmInvoices /></Guard>} />
            <Route path="pm/updates" element={<Guard perm="module.pm"><Feature id="updates"><PmUpdates /></Feature></Guard>} />
            <Route path="pm/board" element={<Guard perm="module.pm"><Feature id="board"><PmBoard /></Feature></Guard>} />
            <Route path="pm/timeline" element={<Guard perm="module.pm"><Feature id="timeline"><PmTimeline /></Feature></Guard>} />
            <Route path="pm/risks" element={<Guard perm="module.pm"><Feature id="risks"><PmRisks /></Feature></Guard>} />
            <Route path="pm/team" element={<Guard perm="module.pm"><Feature id="team"><PmTeam /></Feature></Guard>} />
            <Route path="pm/budget" element={<Guard perm="module.pm"><Feature id="budget"><PmBudget /></Feature></Guard>} />
            <Route path="pm/settings" element={<Guard perm="module.pm"><PmSettings /></Guard>} />

            <Route path="mkt" element={<Guard perm="module.mkt"><MktPipeline /></Guard>} />
            <Route path="mkt/email" element={<Guard perm="module.mkt"><MktEmail /></Guard>} />
            <Route path="mkt/broadcast" element={<Guard perm="module.mkt"><MktBroadcast /></Guard>} />
            <Route path="mkt/settings" element={<Guard perm="module.mkt"><MktSettings /></Guard>} />

            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
