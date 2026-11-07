import { Link, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCurrentUser, useStore, useCan } from '@/store'
import { PERMISSIONS } from '@/lib/constants'
import { homeFor, requiredFor } from '@/lib/access'

/** Shown instead of a page the signed-in role isn't allowed to open. Nothing of the page is rendered. */
export function Locked() {
  const { pathname } = useLocation()
  const { role } = useCurrentUser()
  const roles = useStore((s) => s.roles)
  const can = useCan()
  const need = requiredFor(pathname) ?? []
  const allowed = roles.filter((r) => need.some((p) => r.permissions[p])).map((r) => r.name)
  const labels = need.map((p) => PERMISSIONS.find((x) => x.id === p)?.label ?? p)
  const home = homeFor(can)

  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted"><Lock className="size-6" /></div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">This page is locked</h1>
          <p className="text-sm text-muted-foreground">It contains sensitive data and your role (<b>{role.name}</b>) doesn’t have access.</p>
        </div>
        <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-left text-sm">
          <div><span className="text-muted-foreground">Requires:</span> {labels.join(' or ')}</div>
          <div><span className="text-muted-foreground">Roles with access:</span> {allowed.join(', ') || '—'}</div>
        </div>
        <p className="text-xs text-muted-foreground">Ask an Admin to change your role if you need this.</p>
        <Button variant="outline" render={<Link to={home} replace />}>Go to a page I can open</Button>
      </div>
    </div>
  )
}
