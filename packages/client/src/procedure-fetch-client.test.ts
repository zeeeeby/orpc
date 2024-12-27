import { ORPCPayloadCodec } from '@orpc/server/fetch'
import { createProcedureFetchClient } from './procedure-fetch-client'

vi.mock('@orpc/server/fetch', () => ({
  ORPCPayloadCodec: vi.fn().mockReturnValue({ encode: vi.fn(), decode: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('procedure fetch client', () => {
  const encode = (ORPCPayloadCodec as any)().encode
  const decode = (ORPCPayloadCodec as any)().decode
  const response = new Response('output')
  const headers = new Headers({ 'Content-Type': 'application/json' })

  const fakeFetch = vi.fn()
  fakeFetch.mockReturnValue(response)
  encode.mockReturnValue({ body: 'transformed_input', headers })
  decode.mockReturnValue('transformed_output')

  it('works', async () => {
    const client = createProcedureFetchClient({
      baseURL: 'http://localhost:3000/orpc',
      path: ['ping'],
      fetch: fakeFetch,
    })

    const output = await client('input')

    expect(output).toBe('transformed_output')

    expect(encode).toBeCalledTimes(1)
    expect(encode).toBeCalledWith('input')

    expect(fakeFetch).toBeCalledTimes(1)
    expect(fakeFetch).toBeCalledWith('http://localhost:3000/orpc/ping', {
      method: 'POST',
      body: 'transformed_input',
      headers: expect.any(Headers),
    })

    expect(decode).toBeCalledTimes(1)
    expect(decode).toBeCalledWith(response)
  })

  it.each([
    async () => new Headers({ 'x-test': 'hello' }),
    async () => ({ 'x-test': 'hello' }),
  ])('works with headers', async (headers) => {
    const client = createProcedureFetchClient({
      path: ['ping'],
      baseURL: 'http://localhost:3000/orpc',
      fetch: fakeFetch,
      headers,
    })

    await client({ value: 'hello' })

    expect(fakeFetch).toBeCalledWith('http://localhost:3000/orpc/ping', {
      method: 'POST',
      body: 'transformed_input',
      headers: expect.any(Headers),
    })

    expect(fakeFetch.mock.calls[0]![1].headers.get('x-test')).toBe('hello')
  })

  it('abort signal', async () => {
    const controller = new AbortController()
    const signal = controller.signal

    const client = createProcedureFetchClient({
      path: ['ping'],
      baseURL: 'http://localhost:3000/orpc',
      fetch: fakeFetch,
    })

    await client(undefined, { signal })

    expect(fakeFetch).toBeCalledTimes(1)
    expect(fakeFetch.mock.calls[0]![1].signal).toBe(signal)
  })
})
