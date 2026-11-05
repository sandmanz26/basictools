import { StageEditor } from '@/components/StageEditor'
import { useCan, useStore } from '@/store'
import { DEFAULT_STAGES } from '@/lib/constants'

export default function PipelineSettingsPage() {
  const { projects, activeProjectId, candidates, setStages, removeStage } = useStore()
  const can = useCan()('projects.manage')
  const project = projects.find((p) => p.id === activeProjectId)!
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hiring pipeline — {project.name}</h1>
          <p className="text-sm text-muted-foreground">
            Stages become the kanban columns and the “Stage” options in the candidate table. Stages marked <b>Interview</b> get Date / Time / Result columns.
            <b> Pass</b> moves a candidate to the next stage in this order; <b>Fail</b> moves them to the first “Lost” stage. The PM work board has its own, separate workflow.
          </p>
        </div>
        {!can && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t change pipeline stages.</div>}
        <StageEditor
          mode="hr" can={can} itemLabel="cand."
          stages={project.stages}
          onChange={(st) => setStages(project.id, st)}
          countIn={(id) => candidates.filter((c) => c.projectId === project.id && c.stage === id).length}
          onRemove={(id, to) => removeStage(project.id, id, to)}
          onReset={() => confirm('Replace stages with the default pipeline? Only do this on a fresh project.') && setStages(project.id, DEFAULT_STAGES())}
        />
      </div>
    </div>
  )
}
