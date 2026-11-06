import { CheckCircle2, LogIn, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Field } from '@/components/pm/ui'
import { useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { MS_SCOPES } from '@/lib/microsoft'

const TENANTS = [
  { value: 'common', label: 'Work, school and personal accounts' },
  { value: 'organizations', label: 'Work or school accounts only' },
  { value: 'consumers', label: 'Personal accounts only' },
]

/** Shared Microsoft connection card: Azure client ID, sign in/out. Used by Marketing and PM settings. */
export function MicrosoftCard({ canEdit }: { canEdit: boolean }) {
  const { msConfig, setMsConfig } = useStore()
  const ms = useMicrosoft()
  const custom = !TENANTS.some((t) => t.value === msConfig.tenant)
  return (
        <Card title="Microsoft account">
          <div className="space-y-4">
            {ms.account ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <div className="flex-1"><div className="font-medium">Connected as {ms.account.name ?? ms.account.username}</div><div className="text-xs text-muted-foreground">{ms.account.username}</div></div>
                <Button variant="outline" size="sm" disabled={ms.busy} onClick={ms.disconnect}><LogOut /> Disconnect</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!ms.configured || ms.busy} onClick={ms.connect}><LogIn /> Connect Microsoft</Button>
                {!ms.configured && <span className="text-sm text-muted-foreground">Enter the Application (client) ID below first.</span>}
              </div>
            )}
            {ms.error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{ms.error}</div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Application (client) ID"><Input disabled={!canEdit} placeholder="00000000-0000-0000-0000-000000000000" value={msConfig.clientId} onChange={(e) => setMsConfig({ clientId: e.target.value.trim() })} /></Field>
              <Field label="Who can sign in">
                <NativeSelect disabled={!canEdit} className="w-full" value={custom ? 'custom' : msConfig.tenant} onChange={(v) => setMsConfig({ tenant: v === 'custom' ? '' : v })} options={[...TENANTS, { value: 'custom', label: 'A specific tenant ID…' }]} />
                {custom && <Input className="mt-1.5" disabled={!canEdit} placeholder="Tenant ID" value={msConfig.tenant} onChange={(e) => setMsConfig({ tenant: e.target.value.trim() })} />}
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Only the client ID is stored here (it is not a secret). Sign-in tokens stay in this browser tab’s session and are never saved with your data. You can also preset the ID with <code>VITE_MS_CLIENT_ID</code> at build time.</p>

            <details className="rounded-lg border bg-muted/30 p-3 text-sm">
              <summary className="cursor-pointer font-medium">One-time Azure setup (about 5 minutes)</summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted-foreground">
                <li>Open <b>entra.microsoft.com</b> → App registrations → <b>New registration</b>.</li>
                <li>Pick the account type that matches “Who can sign in” above.</li>
                <li>Redirect URI: platform <b>Single-page application (SPA)</b>, value <code className="rounded bg-muted px-1">{window.location.origin}</code>. Add your production URL too.</li>
                <li>API permissions → Add → Microsoft Graph → <b>Delegated</b>: {MS_SCOPES.map((s) => <code key={s} className="mr-1 rounded bg-muted px-1">{s}</code>)}. Work accounts may need an admin to click “Grant admin consent”.</li>
                <li>Copy the <b>Application (client) ID</b> from the Overview page into the field above.</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">Limits to keep in mind: Microsoft 365 allows about 30 messages per minute and 10,000 recipients per day per mailbox; personal Outlook accounts are stricter. This is meant for personal, one-to-one outreach, not bulk newsletters.</p>
            </details>
          </div>
        </Card>
  )
}
