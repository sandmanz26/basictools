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
  throw new Error(msg)
}

/** Fill {{name}}, {{firstName}}, {{company}}, {{title}}, {{owner}} from a lead. Unknown variables are left visible. */
export function merge(text: string, l: Lead): string {
  const vars: Record<string, string> = {
    name: l.name, firstName: l.name.trim().split(/\s+/)[0] ?? '', company: l.company, title: l.title, owner: l.owner,
  }
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in vars ? vars[k] : m))
}

export const MERGE_FIELDS = ['name', 'firstName', 'company', 'title', 'owner']
