import type {
  QuestionStatus,
  VotingProcessQuestion,
  VotingProcessResponse,
  VotingProcessResultsResponse,
} from '@vocdoni/api-types'

/**
 * The backend emits `READY` for a live question at runtime — the same semantic
 * state as `ONGOING`, which is the only name {@link QuestionStatus} declares.
 * Normalize it away at the read boundary so `status === 'ONGOING'` comparisons
 * hold; the wire name `ready` then only exists in the write API
 * (`SetElectionStatusRequest` / `bulkSetQuestionStatus`).
 */
export const normalizeQuestionStatus = (status: string): QuestionStatus =>
  (status === 'READY' ? 'ONGOING' : status) as QuestionStatus

/** Normalizes every question's status of a process read (`READY` → `ONGOING`). */
export const normalizeVotingProcess = <T extends VotingProcessResponse>(process: T): T => ({
  ...process,
  questions: process.questions.map((q) => ({ ...q, status: normalizeQuestionStatus(q.status) })),
})

/**
 * Derive a single {@link QuestionStatus} for a process from its questions' statuses.
 *
 * Rules (applied in order):
 * 1. Any question `ONGOING` → `ONGOING` (loudest running state wins)
 * 2. All questions share the same status → that status (e.g. all `RESULTS`, all `PAUSED`)
 * 3. All questions in `{ENDED, RESULTS}` → `ENDED` (mixed: some results still computing)
 * 4. No questions or mixed state → `PROCESS_UNKNOWN`
 *
 * Statuses are normalized first (`READY` → `ONGOING`), so the derivation also
 * holds for raw wire data that didn't pass through the client (e.g. an SSR
 * payload handed to `<ElectionProvider election>`).
 */
export const computeProcessStatus = (questions: VotingProcessQuestion[]): QuestionStatus => {
  if (questions.length === 0) return 'PROCESS_UNKNOWN'

  const statuses = questions.map((q) => normalizeQuestionStatus(q.status))

  if (statuses.includes('ONGOING')) return 'ONGOING'

  const first = statuses[0]
  if (statuses.every((s) => s === first)) return first

  if (statuses.every((s) => s === 'ENDED' || s === 'RESULTS')) return 'ENDED'

  return 'PROCESS_UNKNOWN'
}

/** True when the process is actively accepting votes (`ONGOING`). */
export const isLive = (process: VotingProcessResponse): boolean =>
  computeProcessStatus(process.questions) === 'ONGOING'

/** True when the process is scheduled but not yet started (`UPCOMING`). */
export const isUpcoming = (process: VotingProcessResponse): boolean =>
  computeProcessStatus(process.questions) === 'UPCOMING'

/** True when all question results are final (`RESULTS`). */
export const hasResults = (process: VotingProcessResponse): boolean =>
  computeProcessStatus(process.questions) === 'RESULTS'

/** True when any question hides its tallies until the vote ends. */
export const isSecretUntilTheEnd = (process: VotingProcessResponse): boolean =>
  process.questions.some((q) => q.secretUntilTheEnd)

/**
 * Ballots cast for the process: the highest per-question vote count. Every voter
 * votes each question of the process, so the max approximates unique ballots better
 * than a sum (which would count one voter N times for N questions).
 */
export const processVoteCount = (results: VotingProcessResultsResponse | null | undefined): number =>
  results?.questions.reduce((max, q) => Math.max(max, q.voteCount ?? 0), 0) ?? 0
