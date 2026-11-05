import { nanoid } from 'nanoid'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Field, HealthBadge, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { HEALTH, PHASES, PRIORITY } from '@/lib/pm'
import type { ProjectInfo, Stakeholder } from '@/types'

const opts = <T extends string>(o: Record<T, { label: string }>) => (Object.keys(o) as T[]).map((k) => ({ value: k, label: o[k].label }))

export default function PmInfo() {
  const { s, project, info, canEdit } = usePm()
  const up = (p: Partial<ProjectInfo>) => s.updateInfo(project.id, p)
  const ro = !canEdit
  const setSh = (id: string, p: Partial<Stakeholder>) => up({ stakeholders: info.stakeholders.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  const text = (label: string, key: 'objectives' | 'scopeIn' | 'scopeOut' | 'successCriteria' | 'assumptions', rows = 4, hint = '') => (
    <Field label={label}>
      <Textarea disabled={ro} rows={rows} value={info[key]} placeholder={hint} onChange={(e) => up({ [key]: e.target.value })} />
    </Field>
  )

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-5xl space-y-5">
        <PageHeader title="Project info" desc="The project charter: why it exists, what’s in and out, who’s involved. Visible to HR as well." />
        {ro && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Your role can view but not edit project management data.</div>}

        <Card title="Status & ownership">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Health"><div className="flex items-center gap-2"><NativeSelect disabled={ro} className="flex-1" value={info.health} onChange={(v) => up({ health: v as ProjectInfo['health'] })} options={opts(HEALTH)} /><HealthBadge health={info.health} className="hidden xl:inline-flex" /></div></Field>
            <Field label="Phase"><NativeSelect disabled={ro} className="w-full" value={info.phase} onChange={(v) => up({ phase: v as ProjectInfo['phase'] })} options={PHASES} /></Field>
            <Field label="Methodology"><NativeSelect disabled={ro} className="w-full" value={info.methodology} onChange={(v) => up({ methodology: v as ProjectInfo['methodology'] })} options={['Agile', 'Waterfall', 'Hybrid'].map((x) => ({ value: x, label: x }))} /></Field>
            <Field label="Priority"><NativeSelect disabled={ro} className="w-full" value={info.priority} onChange={(v) => up({ priority: v as ProjectInfo['priority'] })} options={opts(PRIORITY)} /></Field>
            <Field label="Project manager"><Input disabled={ro} value={info.manager} onChange={(e) => up({ manager: e.target.value })} /></Field>
            <Field label="Sponsor"><Input disabled={ro} value={info.sponsor} onChange={(e) => up({ sponsor: e.target.value })} /></Field>
            <Field label="Client / business owner"><Input disabled={ro} value={info.client} onChange={(e) => up({ client: e.target.value })} /></Field>
            <Field label="Total budget (IDR)"><Input disabled={ro} type="number" value={info.budget ?? ''} onChange={(e) => up({ budget: e.target.value ? Number(e.target.value) : null })} /></Field>
            <Field label="Start date"><Input disabled={ro} type="date" value={info.startDate} onChange={(e) => up({ startDate: e.target.value })} /></Field>
            <Field label="Target end date"><Input disabled={ro} type="date" value={info.endDate} onChange={(e) => up({ endDate: e.target.value })} /></Field>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Objectives & success">
            <div className="space-y-3">
              {text('Objectives', 'objectives', 5, 'What outcomes should this project deliver?')}
              {text('Success criteria', 'successCriteria', 4, 'How will we know it worked? Make it measurable.')}
            </div>
          </Card>
          <Card title="Scope & assumptions">
            <div className="space-y-3">
              {text('In scope', 'scopeIn', 4)}
              {text('Out of scope', 'scopeOut', 3)}
              {text('Assumptions & constraints', 'assumptions', 3)}
            </div>
          </Card>
        </div>

        <Card title="Stakeholders" action={!ro && <Button size="sm" variant="outline" onClick={() => up({ stakeholders: [...info.stakeholders, { id: nanoid(5), name: '', role: '', influence: 'medium', contact: '' }] })}><Plus /> Add</Button>}>
          <div className="space-y-2">
            {info.stakeholders.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2">
                <Input disabled={ro} className="h-8 w-40" placeholder="Name" value={x.name} onChange={(e) => setSh(x.id, { name: e.target.value })} />
                <Input disabled={ro} className="h-8 w-56" placeholder="Role" value={x.role} onChange={(e) => setSh(x.id, { role: e.target.value })} />
                <Input disabled={ro} className="h-8 w-56" placeholder="Contact" value={x.contact} onChange={(e) => setSh(x.id, { contact: e.target.value })} />
                <NativeSelect disabled={ro} value={x.influence} onChange={(v) => setSh(x.id, { influence: v as Stakeholder['influence'] })} options={['low', 'medium', 'high'].map((v) => ({ value: v, label: `${v} influence` }))} />
                {!ro && <Button variant="ghost" size="icon-sm" onClick={() => up({ stakeholders: info.stakeholders.filter((y) => y.id !== x.id) })}><Trash2 className="text-destructive" /></Button>}
              </div>
            ))}
            {info.stakeholders.length === 0 && <p className="text-sm text-muted-foreground">No stakeholders listed.</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
