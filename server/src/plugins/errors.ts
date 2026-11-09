import type { FastifyError, FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod'
import { AppError } from '../lib/errors.js'

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string }
}

/** One error envelope for everything: { error: { code, message, details?, requestId } }. */
export function registerErrorHandling(app: FastifyInstance, isProd: boolean): void {
  app.setNotFoundHandler((req, reply) => {
    const body: ErrorBody = { error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url.split('?')[0]} not found.`, requestId: req.id } }
    void reply.code(404).send(body)
  })

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    let status = 500
    let code = 'INTERNAL_ERROR'
    let message = 'Something went wrong on our side.'
    let details: unknown

    if (err instanceof AppError) {
      status = err.status
      code = err.code
      message = err.message
      details = err.details
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      status = 400
      code = 'VALIDATION_ERROR'
      message = 'The request is not valid.'
      details = err.validation.map((v) => ({
        path: v.instancePath.replace(/^\//, '').replace(/\//g, '.') || undefined,
        message: v.message,
      }))
    } else if (isResponseSerializationError(err)) {
      req.log.error({ err }, 'response did not match its schema')
    } else {
      const fe = err as FastifyError
      if (typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
        status = fe.statusCode
        code = fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : (fe.code ?? 'BAD_REQUEST')
        message = fe.message
      }
    }

    if (status >= 500) {
      req.log.error({ err }, 'request failed')
      // Never leak internals in production; in dev the message helps.
      if (!isProd) message = err.message
    } else {
      req.log.info({ code, status }, 'request rejected')
    }
    const body: ErrorBody = { error: { code, message, requestId: req.id, ...(details !== undefined ? { details } : {}) } }
    void reply.code(status).send(body)
  })
}
