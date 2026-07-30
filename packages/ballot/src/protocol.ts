import type { BallotProtocol, Choice, QuestionTypeSetup, VoteType } from '@vocdoni/api-types'
import { isDenseBallotProtocol } from './infer.js'

/** The part of a ballot protocol the satisfiability rule reads. */
export type ProtocolBounds = Pick<BallotProtocol, 'maxCount' | 'maxValue' | 'uniqueValues'>

/**
 * Explain why a ballot protocol admits no usable ballot, or `null` when it is fine.
 *
 * The vochain scrutinizer applies `uniqueValues` to the **raw field values** of the
 * ballot, not to "the choices a voter picked": `results.AddVote` rejects the whole
 * ballot with `values are not unique` as soon as one value repeats
 * (vocdoni-node `vochain/results/results.go`). A rejected ballot is dropped from the
 * tally while the vote still counts towards `voteCount` — the election accepts votes
 * and reports zeros, which is why an unsatisfiable protocol must be caught before
 * anyone votes rather than diagnosed from an empty result matrix.
 *
 * Two ways a protocol gets there:
 *
 * - **Dense 0/1 layout + `uniqueValues`** (`maxValue === 1`, `maxCount > 1`): the
 *   layout is one field per choice, so the only field values that exist are 0 and 1.
 *   Above two choices no ballot survives at all — even a single pick
 *   (`[1, 0, 0, 0]`) repeats `0`. At exactly two choices the check is satisfiable
 *   but destructive: only `[0, 1]` and `[1, 0]` pass, so the voter can neither pick
 *   both nor abstain, and any ballot that does is dropped while `maxTotalCost`
 *   advertises those picks as allowed. Rejected in both cases.
 * - **Pigeonhole** (`uniqueValues`, `0 < maxValue + 1 < maxCount`): fewer distinct
 *   legal values than fields to fill.
 *
 * `maxValue === 0` means "no upper bound" (budget / quadratic), so uniqueness is
 * always satisfiable there and is never reported.
 */
export function unsatisfiableProtocolReason(bp: ProtocolBounds): string | null {
  if (!bp.uniqueValues) return null
  // maxValue 0 is the budget/quadratic "unbounded value" marker, not a one-value range.
  if (bp.maxValue === 0) return null

  if (isDenseBallotProtocol(bp)) {
    // The consequence genuinely differs at the boundary, so say which one applies
    // rather than giving a creator a reason that is false for their question.
    const why =
      bp.maxCount > 2
        ? `no ballot over ${bp.maxCount} fields can avoid repeating one of them — even a single ` +
          'pick ([1, 0, 0, …]) repeats 0 — and the scrutinizer discards every vote, leaving an ' +
          'all-zero result'
        : 'with exactly two fields only [0, 1] and [1, 0] pass the uniqueness check: a voter can ' +
          'neither pick both choices nor abstain, and those ballots are discarded at tally even ' +
          'though maxTotalCost advertises them as allowed'
    return (
      `uniqueValues is true on a dense 0/1 ballot (maxValue 1, maxCount ${bp.maxCount}): ` +
      `each choice is its own 0/1 field, so ${why}. Uniqueness is already implicit in this ` +
      'layout — a voter cannot select the same choice twice — so create the question with ' +
      'uniqueValues/typeSetup.uniqueChoices false'
    )
  }

  if (bp.maxValue + 1 < bp.maxCount) {
    return (
      `uniqueValues is true but maxValue ${bp.maxValue} allows only ${bp.maxValue + 1} distinct ` +
      `value(s) for ${bp.maxCount} ballot fields, so no ballot can fill them without repeating ` +
      'one — every vote would be discarded at tally. Raise maxValue to at least ' +
      `${bp.maxCount - 1} or set uniqueValues false`
    )
  }

  return null
}

/** True when {@link unsatisfiableProtocolReason} has something to say about `bp`. */
export function isUnsatisfiableProtocol(bp: ProtocolBounds): boolean {
  return unsatisfiableProtocolReason(bp) !== null
}

/** Read the satisfiability bounds off an election-level {@link VoteType}. */
export function voteTypeBounds(voteType: Pick<VoteType, 'maxCount' | 'maxValue' | 'uniqueChoices'>): ProtocolBounds {
  return { maxCount: voteType.maxCount, maxValue: voteType.maxValue, uniqueValues: voteType.uniqueChoices }
}

/**
 * Explain why a question's ballot config admits no usable ballot, or `null` when it
 * is fine. Use it on the read side to detect an already-created broken question —
 * an all-zero tally is otherwise indistinguishable from "nobody voted".
 *
 * A raw `ballotProtocol` is checked directly (it overrides the named type on
 * creation). Otherwise the named type's derivation is checked: the backend turns
 * `type: 'multichoice'` into the dense layout (`maxCount = choices.length`,
 * `maxValue = 1`, `maxTotalCost = typeSetup.maxChoices`) and maps
 * `typeSetup.uniqueChoices` straight onto the on-chain `uniqueValues`, so the same
 * contradiction is visible from `type` + `typeSetup` alone — which is all a public
 * read exposes, since it omits the derived protocol.
 */
export function unsatisfiableQuestionReason(question: {
  ballotProtocol?: BallotProtocol
  type?: string
  typeSetup?: QuestionTypeSetup
  choices: Choice[]
}): string | null {
  const bp = question.ballotProtocol
  if (bp) return unsatisfiableProtocolReason(bp)

  if (question.type === 'multichoice' && question.typeSetup?.uniqueChoices && question.choices.length > 1) {
    return unsatisfiableProtocolReason({
      maxCount: question.choices.length,
      maxValue: 1,
      uniqueValues: true,
    })
  }

  return null
}

/** True when {@link unsatisfiableQuestionReason} has something to say about `question`. */
export function isUnsatisfiableQuestion(question: {
  ballotProtocol?: BallotProtocol
  type?: string
  typeSetup?: QuestionTypeSetup
  choices: Choice[]
}): boolean {
  return unsatisfiableQuestionReason(question) !== null
}
