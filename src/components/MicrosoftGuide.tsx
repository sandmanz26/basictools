import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { MS_SCOPES } from '@/lib/microsoft'

function Copyable({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {text}
      <button type="button" title="Copy" className="text-muted-foreground hover:text-foreground" onClick={() => { void navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200) }}>
        {ok ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  )
}

const Click = ({ children }: { children: ReactNode }) => <b className="rounded border bg-background px-1 py-px text-[13px] text-foreground">{children}</b>
const Arrow = () => <span className="mx-1 text-muted-foreground">›</span>

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="space-y-1.5 text-sm text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

const Problem = ({ error, fix }: { error: string; fix: ReactNode }) => (
  <tr className="border-t align-top"><td className="py-2 pr-3 font-mono text-xs">{error}</td><td className="py-2 text-muted-foreground">{fix}</td></tr>
)

/** Click-by-click Azure / Microsoft Entra setup for sending email from this app. */
export function MicrosoftGuide({ defaultOpen }: { defaultOpen?: boolean }) {
  const origin = window.location.origin
  return (
    <details open={defaultOpen} className="rounded-lg border bg-muted/30 p-4">
      <summary className="cursor-pointer text-sm font-semibold">Setup guide: what to click in Microsoft (about 10 minutes)</summary>
      <div className="mt-4 space-y-5">
        <div className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
          <b className="text-foreground">What you need first:</b> a Microsoft 365 work account with an Outlook mailbox (Exchange Online license). To create the app you need the <Click>Application Developer</Click> role or higher; to approve permissions you may need an admin. If you cannot see the pages below, send step 8 to your IT admin.
        </div>

        <ol className="space-y-4">
          <Step n={1} title="Open the Microsoft Entra admin center">
            <p>Go to <a className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4" href="https://entra.microsoft.com" target="_blank" rel="noreferrer">entra.microsoft.com <ExternalLink className="size-3" /></a> and sign in with your <b>company</b> account. (Same thing: portal.azure.com <Arrow /> search “Microsoft Entra ID”.)</p>
          </Step>

          <Step n={2} title="Create the app registration">
            <p>Left menu <Click>Entra ID</Click><Arrow /><Click>App registrations</Click><Arrow />top bar <Click>+ New registration</Click>. <span className="text-xs">(Older layout: <b>Identity <Arrow /> Applications <Arrow /> App registrations</b>.)</span></p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b>Name:</b> <Copyable text="HireFlow" /> (anything you like).</li>
              <li><b>Supported account types:</b> choose <Click>Accounts in this organizational directory only</Click> if only your company will use it (recommended). Choose “…any organizational directory” if other companies’ accounts must sign in.</li>
              <li><b>Redirect URI:</b> open the dropdown <Click>Select a platform</Click> and pick <Click>Single-page application (SPA)</Click>, not “Web”. Paste: <Copyable text={origin} /></li>
              <li>Click <Click>Register</Click>.</li>
            </ul>
          </Step>

          <Step n={3} title="Copy the IDs">
            <p>You land on the app’s <Click>Overview</Click> page. Copy <b>Application (client) ID</b> into the field “Application (client) ID” above. Also copy <b>Directory (tenant) ID</b> (needed only for “A specific tenant ID…”).</p>
          </Step>

          <Step n={4} title="Give the app permission to send mail">
            <p>Left menu <Click>API permissions</Click><Arrow /><Click>+ Add a permission</Click><Arrow /><Click>Microsoft Graph</Click><Arrow /><Click>Delegated permissions</Click> (not “Application”).</p>
            <p>Search and tick {MS_SCOPES.map((s) => <Copyable key={s} text={s} />)}{' '}(User.Read is usually already there), then click <Click>Add permissions</Click>.</p>
            <p className="text-xs">The app sends email as the person who signs in. It cannot read an inbox unless you also add the optional permission below.</p>
            <p><b>Optional, only for “Microsoft test lab” (reading your inbox):</b> repeat the same steps and also tick <Copyable text="Mail.Read" /> (group <b>Mail</b>, Delegated). It is read-only and normally needs no admin. The first time you load the inbox, Microsoft shows a “Permissions requested” popup to accept. Skip it if you do not need that test.</p>
            <p><b>Optional, for “Meetings & follow-up” (reading your calendar):</b> also tick <Copyable text="Calendars.Read" /> (group <b>Calendars</b>, Delegated). Read-only, normally no admin needed; Microsoft shows a “Permissions requested” popup the first time you load meetings.</p>
            <p><b>Optional, for scheduling meetings from a project:</b> tick <Copyable text="Calendars.ReadWrite" /> instead of Calendars.Read. It lets HireFlow create the Outlook event and send the invitations.</p>
            <p><b>Optional, for project documents in SharePoint / OneDrive:</b> tick <Copyable text="Files.ReadWrite.All" /> (Delegated). Most companies need an admin to approve it. HireFlow only touches the folder you set in “SharePoint documents” above.</p>
          </Step>

          <Step n={5} title="Approve the permissions">
            <p>Still on <b>API permissions</b>: if you are an admin, click <Click>Grant admin consent for your company</Click><Arrow /><Click>Yes</Click>. The Status column must show a green tick for Mail.Send.</p>
            <p>Not an admin? Skip it: the first person who clicks Connect sees a Microsoft “Permissions requested” screen and can accept for themselves. If it says <i>“Need admin approval”</i>, send step 8 to your admin.</p>
          </Step>

          <Step n={6} title="Add more addresses later (e.g. your live website)">
            <p>Left menu <Click>Authentication</Click>. Under <b>Single-page application</b> click <Click>Add URI</Click>, paste your live address <Copyable text="https://ainstooling.vercel.app" /> (no trailing slash), then <Click>Save</Click>. Each address the app runs on needs its own entry. Localhost is <Copyable text="http://localhost:5173" /> and must match exactly (no trailing slash).</p>
          </Step>

          <Step n={7} title="Connect in this app">
            <p>Paste the client ID above, pick “Who can sign in” (matches step 2), then click <Click>Connect Microsoft</Click>. A popup opens: allow popups for this site, sign in, accept the permissions. Then click <Click>Test connection</Click> and <Click>Send test email to me</Click>.</p>
          </Step>

          <Step n={8} title="If an admin must do it for you, send them this">
            <div className="rounded-lg border bg-background p-3 text-xs leading-relaxed">
              Please register an app in Microsoft Entra (entra.microsoft.com <Arrow /> Entra ID <Arrow /> App registrations <Arrow /> New registration). Name “HireFlow”, single tenant, redirect URI platform <b>Single-page application</b> = <code>https://ainstooling.vercel.app</code> (also <code>{origin}</code> for testing). Under API permissions add Microsoft Graph <b>Delegated</b>: User.Read and Mail.Send, then “Grant admin consent”. Send me the <b>Application (client) ID</b> and <b>Directory (tenant) ID</b>. No client secret is needed.
            </div>
          </Step>
        </ol>

        <div>
          <div className="mb-1 text-sm font-semibold">If something goes wrong</div>
          <table className="w-full text-left text-sm">
            <tbody>
              <Problem error="AADSTS50011" fix={<>Redirect URI mismatch: repeat step 6 with the exact address in your browser bar.</>} />
              <Problem error="AADSTS9002326" fix={<>The address was added under “Web”. Move it to <b>Single-page application</b> (step 6).</>} />
              <Problem error="AADSTS700016" fix={<>Wrong client ID, or “Who can sign in” does not match the app (step 2 and 3).</>} />
              <Problem error="Need admin approval / AADSTS65001" fix={<>Step 5: an admin must click “Grant admin consent”.</>} />
              <Problem error="Popup closes or never opens" fix={<>Allow popups for this site in the address bar, then click Connect again.</>} />
              <Problem error="MailboxNotEnabledForRESTAPI" fix={<>That account has no Exchange Online mailbox. Ask admin to assign a Microsoft 365 license with email.</>} />
              <Problem error="429 / throttled" fix={<>Microsoft allows about 30 emails per minute and 10,000 recipients per day per mailbox. The app already paces sends; wait and retry.</>} />
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">Good to know: emails are sent from the mailbox of whoever signs in and appear in their Sent Items. Tokens stay in this browser tab only. Shared mailboxes and “send as” another address are not supported yet. For large newsletters use a mailing service; this is meant for personal outreach.</p>
        <a className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted" href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">Open App registrations <ExternalLink className="size-3.5" /></a>
      </div>
    </details>
  )
}
