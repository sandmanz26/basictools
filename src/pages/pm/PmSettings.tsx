import { Switch } from '@/components/ui/switch'
import { MicrosoftCard } from '@/components/MicrosoftCard'
import { StageEditor } from '@/components/StageEditor'
import { Card, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { DEFAULT_PM_STAGES, PM_FEATURES } from '@/lib/pm'

export default function PmSettings() {
  const { s, project, tasks, canEdit } = usePm()
  const f = project.pmFeatures
  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title={`PM settings — ${project.name}`} desc="Keep project management light: switch on only the tools this project needs. Turned-off tools disappear from the menu; their data is kept." />
        {!canEdit && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t change these settings.</div>}

        <Card title="Optional tools for this project">
          <div className="divide-y">
            {PM_FEATURES.map((x) => (
              <label key={x.id} className="flex items-center gap-3 py-2.5">
                <Switch disabled={!canEdit} checked={f[x.id]} onCheckedChange={(v) => s.setPmFeature(project.id, x.id, v)} />
                <div><div className="text-sm font-medium">{x.label}</div><div className="text-xs text-muted-foreground">{x.hint}</div></div>
              </label>
            ))}
          </div>
        </Card>

        <MicrosoftCard canEdit={canEdit} />

        {f.board && (
          <Card title="Work board workflow">
            <p className="mb-3 text-sm text-muted-foreground">The columns of the work board. Mark the final stage as Done so progress is calculated correctly.</p>
            <StageEditor
              mode="pm" can={canEdit} itemLabel="tasks"
              stages={project.pmStages}
              onChange={(st) => s.setPmStages(project.id, st)}
              countIn={(id) => tasks.filter((t) => t.stage === id).length}
              onRemove={(id, to) => s.removePmStage(project.id, id, to)}
              onReset={() => confirm('Replace the workflow with the default one? Only do this on a fresh project.') && s.setPmStages(project.id, DEFAULT_PM_STAGES())}
            />
          </Card>
        )}
      </div>
    </div>
  )
}
