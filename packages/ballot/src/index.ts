// Re-export types
export type {
  DecodedChoiceResult,
  DecodedAbstainResult,
  DecodedQuestionResults,
  DecodedResults,
  BallotSelections,
} from './types.js'

export { BallotType } from './types.js'

// Re-export functions
export { inferBallotType, inferQuestionBallotType } from './infer.js'
export { encodeBallot, encodeQuestionBallot } from './encode.js'
export { decodeResults, decodeQuestionResults } from './decode.js'
export { validateSelections } from './validate.js'
export { multichoiceReservesAbstain, questionReservesAbstain, questionSelectionRange } from './abstain.js'
