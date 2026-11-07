import { useMemo, useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, Plus, Share2, Upload, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
  const [sharing, setSharing] = useState(false)
  const can = useCan()
  const project = projects.find((p) => p.id === activeProjectId)!
  const rows = useMemo(() => candidates.filter((c) => c.projectId === activeProjectId), [candidates, activeProjectId])
  const projPositions = useMemo(() => positions.filter((p) => p.projectId === activeProjectId), [positions, activeProjectId])

  const inProject = new Set(rows.map((c) => c.talentId))
  const newInPool = talents.filter((t) => !inProject.has(t.id)).length

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
          <p className="truncate text-sm text-muted-foreground">{project.description}</p>
        </div>
        {can('candidates.edit') && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => setPooling(true)}>
              <Users /> Add from talent pool
              {newInPool > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">{newInPool}</span>}
            </Button>
            <Button onClick={() => addCandidate({ positionId: projPositions[0]?.id ?? '' })}><Plus /> Add candidate</Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <PipelineView
          candidates={rows}
          positions={projPositions}
          stages={project.stages}
          toolbarExtra={(shown) => (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}><FileSpreadsheet className="size-3.5" /> Data <ChevronDown className="size-3.5 opacity-60" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {can('candidates.edit') && <DropdownMenuItem onClick={() => setImporting(true)}><Upload /> Import candidates (CSV)</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => downloadCsv(exportName(project.name), candidatesToTable(shown, projPositions, project.stages, { salary: can('salary.view'), contact: true }))}>
                  <Download /> Export {shown.length} shown (CSV)
                </DropdownMenuItem>
                {can('share.manage') && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setSharing(true)}><Share2 /> Share links</DropdownMenuItem></>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          mode={{ readOnly: !can('candidates.edit'), showSalary: can('salary.view'), showContact: true, canDelete: can('candidates.delete') }}
        />
      </div>
      <Dialog open={sharing} onOpenChange={setSharing}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share “{project.name}”</DialogTitle>
            <DialogDescription>Read-only links. Make them public or protect with a password.</DialogDescription>
          </DialogHeader>
          <ShareManager projectId={activeProjectId} />
        </DialogContent>
      </Dialog>
      <ImportDialog open={importing} onOpenChange={setImporting} kind="project" projectId={activeProjectId} />
      <AddFromPoolDialog open={pooling} onOpenChange={setPooling} projectId={activeProjectId} showSalary={can('salary.view')} />
    </div>
  )
}
