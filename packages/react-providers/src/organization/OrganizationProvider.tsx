import type { CreateOrganizationRequest, Organization } from '@vocdoni/api-types'
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

/**
 * Query keys the organization provider reads through. Exported so consumers
 * can pre-seed (`setQueryData`) or invalidate these queries without hardcoding
 * the key shape.
 */
export const organizationQueryKeys = {
  organization: (address: string | undefined) => ['organization', address] as const,
}

/**
 * Extra react-query options for the organization read. `queryKey`, `queryFn`,
 * `enabled` and `initialData` are provider-owned.
 */
export type OrganizationQueryOptions = Omit<
  UseQueryOptions<Organization, Error>,
  'queryKey' | 'queryFn' | 'enabled' | 'initialData'
>

export interface OrganizationContextValue {
  organization: Organization | null
  loading: boolean
  error: Error | null
  fetch(address?: string): Promise<void>
  update(address: string, data: Partial<CreateOrganizationRequest>): Promise<void>
}

export interface OrganizationProviderProps {
  children: ReactNode
  /** Organization id (its address) — fetches the organization on mount. */
  id?: string
  /**
   * Prefetched organization, rendered immediately instead of a loading state.
   * Seeded into the query cache as `initialData`, so the provider still
   * refetches — by `id`, or by `organization.address` when `id` is omitted —
   * whenever the query goes stale.
   */
  organization?: Organization
  /** Extra react-query options for the organization read, e.g. `staleTime` or `refetchInterval`. */
  queryOptions?: OrganizationQueryOptions
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined)

export function OrganizationProvider({
  children,
  id,
  organization: prefetched,
  queryOptions,
}: OrganizationProviderProps) {
  const { client } = useClient()
  const queryClient = useQueryClient()

  // The id drives the query; a prefetched organization carries its own
  // address, so passing only `organization` still allows refetching.
  const address = id ?? prefetched?.address

  const {
    data: organization = null,
    isLoading: loading,
    error,
  } = useQuery<Organization, Error>({
    ...queryOptions,
    queryKey: organizationQueryKeys.organization(address),
    queryFn: () => client.organizations.get(address!),
    enabled: !!address,
    // Never seed the cache entry of `id` with a *different* org's data.
    initialData: prefetched && prefetched.address === address ? prefetched : undefined,
  })

  const updateMutation = useMutation<
    Organization,
    Error,
    { address: string; data: Partial<CreateOrganizationRequest> }
  >({
    mutationFn: ({ address: addr, data }) => client.organizations.update(addr, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(organizationQueryKeys.organization(updated.address), updated)
    },
  })

  const fetch = useCallback(
    async (addr?: string) => {
      const target = addr ?? address
      if (!target) throw new Error('fetch() requires an address when none is set on the provider')
      await queryClient.fetchQuery({
        queryKey: organizationQueryKeys.organization(target),
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
