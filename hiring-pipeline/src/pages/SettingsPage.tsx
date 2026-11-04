import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect } from '@/components/NativeSelect'
import { useCan, useStore } from '@/store'
import { PERMISSIONS } from '@/lib/constants'

export default function SettingsPage() {
  const { roles, users, togglePermission, updateUser, addRole, reset } = useStore()
  const can = useCan()
  const canRoles = can('roles.manage')
  const [newRole, setNewRole] = useState('')

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roles & Settings</h1>
          <p className="text-sm text-muted-foreground">Control who can edit job descriptions, tests, salary data and sharing. Switch “Viewing as” in the sidebar to try each role.</p>
        </div>
        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles">Roles & permissions</TabsTrigger>
            <TabsTrigger value="users">Team</TabsTrigger>
            <TabsTrigger value="data">Demo data</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="space-y-3 pt-4">
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
          </TabsContent>

          <TabsContent value="users" className="pt-4">
            <div className="divide-y rounded-xl border">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold">{u.name[0]}</div>
                  <div className="flex-1"><div className="text-sm font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{u.email}</div></div>
                  <NativeSelect disabled={!canRoles} value={u.roleId} onChange={(v) => updateUser(u.id, { roleId: v })} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">Everything is stored in this browser (localStorage). There is no backend yet.</p>
            <Button variant="destructive" onClick={() => confirm('Reset all data to the demo set?') && reset()}>Reset demo data</Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
