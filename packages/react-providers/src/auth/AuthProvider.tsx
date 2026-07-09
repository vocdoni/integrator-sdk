import type { AuthToken } from '@vocdoni/api-types'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

export interface AuthContextValue {
  token: string | null
  /**
   * Expiry timestamp of the current token (from `AuthToken.expirity`), or null
   * when there is no session. Exposed so the consuming app can decide when to
   * renew — the provider itself runs no timers.
   */
  expiry: string | null
  isAuthenticated: boolean
  /** Log in with email + password. Persists token + expiry and returns the `AuthToken`. */
  login(email: string, password: string): Promise<AuthToken>
  logout(): void
  /** Re-issue the JWT using the current token. Persists token + expiry and returns the `AuthToken`. */
  refresh(): Promise<AuthToken>
  /**
   * Store a session obtained out-of-band (e.g. OAuth, or the app's own login
   * mutation) without calling the API. Persists token + expiry to state and
   * `localStorage` (when a `storageKey` is set).
   */
  setSession(session: AuthToken): void
}

export interface AuthProviderProps {
  children: ReactNode
  /** Optional localStorage key for token persistence. If omitted, tokens are memory-only. */
  storageKey?: string
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readItem(key: string | undefined, suffix: string): string | null {
  if (!key || typeof window === 'undefined') return null
  try {
    return localStorage.getItem(`${key}.${suffix}`)
  } catch {
    return null
  }
}

function writeItem(key: string | undefined, suffix: string, value: string | null) {
  if (!key || typeof window === 'undefined') return
  try {
    if (value) {
      localStorage.setItem(`${key}.${suffix}`, value)
    } else {
      localStorage.removeItem(`${key}.${suffix}`)
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children, storageKey }: AuthProviderProps) {
  const { client } = useClient()

  const [token, setToken] = useState<string | null>(() => readItem(storageKey, 'token'))
  const [expiry, setExpiry] = useState<string | null>(() => readItem(storageKey, 'expiry'))

  const persistSession = useCallback(
    (session: AuthToken | null) => {
      const nextToken = session?.token ?? null
      const nextExpiry = session?.expirity ?? null
      setToken(nextToken)
      setExpiry(nextExpiry)
      writeItem(storageKey, 'token', nextToken)
      writeItem(storageKey, 'expiry', nextExpiry)
    },
    [storageKey],
  )

  const setSession = useCallback((session: AuthToken) => persistSession(session), [persistSession])

  const login = useCallback(
    async (email: string, password: string) => {
      const authToken = await client.auth.login(email, password)
      persistSession(authToken)
      return authToken
    },
    [client.auth, persistSession],
  )

  const logout = useCallback(() => persistSession(null), [persistSession])

  const refresh = useCallback(async () => {
    if (!token) throw new Error('Not authenticated. Please log in first.')
    const authToken = await client.auth.refresh()
    persistSession(authToken)
    return authToken
  }, [client.auth, token, persistSession])

  const value: AuthContextValue = {
    token,
    expiry,
    isAuthenticated: !!token,
    login,
    logout,
    refresh,
    setSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error(
      'useAuth() must be used inside <AuthProvider>. ' +
        'Make sure the component is wrapped in <AuthProvider>.',
    )
  }
  return ctx
}
