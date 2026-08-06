import type { BallotProtocol, Choice, Election, Question, QuestionTypeSetup, VoteType } from '@vocdoni/api-types'
import { BallotType, type BallotSelections } from './types'
import {
  declaresLegacyPickSlot,
  inferBallotType,
  inferQuestionBallotType,
  isDenseBallotProtocol,
} from './infer'
import { normalizeSelections } from './selections'
import { requiredAbstainMaxValue } from './abstain'
import {
  assertEncodedBallot,
  unsatisfiableProtocolReason,
  unsatisfiableQuestionReason,
  voteTypeBounds,
  type ProtocolBounds,
} from './protocol'

/**
 * Encode high-level voter selections into the on-chain ballot array format.
 *
 * `selections` accepts a flat `number[]` (the ergonomic default) or a nested
 * `number[][]` (one array per question); both normalize to the same output — see
 * {@link BallotSelections}.
 *
 * Encoding rules (must match vochain scrutinizer):
 * - single-choice (multi-question): one chosen choice value per question: [v0, v1, …]
 * - approval: dense 0/1 vector over options: choices.map(c => selected.has(c) ? 1 : 0)
 * - multichoice: exactly `maxCount` picked option values, unfilled slots padded with abstain
 *   sentinels (values ≥ choices.length; see encodeMultiChoice)
 * - budget / quadratic: per-option amount array [a0, a1, …]
 *
 * @param input - Election config with questions and voteType
 * @param selections - Per-question choice values (single/multi) or per-option amounts (budget/quadratic)
 * @returns The ballot array as numbers
 * @throws When the election's ballot config is unsatisfiable — see
 *   {@link unsatisfiableProtocolReason} — or when the encoded ballot itself would
 *   violate the protocol's per-field bounds (a value above `maxValue`, or a repeat
 *   under `uniqueChoices` — see {@link assertEncodedBallot}). Either way the chain
 *   would accept the vote and drop it at tally, so refuse rather than cast a vote
 *   that silently never counts.
 */
export function encodeBallot(
  input: Pick<Election, 'questions' | 'voteType'> & { type?: string; meta?: Record<string, unknown> },
  selections: BallotSelections
): number[] {
  const { questions, voteType } = input
  const bounds = voteTypeBounds(voteType)
  const unsatisfiable = unsatisfiableProtocolReason(bounds)
  if (unsatisfiable) {
    throw new Error(`cannot encode a ballot for this election: ${unsatisfiable}`)
  }
  const ballotType = inferBallotType(input)
  const perQuestion = normalizeSelections(input, selections)

  const ballot = ((): number[] => {
    switch (ballotType) {
      case BallotType.SingleChoice:
        return encodeSingleChoice(questions, perQuestion)

      case BallotType.Approval:
        // approval: dense 0/1 vector, confirmed correct vs vochain scrutinizer
        // (NOT the legacy Form.tsx index list, which is buggy for >2 options)
        return encodeApproval(questions[0], perQuestion[0] ?? [])

      case BallotType.MultiChoice:
        return encodeMultiChoice(voteType, questions[0], perQuestion[0] ?? [])

      case BallotType.Budget:
      case BallotType.Quadratic:
        return encodeBudgetOrQuadratic(perQuestion[0] ?? [])

      default:
        throw new Error(`Unknown ballot type: ${ballotType}`)
    }
  })()

  // The config being satisfiable does not make this ballot satisfying: a stray
  // selection value or a duplicated unique pick still yields a ballot the chain
  // accepts and never counts, so check the product, not just the config.
  assertEncodedBallot(ballot, bounds)
  return ballot
}

/**
 * Encode single-choice ballot: one choice value per question.
 *
 * Each question is a field whose value is the chosen choice. Single-choice has no
 * abstain concept: if abstaining is offered, the process creator adds an explicit
 * "Abstain" option as a normal choice, so the voter always picks exactly one value.
 * An empty selection is therefore invalid input, not an abstention.
 */
function encodeSingleChoice(questions: Question[], selections: number[][]): number[] {
  return selections.map((choices, q) => {
    if (choices.length === 0) {
      throw new Error(`Question ${q}: single-choice requires exactly one choice`)
    }
    // Take the first selected value. encodeBallot does not run validateSelections, so it
    // only guards against an empty pick here; if a caller passes more than one value, the
    // extras are ignored. Call validateSelections separately to reject that up front.
    return choices[0]
  })
}

/**
 * Encode approval ballot: dense 0/1 vector over all choices.
 */
function encodeApproval(question: Question, selections: number[]): number[] {
  const has = new Set(selections)
  return question.choices.map((choice) => (has.has(choice.value) ? 1 : 0))
}

/**
 * Encode multichoice ballot: the picked option values, one per pick-slot.
 *
 * The scrutinizer enforces only the *upper* bound — a ballot may hold fewer than `maxCount`
 * picks (the legacy SDK sends short ballots unpadded), so a partial selection is returned
 * as-is unless the protocol reserves abstain sentinels, in which case unfilled slots are
 * padded. The sentinels are the values just past the valid choice indices
 * (`0..choices.length-1`); the ballot config reserves them by setting
 * `maxValue >= choices.length` (legacy SDK: `maxValue = choices.length - 1 + abstainAllowance`):
 *
 * - `uniqueChoices === false` (choices may repeat): a single abstain value `choices.length`,
 *   reused for every empty slot.
 * - `uniqueChoices === true` (choices are unique): distinct ascending values
 *   `choices.length, choices.length + 1, …`, one per empty slot, so no value repeats.
 *
 * Throws only when there are more selections than `maxCount`. Fewer than `maxCount` is
 * always allowed: padded with abstain sentinels when the config reserves enough room (the
 * reservation formula `maxValue >= choices.length - 1 + (uniqueChoices ? maxCount : 1)`),
 * otherwise returned short — the vochain accepts it, and a minimum-pick count is the UI's
 * concern (`typeSetup.minChoices`), not the encoder's (there is no on-chain minimum).
 */
function encodeMultiChoice(voteType: VoteType, question: Question, selections: number[]): number[] {
  const numChoices = question.choices.length
  const { maxCount } = voteType
  const ballot = [...selections]

  if (ballot.length > maxCount) {
    throw new Error(
      `multichoice: too many selections (${ballot.length}); at most maxCount (${maxCount}) allowed`
    )
  }
  if (ballot.length === maxCount) return ballot

  // Fewer picks than slots. Pad with abstain sentinels only when the config reserves enough
  // room (repeatable ballots reuse a single sentinel +1; unique ballots need one distinct
  // ascending sentinel per slot +maxCount — matching the legacy maxValue reservation).
  // Otherwise return the short ballot as-is: the vochain accepts ballots shorter than
  // maxCount (it enforces only the upper bound) and the legacy SDK sends them unpadded.
  const neededMaxValue = requiredAbstainMaxValue(numChoices, voteType)
  if (voteType.maxValue >= neededMaxValue) {
    const unique = voteType.uniqueChoices
    let abstainSlot = 0
    while (ballot.length < maxCount) {
      ballot.push(unique ? numChoices + abstainSlot : numChoices)
      abstainSlot++
    }
  }
  return ballot
}

/**
 * Encode budget or quadratic ballot: per-option amount array, in choice order.
 */
function encodeBudgetOrQuadratic(selections: number[]): number[] {
  // For budget/quadratic, selections are the amounts allocated to each option; the
  // caller supplies them already in choice order, so pass them through unchanged.
  return [...selections]
}

function ballotProtocolToVoteType(bp: BallotProtocol): VoteType {
  return {
    maxCount: bp.maxCount,
    maxValue: bp.maxValue,
    maxVoteOverwrites: bp.maxVoteOverwrites,
    costExponent: bp.costExponent,
    uniqueChoices: bp.uniqueValues,
    costFromWeight: bp.costFromWeight,
  }
}

/**
 * The protocol bounds a question's encoded ballot is judged against on chain: its raw
 * `ballotProtocol` when it carries one (the protocol overrides the named type at
 * creation), otherwise the named type's canonical derivation, mirroring saas-backend's
 * `BallotProtocolFromType` — `singlechoice` is one field whose `maxValue` covers the
 * highest `Choice.value` (values need not be contiguous), `multichoice` is the dense
 * 0/1 layout. A question with neither half has no derivable bounds.
 */
function questionProtocolBounds(question: {
  ballotProtocol?: BallotProtocol
  type?: string
  metadata?: Record<string, unknown>
  typeSetup?: QuestionTypeSetup
  choices: Choice[]
}): ProtocolBounds | null {
  if (question.ballotProtocol) return question.ballotProtocol
  switch (question.type) {
    case 'singlechoice':
      return {
        maxCount: 1,
        maxValue: Math.max(0, ...question.choices.map((choice) => choice.value)),
        uniqueValues: false,
      }
    case 'multichoice':
      return {
        maxCount: question.choices.length,
        maxValue: 1,
        uniqueValues: question.typeSetup?.uniqueChoices ?? false,
      }
    default:
      return null
  }
}

/**
 * Encode a single question's ballot using its own {@link BallotProtocol}.
 *
 * @param question - The question with `ballotProtocol` and `choices`
 * @param selections - The voter's raw selections for this question
 * @throws When the question's ballot config is unsatisfiable — see
 *   {@link unsatisfiableQuestionReason} — or when the encoded ballot itself would
 *   violate the question's protocol bounds (a value above `maxValue`, or a repeat
 *   under `uniqueValues` — see {@link assertEncodedBallot}). Every such ballot is
 *   dropped by the scrutinizer at tally while still counting towards `voteCount`,
 *   so refuse instead of letting the voter cast a vote that never counts.
 */
export function encodeQuestionBallot(
  question: { ballotProtocol?: BallotProtocol; type?: string; metadata?: Record<string, unknown>; typeSetup?: QuestionTypeSetup; choices: Choice[] },
  selections: number[]
): number[] {
  const unsatisfiable = unsatisfiableQuestionReason(question)
  if (unsatisfiable) {
    throw new Error(`cannot encode a ballot for this question: ${unsatisfiable}`)
  }
  const ballotType = inferQuestionBallotType(question)
  const fakeQuestion: Question = { title: { default: '' }, choices: question.choices }

  const ballot = ((): number[] => {
    switch (ballotType) {
      case BallotType.SingleChoice:
        if (selections.length !== 1) {
          throw new Error(`single-choice requires exactly one choice (got ${selections.length})`)
        }
        return [selections[0]]

      case BallotType.Approval:
        return encodeApproval(fakeQuestion, selections)

      case BallotType.MultiChoice: {
        const bp = question.ballotProtocol
        // Named multichoice derives the dense layout on chain (one 0/1 field per
        // choice, maxTotalCost = typeSetup.maxChoices bounding the picks) —
        // encode dense, not pick-slot. Pick-slot values (choice values, abstain
        // sentinels >= numChoices) would exceed maxValue = 1 and the chain
        // silently discards them at tally. Public reads of named-type questions
        // may omit the protocol entirely; the layout is still fully determined
        // by the type, with the pick bound read from typeSetup.
        //
        // The legacy `multiple-choice` metadata name means the opposite — pick-slot —
        // and at two options its protocol also satisfies isDenseBallotProtocol, so it
        // has to opt out of the dense branch explicitly or the ballot goes out on the
        // wrong axis.
        if (!declaresLegacyPickSlot(question) && (!bp || isDenseBallotProtocol(bp))) {
          const cap = bp?.maxTotalCost || question.typeSetup?.maxChoices || 0
          if (cap > 0 && selections.length > cap) {
            throw new Error(
              `multichoice: too many selections (${selections.length}); at most ${cap} allowed`
            )
          }
          return encodeApproval(fakeQuestion, selections)
        }
        if (!bp) {
          // Only reachable via a legacy pick-slot name on a protocol-less read. Pick-slot
          // needs `maxCount` to size the slate and `maxValue` to know whether abstain
          // sentinels are reserved; guessing either produces a ballot the chain accepts
          // and drops at tally, so refuse and let the caller fetch the protocol.
          throw new Error(
            'cannot encode a legacy multiple-choice ballot without a ballotProtocol: ' +
              'the pick-slot layout needs maxCount/maxValue to pad abstain slots'
          )
        }
        return encodeMultiChoice(ballotProtocolToVoteType(bp), fakeQuestion, selections)
      }

      case BallotType.Budget:
      case BallotType.Quadratic:
        return encodeBudgetOrQuadratic(selections)

      default:
        throw new Error(`Unknown ballot type: ${ballotType}`)
    }
  })()

  // A satisfiable config still admits unsatisfying ballots — duplicate ranks on a
  // unique-values protocol, an amount above maxValue, a stray selection value. The
  // chain accepts all of those and never counts them, so check the product too.
  // Without derivable bounds only the fields' basic shape can be checked.
  assertEncodedBallot(ballot, questionProtocolBounds(question) ?? { maxCount: ballot.length, maxValue: 0, uniqueValues: false })
  return ballot
}
