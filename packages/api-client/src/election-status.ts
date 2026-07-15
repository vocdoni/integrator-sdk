import type { QuestionStatus, VotingProcessQuestion, VotingProcessResponse } from '@vocdoni/api-types'

/**
 * Derive a single {@link QuestionStatus} for a process from its questions' statuses.
 *
 * Rules (applied in order):
 * 1. Any question `ONGOING` → `ONGOING` (loudest running state wins)
 * 2. All questions share the same status → that status (e.g. all `RESULTS`, all `PAUSED`)
 * 3. All questions in `{ENDED, RESULTS}` → `ENDED` (mixed: some results still computing)
 * 4. No questions or mixed state → `PROCESS_UNKNOWN`
 */
export const computeProcessStatus = (questions: VotingProcessQuestion[]): QuestionStatus => {
  if (questions.length === 0) return 'PROCESS_UNKNOWN'

  const statuses = questions.map((q) => q.status)

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
