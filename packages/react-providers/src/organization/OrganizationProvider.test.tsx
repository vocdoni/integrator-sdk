import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockOrganization } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { TestProvider } from '../test-utils'
import { OrganizationProvider, useOrganization } from './OrganizationProvider'

const BASE = 'http://localhost'
const ADDRESS = '0xdeadbeef'

function wrapper(address?: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <TestProvider>
      <OrganizationProvider address={address}>{children}</OrganizationProvider>
    </TestProvider>
  )
}

describe('OrganizationProvider', () => {
  it('auto-fetches the organization when an address is given', async () => {
    const { result } = renderHook(useOrganization, { wrapper: wrapper(ADDRESS) })
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.organization).not.toBeNull())
    expect(result.current.organization?.address).toBe(ADDRESS)
    expect(result.current.organization?.name).toBe(mockOrganization.name)
    expect(result.current.loading).toBe(false)
  })

  it('does not fetch when no address is set, and fetch() then requires one', async () => {
    const { result } = renderHook(useOrganization, { wrapper: wrapper() })
    expect(result.current.organization).toBeNull()

    await expect(result.current.fetch()).rejects.toThrow('requires an address')
  })

  it('update() writes through and refreshes the cached organization', async () => {
    const { result } = renderHook(useOrganization, { wrapper: wrapper(ADDRESS) })
    await waitFor(() => expect(result.current.organization).not.toBeNull())

    await act(async () => {
      await result.current.update(ADDRESS, { name: 'Renamed Org' })
    })

    await waitFor(() => expect(result.current.organization?.name).toBe('Renamed Org'))
  })

  it('surfaces a fetch error', async () => {
    server.use(
      http.get(`${BASE}/organizations/:address`, () => new HttpResponse(null, { status: 500 })),
    )
    const { result } = renderHook(useOrganization, { wrapper: wrapper(ADDRESS) })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.organization).toBeNull()
  })

  it('throws a clear error when useOrganization() is used outside a provider', () => {
    expect(() => renderHook(useOrganization)).toThrow(
      'useOrganization() must be used inside <OrganizationProvider>',
    )
  })
})
