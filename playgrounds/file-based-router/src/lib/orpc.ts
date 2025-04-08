import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createORPCReactQueryUtils } from '@orpc/react-query'
import type { RouterClient } from '@orpc/server'
import type { router } from '../router'

const rpcLink = new RPCLink({
  url: new URL('/rpc', 'http://localhost:3000'),
  headers: () => ({
    Authorization: 'Bearer default-token',
  }),
})

export const orpcClient: RouterClient<typeof router> = createORPCClient(rpcLink)

export const orpc = createORPCReactQueryUtils(orpcClient)
