// Pure helpers behind the broadcast worker: easy to unit test, no I/O.

export interface SendCaps {
  perMinute: number
  perDay: number
  /** Local hour the window opens (inclusive) and closes (exclusive), in `tz`. 0..24 covers the whole day. */
  windowStartHour: number
  windowEndHour: number
  tz: string
}

/** Hour of day (0-23) in the given IANA time zone. */
export function localHour(now: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).formatToParts(now).find((p) => p.type === 'hour')?.value
  return Number(h) % 24
}

export function inSendWindow(now: Date, caps: Pick<SendCaps, 'windowStartHour' | 'windowEndHour' | 'tz'>): boolean {
  const { windowStartHour: start, windowEndHour: end } = caps
  if (start === end || (start <= 0 && end >= 24)) return true
  const h = localHour(now, caps.tz)
  return h >= start && h < end
}

/**
 * How many messages may start right now.
 * `inMinute` / `today` must already include messages that are claimed but not yet finished, so parallel workers cannot overshoot.
 */
export function sendBudget(caps: Pick<SendCaps, 'perMinute' | 'perDay'>, inMinute: number, today: number): number {
  return Math.max(0, Math.min(caps.perMinute - inMinute, caps.perDay - today))
}

/** Exponential backoff: base * 2^(attempt-1), capped. `attempt` is the number of tries already made (>= 1). */
export function backoffSeconds(attempt: number, baseSeconds: number, capSeconds = 6 * 3600): number {
  return Math.min(capSeconds, baseSeconds * 2 ** Math.max(0, attempt - 1))
}
