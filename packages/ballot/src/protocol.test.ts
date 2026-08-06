import { describe, it, expect } from 'vitest'
import {
  assertEncodedBallot,
  hasUncastableChoices,
  isUnsatisfiableProtocol,
  isUnsatisfiableQuestion,
  uncastableChoicesReason,
  unsatisfiableProtocolReason,
  unsatisfiableQuestionReason,
  voteTypeBounds,
} from './protocol'

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

/** Build choices carrying the given (possibly non-contiguous) values. */
const valued = (values: number[]) =>
  values.map((v) => ({ title: { default: `C${v}` }, value: v }))

describe('uncastableChoicesReason', () => {
  describe('single-choice (value-addressed wire)', () => {
    it('rejects a choice whose value exceeds maxValue', () => {
      // The shape reported in integrator-sdk#28: values 1/2/3 published under a
      // maxValue of 2, so C3 addresses a field value the chain refuses. Verified
      // live in integration/value-skew.itest.ts — the relay accepts such a ballot,
      // voteCount counts it, and the scrutinizer drops it at tally with no error.
      const reason = uncastableChoicesReason({
        ballotProtocol: bp({ maxCount: 1, maxValue: 2 }),
        choices: valued([1, 2, 3]),
      })
      expect(reason).toMatch(/3/)
      expect(reason).toMatch(/maxValue 2/)
      expect(
        hasUncastableChoices({ ballotProtocol: bp({ maxCount: 1, maxValue: 2 }), choices: valued([1, 2, 3]) })
      ).toBe(true)
    })

    it('allows sparse values that still fit maxValue', () => {
      // Gaps are legal and deliberate: saas-backend derives maxValue from the
      // highest value precisely so {0,2,5} works. Unused columns simply stay empty.
      expect(
        uncastableChoicesReason({
          ballotProtocol: bp({ maxCount: 1, maxValue: 5 }),
          choices: valued([0, 2, 5]),
        })
      ).toBeNull()
    })

    it('allows the named singlechoice type, whose maxValue is derived from the values', () => {
      expect(uncastableChoicesReason({ type: 'singlechoice', choices: valued([1, 2, 3]) })).toBeNull()
    })
  })

  describe('pick-slot multichoice (positional sentinels)', () => {
    // Pick-slot picks share one value space with the abstain sentinels the encoder
    // pads with (`numChoices`, `numChoices + 1`, …) and that decode sweeps up as
    // "abstain" (every column >= numChoices). That only holds while the real values
    // occupy exactly 0..numChoices-1, so this layout needs contiguity, not merely a
    // bound: with values 1/2/3 the sentinel IS 3, and an abstention would be
    // recorded as a vote for C3 before decode stole the column back.
    const pickSlot = (overrides = {}) => bp({ maxCount: 3, maxValue: 6, uniqueValues: true, ...overrides })

    it('rejects values that collide with the abstain sentinel space', () => {
      const reason = uncastableChoicesReason({ ballotProtocol: pickSlot(), choices: valued([1, 2, 3]) })
      expect(reason).toMatch(/abstain/i)
      expect(reason).toMatch(/0\.\.2/)
    })

    it('rejects a gap below numChoices, which pushes a value into sentinel space', () => {
      expect(uncastableChoicesReason({ ballotProtocol: pickSlot(), choices: valued([0, 1, 4]) })).toBeTruthy()
    })

    it('allows contiguous 0..n-1 values', () => {
      expect(uncastableChoicesReason({ ballotProtocol: pickSlot(), choices: choices(3) })).toBeNull()
    })
  })

  describe('positional layouts carry no constraint', () => {
    // approval / dense multichoice / budget / quadratic lay their fields out in
    // choice ORDER, so choice.value is a display label the wire never sees. Decode
    // already reads these by position (see decode.test.ts) — values may be anything.
    it.each([
      ['approval', bp({ maxCount: 3, maxValue: 1, uniqueValues: false })],
      ['budget', bp({ maxCount: 3, maxValue: 0, costExponent: 1 })],
      ['quadratic', bp({ maxCount: 3, maxValue: 0, costExponent: 2 })],
    ])('%s', (_label, protocol) => {
      expect(uncastableChoicesReason({ ballotProtocol: protocol, choices: valued([0, 4, 9]) })).toBeNull()
    })

    it('dense (named) multichoice', () => {
      expect(
        uncastableChoicesReason({
          type: 'multichoice',
          typeSetup: { minChoices: 1, maxChoices: 2, uniqueChoices: false },
          choices: valued([0, 4, 9]),
        })
      ).toBeNull()
    })
  })

  describe('no verdict on shapes it cannot judge', () => {
    // Mirrors unsatisfiableProtocolReason's stance: explain a well-formed config,
    // never emit a NaN-laden verdict on a malformed or untyped one.
    it('returns null when the ballot type cannot be inferred', () => {
      expect(uncastableChoicesReason({ choices: valued([1, 2, 3]) })).toBeNull()
    })

    it('returns null for an empty choice list', () => {
      expect(uncastableChoicesReason({ ballotProtocol: bp({ maxCount: 1, maxValue: 2 }), choices: [] })).toBeNull()
    })

    it('returns null for non-integer or negative values', () => {
      expect(
        uncastableChoicesReason({ ballotProtocol: bp({ maxCount: 1, maxValue: 2 }), choices: valued([0, -1]) })
      ).toBeNull()
      expect(
        uncastableChoicesReason({ ballotProtocol: bp({ maxCount: 1, maxValue: 2 }), choices: valued([0, 1.5]) })
      ).toBeNull()
    })
  })
})
