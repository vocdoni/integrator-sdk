import type {
  ProcessQuestionStatus,
  QuestionStatus,
  VoteJobResult,
  VotingProcessResponse,
  VotingProcessResultsResponse,
} from '@vocdoni/api-types'
import { buildVoteTransaction, EphemeralSigner, MAX_MEMO_BYTES } from '@vocdoni/api-voting'
import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  computeProcessStatus,
  JobFailedError,
  normalizeVotingProcess,
  VocdoniApiError,
} from '@vocdoni/api-client'
import { useClient } from '../client/ClientProvider'
import {
  ElectionAuthContext,
  useVoterSession,
  type ElectionAuthContextValue,
} from './use-election-auth'

/**
 * Query keys the election provider reads through. Exported so consumers can
 * pre-seed (`setQueryData`) or invalidate these queries without hardcoding the
 * key shape.
 */
export const electionQueryKeys = {
  election: (id: string) => ['process', id] as const,
  results: (id: string) => ['process-results', id] as const,
}

/**
 * One question's progress through a `vote()` call: CSP-signing the envelope,
 * built and waiting for the batch relay, accepted and awaiting chain
 * confirmation, then confirmed or failed.
 */
export type QuestionVoteStatus = 'signing' | 'submitting' | 'confirming' | 'confirmed' | 'failed'

/** Hard cap of `POST /votes` — the backend rejects larger batches. */
const MAX_VOTE_BATCH = 100

/**
 * Election data, results and the vote flow, plus the voter's CSP auth session
 * (inherited from {@link ElectionAuthContextValue} — `auth0`/`auth1`/`resend`
 * to authenticate, `check`/`sign` for advanced UIs; the session's `clear` is
 * exposed here as {@link clearVoter}).
 */
export interface ElectionContextValue extends Omit<ElectionAuthContextValue, 'clear'> {
  election: VotingProcessResponse | null
  /** Derived process status from all question statuses. */
  status: QuestionStatus | null
  /** Vochain chain id the process's votes are signed against. */
  chainId: string | null
  /** Per-question results from `GET /processes/{id}/results`. */
  results: VotingProcessResultsResponse | null
  loading: boolean
  error: Error | null

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
   * ballots (`number[][]`, one entry per question) and optional per-question
   * memos (free-text notes, e.g. an open "Other" answer — max 256 UTF-8 bytes
   * each, and ⚠️ always cleartext on the envelope, even for secret questions).
   * Returns the first vote id cast by this call — one vote id is relayed per
   * question, so read {@link voteIds} for all of them.
   *
   * Casting is phased so a failure can't half-vote silently: every question is
   * validated and CSP-signed and every transaction built BEFORE anything is
   * relayed, then the whole batch is relayed in ONE call (`POST /votes`) that
   * the backend accepts or rejects as a unit — a rejection relays nothing and
   * is safe to retry. Questions the voter already voted (per a fresh check)
   * are skipped, so calling `vote()` again after a failure resumes the
   * remaining questions. If, after the batch is accepted, some votes land on
   * chain and others fail, throws {@link PartialVoteError} naming both sets.
   */
  vote(encodedBallots: number[][], memos?: (string | undefined)[]): Promise<string>
  /**
   * true exactly while a `vote()` call is in flight — from entry until it
   * settles, whether it resolves or throws. Drive "processing your vote"
   * overlays and disable submit buttons with it (double-submit guard).
   */
  voting: boolean
  /**
   * Per-question progress of the current (or last) `vote()` call, keyed by
   * question id: `signing` → `submitting` → `confirming` → `confirmed` or
   * `failed`. Questions the call skipped because they were already voted
   * appear as `confirmed`. Empty until a vote is attempted; cleared by
   * {@link clearVoter} and on disconnect.
   */
  voteStatus: Record<string, QuestionVoteStatus>
  /**
   * Every vote id (nullifier) the voter holds for this process, keyed by
   * question id — one entry per question already cast. Populated from the
   * outcomes of `vote()` (including the questions that landed when it throws
   * {@link PartialVoteError}) and, on load, recovered from
   * `POST /processes/{id}/sign-info`, so a voter returning after a reload still
   * sees all of them. Empty until the voter is connected and has voted.
   */
  voteIds: Record<string, string>
  /**
   * The first vote id cast by the last `vote()` call — or, before any call in
   * this session, the first one recovered from sign-info.
   *
   * @deprecated Votes are relayed per question, so a process with more than one
   * question yields more than one vote id. Read {@link voteIds} instead; this
   * field only ever exposes one of them.
   */
  voteId: string | null
  isAbleToVote: boolean
  /** Clears the voter's auth session and vote state. */
  clearVoter(): void
}

/**
 * Extra react-query options for the election read. `queryKey`, `queryFn`,
 * `enabled` and `initialData` are provider-owned.
 */
export type ElectionQueryOptions = Omit<
  UseQueryOptions<VotingProcessResponse, Error>,
  'queryKey' | 'queryFn' | 'enabled' | 'initialData'
>

/** Extra react-query options for the results read — same rules as {@link ElectionQueryOptions}. */
export type ElectionResultsQueryOptions = Omit<
  UseQueryOptions<VotingProcessResultsResponse | null, Error>,
  'queryKey' | 'queryFn' | 'enabled' | 'initialData'
>

export interface ElectionProviderBaseProps {
  children: ReactNode
  /** Election ID (the voting process Mongo ObjectID) — fetches the election on mount. */
  id?: string
  /**
   * Prefetched election, rendered immediately instead of a loading state.
   * Seeded into the query cache as `initialData`, so the provider still
   * refetches — by `id`, or by `election.id` when `id` is omitted — whenever
   * the query goes stale (immediately, under the default `staleTime` of 0).
   */
  election?: VotingProcessResponse
  /**
   * Extra react-query options for the election read, e.g. `refetchInterval`
   * to poll for status changes or `staleTime` to trust prefetched data.
   */
  queryOptions?: ElectionQueryOptions
  /**
   * Extra react-query options for the results read, e.g. `refetchInterval`
   * for live tallies.
   */
  resultsQueryOptions?: ElectionResultsQueryOptions
}

/** At least one of `id` or `election` must be provided. */
export type ElectionProviderProps = ElectionProviderBaseProps &
  ({ id: string } | { election: VotingProcessResponse })

/**
 * Thrown by `vote()` when some questions' votes landed on chain and others
 * failed. The voter is partially voted: calling `vote()` again with the same
 * ballots resumes — already-voted questions are skipped — so the UI should
 * offer a retry, not treat the whole cast as lost.
 */
export class PartialVoteError extends Error {
  constructor(
    /** Questions whose vote landed, with the vote id (nullifier) of each. */
    readonly succeeded: Array<{ questionId: string; voteId: string }>,
    /** Questions whose vote failed, with the error that failed each one. */
    readonly failed: Array<{ questionId: string; error: unknown }>,
  ) {
    super(
      `Vote partially failed: ${succeeded.length} question(s) cast, ${failed.length} failed ` +
        `(${failed.map((f) => f.questionId).join(', ')}); call vote() again to retry the failed ones`,
    )
    this.name = 'PartialVoteError'
  }
}

/** Folds a `succeeded` list into the `questionId → voteId` map shape. */
const byQuestion = (succeeded: Array<{ questionId: string; voteId: string }>): Record<string, string> =>
  Object.fromEntries(succeeded.map((s) => [s.questionId, s.voteId]))

const ElectionContext = createContext<ElectionContextValue | undefined>(undefined)

/**
 * Fetches the election and provides its data, results and the vote flow via
 * `useElection()`, plus the voter's CSP auth session — hosted in a separate
 * context readable through `useElectionAuth()`, so auth-only widgets don't
 * re-render on data/results updates.
 */
export function ElectionProvider({
  children,
  id,
  election: prefetched,
  queryOptions,
  resultsQueryOptions,
}: ElectionProviderProps) {
  const { client } = useClient()

  // The id drives every query; a prefetched election carries its own, so
  // passing only `election` still leaves the provider able to refetch.
  const electionId = id ?? prefetched?.id

  // A prefetched process is raw wire data (SSR payload, cache dump) that never
  // went through the client's read boundary, so run it through the same
  // normalization the fetch path applies — otherwise the first paint would show
  // `READY` statuses and choices without their extended info, and only settle
  // once the refetch lands. Idempotent, so an already-normalized process is
  // unaffected.
  const initialElection = useMemo(
    () => (prefetched && prefetched.id === electionId ? normalizeVotingProcess(prefetched) : undefined),
    [prefetched, electionId],
  )

  const {
    data: election = null,
    isLoading: loading,
    error,
  } = useQuery<VotingProcessResponse, Error>({
    ...queryOptions,
    queryKey: electionQueryKeys.election(electionId!),
    queryFn: () => client.elections.get(electionId!),
    enabled: !!electionId,
    // Never seed the cache entry of `id` with a *different* election's data
    // (guarded when building `initialElection`).
    initialData: initialElection,
  })

  const { data: results = null } = useQuery<VotingProcessResultsResponse | null, Error>({
    ...resultsQueryOptions,
    queryKey: electionQueryKeys.results(electionId!),
    // A 404 legitimately means "no results yet" (e.g. before any question is
    // published) — swallow it instead of letting react-query retry the endpoint.
    queryFn: () =>
      client.elections.getResults(electionId!).catch((err) => {
        if (err instanceof VocdoniApiError && err.status === 404) return null
        throw err
      }),
    enabled: !!electionId && !!election,
  })

  const session = useVoterSession(electionId, election)

  const chainId = election?.chainId ?? null

  const status: QuestionStatus | null = election
    ? computeProcessStatus(election.questions)
    : null

  const [voteId, setVoteId] = useState<string | null>(null)
  const [voteIds, setVoteIds] = useState<Record<string, string>>({})
  const [voting, setVoting] = useState(false)
  const [voteStatus, setVoteStatus] = useState<Record<string, QuestionVoteStatus>>({})
  const [hasVoted, setHasVoted] = useState(false)
  const [isInCensus, setIsInCensus] = useState(false)
  const [voterQuestions, setVoterQuestions] = useState<ProcessQuestionStatus[]>([])

  // Resolve census membership once the voter's session is connected. The
  // check reports per-question canVote/hasVoted state. The disconnect branch
  // also resets the vote state, so clearing the session from useElectionAuth()
  // propagates here instead of leaving a stale hasVoted/voteId behind.
  useEffect(() => {
    if (!session.connected || !election) {
      setIsInCensus(false)
      setVoterQuestions([])
      setHasVoted(false)
      setVoteId(null)
      setVoteIds({})
      setVoteStatus({})
      return
    }

    let cancelled = false
    session
      .check()
      .then(async (res) => {
        if (cancelled) return
        setIsInCensus(res.belongsToProcess)
        setVoterQuestions(res.questions)
        setHasVoted(res.questions.length > 0 && res.questions.every((q) => q.hasVoted))

        // Recover the nullifiers of the questions already on chain, so a voter
        // coming back after a reload still sees every vote id they hold and
        // not just the ones this session's vote() produced. Only worth a
        // request once something is actually voted, and a failure here must
        // never invalidate the membership check — swallow it.
        if (!res.questions.some((q) => q.hasVoted)) return
        const info = await client.processes
          .signInfo(election.id, { authToken: session.authToken! })
          .catch(() => null)
        if (cancelled || !info) return
        const recovered = byQuestion(
          info.consumed.map((c) => ({ questionId: c.questionId, voteId: c.nullifier })),
        )
        // Ids cast in this session win: they came straight from the relay job.
        setVoteIds((prev) => ({ ...recovered, ...prev }))
        const first = info.consumed[0]?.nullifier
        if (first) setVoteId((prev) => prev ?? first)
      })
      .catch(() => {
        // ineligible / network error — leave membership as not-in-census
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.connected, election?.id])

  const castVotes = useCallback(
    async (encodedBallots: number[][], memos?: (string | undefined)[]): Promise<string> => {
      if (!election) throw new Error('Election not loaded')
      if (!session.connected) throw new Error('Voter is not authenticated for this election')
      if (!chainId) {
        throw new Error('Missing chainId — the process read did not provide one; cannot cast a vote')
      }
      // Fail before consuming any one-shot CSP signature: a missing ballot at
      // question k would otherwise cast questions 0..k-1 and leave the voter
      // half-voted (and `?? []` would silently cast an empty ballot).
      if (election.questions.length === 0) {
        throw new Error('Process has no questions to vote on')
      }
      if (encodedBallots.length !== election.questions.length) {
        throw new Error(
          `Expected one encoded ballot per question (${election.questions.length}), got ${encodedBallots.length}`,
        )
      }
      if (memos) {
        if (memos.length > election.questions.length) {
          throw new Error(`Got ${memos.length} memos for ${election.questions.length} questions`)
        }
        for (const [i, memo] of memos.entries()) {
          if (memo !== undefined && new TextEncoder().encode(memo).length > MAX_MEMO_BYTES) {
            throw new Error(`Memo for question ${i} exceeds the chain's ${MAX_MEMO_BYTES} UTF-8-byte cap`)
          }
        }
      }

      // Pre-flight EVERY question before anything is consumed or relayed, so a
      // problem at question k can never leave questions 0..k-1 cast on chain.
      // Secret questions must never go out in cleartext: the keykeepers publish
      // the encryption keys asynchronously after publish, so keys may
      // legitimately be absent for a while — refuse rather than cast an
      // unencrypted ballot.
      for (const [i, question] of election.questions.entries()) {
        if (!question.upstreamId) {
          throw new Error(`Question ${i} has no upstreamId; process may not be published yet`)
        }
        if (question.secretUntilTheEnd && !question.encryptionKeys?.length) {
          throw new Error(
            `Question ${i} ("${question.id}") is secret but its encryption keys are not published yet; retry once the keykeepers publish them`,
          )
        }
      }

      // Resume: refresh the per-question voted state so a retry after a partial
      // failure skips the questions already on chain instead of dying on a
      // double-vote. Falls back to the last known state if the check is down.
      let voted: Set<string>
      try {
        const checked = await session.check()
        setIsInCensus(checked.belongsToProcess)
        setVoterQuestions(checked.questions)
        voted = new Set(checked.questions.filter((q) => q.hasVoted).map((q) => q.questionId))
      } catch {
        voted = new Set(voterQuestions.filter((q) => q.hasVoted).map((q) => q.questionId))
      }
      const pending = election.questions
        .map((question, i) => ({ question, i }))
        .filter(({ question }) => !voted.has(question.id))
      if (pending.length === 0) {
        throw new Error('Every question of this process has already been voted')
      }
      // Fail before consuming any CSP signature: the batch endpoint hard-caps
      // at 100 envelopes and would reject the whole relay.
      if (pending.length > MAX_VOTE_BATCH) {
        throw new Error(
          `Cannot cast ${pending.length} votes in one call — the batch relay caps at ${MAX_VOTE_BATCH}`,
        )
      }

      // Per-question progress for UIs: already-voted questions show as
      // confirmed, everything this call will cast starts at 'signing'.
      setVoteStatus(
        Object.fromEntries(
          election.questions.map((q) => [q.id, voted.has(q.id) ? 'confirmed' : 'signing'] as const),
        ),
      )

      // Consume every one-shot CSP signature and build every transaction
      // BEFORE relaying anything. A failure in these phases aborts with zero
      // votes on chain.
      const signed: Array<{ question: (typeof election.questions)[number]; i: number; txPayload: string }> = []
      for (const { question, i } of pending) {
        const signer = new EphemeralSigner()
        const { signature, weight } = await session.sign(question.upstreamId!, signer.address)
        signed.push({
          question,
          i,
          txPayload: buildVoteTransaction({
            processId: question.upstreamId!,
            choices: encodedBallots[i],
            chainId,
            signer,
            cspSignature: signature,
            cspWeight: weight,
            encryptionKeys: question.secretUntilTheEnd ? question.encryptionKeys : undefined,
            memo: memos?.[i],
          }),
        })
        setVoteStatus((st) => ({ ...st, [question.id]: 'submitting' }))
      }

      // Relay the whole batch in ONE call (saas-backend#610). The backend
      // validates it synchronously and accepts or rejects it AS A UNIT, so a
      // throw here means zero votes are on chain — a plain, fully-retryable
      // error, never a partial vote.
      let jobId: string
      try {
        ;({ jobId } = await client.elections.voteBatch({
          votes: signed.map(({ txPayload }) => ({ txPayload })),
        }))
      } catch (err) {
        setVoteStatus((st) => {
          const next = { ...st }
          for (const { question } of signed) next[question.id] = 'failed'
          return next
        })
        throw err
      }

      // One job covers the batch; its per-envelope entries settle one by one
      // while the job is pending — mirror every poll into voteStatus so UIs
      // can show per-question confirmation progress.
      const applyOutcomes = (votes: VoteJobResult[] | undefined) => {
        if (!votes) return
        setVoteStatus((st) => {
          const next = { ...st }
          votes.forEach((v, idx) => {
            const question = signed[idx]?.question
            if (!question) return
            next[question.id] =
              v.status === 'completed' ? 'confirmed' : v.status === 'failed' ? 'failed' : 'confirming'
          })
          return next
        })
      }
      setVoteStatus((st) => {
        const next = { ...st }
        for (const { question } of signed) next[question.id] = 'confirming'
        return next
      })

      // The job completes only when EVERY envelope landed and fails otherwise;
      // a failed job still carries the per-vote outcomes, so read them from
      // the JobFailedError instead of rethrowing.
      let outcomes: VoteJobResult[]
      try {
        const job = await client.jobs.waitFor(jobId, {
          expectType: 'relay_votes',
          onPoll: (j) => applyOutcomes(j.result?.votes),
        })
        outcomes = job.result?.votes ?? []
      } catch (err) {
        if (!(err instanceof JobFailedError)) throw err
        outcomes = err.job.result?.votes ?? []
        applyOutcomes(outcomes)
      }

      const succeeded: Array<{ questionId: string; voteId: string }> = []
      const failed: Array<{ questionId: string; error: unknown }> = []
      signed.forEach(({ question }, idx) => {
        const outcome = outcomes[idx]
        if (outcome?.status === 'completed') {
          succeeded.push({ questionId: question.id, voteId: outcome.voteID ?? outcome.nullifier })
        } else {
          failed.push({
            questionId: question.id,
            error: new Error(outcome?.error ?? `Vote for question ${question.id} did not complete`),
          })
        }
      })

      // Whatever landed is the voter's, failures included: expose those ids
      // before the throw path so a partial cast doesn't lose them.
      if (succeeded.length > 0) {
        setVoteIds((prev) => ({ ...prev, ...byQuestion(succeeded) }))
      }

      if (failed.length > 0) {
        if (succeeded.length > 0) setVoteId((prev) => prev ?? succeeded[0].voteId)
        // Truthful partial state: reflect what actually landed on chain, so
        // `voterQuestions`/`hasVoted` don't claim "not voted" for cast votes.
        try {
          const checked = await session.check()
          setVoterQuestions(checked.questions)
          setHasVoted(checked.questions.length > 0 && checked.questions.every((q) => q.hasVoted))
        } catch {
          const landed = new Set(succeeded.map((s) => s.questionId))
          setVoterQuestions((qs) => qs.map((q) => (landed.has(q.questionId) ? { ...q, hasVoted: true } : q)))
        }
        throw new PartialVoteError(succeeded, failed)
      }

      setVoterQuestions((qs) => qs.map((q) => ({ ...q, hasVoted: true })))
      setHasVoted(true)
      // The first cast question's vote id (on a resumed call, the first of the
      // questions cast by THIS call).
      const resultVoteId = succeeded[0]?.voteId ?? ''
      setVoteId(resultVoteId)
      return resultVoteId
    },
    [election, session, chainId, client, voterQuestions],
  )

  // Public vote(): the cast wrapped in the in-flight flag, so UIs can show a
  // "processing your vote" state and guard against double submits. The flag
  // clears on settle either way — including a PartialVoteError, where the UI
  // is expected to offer a retry, not stay stuck "processing".
  const vote = useCallback(
    async (encodedBallots: number[][], memos?: (string | undefined)[]): Promise<string> => {
      setVoting(true)
      try {
        return await castVotes(encodedBallots, memos)
      } finally {
        setVoting(false)
      }
    },
    [castVotes],
  )

  const clearVoter = useCallback(() => {
    setVoteId(null)
    setVoteIds({})
    setVoteStatus({})
    setHasVoted(false)
    setIsInCensus(false)
    setVoterQuestions([])
    session.clear()
  }, [session])

  const value = useMemo<ElectionContextValue>(
    () => ({
      election,
      status,
      chainId,
      results,
      loading,
      error: error ?? null,
      authToken: session.authToken,
      connected: session.connected,
      weight: session.weight,
      auth0: session.auth0,
      auth1: session.auth1,
      resend: session.resend,
      check: session.check,
      sign: session.sign,
      isInCensus,
      voterQuestions,
      hasVoted,
      vote,
      voting,
      voteStatus,
      voteIds,
      voteId,
      isAbleToVote: session.connected && isInCensus && !hasVoted,
      clearVoter,
    }),
    [election, status, chainId, results, loading, error, session, isInCensus, voterQuestions, hasVoted, vote, voting, voteStatus, voteIds, voteId, clearVoter],
  )

  return (
    <ElectionAuthContext.Provider value={session}>
      <ElectionContext.Provider value={value}>{children}</ElectionContext.Provider>
    </ElectionAuthContext.Provider>
  )
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
