import { VocdoniApiClient } from '@vocdoni/api-client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { ClientProvider, type ClientProviderProps } from './client/ClientProvider'

/**
 * Creates a fresh VocdoniApiClient pointing at the given base URL.
 * Useful for asserting on the client instance in tests.
 */
export function createTestClient(apiUrl = 'http://localhost'): VocdoniApiClient {
  return new VocdoniApiClient({ apiUrl })
}

export interface TestProviderProps extends Partial<ClientProviderProps> {
  children: ReactNode
}

/**
 * Wraps children in a fresh QueryClientProvider + ClientProvider.
 *
 * Use as the `wrapper` option in renderHook / render:
 *
 *   renderHook(() => useElection(), {
 *     wrapper: ({ children }) => <TestProvider>{children}</TestProvider>
 *   })
 */
export function TestProvider({ children, apiUrl = 'http://localhost', ...rest }: TestProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(ClientProvider, { apiUrl, ...rest, children }),
  )
}
