// Fetch wrapper for the HireFlow API. Switched on by VITE_API_URL (for example "/api/v1" when the API runs on the
// same domain as the app, as on Vercel). Empty = demo mode: the app keeps using the browser store.

export const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
export const API_ON = API_BASE !== ''

export class ApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

// The access token lives in memory only (never localStorage). The refresh cookie is httpOnly and handled by the browser.
let accessToken: string | null = null
let onUnauthorized: () => void = () => undefined
export const setAccessToken = (t: string | null) => { accessToken = t }
export const getAccessToken = () => accessToken
export const setOnUnauthorized = (fn: () => void) => { onUnauthorized = fn }

type Opts = { auth?: boolean; query?: Record<string, string | number | boolean | undefined | null> }

function url(path: string, query?: Opts['query']) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return `${API_BASE}${path}${s ? `?${s}` : ''}`
}

async function send(method: string, path: string, body: unknown, opts: Opts, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`
  // Cookies are only needed for /auth/*; everything else uses the bearer token.
  return fetch(url(path, opts.query), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: path.startsWith('/auth/') ? 'include' : 'same-origin' })
}

async function toError(res: Response): Promise<ApiError> {
  let code = 'HTTP_' + res.status
  let message = res.statusText || 'Request failed.'
  let details: unknown
  try {
    const j = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } }
    if (j.error) { code = j.error.code ?? code; message = j.error.message ?? message; details = j.error.details }
  } catch { /* not JSON */ }
  return new ApiError(res.status, code, message, details)
}

// One refresh at a time: two parallel refreshes look like token theft to the server and end the session.
let refreshing: Promise<boolean> | null = null
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await send('POST', '/auth/refresh', undefined, { auth: false }, null)
      if (!res.ok) return false
      const s = (await res.json()) as { accessToken: string }
      accessToken = s.accessToken
      return true
    } catch { return false } finally { setTimeout(() => { refreshing = null }, 0) }
  })()
  return refreshing
}

export async function api<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, opts: Opts = {}): Promise<T> {
  let res: Response
  try { res = await send(method, path, body, opts, accessToken) } catch { throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.') }
  if (res.status === 401 && opts.auth !== false && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(method, path, body, opts, accessToken)
    if (res.status === 401) { accessToken = null; onUnauthorized() }
  }
  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const get = <T>(path: string, query?: Opts['query']) => api<T>('GET', path, undefined, { query })
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body)
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body)
export const put = <T>(path: string, body?: unknown) => api<T>('PUT', path, body)
export const del = <T>(path: string) => api<T>('DELETE', path)
