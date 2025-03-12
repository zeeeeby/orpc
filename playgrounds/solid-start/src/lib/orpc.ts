import type { RouterClient } from '@orpc/server'
import type { router } from '~/router'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createORPCSolidQueryUtils } from '@orpc/solid-query'

const rpcLink = new RPCLink({
  url: 'http://localhost:3000/rpc',
  headers: () => ({
    Authorization: 'Bearer default-token',
  }),
})

export const client: RouterClient<typeof router> = createORPCClient(rpcLink)

export const orpc = createORPCSolidQueryUtils(client)
