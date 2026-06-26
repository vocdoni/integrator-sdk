import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

export interface AuthContextValue {
  token: string | null
  isAuthenticated: boolean
  login(email: string, password: string): Promise<void>
  logout(): void
  refresh(): Promise<void>
}

export interface AuthProviderProps {
  children: ReactNode
  /** Optional localStorage key for token persistence. If omitted, tokens are memory-only. */
  storageKey?: string
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readToken(key: string | undefined): string | null {
  if (!key || typeof window === 'undefined') return null
  try {
    return localStorage.getItem(`${key}.token`)
  } catch {
    return null
  }
}

function writeToken(key: string | undefined, token: string | null) {
  if (!key || typeof window === 'undefined') return
  try {
    if (token) {
      localStorage.setItem(`${key}.token`, token)
    } else {
      localStorage.removeItem(`${key}.token`)
    }
  } catch {
    // ignore storage errors
  }
}

export function AuthProvider({ children, storageKey }: AuthProviderProps) {
  const { client } = useClient()

  const [token, setToken] = useState<string | null>(() => readToken(storageKey))

  const login = useCallback(
    async (email: string, password: string) => {
      const authToken = await client.auth.login(email, password)
      setToken(authToken.token)
      writeToken(storageKey, authToken.token)
    },
    [client.auth, storageKey],
  )

  const logout = useCallback(() => {
    setToken(null)
    writeToken(storageKey, null)
  }, [storageKey])

  const refresh = useCallback(async () => {
    if (!token) throw new Error('Not authenticated. Please log in first.')
    const authToken = await client.auth.refresh()
    setToken(authToken.token)
    writeToken(storageKey, authToken.token)
  }, [client.auth, token, storageKey])

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
