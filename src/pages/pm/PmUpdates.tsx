import { useState } from 'react'
import { nanoid } from 'nanoid'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Empty, Field, HealthBadge, PageHeader, pageCls, usePm } from '@/components/pm/ui'
import { useCurrentUser } from '@/store'
import { HEALTH, todayStr } from '@/lib/pm'
import { fmtDate } from '@/lib/constants'
import type { Health } from '@/types'

export default function PmUpdates() {
  const { s, project, info, updates, canEdit } = usePm()
  const { user } = useCurrentUser()
  const blank = { health: info.health as Health, summary: '', highlights: '', blockers: '', nextSteps: '', date: todayStr(), setHealth: true }
  const [f, setF] = useState(blank)
  const post = () => {
    if (!f.summary.trim()) return
    s.pmAdd('updates', { id: 'su-' + nanoid(5), projectId: project.id, date: f.date, author: user.name, health: f.health, summary: f.summary, highlights: f.highlights, blockers: f.blockers, nextSteps: f.nextSteps })
    if (f.setHealth) s.updateInfo(project.id, { health: f.health })
    setF({ ...blank, health: f.health })
  }
  const list = [...updates].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className={pageCls}>
      <div className="mx-auto max-w-4xl space-y-5">
        <PageHeader title="Status updates" desc="A running log of where the project stands. HR and stakeholders see the same feed." />

        {canEdit && (
          <Card title="Post an update">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="w-40" /></Field>
                <Field label="Overall health"><NativeSelect value={f.health} onChange={(v) => setF({ ...f, health: v as Health })} options={(Object.keys(HEALTH) as Health[]).map((k) => ({ value: k, label: HEALTH[k].label }))} /></Field>
                <label className="flex items-center gap-2 pb-1.5 text-sm"><input type="checkbox" checked={f.setHealth} onChange={(e) => setF({ ...f, setHealth: e.target.checked })} /> Also set project health</label>
              </div>
              <Field label="Summary"><Textarea rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="One or two sentences anyone can read." /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Highlights"><Textarea rows={3} value={f.highlights} onChange={(e) => setF({ ...f, highlights: e.target.value })} /></Field>
                <Field label="Blockers"><Textarea rows={3} value={f.blockers} onChange={(e) => setF({ ...f, blockers: e.target.value })} /></Field>
                <Field label="Next steps"><Textarea rows={3} value={f.nextSteps} onChange={(e) => setF({ ...f, nextSteps: e.target.value })} /></Field>
              </div>
              <Button disabled={!f.summary.trim()} onClick={post}>Post update</Button>
            </div>
          </Card>
        )}

        {list.length === 0 && <Empty>No updates yet.</Empty>}
        <div className="space-y-3">
          {list.map((u) => (
            <Card key={u.id} action={canEdit && <Button variant="ghost" size="icon-xs" onClick={() => s.pmDelete('updates', u.id)}><Trash2 className="text-destructive" /></Button>}
              title={<span className="flex items-center gap-2"><HealthBadge health={u.health} /><span className="text-xs font-normal text-muted-foreground">{fmtDate(u.date)} · {u.author}</span></span>}>
              <p className="text-sm">{u.summary}</p>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                {([['Highlights', u.highlights], ['Blockers', u.blockers], ['Next steps', u.nextSteps]] as const).map(([k, v]) => v && (
                  <div key={k}><div className="text-xs font-medium text-muted-foreground">{k}</div><pre className="font-sans whitespace-pre-wrap">{v}</pre></div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
