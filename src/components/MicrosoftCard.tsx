import { useState } from 'react'
import { CheckCircle2, LogIn, LogOut, MailCheck, PlugZap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/NativeSelect'
import { Card, Field } from '@/components/pm/ui'
import { useStore } from '@/store'
import { useMicrosoft } from '@/lib/useMicrosoft'
import { MicrosoftGuide } from '@/components/MicrosoftGuide'
import { friendlyMsError, sendMail, testConnection } from '@/lib/microsoft'

const TENANTS = [
  { value: 'common', label: 'Work, school and personal accounts' },
  { value: 'organizations', label: 'Work or school accounts only' },
  { value: 'consumers', label: 'Personal accounts only' },
]

/** Shared Microsoft connection card: Azure client ID, sign in/out. Used by Marketing and PM settings. */
export function MicrosoftCard({ canEdit }: { canEdit: boolean }) {
  const { msConfig, setMsConfig } = useStore()
  const ms = useMicrosoft()
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const check = async (kind: 'connect' | 'mail') => {
    setTesting(true); setTest(null)
    try {
      const me = await testConnection(msConfig)
      if (kind === 'mail') {
        const to = ms.account?.username || me.mail
        await sendMail(msConfig, to, 'HireFlow test email', 'This is a test from HireFlow. Your Microsoft connection works.')
        setTest({ ok: true, text: `Test email sent to ${to}. Check your inbox (and Sent Items).` })
      } else setTest({ ok: true, text: `Connection works. Signed in as ${me.name || me.mail} (${me.mail}).` })
    } catch (e) { setTest({ ok: false, text: friendlyMsError(e instanceof Error ? e.message : String(e)) }) }
    setTesting(false)
  }
  const custom = !TENANTS.some((t) => t.value === msConfig.tenant)
  return (
        <Card title="Microsoft account">
          <div className="space-y-4">
            {ms.account ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <div className="flex-1"><div className="font-medium">Connected as {ms.account.name ?? ms.account.username}</div><div className="text-xs text-muted-foreground">{ms.account.username}</div></div>
                <Button variant="outline" size="sm" disabled={testing} onClick={() => check('connect')}><PlugZap /> Test connection</Button>
                <Button variant="outline" size="sm" disabled={testing} onClick={() => check('mail')}><MailCheck /> Send test email to me</Button>
                <Button variant="outline" size="sm" disabled={ms.busy} onClick={ms.disconnect}><LogOut /> Disconnect</Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!ms.configured || ms.busy} onClick={ms.connect}><LogIn /> Connect Microsoft</Button>
                {!ms.configured && <span className="text-sm text-muted-foreground">Enter the Application (client) ID below first.</span>}
              </div>
            )}
            {test && <div className={test.ok ? 'rounded-lg bg-emerald-50 px-3 py-2 text-sm whitespace-pre-line text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300'}>{test.text}</div>}
            {ms.error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-700 dark:bg-red-950 dark:text-red-300">{ms.error}</div>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Application (client) ID"><Input disabled={!canEdit} placeholder="00000000-0000-0000-0000-000000000000" value={msConfig.clientId} onChange={(e) => setMsConfig({ clientId: e.target.value.trim() })} /></Field>
              <Field label="Who can sign in">
                <NativeSelect disabled={!canEdit} className="w-full" value={custom ? 'custom' : msConfig.tenant} onChange={(v) => setMsConfig({ tenant: v === 'custom' ? '' : v })} options={[...TENANTS, { value: 'custom', label: 'A specific tenant ID…' }]} />
                {custom && <Input className="mt-1.5" disabled={!canEdit} placeholder="Tenant ID" value={msConfig.tenant} onChange={(e) => setMsConfig({ tenant: e.target.value.trim() })} />}
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Only the client ID is stored here (it is not a secret). Sign-in tokens stay in this browser tab’s session and are never saved with your data. You can also preset the ID with <code>VITE_MS_CLIENT_ID</code> at build time.</p>

            <MicrosoftGuide defaultOpen={!ms.configured} />
          </div>
        </Card>
  )
}
