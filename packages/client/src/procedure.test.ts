import { ORPCError, createRouterHandler, initORPC } from '@orpc/server'
import { fetchHandler } from '@orpc/server/fetch'
import { z } from 'zod'
import { createProcedureClient } from './procedure'

describe('createProcedureClient', () => {
  const orpc = initORPC
  const schema = z.object({
    value: z.string(),
  })
  const ping = orpc.input(schema).handler((_, __, { path }) => path)
  const router = orpc.router({
    ping,
    nested: {
      ping,
    },
  })
  const handler = createRouterHandler({
    router,
  })
  const orpcFetch: typeof fetch = async (...args) => {
    const request = new Request(...args)
    const response = await fetchHandler({
      prefix: '/orpc',
      request,
      handler,
      context: {},
    })
    return response
  }

  it('types', () => {
    const schema = z.object({
      value: z.string(),
    })
    const client = createProcedureClient<
      typeof schema,
      undefined,
      { age: number }
    >({} as any)

    expectTypeOf(client).toEqualTypeOf<
      (input: { value: string }) => Promise<{ age: number }>
    >()

    const client2 = createProcedureClient<
      undefined,
      typeof schema,
      { value: string }
    >({} as any)

    expectTypeOf(client2).toEqualTypeOf<
      (input: unknown) => Promise<{ value: string }>
    >()
  })

  it('simple', async () => {
    const client = createProcedureClient({
      baseURL: 'http://localhost:3000/orpc',
      fetch: orpcFetch,
      path: ['ping'],
    })

    const result = await client({ value: 'hello' })

    expect(result).toEqual(['ping'])

    const client2 = createProcedureClient({
      baseURL: 'http://localhost:3000/orpc',
      fetch: orpcFetch,
      path: ['nested', 'ping'],
    })

    const result2 = await client2({ value: 'hello' })

    expect(result2).toEqual(['nested', 'ping'])
  })

  it('on known error', () => {
    const client = createProcedureClient({
      baseURL: 'http://localhost:3000/orpc',
      fetch: orpcFetch,
      path: ['ping'],
    })

    expect(client({ value: {} })).rejects.toThrowError(
      'Validation input failed',
    )
  })

  it('on unknown error', () => {
    const orpcFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({}), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }

    const client = createProcedureClient({
      baseURL: 'http://localhost:3000/orpc',
      fetch: orpcFetch,
      path: ['ping'],
    })

    expect(client({ value: 'hello' })).rejects.toThrowError(
      'Internal server error',
    )
  })

  it('transformer', async () => {
    const router = orpc.router({
      ping: orpc
        .input(z.object({ value: z.date() }))
        .handler((input) => input.value),
    })

    const handler = createRouterHandler({
      router,
    })

    const client = createProcedureClient({
      path: ['ping'],
      baseURL: 'http://localhost:3000/orpc',
      fetch: (...args) => {
        const request = new Request(...args)
        return fetchHandler({
          prefix: '/orpc',
          request,
          handler,
          context: {},
        })
      },
    })

    const now = new Date()
    expect(await client({ value: now })).toEqual(now)
  })

  it('error include data', async () => {
    const router = orpc.router({
      ping: orpc.handler((input) => {
        throw new ORPCError({
          code: 'BAD_GATEWAY',
          data: {
            value: 'from error',
          },
        })
      }),
    })

    const handler = createRouterHandler({
      router,
    })

    const client = createProcedureClient({
      path: ['ping'],
      baseURL: 'http://localhost:3000/orpc',
      fetch: (...args) => {
        const request = new Request(...args)
        return fetchHandler({
          prefix: '/orpc',
          request,
          handler,
          context: {},
        })
      },
    })

    let error: any
    try {
      await client(undefined)
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(ORPCError)
    expect(error.code).toEqual('BAD_GATEWAY')
    expect(error.data).toEqual({ value: 'from error' })
  })
})

describe('upload file', () => {
  const router = initORPC.router({
    signal: initORPC.input(z.instanceof(Blob)).handler((input) => {
      return input
    }),
    multiple: initORPC
      .input(
        z.object({ first: z.instanceof(Blob), second: z.instanceof(Blob) }),
      )
      .handler((input) => {
        return input
      }),
  })

  const handler = createRouterHandler({ router })

  const orpcFetch: typeof fetch = async (...args) => {
    const request = new Request(...args)
    const response = await fetchHandler({
      prefix: '/orpc',
      request,
      handler,
      context: {},
    })
    return response
  }

  const blob1 = new Blob(['hello'], { type: 'text/plain;charset=utf-8' })
  const blob2 = new Blob(['"world"'], { type: 'image/png' })
  const blob3 = new Blob(['dinwwwh'], { type: 'application/octet-stream' })

  it('single file', async () => {
    const client = createProcedureClient({
      baseURL: 'http://localhost:3000/orpc',
      fetch: orpcFetch,
      path: ['signal'],
    })

    const output = await client(blob1)

    expect(output).toBeInstanceOf(Blob)
    expect(output.type).toBe('text/plain;charset=utf-8')
    expect(await output.text()).toBe('hello')
  })

  it('multiple file', async () => {
    const client = createProcedureClient({
      baseURL: 'http://localhost:3000/orpc',
      fetch: orpcFetch,
      path: ['multiple'],
    })

    const output = await client({ first: blob3, second: blob2 })

    const file0 = output.first
    const file1 = output.second

    expect(file0).toBeInstanceOf(Blob)
    expect(file0.type).toBe('application/octet-stream')
    expect(await file0.text()).toBe('dinwwwh')

    expect(file1).toBeInstanceOf(Blob)
    expect(file1.type).toBe('image/png')
    expect(await file1.text()).toBe('"world"')
  })
})
