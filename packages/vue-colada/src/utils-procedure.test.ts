import { ref } from 'vue'
import * as keyModule from './key'
import { createProcedureUtils } from './utils-procedure'

const buildKeySpy = vi.spyOn(keyModule, 'buildKey')

const controller = new AbortController()
const signal = controller.signal

beforeEach(() => {
  buildKeySpy.mockClear()

  buildKeySpy.mockReturnValue(['__mocked__'])
})

describe('queryOptions', () => {
  const client = vi.fn(
    (...[input]) => Promise.resolve(input?.toString()),
  )
  const utils = createProcedureUtils(client, ['ping'])

  beforeEach(() => {
    client.mockClear()
  })

  it('works', async () => {
    const options = utils.queryOptions({ input: 1 })

    expect(options.key.value).toEqual(['__mocked__'])
    expect(buildKeySpy).toHaveBeenCalledTimes(1)
    expect(buildKeySpy).toHaveBeenCalledWith(['ping'], { input: 1 })

    client.mockResolvedValueOnce('__mocked__')
    await expect((options as any).query({ signal })).resolves.toEqual('__mocked__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toBeCalledWith(1, { signal })
  })

  it('works with ref', async () => {
    const input = ref(1)
    const options = utils.queryOptions({ input })

    expect(options.key.value).toEqual(['__mocked__'])
    expect(buildKeySpy).toHaveBeenCalledTimes(1)
    expect(buildKeySpy).toHaveBeenCalledWith(['ping'], { input: 1 })

    client.mockResolvedValueOnce('__mocked__')
    await expect((options as any).query({ signal })).resolves.toEqual('__mocked__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toBeCalledWith(1, { signal })
  })

  it('works with client context', async () => {
    const client = vi.fn((...[input]) => Promise.resolve(input?.toString()))
    const utils = createProcedureUtils(client, ['ping'])

    const options = utils.queryOptions({ context: { batch: ref(true) } })

    expect(options.key.value).toEqual(['__mocked__'])
    expect(buildKeySpy).toHaveBeenCalledTimes(1)
    expect(buildKeySpy).toHaveBeenCalledWith(['ping'], { })

    client.mockResolvedValueOnce('__mocked__')
    await expect((options as any).query({ signal })).resolves.toEqual('__mocked__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toBeCalledWith(undefined, { signal, context: { batch: true } })
  })
})

describe('mutationOptions', () => {
  const client = vi.fn(
    (...[input]) => Promise.resolve(input?.toString()),
  )
  const utils = createProcedureUtils(client, ['ping'])

  beforeEach(() => {
    client.mockClear()
  })

  it('works', async () => {
    const options = utils.mutationOptions()

    expect(options.key('__input__')).toEqual(['__mocked__'])
    expect(buildKeySpy).toHaveBeenCalledTimes(1)
    expect(buildKeySpy).toHaveBeenCalledWith(['ping'], { input: '__input__' })

    client.mockResolvedValueOnce('__mocked__')
    await expect(options.mutation(1)).resolves.toEqual('__mocked__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toBeCalledWith(1, {})
  })

  it('works with client context', async () => {
    const client = vi.fn(
      (...[input]) => Promise.resolve(input?.toString()),
    )
    const utils = createProcedureUtils(client, ['ping'])

    const options = utils.mutationOptions({ context: { batch: ref(true) } })

    expect(options.key('__input__')).toEqual(['__mocked__'])
    expect(buildKeySpy).toHaveBeenCalledTimes(1)
    expect(buildKeySpy).toHaveBeenCalledWith(['ping'], { input: '__input__' })

    client.mockResolvedValueOnce('__mocked__')
    await expect(options.mutation(1)).resolves.toEqual('__mocked__')
    expect(client).toHaveBeenCalledTimes(1)
    expect(client).toBeCalledWith(1, { context: { batch: true } })
  })
})
