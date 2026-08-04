import type { BallotProtocol, Choice, QuestionTypeSetup, VoteType } from '@vocdoni/api-types'

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
 * The rule is **pigeonhole only** — `uniqueValues` with fewer distinct legal values
 * (`0..maxValue`) than fields to fill (`maxCount`). It deliberately mirrors the
 * backend's `ValidateBallotProtocol` (saas-backend `account/ballot.go`), which
 * checks *unsatisfiability only, never plausibility*: a raw protocol is exactly how
 * the shapes with no named type are expressed, so anything a voter could actually
 * satisfy has to stay expressible. Diverging would mean rejecting protocols the API
 * accepts. Two scope notes on that mirror:
 *
 * - Neither side checks cost bounds, so a `uniqueValues` protocol whose *cheapest*
 *   legal ballot exceeds a non-zero `maxTotalCost` (e.g. `maxCount: 4, maxValue: 3,
 *   maxTotalCost: 3` — any permutation costs ≥ 0+1+2+3 = 6) passes here and at the
 *   API, yet tallies to zero all the same. "Unsatisfiable" in this module means
 *   *pigeonhole-unsatisfiable*, not "every possible way to never count".
 * - The `maxValue === 0` carve-out below is client-only: the backend applies the
 *   pigeonhole literally and rejects `uniqueValues` with `maxValue: 0` and
 *   `maxCount > 1`. This function stays silent there and lets the API answer, so
 *   the laxness fails slow (a 400 on create), never silent.
 *
 * The dense 0/1 multichoice layout (`maxValue === 1`) is the shape this exists for:
 * over more than two choices only 0 and 1 are available, so every ballot repeats a
 * value — even a single pick, `[1, 0, 0, 0]`, repeats `0`. Note that at *exactly* two
 * fields `[0, 1]` and `[1, 0]` do satisfy it, which is a two-option ranked ballot;
 * that is allowed here, matching the backend. The named `multichoice` type cannot
 * reach it either way, because the API rejects `typeSetup.uniqueChoices` outright.
 *
 * `maxValue === 0` means "no upper bound" (budget / quadratic), so uniqueness is
 * always satisfiable there and is never reported.
 */
export function unsatisfiableProtocolReason(bp: ProtocolBounds): string | null {
  // Malformed bounds (missing, negative, fractional — reachable only from untyped JS
  // or hand-built objects) get no verdict rather than a NaN-laden one: this function
  // explains why a well-formed protocol can never be tallied; rejecting malformed
  // input is the API's job, and it never reaches the chain.
  if (!Number.isInteger(bp.maxCount) || bp.maxCount < 0) return null
  if (!Number.isInteger(bp.maxValue) || bp.maxValue < 0) return null
  if (!bp.uniqueValues) return null
  // maxValue 0 is the budget/quadratic "unbounded value" marker, not a one-value range.
  if (bp.maxValue === 0) return null
  if (bp.maxValue + 1 >= bp.maxCount) return null

  const dense =
    bp.maxValue === 1
      ? ' This is the dense 0/1 multichoice layout, where each choice is its own field and ' +
        'uniqueness is already implicit — a voter cannot select the same choice twice.'
      : ''
  return (
    `uniqueValues is true but maxValue ${bp.maxValue} allows only ${bp.maxValue + 1} distinct ` +
    `value(s) for ${bp.maxCount} ballot fields, so no ballot can fill them without repeating ` +
    `one — every vote would be discarded at tally, leaving an all-zero result.${dense} ` +
    `Raise maxValue to at least ${bp.maxCount - 1}, or set uniqueValues/typeSetup.uniqueChoices false`
  )
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
 * Assert an encoded wire ballot would survive the scrutinizer's per-field checks.
 *
 * {@link unsatisfiableProtocolReason} judges the *config*; this judges the *product*:
 * every field a non-negative integer no greater than `maxValue` (when `maxValue > 0` —
 * `0` is the budget/quadratic "unbounded" marker), and no repeated value under
 * `uniqueValues`. A ballot violating either is not refused at cast time — the chain
 * accepts the envelope, counts it in `voteCount`, and silently drops it during tally
 * aggregation — so this is the last place the mistake can be loud. Encoders call it on
 * everything they produce; call it directly on a ballot built by hand.
 *
 * @throws When a field is negative, fractional, above `maxValue`, or repeats a value
 *   the protocol requires to be unique.
 */
export function assertEncodedBallot(ballot: number[], bounds: ProtocolBounds): void {
  ballot.forEach((value, field) => {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        `encoded ballot field ${field} is ${value}; ballot fields must be non-negative integers — ` +
          'the chain would accept this vote and silently drop it at tally'
      )
    }
    if (bounds.maxValue > 0 && value > bounds.maxValue) {
      throw new Error(
        `encoded ballot field ${field} is ${value}, above maxValue ${bounds.maxValue} — the chain ` +
          'would accept this vote and silently drop it at tally'
      )
    }
  })
  if (!bounds.uniqueValues) return
  const seen = new Map<number, number>()
  ballot.forEach((value, field) => {
    const first = seen.get(value)
    if (first !== undefined) {
      throw new Error(
        `encoded ballot repeats value ${value} (fields ${first} and ${field}), but uniqueValues ` +
          'requires every field distinct — the chain would accept this vote and silently drop it at tally'
      )
    }
    seen.set(value, field)
  })
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
