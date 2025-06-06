import type { RouterClient } from '../../../server/src/router-client'
import type { ClientRetryPluginContext } from './retry'
import { getEventMeta, withEventMeta } from '@orpc/standard-server'
import { RPCHandler } from '../../../server/src/adapters/fetch/rpc-handler'
import { os } from '../../../server/src/builder'
import { RPCLink } from '../adapters/fetch'
import { createORPCClient } from '../client'
import { ORPCError } from '../error'
import { ClientRetryPlugin } from './retry'

interface ORPCClientContext extends ClientRetryPluginContext {

}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('clientRetryPlugin', () => {
  const handlerFn = vi.fn()

  const router = os.handler(handlerFn)

  const handler = new RPCHandler(router)

  const link = new RPCLink<ORPCClientContext>({
    url: 'http://localhost:3000',
    fetch: async (request) => {
      if (request.signal?.aborted === true) {
        // fake real fetch abort behavior
        throw new Error('AbortError')
      }

      const { response } = await handler.handle(request)
      return response ?? new Response('fail', { status: 500 })
    },
    plugins: [
      new ClientRetryPlugin(),
    ],
  })

  const client: RouterClient<typeof router, ORPCClientContext> = createORPCClient(link)

  it('should not retry by default', async () => {
    handlerFn.mockRejectedValueOnce(new Error('fail'))

    await expect(client('hello')).rejects.toThrow('Internal server error')

    expect(handlerFn).toHaveBeenCalledTimes(1)
  })

  it('should retry', async () => {
    handlerFn.mockRejectedValue(new Error('fail'))

    const retry = vi.fn(() => 3)

    await expect(client('hello', { context: { retry, retryDelay: 0 } })).rejects.toThrow('Internal server error')

    expect(handlerFn).toHaveBeenCalledTimes(4)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(retry).toHaveBeenCalledWith({ context: { retry, retryDelay: 0 } }, [], 'hello')
  })

  it('should not retry if success', async () => {
    handlerFn.mockResolvedValue('success')

    const output = await client('hello', { context: { retry: 3, retryDelay: 0 } })

    expect(output).toBe('success')
    expect(handlerFn).toHaveBeenCalledTimes(1)
    expect(handlerFn).toHaveBeenCalledWith(expect.objectContaining({ input: 'hello' }))
  })

  it('should retry with delay', { retry: 5 }, async () => {
    handlerFn.mockRejectedValue(new Error('fail'))

    const start = Date.now()
    await expect(client('hello', { context: { retry: 4, retryDelay: 50 } })).rejects.toThrow('Internal server error')

    expect(Date.now() - start).toBeGreaterThanOrEqual(200)
    expect(Date.now() - start).toBeLessThanOrEqual(249)

    expect(handlerFn).toHaveBeenCalledTimes(5)
  })

  it('should not retry if shouldRetry=false', { retry: 5 }, async () => {
    handlerFn.mockRejectedValue(new Error('fail'))

    let times = 0
    const shouldRetry = vi.fn(() => {
      times++

      return times < 2
    })

    await expect(client('hello', { context: { retry: 3, shouldRetry, retryDelay: 0 } })).rejects.toThrow('Internal server error')

    expect(handlerFn).toHaveBeenCalledTimes(2)

    expect(shouldRetry).toHaveBeenCalledTimes(2)
    expect(shouldRetry).toHaveBeenNthCalledWith(
      1,
      { attemptIndex: 0, error: expect.any(ORPCError) },
      expect.objectContaining({ context: { retry: 3, shouldRetry, retryDelay: 0 } }),
      [],
      'hello',
    )
    expect(shouldRetry).toHaveBeenNthCalledWith(
      2,
      { attemptIndex: 1, error: expect.any(ORPCError) },
      expect.objectContaining({ context: { retry: 3, shouldRetry, retryDelay: 0 } }),
      [],
      'hello',
    )
  })

  it('onRetry', async () => {
    handlerFn.mockRejectedValue(new Error('fail'))

    const clean = vi.fn()
    const onRetry = vi.fn(() => clean)

    await expect(client('hello', { context: { retry: 3, retryDelay: 0, onRetry } })).rejects.toThrow('Internal server error')

    expect(handlerFn).toHaveBeenCalledTimes(4)

    expect(onRetry).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenNthCalledWith(
      1,
      { attemptIndex: 0, error: expect.any(ORPCError) },
      expect.objectContaining({ context: { retry: 3, retryDelay: 0, onRetry } }),
      [],
      'hello',
    )
    expect(onRetry).toHaveBeenNthCalledWith(
      2,
      { attemptIndex: 1, error: expect.any(ORPCError) },
      expect.objectContaining({ context: { retry: 3, retryDelay: 0, onRetry } }),
      [],
      'hello',
    )
    expect(onRetry).toHaveBeenNthCalledWith(
      3,
      { attemptIndex: 2, error: expect.any(ORPCError) },
      expect.objectContaining({ context: { retry: 3, retryDelay: 0, onRetry } }),
      [],
      'hello',
    )

    expect(clean).toHaveBeenCalledTimes(3)
  })

  it('should not retry if signal aborted', async () => {
    handlerFn.mockRejectedValue(new Error('fail'))

    const controller = new AbortController()

    controller.abort()

    await expect(client('hello', { context: { retry: 3, retryDelay: 0 }, signal: controller.signal })).rejects.toThrow('AbortError')

    expect(handlerFn).toHaveBeenCalledTimes(0)
  })

  describe('event iterator', () => {
    it('should not retry by default', async () => {
      handlerFn.mockImplementation(async function* () {
        throw new Error('fail')
      })

      const iterator = await client('hello')

      await expect(iterator.next()).rejects.toThrow('Internal server error')

      expect(handlerFn).toHaveBeenCalledTimes(1)
    })

    it('should retry', async () => {
      handlerFn.mockImplementation(async function* () {
        throw new Error('fail')
      })

      const iterator = await client('hello', { context: { retry: 3, retryDelay: 0 } })

      await expect(iterator.next()).rejects.toThrow('Internal server error')

      expect(handlerFn).toHaveBeenCalledTimes(4)
    })

    it('should not retry if success', async () => {
      handlerFn.mockImplementation(async function* () {
        yield 1
        yield withEventMeta({ order: 2 }, { id: '5' })
        return withEventMeta({ order: 3 }, { retry: 6000 })
      })

      const iterator = await client('hello', { context: { retry: 3, retryDelay: 0 } })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual(1)
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual({ order: 2 })
        expect(getEventMeta(value)).toMatchObject({ id: '5' })
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(true)
        expect(value).toEqual({ order: 3 })
        expect(getEventMeta(value)).toMatchObject({ retry: 6000 })
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(true)
        expect(value).toEqual(undefined)
        return true
      })

      expect(handlerFn).toHaveBeenCalledTimes(1)
    })

    it('should retry with meta data', async () => {
      handlerFn.mockImplementation(async function* () {
        yield 1
        yield withEventMeta({ order: 2 }, { id: '5', retry: 5678 })
        throw new Error('fail')
      })

      const shouldRetry = vi.fn(() => true)

      const iterator = await client('hello', { context: { retry: 3, retryDelay: 0, shouldRetry }, lastEventId: '1' })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual(1)
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual({ order: 2 })
        expect(getEventMeta(value)).toMatchObject({ id: '5', retry: 5678 })
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual(1)
        return true
      })

      expect(handlerFn).toHaveBeenCalledTimes(2)
      expect(handlerFn).toHaveBeenNthCalledWith(1, expect.objectContaining({ input: 'hello', lastEventId: '1' }))
      expect(handlerFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ input: 'hello', lastEventId: '5' }))

      expect(shouldRetry).toHaveBeenCalledTimes(1)
      expect(shouldRetry).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ error: expect.any(Error), lastEventId: '5', lastEventRetry: 5678 }),
        expect.objectContaining({ lastEventId: '5' }),
        [],
        'hello',
      )
    })

    it('should retry with meta in error', async () => {
      handlerFn.mockImplementation(async function* () {
        yield 1
        yield { order: 2 }
        throw withEventMeta(new Error('fail'), { id: '10', retry: 1234 })
      })

      const shouldRetry = vi.fn(() => true)

      const iterator = await client('hello', { context: { retry: 1, retryDelay: 0, shouldRetry }, lastEventId: '1' })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual(1)
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual({ order: 2 })
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual(1)
        return true
      })

      expect(await iterator.next()).toSatisfy(({ done, value }) => {
        expect(done).toEqual(false)
        expect(value).toEqual({ order: 2 })
        return true
      })

      await expect(iterator.next()).rejects.toSatisfy((error) => {
        expect(error).toBeInstanceOf(ORPCError)
        expect(getEventMeta(error)).toMatchObject({ id: '10', retry: 1234 })
        return true
      })

      expect(handlerFn).toHaveBeenCalledTimes(2)
      expect(handlerFn).toHaveBeenNthCalledWith(1, expect.objectContaining({ input: 'hello', lastEventId: '1' }))
      expect(handlerFn).toHaveBeenNthCalledWith(2, expect.objectContaining({ input: 'hello', lastEventId: '10' }))

      expect(shouldRetry).toHaveBeenCalledTimes(1)
      expect(shouldRetry).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ error: expect.any(Error), lastEventId: '10', lastEventRetry: 1234 }),
        expect.objectContaining({ lastEventId: '10' }),
        [],
        'hello',
      )
    })

    it('should retry with delay', { retry: 5 }, async () => {
      handlerFn.mockImplementation(async function* () {
        throw new Error('fail')
      })

      const start = Date.now()
      const iterator = await client('hello', { context: { retry: 4, retryDelay: 50 } })

      await expect(iterator.next()).rejects.toThrow('Internal server error')

      expect(Date.now() - start).toBeGreaterThanOrEqual(200)
      expect(Date.now() - start).toBeLessThanOrEqual(249)

      expect(handlerFn).toHaveBeenCalledTimes(5)
    })

    it('should not retry if shouldRetry=false', { retry: 5 }, async () => {
      handlerFn.mockImplementation(async function* () {
        throw new Error('fail')
      })

      let times = 0
      const shouldRetry = vi.fn(() => {
        times++

        return times < 2
      })

      const iterator = await client('hello', { context: { retry: 3, shouldRetry, retryDelay: 0 } })

      await expect(iterator.next()).rejects.toThrow('Internal server error')

      expect(handlerFn).toHaveBeenCalledTimes(2)

      expect(shouldRetry).toHaveBeenCalledTimes(2)
      expect(shouldRetry).toHaveBeenNthCalledWith(
        1,
        { attemptIndex: 0, error: expect.any(ORPCError) },
        expect.objectContaining({ context: { retry: 3, shouldRetry, retryDelay: 0 } }),
        [],
        'hello',
      )
      expect(shouldRetry).toHaveBeenNthCalledWith(
        2,
        { attemptIndex: 1, error: expect.any(ORPCError) },
        expect.objectContaining({ context: { retry: 3, shouldRetry, retryDelay: 0 } }),
        [],
        'hello',
      )
    })

    it('onRetry', async () => {
      let time = 0
      handlerFn.mockImplementation(async function* () {
        throw withEventMeta(new Error('fail'), { id: `${time++}` })
      })

      const clean = vi.fn()
      const onRetry = vi.fn(() => clean)

      const iterator = await client('hello', { context: { retry: 3, retryDelay: 0, onRetry } })

      await expect(iterator.next()).rejects.toThrow('Internal server error')

      expect(handlerFn).toHaveBeenCalledTimes(4)

      expect(onRetry).toHaveBeenCalledTimes(3)
      expect(onRetry).toHaveBeenNthCalledWith(
        1,
        { attemptIndex: 0, error: expect.any(ORPCError), lastEventId: '0' },
        expect.objectContaining({ context: { retry: 3, retryDelay: 0, onRetry } }),
        [],
        'hello',
      )
      expect(onRetry).toHaveBeenNthCalledWith(
        2,
        { attemptIndex: 1, error: expect.any(ORPCError), lastEventId: '1' },
        expect.objectContaining({ context: { retry: 3, retryDelay: 0, onRetry } }),
        [],
        'hello',
      )
      expect(onRetry).toHaveBeenNthCalledWith(
        3,
        { attemptIndex: 2, error: expect.any(ORPCError), lastEventId: '2' },
        expect.objectContaining({ context: { retry: 3, retryDelay: 0, onRetry } }),
        [],
        'hello',
      )

      expect(clean).toHaveBeenCalledTimes(3)
    })

    it('should not retry if signal aborted', async () => {
      handlerFn.mockImplementation(async function* () {
        throw new Error('fail')
      })

      const controller = new AbortController()

      controller.abort()

      await expect(client('hello', { context: { retry: 3, retryDelay: 0 }, signal: controller.signal })).rejects.toThrow('AbortError')

      expect(handlerFn).toHaveBeenCalledTimes(0)
    })

    it('throw right away if retry invalid event iterator response', async () => {
      let times = 0
      handlerFn.mockImplementation(async () => {
        times++

        if (times === 2) {
          return 'not-an-event-iterator'
        }

        return (async function* () {
          throw new Error('fail')
        })()
      })

      const iterator = await client('hello', { context: { retry: 3, retryDelay: 0 } })

      await expect(iterator.next()).rejects.toThrow('RetryPlugin: Expected an Event Iterator, got a non-Event Iterator')

      expect(handlerFn).toHaveBeenCalledTimes(2)
    })

    it('manually .return still works', async () => {
      const cleanup = vi.fn()

      handlerFn.mockImplementation(async function* () {
        try {
          while (true) {
            yield 1
          }
        }
        finally {
          cleanup()
        }
      })

      const iterator = await client('hello', { context: { retry: 3, retryDelay: 0 } })

      await iterator.next()

      await iterator.return()

      /**
       * Don't know why but we need await a bit to make sure the cleanup is called
       */
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })
})
