import { describe, it, expect } from 'vitest'
import {
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
    expect(reason).toMatch(/dense 0\/1 ballot/)
    // Above two fields nothing survives at all — the reason must say so.
    expect(reason).toMatch(/even a single pick/)
    expect(reason).toMatch(/all-zero result/)
    expect(isUnsatisfiableProtocol(bp({ maxCount: 4, maxValue: 1, uniqueValues: true }))).toBe(true)
  })

  it('rejects the dense layout at its smallest multi-field size, for the right reason', () => {
    // maxCount 2 admits [0,1] / [1,0] only — a voter can neither pick both nor
    // neither, which maxTotalCost 2 says they may. That is a DIFFERENT failure
    // from the >2 case: here some ballots do tally, so the message must not
    // claim every ballot repeats a value or that the result is all zero.
    const reason = unsatisfiableProtocolReason(bp({ maxCount: 2, maxValue: 1, uniqueValues: true }))
    expect(reason).toMatch(/dense 0\/1 ballot/)
    expect(reason).toMatch(/neither pick both choices nor abstain/)
    expect(reason).not.toMatch(/even a single pick/)
    expect(reason).not.toMatch(/all-zero result/)
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
    ).toMatch(/dense 0\/1 ballot/)
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
    ).toMatch(/dense 0\/1 ballot/)
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
