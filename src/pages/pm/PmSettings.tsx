import { useState } from 'react'
import { nanoid } from 'nanoid'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Dropdown } from '@/components/Dropdown'
import { MicrosoftCard } from '@/components/MicrosoftCard'
import { InvoiceTemplateCard } from '@/components/pm/InvoiceTemplateCard'
import { SaveBar } from '@/components/SaveBar'
import { StageEditor } from '@/components/StageEditor'
import { Card, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { useCan } from '@/store'
import { useDraft } from '@/lib/useDraft'
import { STAGE_COLORS } from '@/lib/constants'
import { DEFAULT_PM_STAGES, FIELD_PRESETS, PM_FEATURES, PM_FIELDS, fieldsOf, statusStyle } from '@/lib/pm'
import { cn } from '@/lib/utils'
import type { BillingProfile, PmFeature, PmField, Stage, StatusDef } from '@/types'

interface SettingsDraft {
  features: Record<PmFeature, boolean>
  fields: Record<PmField, boolean>
  stages: Stage[]
  statuses: StatusDef[]
  billing: BillingProfile
}

/**
 * Every setting on this page is edited on a copy. The "Save changes" bar applies them all at once,
 * so a half-finished change can't be left behind. Only the Microsoft connection applies immediately.
 */
export default function PmSettings() {
  const { s, project, tasks, canEdit } = usePm()
  const canBilling = useCan()('pm.invoice')
  const [moves, setMoves] = useState<{ stages: Record<string, string>; statuses: Record<string, string> }>({ stages: {}, statuses: {} })
  const [removing, setRemoving] = useState<{ status: StatusDef; to: string } | null>(null)

  const source: SettingsDraft = { features: project.pmFeatures, fields: fieldsOf(project), stages: project.pmStages, statuses: s.statuses, billing: s.billingProfile }
  const d = useDraft<SettingsDraft>(source, project.id, (draft) => {
    if (canEdit) {
      Object.entries(moves.stages).forEach(([from, to]) => s.removePmStage(project.id, from, to)) // moves tasks first
      s.setPmStages(project.id, draft.stages)
      Object.entries(moves.statuses).forEach(([from, to]) => s.remapStatus(from, to))
      s.setStatuses(draft.statuses)
      s.setPmFeatures(project.id, draft.features)
      s.setPmFields(project.id, draft.fields)
    }
    if (canBilling) s.setBillingProfile(draft.billing)
    setMoves({ stages: {}, statuses: {} })
  })
  const { features, fields, stages, statuses, billing: bp } = d.draft
  const discard = () => { d.discard(); setMoves({ stages: {}, statuses: {} }) }

  const groups = [...new Set(PM_FIELDS.map((x) => x.group))]
  const activePreset = FIELD_PRESETS.find((p) => PM_FIELDS.every((x) => p.make()[x.id] === fields[x.id]))?.id
  const setBp = (p: Partial<BillingProfile>) => d.set({ billing: { ...bp, ...p } })
  const inUse = (id: string) => s.projects.filter((p) => p.info.health === id).length + s.updates.filter((u) => u.health === id).length
  const patchStatus = (id: string, p: Partial<StatusDef>) => d.set({ statuses: statuses.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const moveStatus = (i: number, dir: -1 | 1) => { const n = [...statuses]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; d.set({ statuses: n }) }
  const dropStatus = (st: StatusDef, to: string) => {
    d.set({ statuses: statuses.filter((x) => x.id !== st.id) })
    if (inUse(st.id) > 0) setMoves((m) => ({ ...m, statuses: { ...m.statuses, [st.id]: to } }))
  }

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title={`PM settings — ${project.name}`} desc="Keep project management light: choose the tools, fields and statuses this project needs. Changes apply only after you press Save." />
        {!canEdit && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can’t change most of these settings.</div>}

        <Card title="Optional tools for this project">
          <div className="divide-y">
            {PM_FEATURES.map((x) => (
              <label key={x.id} className="flex items-center gap-3 py-2.5">
                <Switch disabled={!canEdit} checked={features[x.id]} onCheckedChange={(v) => d.set({ features: { ...features, [x.id]: v } })} />
                <div><div className="text-sm font-medium">{x.label}</div><div className="text-xs text-muted-foreground">{x.hint}</div></div>
              </label>
            ))}
          </div>
        </Card>

        <Card title="Project info fields">
          <p className="mb-3 text-sm text-muted-foreground">Hidden fields disappear from the project info page, the project list and the dashboard; their values are kept if you switch them back on.</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {FIELD_PRESETS.map((p) => (
              <Button key={p.id} size="sm" variant={activePreset === p.id ? 'default' : 'outline'} disabled={!canEdit} title={p.hint} onClick={() => d.set({ fields: p.make() })}>{p.label}</Button>
            ))}
            {!activePreset && <span className="self-center text-xs text-muted-foreground">Custom selection</span>}
          </div>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g} className="space-y-1">
                <div className="pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g}</div>
                {PM_FIELDS.filter((x) => x.group === g).map((x) => (
                  <label key={x.id} className="flex items-center gap-2.5 py-1 text-sm">
                    <Switch disabled={!canEdit} checked={fields[x.id]} onCheckedChange={(v) => d.set({ fields: { ...fields, [x.id]: v } })} /> {x.label}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Project statuses">
          <p className="mb-3 text-sm text-muted-foreground">The status you pick for a project (and on status updates). Rename them, change colours, add your own. Statuses marked “needs attention” are counted on the project list. Shared by all projects.</p>
          <div className="space-y-2">
            {statuses.map((st, i) => {
              const n = inUse(st.id)
              return (
                <div key={st.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
                  <div className="flex flex-col">
                    <Button variant="ghost" size="icon-xs" disabled={!canEdit || i === 0} onClick={() => moveStatus(i, -1)}><ArrowUp /></Button>
                    <Button variant="ghost" size="icon-xs" disabled={!canEdit || i === statuses.length - 1} onClick={() => moveStatus(i, 1)}><ArrowDown /></Button>
                  </div>
                  <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', statusStyle(statuses, st.id).tone)}>{st.label || 'Untitled'}</span>
                  <Input disabled={!canEdit} className="h-8 w-44" value={st.label} onChange={(e) => patchStatus(st.id, { label: e.target.value })} aria-label="Status name" />
                  <Dropdown disabled={!canEdit} value={st.color} onChange={(v) => patchStatus(st.id, { color: v })} options={Object.entries(STAGE_COLORS).map(([k, v]) => ({ value: k, label: v.label }))} />
                  <label className="flex items-center gap-2 text-sm"><Switch disabled={!canEdit} checked={st.attention} onCheckedChange={(v) => patchStatus(st.id, { attention: v })} /> Needs attention</label>
                  <span className="ml-auto text-xs text-muted-foreground">{n} in use</span>
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" disabled={statuses.length <= 1} title="Delete status"
                      onClick={() => { const others = statuses.filter((x) => x.id !== st.id); if (n === 0) dropStatus(st, others[0].id); else setRemoving({ status: st, to: others[0].id }) }}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
          {canEdit && <Button className="mt-3" variant="outline" onClick={() => d.set({ statuses: [...statuses, { id: 's_' + nanoid(5), label: 'New status', color: 'teal', attention: false }] })}><Plus /> Add status</Button>}
        </Card>

        <InvoiceTemplateCard bp={bp} setBp={setBp} can={canBilling} />

        {features.board && (
          <Card title="Work board workflow">
            <p className="mb-3 text-sm text-muted-foreground">The columns of the work board. Mark the final stage as Done so progress is calculated correctly.</p>
            <StageEditor
              mode="pm" can={canEdit} itemLabel="tasks"
              stages={stages}
              onChange={(st) => d.set({ stages: st })}
              countIn={(id) => tasks.filter((t) => t.stage === id).length}
              onRemove={(id, to) => {
                d.set({ stages: stages.filter((x) => x.id !== id) })
                if (tasks.some((t) => t.stage === id)) setMoves((m) => ({ ...m, stages: { ...m.stages, [id]: to } }))
              }}
              onReset={() => confirm('Replace the workflow with the default one? Only do this on a fresh project.') && d.set({ stages: DEFAULT_PM_STAGES() })}
            />
          </Card>
        )}

        <MicrosoftCard canEdit={canEdit} />
        <p className="text-xs text-muted-foreground">The Microsoft connection above is applied immediately because signing in needs the saved ID.</p>

        <SaveBar dirty={d.dirty} onSave={d.save} onDiscard={discard} />
      </div>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete status “{removing?.status.label}”?</DialogTitle>
            <DialogDescription>{removing && inUse(removing.status.id)} project(s) or update(s) use it. They move to the status you choose when you save.</DialogDescription>
          </DialogHeader>
          {removing && <Dropdown className="w-full" value={removing.to} onChange={(v) => setRemoving({ ...removing, to: v })} options={statuses.filter((x) => x.id !== removing.status.id).map((x) => ({ value: x.id, label: x.label }))} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (removing) dropStatus(removing.status, removing.to); setRemoving(null) }}>Delete & move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
