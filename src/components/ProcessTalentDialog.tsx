import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/NativeSelect'
import { useStore } from '@/store'

/** Move people from the Talent Pool into a project's hiring pipeline at a chosen stage. */
export function ProcessTalentDialog({
  talentIds, onClose, onDone,
}: {
  talentIds: string[]
  onClose: () => void
  onDone?: () => void
}) {
  const { talents, candidates, projects, positions, activeProjectId, addTalentsToProject, setProject } = useStore()
  const nav = useNavigate()
  const open = talentIds.length > 0
  const active = projects.filter((p) => p.status === 'active')
  const [projectId, setProjectId] = useState(activeProjectId)
  const [positionId, setPositionId] = useState('')
  const [stageId, setStageId] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [added, setAdded] = useState<number | null>(null)

  const project = projects.find((p) => p.id === projectId)
  const stages = (project?.stages ?? []).filter((s) => s.type !== 'lost')
  const projPositions = positions.filter((p) => p.projectId === projectId && p.status !== 'closed')

  // Reset the form whenever the dialog opens or the project changes.
  useEffect(() => { if (open) { setAdded(null); setProjectId(activeProjectId) } }, [open, activeProjectId])
  useEffect(() => {
    setPositionId(projPositions[0]?.id ?? '')
    setStageId(stages[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, open])
  useEffect(() => { setNextStep(stages.find((s) => s.id === stageId)?.nextStep ?? '') }, [stageId]) // eslint-disable-line react-hooks/exhaustive-deps

  const people = useMemo(() => talents.filter((t) => talentIds.includes(t.id)), [talents, talentIds])
  const already = useMemo(
    () => people.filter((t) => candidates.some((c) => c.projectId === projectId && c.talentId === t.id)),
    [people, candidates, projectId],
  )
  const toAdd = people.length - already.length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Process to pipeline</DialogTitle>
          <DialogDescription>
            {people.length === 1 ? people[0].name : `${people.length} people`} will be added to a project’s hiring pipeline. Their pool record stays and is linked.
          </DialogDescription>
        </DialogHeader>

        {added != null ? (
          <div className="space-y-3 rounded-xl border bg-muted/40 p-5">
            <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="size-5 text-emerald-600" /> {added} added to “{project?.name}”</div>
            <p className="text-sm text-muted-foreground">They are now at the <b>{stages.find((s) => s.id === stageId)?.label}</b> stage.</p>
            <Button onClick={() => { setProject(projectId); onClose(); nav('/hr') }}>Open pipeline <ArrowRight /></Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Project</Label>
                <NativeSelect className="w-full" value={projectId} onChange={setProjectId} options={active.map((p) => ({ value: p.id, label: p.name }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Position</Label>
                <NativeSelect className="w-full" value={positionId} onChange={setPositionId} options={[{ value: '', label: 'No position yet' }, ...projPositions.map((p) => ({ value: p.id, label: p.title }))]} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Start at stage</Label>
                <NativeSelect className="w-full" value={stageId} onChange={setStageId} options={stages.map((s) => ({ value: s.id, label: s.label }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">Next step</Label>
                <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="What should happen first?" />
              </div>
            </div>
            {already.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{already.map((t) => t.name).join(', ')} {already.length === 1 ? 'is' : 'are'} already in this project and will be skipped.</span>
              </div>
            )}
          </div>
        )}

        {added == null && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={toAdd === 0 || !stageId} onClick={() => { setAdded(addTalentsToProject(projectId, talentIds, positionId, { stageId, nextStep })); onDone?.() }}>
              Add {toAdd > 0 ? toAdd : ''} to pipeline
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
