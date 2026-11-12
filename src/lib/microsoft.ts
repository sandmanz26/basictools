import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser'
import type { Lead, MsConfig } from '@/types'

/** Delegated scopes: sign-in profile + send mail as the signed-in user. */
export const MS_SCOPES = ['User.Read', 'Mail.Send']

let cached: { key: string; app: PublicClientApplication } | null = null

async function getApp(cfg: MsConfig) {
  const key = `${cfg.clientId}|${cfg.tenant}`
  if (cached?.key === key) return cached.app
  const app = new PublicClientApplication({
    auth: {
      clientId: cfg.clientId,
      authority: `https://login.microsoftonline.com/${cfg.tenant || 'common'}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' }, // tokens never touch the app store or localStorage
  })
  await app.initialize()
  cached = { key, app }
  return app
}

export async function currentAccount(cfg: MsConfig): Promise<AccountInfo | null> {
  if (!cfg.clientId) return null
  const app = await getApp(cfg)
  return app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null
}

export async function signIn(cfg: MsConfig): Promise<AccountInfo> {
  const app = await getApp(cfg)
  const res = await app.loginPopup({ scopes: MS_SCOPES, prompt: 'select_account' })
  app.setActiveAccount(res.account)
  return res.account
}

export async function signOut(cfg: MsConfig) {
  const app = await getApp(cfg)
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0]
  if (account) await app.logoutPopup({ account, postLogoutRedirectUri: window.location.origin })
}

async function token(cfg: MsConfig): Promise<string> {
  const app = await getApp(cfg)
  const account = app.getActiveAccount() ?? app.getAllAccounts()[0]
  if (!account) throw new Error('Not signed in to Microsoft.')
  try {
    return (await app.acquireTokenSilent({ scopes: MS_SCOPES, account })).accessToken
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) return (await app.acquireTokenPopup({ scopes: MS_SCOPES, account })).accessToken
    throw e
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const toHtml = (text: string) => `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.5">${esc(text).replace(/\r?\n/g, '<br>')}</div>`

/** Send one email as the signed-in user via Microsoft Graph. It also lands in the user's Sent Items. */
export interface MailAttachment { name: string; contentType: string; base64: string }

export async function sendMail(cfg: MsConfig, to: string, subject: string, body: string, attachments: MailAttachment[] = []): Promise<void> {
  const accessToken = await token(cfg)
  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject, body: { contentType: 'HTML', content: toHtml(body) }, toRecipients: [{ emailAddress: { address: to } }],
        ...(attachments.length ? { attachments: attachments.map((a) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.contentType, contentBytes: a.base64 })) } : {}),
      },
      saveToSentItems: true,
    }),
  })
  if (res.status === 202) return
  let msg = `Graph error ${res.status}`
  try { msg = (await res.json()).error?.message ?? msg } catch { /* ignore */ }
  throw new Error(friendlyMsError(`${res.status} ${msg}`))
}

/** Confirms the token works and the mailbox can be reached. */
export async function testConnection(cfg: MsConfig): Promise<{ name: string; mail: string }> {
  const accessToken = await token(cfg)
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(friendlyMsError(`${res.status} ${await res.text().catch(() => '')}`))
  const me = await res.json()
  return { name: me.displayName ?? '', mail: me.mail ?? me.userPrincipalName ?? '' }
}

/** Turn raw Microsoft error text into what went wrong and the exact place to fix it. */
export function friendlyMsError(raw: string): string {
  const m = raw || ''
  if (m.includes('\n\nDetails:')) return m // already translated
  const rules: [RegExp, string][] = [
    [/AADSTS50011|redirect_uri_mismatch|redirect uri/i, `Redirect URI mismatch. In Entra: App registrations → your app → Authentication → Single-page application → Add URI → ${window.location.origin} → Save.`],
    [/AADSTS9002326|cross-origin token redemption/i, 'The redirect URI is registered as "Web". In Entra: App registrations → your app → Authentication → remove it from "Web" and add it under "Single-page application".'],
    [/AADSTS700016|application with identifier .* was not found/i, 'Microsoft does not know this client ID in that directory. Re-copy "Application (client) ID" from the app Overview page, and check "Who can sign in" matches how the app was registered.'],
    [/AADSTS90002|tenant .* not found|AADSTS900023/i, 'Tenant not found. Use "Directory (tenant) ID" from the app Overview page, or pick "Work or school accounts only".'],
    [/AADSTS50020|does not exist in tenant|AADSTS50034/i, 'This account is not in the directory the app allows. Use a company account, or change "Supported account types" under Authentication → Supported accounts.'],
    [/AADSTS65001|consent_required|admin_consent|AADSTS90094|AADSTS650056/i, 'Permission not approved yet. In Entra: App registrations → your app → API permissions → "Grant admin consent for …" (needs an admin). Mail.Send must show a green tick.'],
    [/AADSTS53003|AADSTS530003|conditional access/i, 'A conditional-access policy blocks this sign-in. Ask your IT admin to allow it for this app or this device.'],
    [/AADSTS50105|AADSTS50177|assignment required/i, 'You are not assigned to this app. Ask an admin to add you under Enterprise applications → your app → Users and groups.'],
    [/popup_window_error|empty_window_error|popup/i, 'The Microsoft sign-in popup was blocked. Allow popups for this site in the browser address bar, then click Connect again.'],
    [/user_cancelled|user cancelled/i, 'Sign-in was cancelled.'],
    [/MailboxNotEnabledForRESTAPI|mailbox.*(not|inactive|soft)|ErrorInvalidUser|REST API is not yet supported/i, 'This account has no Exchange Online mailbox (no Microsoft 365 license with email), so it cannot send. Ask your admin to assign a license that includes Exchange Online.'],
    [/^401|InvalidAuthenticationToken|token.*expired/i, 'Microsoft rejected the sign-in token. Click Disconnect, then Connect Microsoft again.'],
    [/^403|ErrorAccessDenied|Access is denied|Authorization_RequestDenied/i, 'Microsoft denied the request. Check Mail.Send is added under API permissions and approved, then Disconnect and Connect again.'],
    [/^429|throttl|TooManyRequests|ApplicationThrottled/i, 'Microsoft is rate-limiting this mailbox (about 30 messages per minute). Wait a minute and retry with a slower pace.'],
    [/Failed to fetch|NetworkError|network/i, 'Could not reach Microsoft. Check your internet connection or whether a firewall or VPN blocks graph.microsoft.com.'],
  ]
  for (const [re, text] of rules) if (re.test(m)) return `${text}\n\nDetails: ${m.slice(0, 220)}`
  return m
}

/** Fill {{name}}, {{firstName}}, {{company}}, {{title}}, {{owner}} from a lead. Unknown variables are left visible. */
export function merge(text: string, l: Lead): string {
  const vars: Record<string, string> = {
    name: l.name, firstName: l.name.trim().split(/\s+/)[0] ?? '', company: l.company, title: l.title, owner: l.owner,
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

export const MERGE_FIELDS = ['name', 'firstName', 'company', 'title', 'owner']
