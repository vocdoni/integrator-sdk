import { VocdoniAppClient } from '@vocdoni/api-client'
import { createContext, useContext, useMemo, type ReactNode } from 'react'

export interface ClientContextValue {
  client: VocdoniAppClient
  apiUrl: string
}

export interface ClientProviderProps {
  children: ReactNode
  apiUrl: string
  /** Token getter so JWT is always fresh — called on each request */
  authToken?: () => string | null | undefined
}

const ClientContext = createContext<ClientContextValue | undefined>(undefined)

export function ClientProvider({ children, apiUrl, authToken }: ClientProviderProps) {
  const client = useMemo(
    () => new VocdoniAppClient({ apiUrl, authToken }),
    // Re-create only when apiUrl changes; authToken is a getter so we pass it by reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiUrl],
  )

  const value = useMemo<ClientContextValue>(() => ({ client, apiUrl }), [client, apiUrl])

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
}

export function useClient(): ClientContextValue {
  const ctx = useContext(ClientContext)
  if (!ctx) {
    throw new Error(
      'useClient() must be used inside <ClientProvider>. ' +
        'Make sure the component is wrapped in <ClientProvider>.',
    )
  }
  return ctx
}
