import swagger from '@fastify/swagger'
import type { FastifyInstance } from 'fastify'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

export async function registerDocs(app: FastifyInstance, enableUi: boolean): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: { title: 'HireFlow API', version: '0.1.0', description: 'HR pipeline, PM/billing and marketing broadcast backend.' },
      servers: [{ url: '/' }],
      components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  })
  if (enableUi) {
    // Loaded only when the docs UI is on: its @fastify/static dependency pulls an ES-only package that older Node cannot require().
    const { default: swaggerUi } = await import('@fastify/swagger-ui')
    await app.register(swaggerUi, { routePrefix: '/docs' })
  }
}
