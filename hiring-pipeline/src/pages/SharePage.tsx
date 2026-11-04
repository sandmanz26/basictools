import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Lock, ShieldX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PipelineView } from '@/components/pipeline/PipelineView'
import { useStore } from '@/store'

const key = (id: string) => `share-unlocked-${id}`

export default function SharePage() {
  const { token = '' } = useParams()
  const share = useStore((s) => s.shares.find((x) => x.id === token))
  const { candidates, positions, projects, bumpShare } = useStore()
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(key(token)) === '1' } catch { return false }
  })
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)

  const open = !!share && share.enabled && (share.access === 'public' || unlocked)
  useEffect(() => { if (open && share) bumpShare(share.id) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const project = projects.find((p) => p.id === share?.projectId)
  const projPositions = useMemo(
    () => positions.filter((p) => p.projectId === share?.projectId && (!share?.positionIds.length || share.positionIds.includes(p.id))),
    [positions, share],
  )
  const rows = useMemo(
    () => candidates.filter((c) => c.projectId === share?.projectId && (!share?.positionIds.length || share.positionIds.includes(c.positionId))),
    [candidates, share],
  )

  if (!share || !share.enabled)
    return (
      <div className="grid h-screen place-items-center p-6 text-center">
        <div className="space-y-2">
          <ShieldX className="mx-auto size-10 text-muted-foreground" />
          <h1 className="text-lg font-semibold">This link isn’t available</h1>
          <p className="text-sm text-muted-foreground">It may have been disabled or deleted by the owner.</p>
        </div>
      </div>
    )

  if (share.access === 'password' && !unlocked)
    return (
      <div className="grid h-screen place-items-center p-6">
        <form
          className="w-full max-w-sm space-y-4 rounded-2xl border p-6"
          onSubmit={(e) => {
            e.preventDefault()
            if (pw === share.password) {
              try { sessionStorage.setItem(key(token), '1') } catch { /* private mode */ }
              setUnlocked(true)
            } else setErr(true)
          }}
        >
          <div className="space-y-1">
            <Lock className="size-6" />
            <h1 className="text-lg font-semibold">{project?.name ?? 'Hiring pipeline'}</h1>
            <p className="text-sm text-muted-foreground">This view is private. Enter the password to continue.</p>
          </div>
          <Input autoFocus type="password" placeholder="Password" value={pw} aria-invalid={err} onChange={(e) => { setPw(e.target.value); setErr(false) }} />
          {err && <p className="text-sm text-destructive">Wrong password, try again.</p>}
          <Button type="submit" className="w-full">Unlock</Button>
        </form>
      </div>
    )

  return (
    <div className="flex h-screen flex-col gap-3 p-5">
      <div>
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Shared view · read only</div>
        <h1 className="text-xl font-semibold tracking-tight">{project?.name}</h1>
      </div>
      <div className="min-h-0 flex-1">
        <PipelineView candidates={rows} positions={projPositions} stages={project?.stages ?? []} initialView={share.view} mode={{ readOnly: true, showSalary: share.showSalary, showContact: share.showContact }} />
      </div>
    </div>
  )
}
