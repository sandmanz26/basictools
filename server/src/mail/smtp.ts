import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { MailError, type MailMessage, type MailProvider, type MailResult } from './provider.js'

export interface SmtpOptions {
  host: string
  port: number
  secure: boolean
  user?: string
  password?: string
  from: string
}

export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp'
  private readonly transport: Transporter

  constructor(private readonly opts: SmtpOptions) {
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      auth: opts.user ? { user: opts.user, pass: opts.password ?? '' } : undefined,
      pool: true,
      maxConnections: 2,
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    })
  }

  async send(msg: MailMessage): Promise<MailResult> {
    const domain = this.opts.from.match(/@([^>\s]+)/)?.[1] ?? 'localhost'
    try {
      const info = await this.transport.sendMail({
        from: this.opts.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        headers: msg.headers,
        // Deterministic Message-ID: a duplicate delivery is detectable by the receiving side.
        messageId: msg.idempotencyKey ? `<${msg.idempotencyKey}@${domain}>` : undefined,
      })
      return { messageId: info.messageId }
    } catch (err) {
      const e = err as { responseCode?: number; message?: string }
      // 5xx = permanent rejection (unknown mailbox, policy). 4xx / network errors are worth retrying.
      const permanent = typeof e.responseCode === 'number' && e.responseCode >= 500
      throw new MailError(e.message ?? 'SMTP error', !permanent)
    }
  }

  async close(): Promise<void> {
    this.transport.close()
  }
}
