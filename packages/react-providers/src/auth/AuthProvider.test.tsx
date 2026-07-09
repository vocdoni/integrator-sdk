import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockAuthToken } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { TestProvider } from '../test-utils'
import { AuthProvider, useAuth } from './AuthProvider'

const BASE = 'http://localhost'

beforeEach(() => localStorage.clear())

function wrapper(storageKey?: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <TestProvider>
      <AuthProvider storageKey={storageKey}>{children}</AuthProvider>
    </TestProvider>
  )
}

describe('AuthProvider', () => {
  it('starts unauthenticated', () => {
    const { result } = renderHook(useAuth, { wrapper: wrapper() })
    expect(result.current.token).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('login stores the token and marks the voter authenticated', async () => {
    const { result } = renderHook(useAuth, { wrapper: wrapper() })

    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })

    expect(result.current.token).toBe(mockAuthToken.token)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('login exposes and persists the expiry, and returns the AuthToken', async () => {
    const key = 'vocdoni-auth'
    const { result } = renderHook(useAuth, { wrapper: wrapper(key) })

    let returned: Awaited<ReturnType<typeof result.current.login>> | undefined
    await act(async () => {
      returned = await result.current.login('user@example.com', 'secret')
    })

    expect(returned).toEqual(mockAuthToken)
    expect(result.current.expiry).toBe(mockAuthToken.expirity)
    expect(localStorage.getItem(`${key}.expiry`)).toBe(mockAuthToken.expirity)
  })

  it('setSession stores token + expiry without hitting the API', () => {
    const key = 'vocdoni-auth'
    const { result } = renderHook(useAuth, { wrapper: wrapper(key) })

    act(() =>
      result.current.setSession({ token: 'oauth-token', expirity: '2100-06-06T00:00:00Z' }),
    )

    expect(result.current.token).toBe('oauth-token')
    expect(result.current.expiry).toBe('2100-06-06T00:00:00Z')
    expect(result.current.isAuthenticated).toBe(true)
    expect(localStorage.getItem(`${key}.token`)).toBe('oauth-token')
    expect(localStorage.getItem(`${key}.expiry`)).toBe('2100-06-06T00:00:00Z')
  })

  it('logout clears the token', async () => {
    const { result } = renderHook(useAuth, { wrapper: wrapper() })
    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })
    expect(result.current.isAuthenticated).toBe(true)

    act(() => result.current.logout())

    expect(result.current.token).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('refresh throws before login, then refreshes the token afterwards', async () => {
    const { result } = renderHook(useAuth, { wrapper: wrapper() })

    await expect(result.current.refresh()).rejects.toThrow('Not authenticated')

    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })

    // Next refresh returns a distinct token so we can see it propagate.
    server.use(
      http.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json({ token: 'refreshed-token', expirity: '2100-01-01T00:00:00Z' }),
      ),
    )
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.token).toBe('refreshed-token')
    expect(result.current.expiry).toBe('2100-01-01T00:00:00Z')
  })

  it('persists the token to localStorage and re-reads it on remount', async () => {
    const key = 'vocdoni-auth'
    const { result, unmount } = renderHook(useAuth, { wrapper: wrapper(key) })

    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })
    expect(localStorage.getItem(`${key}.token`)).toBe(mockAuthToken.token)
    expect(localStorage.getItem(`${key}.expiry`)).toBe(mockAuthToken.expirity)

    unmount()
    // A fresh provider with the same key hydrates from storage.
    const remount = renderHook(useAuth, { wrapper: wrapper(key) })
    expect(remount.result.current.token).toBe(mockAuthToken.token)
    expect(remount.result.current.expiry).toBe(mockAuthToken.expirity)
    expect(remount.result.current.isAuthenticated).toBe(true)

    act(() => remount.result.current.logout())
    expect(localStorage.getItem(`${key}.token`)).toBeNull()
    expect(localStorage.getItem(`${key}.expiry`)).toBeNull()
  })

  it('keeps tokens in memory only when no storageKey is given', async () => {
    const { result } = renderHook(useAuth, { wrapper: wrapper() })
    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })
    // Nothing leaked into storage under any key we control.
    expect(localStorage.getItem('vocdoni-auth.token')).toBeNull()
  })

  it('does not throw when storage is unavailable (SSR-safe guards)', async () => {
    // Simulate an environment where localStorage access throws (e.g. SSR /
    // privacy-locked). The provider swallows storage errors and stays usable.
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('no storage')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('no storage')
    })

    const { result } = renderHook(useAuth, { wrapper: wrapper('vocdoni-auth') })
    expect(result.current.token).toBeNull()

    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })
    expect(result.current.token).toBe(mockAuthToken.token)

    act(() => result.current.setSession({ token: 't', expirity: 'e' }))
    act(() => result.current.logout())
    expect(result.current.token).toBeNull()

    getItem.mockRestore()
    setItem.mockRestore()
  })

  it('throws a clear error when useAuth() is used outside a provider', () => {
    expect(() => renderHook(useAuth)).toThrow('useAuth() must be used inside <AuthProvider>')
  })
})
