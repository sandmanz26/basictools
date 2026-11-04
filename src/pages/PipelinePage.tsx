import { useMemo } from 'react'
import { Plus, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PipelineView } from '@/components/pipeline/PipelineView'
import { ShareManager } from '@/components/pipeline/ShareManager'
import { useCan, useStore } from '@/store'

export default function PipelinePage() {
  const { candidates, positions, projects, activeProjectId, addCandidate } = useStore()
  const can = useCan()
  const project = projects.find((p) => p.id === activeProjectId)!
  const rows = useMemo(() => candidates.filter((c) => c.projectId === activeProjectId), [candidates, activeProjectId])
  const projPositions = useMemo(() => positions.filter((p) => p.projectId === activeProjectId), [positions, activeProjectId])

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.description}</p>
        </div>
        <div className="flex gap-2">
          {can('share.manage') && (
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}><Share2 /> Share</DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Share “{project.name}”</DialogTitle>
                  <DialogDescription>Read-only links. Make them public or protect with a password.</DialogDescription>
                </DialogHeader>
                <ShareManager projectId={activeProjectId} />
              </DialogContent>
            </Dialog>
          )}
          {can('candidates.edit') && (
            <Button onClick={() => addCandidate({ positionId: projPositions[0]?.id ?? '' })}><Plus /> Add candidate</Button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <PipelineView
          candidates={rows}
          positions={projPositions}
          stages={project.stages}
          mode={{ readOnly: !can('candidates.edit'), showSalary: can('salary.view'), showContact: true, canDelete: can('candidates.delete') }}
        />
      </div>
    </div>
  )
}
