import type {
  ProcessQuestionStatus,
  QuestionStatus,
  VotingProcessResponse,
  VotingProcessResultsResponse,
} from '@vocdoni/api-types'
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
import { computeProcessStatus, VocdoniApiError } from '@vocdoni/api-client'
import { useClient } from '../client/ClientProvider'
import { processQueryKeys, useProcessOptional } from '../process/ProcessProvider'

export interface ElectionContextValue {
  election: VotingProcessResponse | null
  /** Derived process status from all question statuses. */
  status: QuestionStatus | null
  /** Per-question results from `GET /processes/{id}/results`. */
  results: VotingProcessResultsResponse | null
  loading: boolean
  error: Error | null

  /** true once the voter has a verified process auth session. */
  connected: boolean
  /** Voter census weight (decoded), when known. */
  weight: number | null
  /** Whether the voter belongs to this process's census. */
  isInCensus: boolean
  /**
   * Per-question voter state (`canVote`/`hasVoted`) from the CSP check.
   * Empty until the voter is connected and the membership check resolves.
   */
  voterQuestions: ProcessQuestionStatus[]
  /** true when every question of the process has been voted. */
  hasVoted: boolean

  /**
   * Cast votes for all questions in the process. Accepts per-question encoded
   * ballots (`number[][]`, one entry per question). Returns the first vote id.
   */
  vote(encodedBallots: number[][]): Promise<string>
  voteId: string | null
  isAbleToVote: boolean
  /** Clears the voter session (delegates to the process session when present). */
  clearVoter(): void
}

export interface ElectionProviderProps {
  children: ReactNode
  /** Election ID (the voting process Mongo ObjectID) — fetches the election on mount. */
  id: string
}

const ElectionContext = createContext<ElectionContextValue | undefined>(undefined)

export function ElectionProvider({ children, id }: ElectionProviderProps) {
  const { client } = useClient()
  const process = useProcessOptional()

  const {
    data: election = null,
    isLoading: loading,
    error,
  } = useQuery<VotingProcessResponse, Error>({
    queryKey: processQueryKeys.process(id),
    queryFn: () => client.elections.get(id),
    enabled: !!id,
  })

  const { data: results = null } = useQuery<VotingProcessResultsResponse | null, Error>({
    queryKey: processQueryKeys.results(id),
    // A 404 legitimately means "no results yet" (e.g. before any question is
    // published) — swallow it instead of letting react-query retry the endpoint.
    queryFn: () =>
      client.elections.getResults(id).catch((err) => {
        if (err instanceof VocdoniApiError && err.status === 404) return null
        throw err
      }),
    enabled: !!id && !!election,
  })

  const chainId = election?.chainId ?? process?.chainId ?? null

  const status: QuestionStatus | null = election
    ? computeProcessStatus(election.questions)
    : null

  const [voteId, setVoteId] = useState<string | null>(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [isInCensus, setIsInCensus] = useState(false)
  const [voterQuestions, setVoterQuestions] = useState<ProcessQuestionStatus[]>([])

  // Resolve census membership once the voter's process session is connected.
  // The process check reports per-question canVote/hasVoted state.
  useEffect(() => {
    if (!process?.connected || !election) {
      setIsInCensus(false)
      setVoterQuestions([])
      return
    }

    let cancelled = false
    process
      .check()
      .then((res) => {
        if (cancelled) return
        setIsInCensus(res.belongsToProcess)
        setVoterQuestions(res.questions)
        setHasVoted(res.questions.length > 0 && res.questions.every((q) => q.hasVoted))
      })
      .catch(() => {
        // ineligible / network error — leave membership as not-in-census
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process?.connected, election?.id])

  const vote = useCallback(
    async (encodedBallots: number[][]): Promise<string> => {
      if (!election) throw new Error('Election not loaded')
      if (!process?.connected) throw new Error('Voter is not authenticated for this process')
      if (!chainId) {
        throw new Error('Missing chainId — the process read did not provide one; cannot cast a vote')
      }

      let firstVoteId: string | null = null

      for (const [i, question] of election.questions.entries()) {
        const upstreamId = question.upstreamId
        if (!upstreamId) throw new Error(`Question ${i} has no upstreamId; process may not be published yet`)

        // Secret questions must never go out in cleartext. The keykeepers
        // publish the encryption keys asynchronously after publish, so keys may
        // legitimately be absent for a while — refuse (before consuming the
        // one-shot CSP sign) rather than cast an unencrypted ballot.
        if (question.secretUntilTheEnd && !question.encryptionKeys?.length) {
          throw new Error(
            `Question ${i} ("${question.id}") is secret but its encryption keys are not published yet; retry once the keykeepers publish them`,
          )
        }

        const signer = new EphemeralSigner()
        const { signature, weight } = await process.sign(upstreamId, signer.address)

        const votingClient = new VotingClient({ client })
        const jobId = await votingClient.vote({
          processId: upstreamId,
          choices: encodedBallots[i] ?? [],
          chainId,
          signer,
          cspSignature: signature,
          cspWeight: weight,
          encryptionKeys: question.secretUntilTheEnd ? question.encryptionKeys : undefined,
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
    [election, process, chainId, client],
  )

  const clearVoter = useCallback(() => {
    setVoteId(null)
    setHasVoted(false)
    setIsInCensus(false)
    setVoterQuestions([])
    process?.clear()
  }, [process])

  const connected = !!process?.connected
  const weight = process?.weight ?? null

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
      voterQuestions,
      hasVoted,
      vote,
      voteId,
      isAbleToVote: connected && isInCensus && !hasVoted,
      clearVoter,
    }),
    [election, status, results, loading, error, connected, weight, isInCensus, voterQuestions, hasVoted, vote, voteId, clearVoter],
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
