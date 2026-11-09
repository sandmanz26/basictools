export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  /** Fastify and plugins read `statusCode`. */
  get statusCode(): number {
    return this.status
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details)
export const unauthorized = (message = 'Authentication required.') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'You do not have permission to do this.') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`)
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message)
export const tooMany = (message = 'Too many requests. Try again later.') => new AppError(429, 'RATE_LIMITED', message)
