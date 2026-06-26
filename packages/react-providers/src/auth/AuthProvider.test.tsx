import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
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
        HttpResponse.json({ ...mockAuthToken, token: 'refreshed-token' }),
      ),
    )
    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.token).toBe('refreshed-token')
  })

  it('persists the token to localStorage and re-reads it on remount', async () => {
    const key = 'vocdoni-auth'
    const { result, unmount } = renderHook(useAuth, { wrapper: wrapper(key) })

    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })
    expect(localStorage.getItem(`${key}.token`)).toBe(mockAuthToken.token)

    unmount()
    // A fresh provider with the same key hydrates from storage.
    const remount = renderHook(useAuth, { wrapper: wrapper(key) })
    expect(remount.result.current.token).toBe(mockAuthToken.token)
    expect(remount.result.current.isAuthenticated).toBe(true)

    act(() => remount.result.current.logout())
    expect(localStorage.getItem(`${key}.token`)).toBeNull()
  })

  it('keeps tokens in memory only when no storageKey is given', async () => {
    const { result } = renderHook(useAuth, { wrapper: wrapper() })
    await act(async () => {
      await result.current.login('user@example.com', 'secret')
    })
    // Nothing leaked into storage under any key we control.
    expect(localStorage.getItem('vocdoni-auth.token')).toBeNull()
  })

  it('throws a clear error when useAuth() is used outside a provider', () => {
    expect(() => renderHook(useAuth)).toThrow('useAuth() must be used inside <AuthProvider>')
  })
})
