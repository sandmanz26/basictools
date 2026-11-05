import { StageEditor } from '@/components/StageEditor'
import { PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { DEFAULT_PM_STAGES } from '@/lib/pm'

export default function PmSettings() {
  const { s, project, tasks, canEdit } = usePm()
  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader
          title={`Work board workflow — ${project.name}`}
          desc="The columns of the PM work board. This is separate from the HR hiring pipeline, which has its own stages. Mark the final stage as Done so progress is calculated correctly."
        />
        {!canEdit && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t change the workflow.</div>}
        <StageEditor
          mode="pm" can={canEdit} itemLabel="tasks"
          stages={project.pmStages}
          onChange={(st) => s.setPmStages(project.id, st)}
          countIn={(id) => tasks.filter((t) => t.stage === id).length}
          onRemove={(id, to) => s.removePmStage(project.id, id, to)}
          onReset={() => confirm('Replace the workflow with the default one? Only do this on a fresh project.') && s.setPmStages(project.id, DEFAULT_PM_STAGES())}
        />
      </div>
    </div>
  )
}
