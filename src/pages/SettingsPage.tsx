import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Lock, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect } from '@/components/NativeSelect'
import { Badge } from '@/components/ui/badge'
import { PasswordInput, PasswordRules } from '@/components/auth/PasswordInput'
import { FormError, FormNote } from '@/components/auth/AuthLayout'
import { Field } from '@/components/pm/ui'
import { useAuth } from '@/auth'
import { passwordOk } from '@/lib/auth'
import { useCan, useCurrentUser, useStore } from '@/store'
import { PERMISSIONS } from '@/lib/constants'

export default function SettingsPage() {
  const { roles, users, togglePermission, updateUser, deleteUser, addRole, reset } = useStore()
  const { user: me } = useCurrentUser()
  const [params, setParams] = useSearchParams()
  const can = useCan()
  const canRoles = can('roles.manage')
  const [newRole, setNewRole] = useState('')

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roles & Settings</h1>
          <p className="text-sm text-muted-foreground">Control who can edit job descriptions, tests, salary data and sharing.</p>
        </div>
        {!canRoles && <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"><Lock className="size-4" /> Roles, team and data tools are locked for your role. You can still manage your own account.</div>}
        <Tabs value={canRoles ? params.get('tab') ?? 'roles' : 'account'} onValueChange={(v) => setParams({ tab: v as string })}>
          <TabsList>
            {canRoles && <TabsTrigger value="roles">Roles & permissions</TabsTrigger>}
            {canRoles && <TabsTrigger value="users">Team{users.some((u) => u.status === 'pending') && <span className="ml-1.5 size-2 rounded-full bg-red-600" />}</TabsTrigger>}
            <TabsTrigger value="account">Account</TabsTrigger>
            {canRoles && <TabsTrigger value="data">Demo data</TabsTrigger>}
          </TabsList>

          {canRoles && <TabsContent value="roles" className="space-y-3 pt-4">
            {!canRoles && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Only roles with “Manage roles” can change this matrix.</div>}
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Permission</th>
                    {roles.map((r) => <th key={r.id} className="px-3 py-2.5 text-center font-medium">{r.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-4 py-2.5"><div className="font-medium">{p.label}</div><div className="text-xs text-muted-foreground">{p.hint}</div></td>
                      {roles.map((r) => (
                        <td key={r.id} className="px-3 text-center">
                          <Switch checked={r.permissions[p.id]} disabled={!canRoles || (r.id === 'r-admin')} onCheckedChange={() => togglePermission(r.id, p.id)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canRoles && (
              <div className="flex gap-2">
                <Input className="max-w-60" placeholder="New role name" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
                <Button variant="outline" onClick={() => { if (newRole.trim()) { addRole(newRole.trim()); setNewRole('') } }}><Plus /> Add role</Button>
              </div>
            )}
          </TabsContent>}

          {canRoles && <TabsContent value="users" className="space-y-2 pt-4">
            <p className="text-sm text-muted-foreground">New sign-ups wait here until an admin approves them and picks a role.</p>
            <div className="divide-y rounded-xl border">
              {[...users].sort((x, y) => Number(y.status === 'pending') - Number(x.status === 'pending')).map((u) => {
                const status = u.status ?? 'active'
                const self = u.id === me.id
                return (
                  <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">{u.name[0]}</div>
                    <div className="min-w-40 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">{u.name}{self && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                        {status === 'pending' && <Badge variant="secondary">Pending approval</Badge>}
                        {status === 'disabled' && <Badge variant="outline">Disabled</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <NativeSelect disabled={!canRoles || self} value={u.roleId} onChange={(v) => updateUser(u.id, { roleId: v })} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
                    {canRoles && !self && (
                      <div className="flex gap-1">
                        {status !== 'active' && <Button size="xs" onClick={() => updateUser(u.id, { status: 'active' })}>{status === 'pending' ? 'Approve' : 'Enable'}</Button>}
                        {status === 'active' && <Button size="xs" variant="outline" onClick={() => updateUser(u.id, { status: 'disabled' })}>Disable</Button>}
                        <Button size="xs" variant="ghost" className="text-destructive" onClick={() => confirm(`Remove ${u.name}? They will no longer be able to sign in.`) && deleteUser(u.id)}>Remove</Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </TabsContent>}

          <TabsContent value="account" className="pt-4">
            <ChangePassword />
          </TabsContent>

          {canRoles && <TabsContent value="data" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">Everything is stored in this browser (localStorage). There is no backend yet.</p>
            <Button variant="destructive" onClick={() => confirm('Reset all data to the demo set?') && reset()}>Reset demo data</Button>
          </TabsContent>}
        </Tabs>
      </div>
    </div>
  )
}

function ChangePassword() {
  const changePassword = useAuth((s) => s.changePassword)
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setDone(false); setError('')
    if (next !== again) return setError('New passwords do not match.')
    setBusy(true)
    const r = await changePassword(cur, next).catch((err: Error) => ({ ok: false as const, error: err.message }))
    setBusy(false)
    if (r.ok) { setDone(true); setCur(''); setNext(''); setAgain('') } else setError(r.error)
  }
  return (
    <form onSubmit={submit} className="max-w-sm space-y-3 rounded-xl border p-4">
      <div className="text-sm font-semibold">Change password</div>
      <Field label="Current password"><PasswordInput value={cur} onChange={setCur} autoComplete="current-password" /></Field>
      <Field label="New password"><PasswordInput value={next} onChange={setNext} autoComplete="new-password" /></Field>
      <PasswordRules value={next} />
      <Field label="Repeat new password"><PasswordInput value={again} onChange={setAgain} autoComplete="new-password" /></Field>
      <FormError>{error}</FormError>
      {done && <FormNote>Password updated.</FormNote>}
      <Button type="submit" disabled={busy || !cur || !passwordOk(next) || next !== again}>{busy ? 'Saving…' : 'Update password'}</Button>
    </form>
  )
}
