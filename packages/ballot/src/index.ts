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
export { inferBallotType } from './infer.js'
export { encodeBallot } from './encode.js'
export { decodeResults } from './decode.js'
export { validateSelections } from './validate.js'
export { multichoiceReservesAbstain } from './abstain.js'
