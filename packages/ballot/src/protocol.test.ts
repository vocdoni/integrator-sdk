import { describe, it, expect } from 'vitest'
import {
  assertEncodedBallot,
  isUnsatisfiableProtocol,
  isUnsatisfiableQuestion,
  unsatisfiableProtocolReason,
  unsatisfiableQuestionReason,
  voteTypeBounds,
} from './protocol.js'

const bp = (overrides: Record<string, number | boolean> = {}) => ({
  maxCount: 1,
  maxValue: 1,
  maxVoteOverwrites: 0,
  maxTotalCost: 0,
  costExponent: 1,
  uniqueValues: false,
  costFromWeight: false,
  ...overrides,
})

const choices = (n: number) =>
  Array.from({ length: n }, (_, j) => ({ title: { default: `C${j}` }, value: j }))

describe('unsatisfiableProtocolReason', () => {
  it('passes anything without uniqueValues', () => {
    expect(unsatisfiableProtocolReason(bp({ maxCount: 4, maxValue: 1 }))).toBeNull()
    expect(unsatisfiableProtocolReason(bp({ maxCount: 4, maxValue: 0 }))).toBeNull()
  })

  it('rejects the dense 0/1 layout with uniqueValues', () => {
    // The live config of the broken processes: 4 choices → 4 fields, values 0/1.
    const reason = unsatisfiableProtocolReason(
      bp({ maxCount: 4, maxValue: 1, maxTotalCost: 4, uniqueValues: true })
    )
    expect(reason).toMatch(/only 2 distinct value\(s\) for 4 ballot fields/)
    expect(reason).toMatch(/all-zero result/)
    // maxValue 1 is worth naming explicitly — it is the shape this guard exists for.
    expect(reason).toMatch(/dense 0\/1 multichoice layout/)
    expect(isUnsatisfiableProtocol(bp({ maxCount: 4, maxValue: 1, uniqueValues: true }))).toBe(true)
  })

  it('ACCEPTS the two-field dense layout, matching the backend', () => {
    // maxCount 2 / maxValue 1 admits [0,1] and [1,0], so it is satisfiable — and
    // it is how a two-option ranked ballot is expressed. The backend's
    // ValidateBallotProtocol checks unsatisfiability only, never plausibility,
    // so rejecting here would refuse a protocol the API accepts.
    expect(unsatisfiableProtocolReason(bp({ maxCount: 2, maxValue: 1, uniqueValues: true }))).toBeNull()
    // The named multichoice type cannot reach this shape anyway: uniqueChoices
    // is rejected outright at creation.
  })

  it('rejects any protocol with fewer distinct values than fields (pigeonhole)', () => {
    expect(unsatisfiableProtocolReason(bp({ maxCount: 5, maxValue: 3, uniqueValues: true }))).toMatch(
      /only 4 distinct value\(s\) for 5 ballot fields/
    )
  })

  it('accepts a ranked ballot, where uniqueValues is the point', () => {
    // 4 options ranked 0..3: maxValue 3 gives exactly 4 distinct values.
    expect(unsatisfiableProtocolReason(bp({ maxCount: 4, maxValue: 3, uniqueValues: true }))).toBeNull()
  })

  it('accepts a pick-slot multichoice that reserves abstain sentinels', () => {
    // Legacy layout: 4 choices, 4 pick-slots, maxValue = 4 - 1 + 4 = 7.
    expect(unsatisfiableProtocolReason(bp({ maxCount: 4, maxValue: 7, uniqueValues: true }))).toBeNull()
  })

  it('accepts budget/quadratic — maxValue 0 is "unbounded", not a one-value range', () => {
    expect(unsatisfiableProtocolReason(bp({ maxCount: 6, maxValue: 0, uniqueValues: true }))).toBeNull()
  })

  it('accepts a single-field ballot', () => {
    expect(unsatisfiableProtocolReason(bp({ maxCount: 1, maxValue: 1, uniqueValues: true }))).toBeNull()
  })

  it('gives no verdict on malformed bounds instead of a NaN-laden reason', () => {
    // Reachable only from untyped JS / hand-built objects; the earlier behavior
    // fell through to "maxValue undefined allows only NaN distinct value(s)".
    expect(
      unsatisfiableProtocolReason({ maxCount: 4, maxValue: undefined, uniqueValues: true } as never)
    ).toBeNull()
    expect(unsatisfiableProtocolReason(bp({ maxCount: 4, maxValue: -1, uniqueValues: true }))).toBeNull()
    expect(unsatisfiableProtocolReason(bp({ maxCount: 4.5, maxValue: 1, uniqueValues: true }))).toBeNull()
    expect(
      unsatisfiableProtocolReason({ maxValue: 1, uniqueValues: true } as never)
    ).toBeNull()
  })
})

describe('assertEncodedBallot', () => {
  const bounds = (overrides: Partial<{ maxCount: number; maxValue: number; uniqueValues: boolean }> = {}) => ({
    maxCount: 4,
    maxValue: 3,
    uniqueValues: false,
    ...overrides,
  })

  it('passes a ballot within bounds', () => {
    expect(() => assertEncodedBallot([0, 3, 1, 2], bounds())).not.toThrow()
  })

  it('rejects a value above maxValue — the chain would drop the whole ballot', () => {
    expect(() => assertEncodedBallot([0, 4, 1, 2], bounds())).toThrow(/above maxValue 3/)
  })

  it('treats maxValue 0 as unbounded (budget/quadratic), not a zero cap', () => {
    expect(() => assertEncodedBallot([12, 0, 400], bounds({ maxValue: 0 }))).not.toThrow()
  })

  it('rejects negative or fractional fields', () => {
    expect(() => assertEncodedBallot([0, -1], bounds())).toThrow(/non-negative integers/)
    expect(() => assertEncodedBallot([0, 1.5], bounds())).toThrow(/non-negative integers/)
  })

  it('rejects a repeated value under uniqueValues, naming both fields', () => {
    expect(() => assertEncodedBallot([2, 0, 2, 1], bounds({ uniqueValues: true }))).toThrow(
      /repeats value 2 \(fields 0 and 2\)/
    )
  })

  it('still applies uniqueness when maxValue is 0', () => {
    // The scrutinizer applies uniqueValues to raw field values regardless of the cap.
    expect(() => assertEncodedBallot([5, 5], bounds({ maxValue: 0, uniqueValues: true }))).toThrow(
      /repeats value 5/
    )
  })

  it('allows repeats when uniqueValues is false', () => {
    expect(() => assertEncodedBallot([1, 1, 0, 0], bounds())).not.toThrow()
  })
})

describe('voteTypeBounds', () => {
  it('maps the election-level voteType onto the protocol bounds', () => {
    expect(
      voteTypeBounds({ maxCount: 4, maxValue: 1, uniqueChoices: true })
    ).toEqual({ maxCount: 4, maxValue: 1, uniqueValues: true })
  })
})

describe('unsatisfiableQuestionReason', () => {
  it('reads the raw ballotProtocol when present (it overrides the named type)', () => {
    const broken = bp({ maxCount: 3, maxValue: 1, maxTotalCost: 2, uniqueValues: true })
    expect(
      unsatisfiableQuestionReason({ ballotProtocol: broken, type: 'multichoice', choices: choices(3) })
    ).toMatch(/only 2 distinct value\(s\) for 3 ballot fields/)
  })

  it('detects the broken derivation from type + typeSetup alone', () => {
    // What a public read of the affected questions actually returns:
    // ballotProtocol omitted, the contradiction only visible in typeSetup.
    expect(
      unsatisfiableQuestionReason({
        type: 'multichoice',
        typeSetup: { minChoices: 0, maxChoices: 4, uniqueChoices: true },
        choices: choices(4),
      })
    ).toMatch(/only 2 distinct value\(s\) for 4 ballot fields/)
    expect(
      isUnsatisfiableQuestion({
        type: 'multichoice',
        typeSetup: { minChoices: 0, maxChoices: 4, uniqueChoices: true },
        choices: choices(4),
      })
    ).toBe(true)
  })

  it('passes a healthy multichoice question', () => {
    expect(
      unsatisfiableQuestionReason({
        type: 'multichoice',
        typeSetup: { minChoices: 1, maxChoices: 2, uniqueChoices: false },
        choices: choices(4),
      })
    ).toBeNull()
    expect(unsatisfiableQuestionReason({ type: 'multichoice', choices: choices(4) })).toBeNull()
  })

  it('passes singlechoice, which never derives the dense layout', () => {
    expect(
      unsatisfiableQuestionReason({
        type: 'singlechoice',
        typeSetup: { minChoices: 0, maxChoices: 0, uniqueChoices: true },
        choices: choices(3),
      })
    ).toBeNull()
  })

  it('passes a one-choice multichoice (one field, nothing to repeat)', () => {
    expect(
      unsatisfiableQuestionReason({
        type: 'multichoice',
        typeSetup: { minChoices: 0, maxChoices: 1, uniqueChoices: true },
        choices: choices(1),
      })
    ).toBeNull()
  })
})
