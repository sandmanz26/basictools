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
import PmInfo from '@/pages/pm/PmInfo'
import PmBoard from '@/pages/pm/PmBoard'
import PmTimeline from '@/pages/pm/PmTimeline'
import PmRisks from '@/pages/pm/PmRisks'
import PmTeam from '@/pages/pm/PmTeam'
import PmBudget from '@/pages/pm/PmBudget'
import PmUpdates from '@/pages/pm/PmUpdates'
import PmSettings from '@/pages/pm/PmSettings'
import { useCan } from '@/store'
import type { Permission } from '@/types'

/** Redirect to the portfolio when the current role can't open a module. */
function Guard({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const can = useCan()
  return can(perm) ? <>{children}</> : <Navigate to="/projects" replace />
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

            <Route path="pm" element={<Guard perm="module.pm"><PmOverview /></Guard>} />
            <Route path="pm/info" element={<Guard perm="module.pm"><PmInfo /></Guard>} />
            <Route path="pm/updates" element={<Guard perm="module.pm"><PmUpdates /></Guard>} />
            <Route path="pm/board" element={<Guard perm="module.pm"><PmBoard /></Guard>} />
            <Route path="pm/timeline" element={<Guard perm="module.pm"><PmTimeline /></Guard>} />
            <Route path="pm/risks" element={<Guard perm="module.pm"><PmRisks /></Guard>} />
            <Route path="pm/team" element={<Guard perm="module.pm"><PmTeam /></Guard>} />
            <Route path="pm/budget" element={<Guard perm="module.pm"><PmBudget /></Guard>} />
            <Route path="pm/settings" element={<Guard perm="module.pm"><PmSettings /></Guard>} />

            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
