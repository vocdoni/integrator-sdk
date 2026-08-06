// Re-export types
export type {
  DecodedChoiceResult,
  DecodedAbstainResult,
  DecodedQuestionResults,
  DecodedResults,
  BallotSelections,
} from './types'

export { BallotType } from './types'
export type { ProtocolBounds } from './protocol'

// Re-export functions
export {
  declaresLegacyPickSlot,
  inferBallotType,
  inferQuestionBallotType,
  isDenseBallotProtocol,
} from './infer'
export {
  assertEncodedBallot,
  isUnsatisfiableProtocol,
  isUnsatisfiableQuestion,
  unsatisfiableProtocolReason,
  unsatisfiableQuestionReason,
  voteTypeBounds,
} from './protocol'
export { encodeBallot, encodeQuestionBallot } from './encode'
export { decodeResults, decodeQuestionResults } from './decode'
export { validateSelections } from './validate'
export { multichoiceReservesAbstain, questionReservesAbstain, questionSelectionRange } from './abstain'
