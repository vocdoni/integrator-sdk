import type { Election } from '@vocdoni/api-types'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { useQuery } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useBundleOptional } from '../bundle/BundleProvider'
import { useClient } from '../client/ClientProvider'

export interface ElectionContextValue {
  election: Election | null
  loading: boolean
  error: Error | null

  /** true once the voter has a verified bundle auth session. */
  connected: boolean
  /** Voter census weight (decoded), when known. */
  weight: number | null
  /** Whether the voter belongs to this election's census. */
  isInCensus: boolean
  hasVoted: boolean

  vote(choices: number[]): Promise<string>
  voteId: string | null
  isAbleToVote: boolean
  /** Clears the voter session (delegates to the bundle when present). */
  clearVoter(): void
}

export interface ElectionProviderProps {
  children: ReactNode
  /** Election ID — fetches the election on mount. */
  id: string
}

const ElectionContext = createContext<ElectionContextValue | undefined>(undefined)

export function ElectionProvider({ children, id }: ElectionProviderProps) {
  const { client } = useClient()
  const bundle = useBundleOptional()

  const {
    data: election = null,
    isLoading: loading,
    error,
  } = useQuery<Election, Error>({
    queryKey: ['election', id],
    queryFn: () => client.elections.get(id),
    enabled: !!id,
  })

  // The process now carries its own chainId; fall back to the bundle for
  // back-compat (and for processes fetched before the merge).
  const chainId = election?.chainId ?? bundle?.chainId ?? null

  const [voteId, setVoteId] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isInCensus, setIsInCensus] = useState(false)

  // Resolve census membership for this election once the bundle is connected.
  useEffect(() => {
    if (!bundle?.connected || !election) {
      setIsInCensus(false)
      return
    }
    let cancelled = false
    // CSP endpoints are keyed by the vochain id, which is `address`.
    bundle
      .check(election.address ?? election.id)
      .then((res) => {
        if (cancelled) return
        setIsInCensus(res.belongs)
        setHasVoted(res.hasVoted)
      })
      .catch(() => {
        // ineligible / network error — leave membership as not-in-census
      })
    return () => {
      cancelled = true
    }
    // bundle.check identity changes with the auth token; connected + election id are the real triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.connected, election?.id])

  const vote = useCallback(
    async (choices: number[]): Promise<string> => {
      if (!election) throw new Error('Election not loaded')
      if (!bundle?.connected) throw new Error('Voter is not authenticated for this bundle')
      if (!chainId) {
        throw new Error('Missing chainId — the bundle info did not provide one; cannot cast a vote')
      }

      // CSP + vote envelope use the vochain id (`address`), not the Mongo id.
      const processId = election.address ?? election.id

      // Per-vote ephemeral identity; the CSP signs its address.
      const signer = new EphemeralSigner()
      const { signature, weight } = await bundle.sign(processId, signer.address)

      const votingClient = new VotingClient()
      const jobId = await votingClient.vote({
        processId,
        choices,
        chainId,
        signer,
        cspSignature: signature,
        cspWeight: weight,
        encryptionKeys: election.encryptionPublicKeys,
        relayFn: (req) => client.elections.vote(req),
      })

      // The relay is async — poll the job for the resulting nullifier.
      const job = await client.jobs.waitFor(jobId)
      const resultVoteId = job.result?.voteID ?? jobId

      setVoteId(resultVoteId)
      setHasVoted(true)
      return resultVoteId
    },
    [election, bundle, chainId, client],
  )

  const clearVoter = useCallback(() => {
    setVoteId(null)
    setHasVoted(false)
    setIsInCensus(false)
    bundle?.clear()
  }, [bundle])

  const connected = !!bundle?.connected
  const weight = bundle?.weight ?? null

  const value = useMemo<ElectionContextValue>(
    () => ({
      election,
      loading,
      error: error ?? null,
      connected,
      weight,
      isInCensus,
      hasVoted,
      vote,
      voteId,
      isAbleToVote: connected && isInCensus && !hasVoted,
      clearVoter,
    }),
    [election, loading, error, connected, weight, isInCensus, hasVoted, vote, voteId, clearVoter],
  )

  return <ElectionContext.Provider value={value}>{children}</ElectionContext.Provider>
}

export function useElection(): ElectionContextValue {
  const ctx = useContext(ElectionContext)
  if (!ctx) {
    throw new Error(
      'useElection() must be used inside <ElectionProvider>. ' +
        'Make sure the component is wrapped in <ElectionProvider>.',
    )
  }
  return ctx
}
