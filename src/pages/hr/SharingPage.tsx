import { ShareManager } from '@/components/pipeline/ShareManager'
import { useStore } from '@/store'

export default function SharingPage() {
  const { projects, activeProjectId } = useStore()
  const project = projects.find((p) => p.id === activeProjectId)!
  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Share links</h1>
          <p className="text-sm text-muted-foreground">Read-only views of “{project.name}” for hiring managers or leadership.</p>
        </div>
        <ShareManager projectId={activeProjectId} />
      </div>
    </div>
  )
}
