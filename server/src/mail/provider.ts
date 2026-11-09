export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>
  /**
   * Stable id for this logical message (the broadcast recipient id). Providers that support it use it as the
   * Message-ID so a duplicate attempt is recognisable downstream.
   */
  idempotencyKey?: string
}

export interface MailResult {
  messageId: string
}

/** Thrown by providers. `retryable=false` means "do not try again" (bad address, rejected content). */
export class MailError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'MailError'
  }
}

export interface MailProvider {
  readonly name: string
  send: (msg: MailMessage) => Promise<MailResult>
  close?: () => Promise<void>
}
