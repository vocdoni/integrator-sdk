import type { QuestionStatus, VotingProcessResponse, VotingProcessResultsResponse } from '@vocdoni/api-types'
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
import { computeProcessStatus } from '@vocdoni/api-client'
import { useBundleOptional } from '../bundle/BundleProvider'
import { useClient } from '../client/ClientProvider'

export interface ElectionContextValue {
  election: VotingProcessResponse | null
  /** Derived process status from all question statuses. */
  status: QuestionStatus | null
  /** Per-question results from `GET /processes/{id}/results`. */
  results: VotingProcessResultsResponse | null
  loading: boolean
  error: Error | null

  /** true once the voter has a verified bundle auth session. */
  connected: boolean
  /** Voter census weight (decoded), when known. */
  weight: number | null
  /** Whether the voter belongs to this election's census. */
  isInCensus: boolean
  hasVoted: boolean

  /**
   * Cast votes for all questions in the process. Accepts per-question encoded
   * ballots (`number[][]`, one entry per question). Returns the first vote id.
   */
  vote(encodedBallots: number[][]): Promise<string>
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
  } = useQuery<VotingProcessResponse, Error>({
    queryKey: ['election', id],
    queryFn: () => client.elections.get(id),
    enabled: !!id,
  })

  const { data: results = null } = useQuery<VotingProcessResultsResponse, Error>({
    queryKey: ['election-results', id],
    queryFn: () => client.elections.getResults(id),
    enabled: !!id && !!election,
  })

  const chainId = bundle?.chainId ?? null

  const status: QuestionStatus | null = election
    ? computeProcessStatus(election.questions)
    : null

  const [voteId, setVoteId] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isInCensus, setIsInCensus] = useState(false)

  // Resolve census membership for this election once the bundle is connected.
  // CSP endpoints are keyed by the vochain id (question.upstreamId).
  useEffect(() => {
    if (!bundle?.connected || !election) {
      setIsInCensus(false)
      return
    }
    const upstreamId = election.questions[0]?.upstreamId
    if (!upstreamId) return

    let cancelled = false
    bundle
      .check(upstreamId)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.connected, election?.id])

  const vote = useCallback(
    async (encodedBallots: number[][]): Promise<string> => {
      if (!election) throw new Error('Election not loaded')
      if (!bundle?.connected) throw new Error('Voter is not authenticated for this bundle')
      if (!chainId) {
        throw new Error('Missing chainId — the bundle info did not provide one; cannot cast a vote')
      }

      let firstVoteId: string | null = null

      for (const [i, question] of election.questions.entries()) {
        const processId = question.upstreamId
        if (!processId) throw new Error(`Question ${i} has no upstreamId; process may not be published yet`)

        const signer = new EphemeralSigner()
        const { signature, weight } = await bundle.sign(processId, signer.address)

        const votingClient = new VotingClient({ client })
        const jobId = await votingClient.vote({
          processId,
          choices: encodedBallots[i] ?? [],
          chainId,
          signer,
          cspSignature: signature,
          cspWeight: weight,
          encryptionKeys: undefined,
        })

        const job = await client.jobs.waitFor(jobId)
        const resultVoteId = job.result?.voteID ?? jobId
        if (firstVoteId === null) firstVoteId = resultVoteId
      }

      const resultVoteId = firstVoteId ?? ''
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
      status,
      results,
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
    [election, status, results, loading, error, connected, weight, isInCensus, hasVoted, vote, voteId, clearVoter],
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
