import type { MailMessage, MailProvider, MailResult } from './provider.js'

/** Development provider: prints the message instead of sending it. Never use in production. */
export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console'
  readonly outbox: MailMessage[] = []

  constructor(private readonly quiet = false) {}

  async send(msg: MailMessage): Promise<MailResult> {
    this.outbox.push(msg)
    if (!this.quiet) {
      console.log(`\n--- mail (console provider) ---\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}\n-------------------------------\n`)
    }
    return { messageId: `console-${this.outbox.length}` }
  }
}
