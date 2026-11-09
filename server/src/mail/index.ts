import type { Config } from '../config.js'
import { ConsoleMailProvider } from './console.js'
import { GraphMailProvider } from './graph.js'
import type { MailProvider } from './provider.js'
import { SmtpMailProvider } from './smtp.js'

export function createMailProvider(config: Config): MailProvider {
  switch (config.MAIL_PROVIDER) {
    case 'smtp':
      return new SmtpMailProvider({
        host: config.SMTP_HOST ?? '',
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        user: config.SMTP_USER,
        password: config.SMTP_PASSWORD,
        from: config.MAIL_FROM,
      })
    case 'graph':
      return new GraphMailProvider({
        tenantId: config.GRAPH_TENANT_ID ?? '',
        clientId: config.GRAPH_CLIENT_ID ?? '',
        clientSecret: config.GRAPH_CLIENT_SECRET ?? '',
        sender: config.GRAPH_SENDER ?? '',
      })
    default:
      return new ConsoleMailProvider()
  }
}

export type { MailProvider, MailMessage, MailResult } from './provider.js'
export { MailError } from './provider.js'
