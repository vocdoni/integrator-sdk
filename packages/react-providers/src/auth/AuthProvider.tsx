import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

export interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login(address: string, signature: string): Promise<void>
  logout(): void
  refresh(): Promise<void>
}

export interface AuthProviderProps {
  children: ReactNode
  /** Optional localStorage key for token persistence. If omitted, tokens are memory-only. */
  storageKey?: string
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStorage(key: string | undefined): { token: string | null; refresh: string | null } {
  if (!key || typeof window === 'undefined') return { token: null, refresh: null }
  try {
    return {
      token: localStorage.getItem(`${key}.token`),
      refresh: localStorage.getItem(`${key}.refresh`),
    }
  } catch {
    return { token: null, refresh: null }
  }
}

function writeStorage(key: string | undefined, token: string | null, refresh: string | null) {
  if (!key || typeof window === 'undefined') return
  try {
    if (token) {
      localStorage.setItem(`${key}.token`, token)
    } else {
      localStorage.removeItem(`${key}.token`)
    }
    if (refresh) {
      localStorage.setItem(`${key}.refresh`, refresh)
    } else {
      localStorage.removeItem(`${key}.refresh`)
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children, storageKey }: AuthProviderProps) {
  const { client } = useClient()

  const [token, setToken] = useState<string | null>(() => readStorage(storageKey).token)
  const [refreshToken, setRefreshToken] = useState<string | null>(
    () => readStorage(storageKey).refresh,
  )

  const login = useCallback(
    async (address: string, signature: string) => {
      const authToken = await client.auth.login(address, signature)
      setToken(authToken.token)
      setRefreshToken(authToken.refresh)
      writeStorage(storageKey, authToken.token, authToken.refresh)
    },
    [client.auth, storageKey],
  )

  const logout = useCallback(() => {
    setToken(null)
    setRefreshToken(null)
    writeStorage(storageKey, null, null)
  }, [storageKey])

  const refresh = useCallback(async () => {
    if (!refreshToken) throw new Error('No refresh token available. Please log in first.')
    const authToken = await client.auth.refresh(refreshToken)
    setToken(authToken.token)
    setRefreshToken(authToken.refresh)
    writeStorage(storageKey, authToken.token, authToken.refresh)
  }, [client.auth, refreshToken, storageKey])

  const value: AuthContextValue = {
    token,
    isAuthenticated: !!token,
    login,
    logout,
    refresh,
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
