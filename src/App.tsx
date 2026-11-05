import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppShell } from '@/components/layout/AppShell'
import PipelinePage from '@/pages/PipelinePage'
import PositionsPage from '@/pages/PositionsPage'
import ProjectsPage from '@/pages/ProjectsPage'
import TalentPage from '@/pages/TalentPage'
import SettingsPage from '@/pages/SettingsPage'
import SharingPage from '@/pages/SharingPage'
import SharePage from '@/pages/SharePage'

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/s/:token" element={<SharePage />} />
          <Route element={<AppShell />}>
            <Route index element={<PipelinePage />} />
            <Route path="talent" element={<TalentPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="positions" element={<PositionsPage />} />
            <Route path="sharing" element={<SharingPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}
