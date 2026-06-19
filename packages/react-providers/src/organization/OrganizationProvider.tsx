import type { CreateOrganizationRequest, Organization } from '@vocdoni/api-types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

export interface OrganizationContextValue {
  organization: Organization | null
  loading: boolean
  error: Error | null
  fetch(address?: string): Promise<void>
  update(address: string, data: Partial<CreateOrganizationRequest>): Promise<void>
}

export interface OrganizationProviderProps {
  children: ReactNode
  /** If provided, the organization is fetched automatically on mount */
  address?: string
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined)

export function OrganizationProvider({ children, address }: OrganizationProviderProps) {
  const { client } = useClient()
  const queryClient = useQueryClient()

  const {
    data: organization = null,
    isLoading: loading,
    error,
  } = useQuery<Organization, Error>({
    queryKey: ['organization', address],
    queryFn: () => client.organizations.get(address!),
    enabled: !!address,
  })

  const updateMutation = useMutation<
    Organization,
    Error,
    { address: string; data: Partial<CreateOrganizationRequest> }
  >({
    mutationFn: ({ address: addr, data }) => client.organizations.update(addr, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['organization', updated.address], updated)
    },
  })

  const fetch = useCallback(
    async (addr?: string) => {
      const target = addr ?? address
      if (!target) throw new Error('fetch() requires an address when none is set on the provider')
      await queryClient.fetchQuery({
        queryKey: ['organization', target],
        queryFn: () => client.organizations.get(target),
      })
    },
    [address, client.organizations, queryClient],
  )

  const update = useCallback(
    async (addr: string, data: Partial<CreateOrganizationRequest>) => {
      await updateMutation.mutateAsync({ address: addr, data })
    },
    [updateMutation],
  )

  const value: OrganizationContextValue = {
    organization,
    loading,
    error: error ?? updateMutation.error,
    fetch,
    update,
  }

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganization(): OrganizationContextValue {
  const ctx = useContext(OrganizationContext)
  if (!ctx) {
    throw new Error(
      'useOrganization() must be used inside <OrganizationProvider>. ' +
        'Make sure the component is wrapped in <OrganizationProvider>.',
    )
  }
  return ctx
}
