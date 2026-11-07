import { Switch } from '@/components/ui/switch'
import { MicrosoftCard } from '@/components/MicrosoftCard'
import { StageEditor } from '@/components/StageEditor'
import { Card, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/pm/ui'
import { useCan } from '@/store'
import { DEFAULT_PM_STAGES, FIELD_PRESETS, PM_FEATURES, PM_FIELDS, fieldsOf } from '@/lib/pm'

export default function PmSettings() {
  const { s, project, tasks, canEdit } = usePm()
  const f = project.pmFeatures
  const { billingProfile: bp, setBillingProfile } = s
  const canBilling = useCan()('pm.invoice')
  const fields = fieldsOf(project)
  const groups = [...new Set(PM_FIELDS.map((x) => x.group))]
  const activePreset = FIELD_PRESETS.find((p) => PM_FIELDS.every((x) => p.make()[x.id] === fields[x.id]))?.id
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

        <Card title="Project info fields">
          <p className="mb-3 text-sm text-muted-foreground">
            Choose which fields this project tracks. Hidden fields disappear from the project info page, the project list and the dashboard; their values are kept if you switch them back on.
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {FIELD_PRESETS.map((p) => (
              <Button key={p.id} size="sm" variant={activePreset === p.id ? 'default' : 'outline'} disabled={!canEdit} title={p.hint} onClick={() => s.setPmFields(project.id, p.make())}>
                {p.label}
              </Button>
            ))}
            {!activePreset && <span className="self-center text-xs text-muted-foreground">Custom selection</span>}
          </div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g} className="space-y-1">
                <div className="pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g}</div>
                {PM_FIELDS.filter((x) => x.group === g).map((x) => (
                  <label key={x.id} className="flex items-center gap-2.5 py-1 text-sm">
                    <Switch disabled={!canEdit} checked={fields[x.id]} onCheckedChange={(v) => s.setPmFields(project.id, { ...fields, [x.id]: v })} /> {x.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Billing profile (printed on invoice PDFs)">
          <p className="mb-3 text-sm text-muted-foreground">Your company details and bank account. They appear on every downloaded or emailed invoice, shared by all projects.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company name"><Input disabled={!canBilling} value={bp.company} onChange={(e) => setBillingProfile({ company: e.target.value })} /></Field>
            <Field label="Tax ID (NPWP)"><Input disabled={!canBilling} value={bp.taxId} onChange={(e) => setBillingProfile({ taxId: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea disabled={!canBilling} rows={2} value={bp.address} onChange={(e) => setBillingProfile({ address: e.target.value })} /></Field>
            <Field label="Billing email"><Input disabled={!canBilling} type="email" value={bp.email} onChange={(e) => setBillingProfile({ email: e.target.value })} /></Field>
            <Field label="Phone"><Input disabled={!canBilling} value={bp.phone} onChange={(e) => setBillingProfile({ phone: e.target.value })} /></Field>
            <Field label="Bank"><Input disabled={!canBilling} placeholder="e.g. BCA" value={bp.bankName} onChange={(e) => setBillingProfile({ bankName: e.target.value })} /></Field>
            <Field label="Account number"><Input disabled={!canBilling} value={bp.bankAccount} onChange={(e) => setBillingProfile({ bankAccount: e.target.value })} /></Field>
            <Field label="Account name" className="sm:col-span-2"><Input disabled={!canBilling} value={bp.bankHolder} onChange={(e) => setBillingProfile({ bankHolder: e.target.value })} /></Field>
            <Field label="Default invoice note" className="sm:col-span-2"><Textarea disabled={!canBilling} rows={2} placeholder="e.g. Please pay within 14 days and include the invoice number in the transfer." value={bp.paymentNote} onChange={(e) => setBillingProfile({ paymentNote: e.target.value })} /></Field>
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
