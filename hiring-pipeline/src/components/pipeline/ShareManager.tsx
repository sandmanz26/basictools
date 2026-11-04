import { useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Lock, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { NativeSelect } from '@/components/NativeSelect'
import { useCan, useStore } from '@/store'
import type { ShareLink } from '@/types'

export const shareUrl = (id: string) => `${window.location.origin}/s/${id}`

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500) }}>
      {ok ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {ok ? 'Copied' : 'Copy link'}
    </Button>
  )
}

export function ShareManager({ projectId }: { projectId: string }) {
  const { shares, positions, addShare, updateShare, deleteShare } = useStore()
  const can = useCan()('share.manage')
  const mine = shares.filter((s) => s.projectId === projectId)
  const projPositions = positions.filter((p) => p.projectId === projectId)
  const [draft, setDraft] = useState({ label: '', access: 'public' as ShareLink['access'], password: '', view: 'kanban' as ShareLink['view'], showSalary: false, showContact: false })

  const create = () => {
    if (draft.access === 'password' && !draft.password.trim()) return
    addShare({ ...draft, label: draft.label || 'Shared pipeline', projectId, positionIds: [], enabled: true })
    setDraft({ ...draft, label: '', password: '' })
  }

  return (
    <div className="space-y-5">
      {can && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="text-sm font-semibold">New share link</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>Name</Label><Input placeholder="e.g. Hiring managers" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Access</Label>
              <NativeSelect className="w-full" value={draft.access} onChange={(v) => setDraft({ ...draft, access: v as ShareLink['access'] })} options={[{ value: 'public', label: 'Public – anyone with the link' }, { value: 'password', label: 'Private – password required' }]} />
            </div>
            {draft.access === 'password' && (
              <div className="space-y-1"><Label>Password</Label><Input value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} placeholder="Set a password" /></div>
            )}
            <div className="space-y-1">
              <Label>Default view</Label>
              <NativeSelect className="w-full" value={draft.view} onChange={(v) => setDraft({ ...draft, view: v as ShareLink['view'] })} options={[{ value: 'kanban', label: 'Kanban' }, { value: 'table', label: 'Table' }]} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <label className="flex items-center gap-2"><Switch checked={draft.showSalary} onCheckedChange={(v) => setDraft({ ...draft, showSalary: v })} /> Show expected salary</label>
            <label className="flex items-center gap-2"><Switch checked={draft.showContact} onCheckedChange={(v) => setDraft({ ...draft, showContact: v })} /> Show email / phone</label>
            <Button className="ml-auto" onClick={create}>Create link</Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {mine.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No share links for this project yet.</div>}
        {mine.map((s) => (
          <div key={s.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-center gap-2">
              {s.access === 'public' ? <Globe className="size-4 text-emerald-600" /> : <Lock className="size-4 text-amber-600" />}
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-muted-foreground">· {s.access === 'public' ? 'Public' : 'Password'} · {s.view} · {s.views} views</span>
              <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                Active <Switch disabled={!can} checked={s.enabled} onCheckedChange={(v) => updateShare(s.id, { enabled: v })} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input readOnly value={shareUrl(s.id)} className="h-8 min-w-64 flex-1 font-mono text-xs" />
              <CopyBtn text={shareUrl(s.id)} />
              <Button size="sm" variant="outline" render={<a href={shareUrl(s.id)} target="_blank" rel="noreferrer" />}><ExternalLink className="size-3.5" /> Open</Button>
              {can && <Button size="icon-sm" variant="ghost" onClick={() => confirm('Delete this link?') && deleteShare(s.id)}><Trash2 className="text-destructive" /></Button>}
            </div>
            {can && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><Switch checked={s.showSalary} onCheckedChange={(v) => updateShare(s.id, { showSalary: v })} /> Salary</label>
                <label className="flex items-center gap-2"><Switch checked={s.showContact} onCheckedChange={(v) => updateShare(s.id, { showContact: v })} /> Contact</label>
                <NativeSelect value={s.access} onChange={(v) => updateShare(s.id, { access: v as ShareLink['access'] })} options={[{ value: 'public', label: 'Public' }, { value: 'password', label: 'Password' }]} />
                {s.access === 'password' && <Input className="h-8 w-40" value={s.password} onChange={(e) => updateShare(s.id, { password: e.target.value })} placeholder="Password" />}
                <NativeSelect
                  value={s.positionIds[0] ?? ''}
                  onChange={(v) => updateShare(s.id, { positionIds: v ? [v] : [] })}
                  options={[{ value: '', label: 'All positions' }, ...projPositions.map((p) => ({ value: p.id, label: p.title }))]}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
