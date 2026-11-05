import { useMemo, useState } from 'react'
import { Download, Plus, Share2, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PipelineView } from '@/components/pipeline/PipelineView'
import { ShareManager } from '@/components/pipeline/ShareManager'
import { ImportDialog } from '@/components/ImportDialog'
import { AddFromPoolDialog } from '@/components/AddFromPoolDialog'
import { downloadCsv } from '@/lib/csv'
import { candidatesToTable, exportName } from '@/lib/importExport'
import { useCan, useStore } from '@/store'

export default function PipelinePage() {
  const { candidates, positions, projects, activeProjectId, addCandidate, talents } = useStore()
  const [importing, setImporting] = useState(false)
  const [pooling, setPooling] = useState(false)
  const can = useCan()
  const project = projects.find((p) => p.id === activeProjectId)!
  const rows = useMemo(() => candidates.filter((c) => c.projectId === activeProjectId), [candidates, activeProjectId])
  const projPositions = useMemo(() => positions.filter((p) => p.projectId === activeProjectId), [positions, activeProjectId])

  const inProject = new Set(rows.map((c) => c.talentId))
  const newInPool = talents.filter((t) => !inProject.has(t.id)).length

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
            <>
              <Button variant="outline" onClick={() => setPooling(true)}><Users /> From talent pool{newInPool > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{newInPool}</span>}</Button>
              <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import</Button>
            </>
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
          toolbarExtra={(shown) => (
            <Button variant="outline" size="sm" onClick={() => downloadCsv(exportName(project.name), candidatesToTable(shown, projPositions, project.stages, { salary: can('salary.view'), contact: true }))}>
              <Download className="size-3.5" /> Export ({shown.length})
            </Button>
          )}
          mode={{ readOnly: !can('candidates.edit'), showSalary: can('salary.view'), showContact: true, canDelete: can('candidates.delete') }}
        />
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} kind="project" projectId={activeProjectId} />
      <AddFromPoolDialog open={pooling} onOpenChange={setPooling} projectId={activeProjectId} showSalary={can('salary.view')} />
    </div>
  )
}
