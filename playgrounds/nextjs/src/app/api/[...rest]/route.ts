import { OpenAPIServerlessHandler } from '@orpc/openapi/fetch'
import { ZodCoercer } from '@orpc/zod'
import { router } from '../../router'
import '../../../polyfill'

const openAPIHandler = new OpenAPIServerlessHandler(router, {
  schemaCoercers: [
    new ZodCoercer(),
  ],
  onError: ({ error }) => {
    console.error(error)
  },
})

export async function GET(request: Request) {
  const { matched, response } = await openAPIHandler.handle(request, { prefix: '/api' })

  if (matched) {
    return response
  }

  // Your custom logic here (e.g., calling `next()` in Express.js or Hono.js)

  return new Response('Not found', { status: 404 })
}

export const POST = GET
export const PUT = GET
export const DELETE = GET
export const PATCH = GET
