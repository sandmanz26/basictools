import { MailError, type MailMessage, type MailProvider, type MailResult } from './provider.js'

export interface GraphOptions {
  tenantId: string
  clientId: string
  clientSecret: string
  /** Mailbox the mail is sent from (user principal name). */
  sender: string
}

/**
 * Microsoft Graph sendMail provider.
 *
 * STATUS: needs real app credentials before it can be used. Register an app in Microsoft Entra ID, add the
 * *application* permission Mail.Send, grant admin consent, create a client secret and (recommended) restrict the
 * app to one mailbox with an Exchange ApplicationAccessPolicy. It has not been run against a live tenant.
 */
export class GraphMailProvider implements MailProvider {
  readonly name = 'graph'
  private token: { value: string; expiresAt: number } | null = null

  constructor(private readonly opts: GraphOptions) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value
    const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(this.opts.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_secret: this.opts.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    })
    if (!res.ok) throw new MailError(`Graph token request failed (${res.status})`, res.status >= 500 || res.status === 429)
    const body = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!body.access_token) throw new MailError('Graph token response had no access_token', true)
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 }
    return body.access_token
  }

  async send(msg: MailMessage): Promise<MailResult> {
    const token = await this.accessToken()
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.opts.sender)}/sendMail`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: msg.subject,
          body: msg.html ? { contentType: 'HTML', content: msg.html } : { contentType: 'Text', content: msg.text },
          toRecipients: [{ emailAddress: { address: msg.to } }],
          // Graph only accepts custom headers prefixed x-.
          internetMessageHeaders: Object.entries(msg.headers ?? {})
            .filter(([k]) => k.toLowerCase().startsWith('x-'))
            .map(([name, value]) => ({ name, value })),
        },
        saveToSentItems: false,
      }),
    })
    if (res.status === 202) return { messageId: msg.idempotencyKey ?? `graph-${Date.now()}` }
    if (res.status === 401) this.token = null
    // 429 and 5xx: throttled or transient. 4xx otherwise: bad request / address, retrying will not help.
    const retryable = res.status === 429 || res.status === 401 || res.status >= 500
    throw new MailError(`Graph sendMail failed (${res.status})`, retryable)
  }
}
