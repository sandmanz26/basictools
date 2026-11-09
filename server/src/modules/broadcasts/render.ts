import type { Config } from '../../config.js'
import { signUnsubscribeToken } from '../../lib/unsubscribe.js'
import type { MailMessage } from '../../mail/provider.js'

/** Merge fields supported in subject and body, same as the frontend templates. */
export const MERGE_FIELDS = ['name', 'firstName', 'company', 'title', 'owner'] as const

export function fillMerge(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => values[key] ?? '')
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function unsubscribeUrl(config: Pick<Config, 'PUBLIC_API_URL' | 'UNSUBSCRIBE_SECRET'>, email: string, broadcastId: string): string {
  return `${config.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/unsubscribe/${signUnsubscribeToken(config.UNSUBSCRIBE_SECRET, { email, broadcastId })}`
}

/** Build the message for one recipient: merge fields, footer with unsubscribe link, one-click headers. */
export function renderBroadcast(
  b: { subject: string; body: string; footer: boolean },
  r: { email: string; broadcastId: string; merge: Record<string, string> },
  config: Pick<Config, 'PUBLIC_API_URL' | 'UNSUBSCRIBE_SECRET' | 'BROADCAST_FOOTER_ADDRESS'>,
): Omit<MailMessage, 'idempotencyKey'> {
  const url = unsubscribeUrl(config, r.email, r.broadcastId)
  // Header injection guard: a merge value must never add a new header line to the subject.
  const subject = fillMerge(b.subject, r.merge).replace(/[\r\n]+/g, ' ').trim()
  let text = fillMerge(b.body, r.merge)
  if (b.footer) {
    const address = config.BROADCAST_FOOTER_ADDRESS ? `${config.BROADCAST_FOOTER_ADDRESS}\n` : ''
    text += `\n\n--\n${address}Do not want these emails? Unsubscribe: ${url}`
  }
  const html = `<div style="white-space:pre-wrap;font-family:sans-serif;font-size:14px">${escapeHtml(text).replace(
    escapeHtml(url),
    `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`,
  )}</div>`
  return {
    to: r.email,
    subject,
    text,
    html,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  }
}
