import type { Bundle, BundleAuthRequest, CheckMembershipResponse } from '@vocdoni/api-types'
import { useQuery } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useClient } from '../client/ClientProvider'

/** Decodes a hex-encoded weight ("2a") into a number; empty/invalid → null. */
function parseWeight(hex?: string): number | null {
  if (!hex) return null
  try {
    return Number(BigInt(`0x${hex.replace(/^0x/, '')}`))
  } catch {
    return null
  }
}

export interface BundleSignResult {
  /** Hex CSP signature over the voter address. */
  signature: string
  /** Hex-encoded census weight the CSP signed with. */
  weight?: string
}

export interface BundleContextValue {
  bundleId: string
  /** Public bundle info (processes, census, chain id); null until loaded. */
  bundle: Bundle | null
  /** Vochain chain id the bundle's votes are signed against. */
  chainId: string | null
  /** Verified auth token — null until auth step 1 completes. */
  authToken: string | null
  /** true once the voter holds a verified auth token. */
  connected: boolean
  /** Census weight (decoded), populated after auth/check. */
  weight: number | null
  /**
   * Step 0 — identify the participant. Pass all fields the census requires in the
   * single object, e.g. `{ memberNumber }` or `{ name, surname, birthDate }`. For
   * auth-only censuses this already marks the voter connected; otherwise a 2FA
   * challenge is sent and must be confirmed with {@link auth1}.
   */
  auth0(participant: BundleAuthRequest): Promise<void>
  /** Step 1 — confirm the 2FA challenge (OTP); marks the voter connected. */
  auth1(solution: string | string[]): Promise<void>
  /** Resend the challenge for the pending token. */
  resend(contact: { email?: string; phone?: string }): Promise<void>
  /** Check eligibility for a process; returns belongs/hasVoted/weight. */
  check(electionId?: string): Promise<CheckMembershipResponse>
  /** Request the CSP signature over an address for a process. */
  sign(electionId: string, address: string): Promise<BundleSignResult>
  /** Clear all auth/voter state. */
  clear(): void
}

export interface BundleProviderProps {
  children: ReactNode
  /** Bundle id — the process bundle voters authenticate against. */
  id: string
}

const BundleContext = createContext<BundleContextValue | undefined>(undefined)

/**
 * Holds the per-bundle CSP auth session. A bundle groups processes that share a
 * census; the voter authenticates once and the verified token is reused by every
 * nested <ElectionProvider> to check membership, sign and cast votes.
 */
export function BundleProvider({ children, id }: BundleProviderProps) {
  const { client } = useClient()
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [weight, setWeight] = useState<number | null>(null)

  const { data: bundle = null } = useQuery<Bundle, Error>({
    queryKey: ['bundle', id],
    queryFn: () => client.bundle.get(id),
    enabled: !!id,
  })

  // Auth-only censuses (no twoFaFields) issue a verified token at step 0.
  const isAuthOnly = useMemo(
    () => !!bundle && (bundle.census?.twoFaFields?.length ?? 0) === 0,
    [bundle],
  )

  const auth0 = useCallback(
    async (participant: BundleAuthRequest) => {
      const res = await client.bundle.authStep0(id, participant)
      if (!res.authToken) throw new Error('Bundle auth step 0 did not return a token')
      if (isAuthOnly) {
        // No challenge step: the step-0 token is already verified.
        setAuthToken(res.authToken)
        if (res.weight) setWeight(parseWeight(res.weight))
      } else {
        setPendingToken(res.authToken)
      }
    },
    [client, id, isAuthOnly],
  )

  const auth1 = useCallback(
    async (solution: string | string[]) => {
      if (!pendingToken) throw new Error('Must complete bundle auth step 0 first')
      const authData = Array.isArray(solution) ? solution : [solution]
      const res = await client.bundle.authStep1(id, { authToken: pendingToken, authData })
      setAuthToken(res.authToken ?? pendingToken)
      if (res.weight) setWeight(parseWeight(res.weight))
    },
    [client, id, pendingToken],
  )

  const resend = useCallback(
    async (contact: { email?: string; phone?: string }) => {
      const token = pendingToken ?? authToken
      if (!token) throw new Error('No pending auth token to resend')
      await client.bundle.resend(id, { authToken: token, ...contact })
    },
    [client, id, pendingToken, authToken],
  )

  const check = useCallback(
    async (electionId?: string) => {
      if (!authToken) throw new Error('Must authenticate before checking membership')
      const res = await client.bundle.check(id, { authToken, electionId })
      if (res.weight) setWeight(parseWeight(res.weight))
      return res
    },
    [client, id, authToken],
  )

  const sign = useCallback(
    async (electionId: string, address: string): Promise<BundleSignResult> => {
      if (!authToken) throw new Error('Must authenticate before signing')
      const res = await client.bundle.sign(id, { authToken, electionId, payload: address })
      if (!res.signature) throw new Error('Bundle sign did not return a signature')
      return { signature: res.signature, weight: res.weight }
    },
    [client, id, authToken],
  )

  const clear = useCallback(() => {
    setPendingToken(null)
    setAuthToken(null)
    setWeight(null)
  }, [])

  const value = useMemo<BundleContextValue>(
    () => ({
      bundleId: id,
      bundle,
      chainId: bundle?.chainId ?? null,
      authToken,
      connected: !!authToken,
      weight,
      auth0,
      auth1,
      resend,
      check,
      sign,
      clear,
    }),
    [id, bundle, authToken, weight, auth0, auth1, resend, check, sign, clear],
  )

  return <BundleContext.Provider value={value}>{children}</BundleContext.Provider>
}

export function useBundle(): BundleContextValue {
  const ctx = useContext(BundleContext)
  if (!ctx) {
    throw new Error(
      'useBundle() must be used inside <BundleProvider>. ' +
        'Make sure the component is wrapped in <BundleProvider>.',
    )
  }
  return ctx
}

/** Like {@link useBundle} but returns undefined instead of throwing when there's no provider. */
export function useBundleOptional(): BundleContextValue | undefined {
  return useContext(BundleContext)
}
