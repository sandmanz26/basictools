import { StageEditor } from '@/components/StageEditor'
import { Card, PageHeader, pageCls } from '@/components/pm/ui'
import { useCan, useStore } from '@/store'
import { MicrosoftCard } from '@/components/MicrosoftCard'
import { DEFAULT_MKT_STAGES } from '@/lib/constants'

export default function MktSettings() {
  const { mktStages, setMktStages, removeMktStage, leads } = useStore()
  const canEdit = useCan()('mkt.edit')

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="Marketing settings" desc="Connect Microsoft for sending email and adjust the lead pipeline stages." />

        <MicrosoftCard canEdit={canEdit} />

        <Card title="Lead pipeline stages">
          {!canEdit && <div className="mb-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t change the stages.</div>}
          <StageEditor
            mode="mkt" can={canEdit} itemLabel="leads"
            stages={mktStages}
            onChange={setMktStages}
            countIn={(id) => leads.filter((l) => l.stage === id).length}
            onRemove={removeMktStage}
            onReset={() => confirm('Replace the stages with the default ones? Leads in removed stages move to the first stage.') && (setMktStages(DEFAULT_MKT_STAGES()), useStore.setState((s) => ({ leads: s.leads.map((l) => ({ ...l, stage: DEFAULT_MKT_STAGES().some((x) => x.id === l.stage) ? l.stage : 'new' })) })))}
          />
        </Card>
      </div>
    </div>
  )
}
