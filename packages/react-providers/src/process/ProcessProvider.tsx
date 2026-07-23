import type { AuthRequest, ProcessCheckResponse, VotingProcessResponse } from '@vocdoni/api-types'
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

/**
 * Query keys the process/election providers read through. Exported so consumers
 * can pre-seed (`setQueryData`) or invalidate these queries without hardcoding
 * the key shape. `process` is shared by <ProcessProvider> and <ElectionProvider>,
 * so nesting them with the same id resolves to a single fetch.
 */
export const processQueryKeys = {
  process: (id: string) => ['process', id] as const,
  results: (id: string) => ['process-results', id] as const,
}

export interface ProcessSignResult {
  /** Hex CSP signature over the voter address. */
  signature: string
  /** Hex-encoded census weight the CSP signed with. */
  weight?: string
}

export interface ProcessContextValue {
  /** Voting process id (the SaaS Mongo ObjectID) the CSP session is anchored to. */
  processId: string
  /** Public process read (census auth config, questions, chain id); null until loaded. */
  process: VotingProcessResponse | null
  /** Vochain chain id the process's votes are signed against. */
  chainId: string | null
  /** Verified auth token — null until the auth flow completes. */
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
  auth0(participant: AuthRequest): Promise<void>
  /** Step 1 — confirm the 2FA challenge (OTP); marks the voter connected. */
  auth1(solution: string | string[]): Promise<void>
  /** Resend the challenge for the pending token. */
  resend(contact: { email?: string; phone?: string }): Promise<void>
  /**
   * The voter's status for the process: census membership, weight and
   * per-question `canVote`/`hasVoted` state.
   */
  check(): Promise<ProcessCheckResponse>
  /**
   * Request the CSP signature over an address for one question's on-chain
   * election (`electionId` is the question's `upstreamId`).
   */
  sign(electionId: string, address: string): Promise<ProcessSignResult>
  /** Clear all auth/voter state. */
  clear(): void
}

export interface ProcessProviderProps {
  children: ReactNode
  /** Voting process id (Mongo ObjectID) — the process voters authenticate against. */
  id: string
}

const ProcessContext = createContext<ProcessContextValue | undefined>(undefined)

/**
 * Holds the per-process CSP auth session. The voter authenticates once against
 * the voting process and the verified token is reused by every nested
 * <ElectionProvider> to check membership, sign and cast votes.
 */
export function ProcessProvider({ children, id }: ProcessProviderProps) {
  const { client } = useClient()
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [weight, setWeight] = useState<number | null>(null)

  const { data: process = null } = useQuery<VotingProcessResponse, Error>({
    queryKey: processQueryKeys.process(id),
    queryFn: () => client.elections.get(id),
    enabled: !!id,
  })

  // Auth-only censuses (no twoFaFields) issue a verified token at step 0.
  const isAuthOnly = useMemo(
    () => !!process && (process.census?.twoFaFields?.length ?? 0) === 0,
    [process],
  )

  const auth0 = useCallback(
    async (participant: AuthRequest) => {
      const res = await client.processes.authStep0(id, participant)
      if (!res.authToken) throw new Error('Process auth step 0 did not return a token')
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
      if (!pendingToken) throw new Error('Must complete process auth step 0 first')
      const authData = Array.isArray(solution) ? solution : [solution]
      const res = await client.processes.authStep1(id, { authToken: pendingToken, authData })
      setAuthToken(res.authToken ?? pendingToken)
      if (res.weight) setWeight(parseWeight(res.weight))
    },
    [client, id, pendingToken],
  )

  const resend = useCallback(
    async (contact: { email?: string; phone?: string }) => {
      const token = pendingToken ?? authToken
      if (!token) throw new Error('No pending auth token to resend')
      await client.processes.resend(id, { authToken: token, ...contact })
    },
    [client, id, pendingToken, authToken],
  )

  const check = useCallback(async () => {
    if (!authToken) throw new Error('Must authenticate before checking membership')
    const res = await client.processes.check(id, { authToken })
    if (res.weight) setWeight(parseWeight(res.weight))
    return res
  }, [client, id, authToken])

  const sign = useCallback(
    async (electionId: string, address: string): Promise<ProcessSignResult> => {
      if (!authToken) throw new Error('Must authenticate before signing')
      const res = await client.processes.sign(id, { authToken, electionId, payload: address })
      if (!res.signature) throw new Error('Process sign did not return a signature')
      return { signature: res.signature, weight: res.weight }
    },
    [client, id, authToken],
  )

  const clear = useCallback(() => {
    setPendingToken(null)
    setAuthToken(null)
    setWeight(null)
  }, [])

  const value = useMemo<ProcessContextValue>(
    () => ({
      processId: id,
      process,
      chainId: process?.chainId ?? null,
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
    [id, process, authToken, weight, auth0, auth1, resend, check, sign, clear],
  )

  return <ProcessContext.Provider value={value}>{children}</ProcessContext.Provider>
}

export function useProcess(): ProcessContextValue {
  const ctx = useContext(ProcessContext)
  if (!ctx) {
    throw new Error(
      'useProcess() must be used inside <ProcessProvider>. ' +
        'Make sure the component is wrapped in <ProcessProvider>.',
    )
  }
  return ctx
}

/** Like {@link useProcess} but returns undefined instead of throwing when there's no provider. */
export function useProcessOptional(): ProcessContextValue | undefined {
  return useContext(ProcessContext)
}
