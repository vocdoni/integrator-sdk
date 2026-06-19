import { VocdoniAppClient } from '@vocdoni/api-client'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TestProvider } from '../test-utils'
import { ClientProvider, useClient } from './ClientProvider'

describe('ClientProvider', () => {
  it('renders without crashing', () => {
    const { result } = renderHook(() => useClient(), {
      wrapper: ({ children }) => <TestProvider>{children}</TestProvider>,
    })
    expect(result.current).toBeDefined()
  })

  it('throws a clear error when useClient() is called outside a provider', () => {
    expect(() => renderHook(() => useClient())).toThrow(
      'useClient() must be used inside <ClientProvider>',
    )
  })

  it('returns a VocdoniAppClient instance inside a provider', () => {
    const { result } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ClientProvider apiUrl="http://localhost">{children}</ClientProvider>
      ),
    })
    expect(result.current.client).toBeInstanceOf(VocdoniAppClient)
  })

  it('exposes the apiUrl passed to the provider', () => {
    const { result } = renderHook(() => useClient(), {
      wrapper: ({ children }) => (
        <ClientProvider apiUrl="http://example.com">{children}</ClientProvider>
      ),
    })
    expect(result.current.apiUrl).toBe('http://example.com')
  })
})
