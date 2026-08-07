import { describe, it, expect } from 'vitest'
import type { BallotProtocol, Choice, Election } from '@vocdoni/api-types'
import { decodeQuestionResults, decodeResults } from './decode'
import { encodeBallot, encodeQuestionBallot, rankedOrderToScores } from './encode'
import { declaresRanked, inferBallotType, inferQuestionBallotType } from './infer'
import { questionReservesAbstain, questionSelectionRange } from './abstain'
import { uncastableChoicesReason, unsatisfiableQuestionReason } from './protocol'
import { validateSelections } from './validate'
import { BallotType } from './types'

/**
 * Ranked ballots (integrator-sdk#22).
 *
 * The whole point of the type is that it is NOT inferable: a ranked protocol and a
 * pick-slot multichoice whose voters fill every slot are byte-identical, meaning
 * opposite things. So every test here that asserts ranked behaviour is paired, where
 * it matters, with the same input minus the declaration — if the declaration were
 * ignored the pair would collapse into agreement and the test would fail.
 */

/** The canonical ranked protocol over `n` options: one field each, ranks 0..n-1, no repeats. */
const rankedProtocol = (n: number): BallotProtocol => ({
  maxCount: n,
  maxValue: n - 1,
  maxVoteOverwrites: 0,
  maxTotalCost: 0,
  costExponent: 1,
  uniqueValues: true,
  costFromWeight: false,
})

const choices = (n: number): Choice[] =>
  Array.from({ length: n }, (_, i) => ({ title: { default: `C${i}` }, value: i }))

/** A ranked question, declared through the metadata bag (the channel the backend stores). */
const rankedQuestion = (n: number) => ({
  ballotProtocol: rankedProtocol(n),
  type: '',
  metadata: { type: { name: 'ranked' } },
  choices: choices(n),
})

/** The same question with the declaration removed — the ambiguity this type exists to resolve. */
const undeclaredQuestion = (n: number) => ({
  ballotProtocol: rankedProtocol(n),
  type: '',
  choices: choices(n),
})

/** The issue's worked example: 3 voters, all ranking C2 > C0 > C1. */
const THREE_VOTERS_C2_C0_C1 = [
  ['0', '3', '0'], // C0 got rank 1 from 3 voters
  ['3', '0', '0'], // C1 got rank 0 from 3 voters
  ['0', '0', '3'], // C2 got rank 2 from 3 voters
]

describe('ranked: the declared name is the only signal', () => {
  it('reads a ranked question from metadata.type.name', () => {
    expect(inferQuestionBallotType(rankedQuestion(4))).toBe(BallotType.Ranked)
    expect(declaresRanked(rankedQuestion(4))).toBe(true)
  })

  it('reads a ranked question from the type field, for callers keeping their own kind', () => {
    const question = { ballotProtocol: rankedProtocol(4), type: 'ranked', choices: choices(4) }
    expect(inferQuestionBallotType(question)).toBe(BallotType.Ranked)
    expect(declaresRanked(question)).toBe(true)
  })

  it('never infers ranked from the protocol — the identical shape reads as multichoice', () => {
    expect(inferQuestionBallotType(undeclaredQuestion(4))).toBe(BallotType.MultiChoice)
    expect(declaresRanked(undeclaredQuestion(4))).toBe(false)
    // Byte-identical inputs: only the declaration differs.
    expect(rankedQuestion(4).ballotProtocol).toEqual(undeclaredQuestion(4).ballotProtocol)
  })

  it('declaresRanked answers for a question with neither a protocol nor a type', () => {
    // inferQuestionBallotType throws on that input; the predicate must not, so a UI
    // can ask "is this a ranking?" of a partial read without handling an exception.
    expect(() => inferQuestionBallotType({ choices: choices(3) })).toThrow()
    expect(declaresRanked({ choices: choices(3) } as never)).toBe(false)
  })

  it('reads a ranked election from type / meta.type.name', () => {
    const election = (declared: Record<string, unknown>) =>
      ({
        voteType: {
          maxCount: 3,
          maxValue: 2,
          maxVoteOverwrites: 0,
          costExponent: 1,
          uniqueChoices: true,
          costFromWeight: false,
        },
        questions: [{ title: { default: 'Q0' }, choices: choices(3) }],
        ...declared,
      }) as Pick<Election, 'questions' | 'voteType'> & { type?: string; meta?: Record<string, unknown> }

    expect(inferBallotType(election({ type: 'ranked' }))).toBe(BallotType.Ranked)
    expect(inferBallotType(election({ meta: { type: { name: 'ranked' } } }))).toBe(BallotType.Ranked)
    // Same shape, nothing declared → the pre-existing multichoice reading.
    expect(inferBallotType(election({}))).toBe(BallotType.MultiChoice)
  })
})

describe('ranked: decodeQuestionResults does Borda', () => {
  it('recovers the ranking from the issue\'s worked example', () => {
    const decoded = decodeQuestionResults(rankedQuestion(3), THREE_VOTERS_C2_C0_C1)

    // Σ count × rank, highest = best.
    expect(decoded.map((row) => row.votes)).toEqual([3, 0, 6])
    // The point of the whole issue: the winner is readable.
    const ranking = [...decoded]
      .sort((a, b) => b.votes - a.votes)
      .map((row) => row.choice)
    expect(ranking).toEqual([2, 0, 1])
  })

  it('is what the undeclared reading is not — same matrix, no ranking at all', () => {
    const decoded = decodeQuestionResults(undeclaredQuestion(3), THREE_VOTERS_C2_C0_C1)
    // Column sums: every option "got 3", plus the spurious abstain bucket. This is
    // the defect #22 reported, pinned here so the two readings cannot converge.
    expect(decoded.map((row) => row.votes)).toEqual([3, 3, 3, 0])
  })

  it('emits no abstain bucket', () => {
    const decoded = decodeQuestionResults(rankedQuestion(3), THREE_VOTERS_C2_C0_C1)
    expect(decoded).toHaveLength(3)
    expect(decoded.some((row) => row.choice === 'abstain')).toBe(false)
    expect(questionReservesAbstain(rankedQuestion(3))).toBe(false)
  })

  it('reports percentages as a share of the total points', () => {
    const decoded = decodeQuestionResults(rankedQuestion(3), THREE_VOTERS_C2_C0_C1)
    // 3 + 0 + 6 = 9 points.
    expect(decoded.map((row) => row.percentage)).toEqual([(3 / 9) * 100, 0, (6 / 9) * 100])
  })

  it('addresses fields by choice POSITION, not choice.value', () => {
    // Ranked lays one field out per option in choice order (like budget), so
    // non-contiguous values must not move the columns that are read.
    const question = {
      ballotProtocol: rankedProtocol(3),
      metadata: { type: { name: 'ranked' } },
      choices: [
        { title: { default: 'C7' }, value: 7 },
        { title: { default: 'C8' }, value: 8 },
        { title: { default: 'C9' }, value: 9 },
      ],
    }
    const decoded = decodeQuestionResults(question, THREE_VOTERS_C2_C0_C1)
    expect(decoded.map((row) => row.choice)).toEqual([7, 8, 9])
    expect(decoded.map((row) => row.votes)).toEqual([3, 0, 6])
  })

  it('decodes zeroes rather than throwing on a missing matrix', () => {
    expect(decodeQuestionResults(rankedQuestion(3), []).map((row) => row.votes)).toEqual([0, 0, 0])
  })

  it('aggregates voters who disagree', () => {
    // 2 voters rank C0 > C1 (C0=1, C1=0), 1 voter ranks C1 > C0.
    const matrix = [
      ['1', '2'], // C0: rank 0 once, rank 1 twice → 2
      ['2', '1'], // C1: rank 0 twice, rank 1 once → 1
    ]
    expect(decodeQuestionResults(rankedQuestion(2), matrix).map((row) => row.votes)).toEqual([2, 1])
  })

  it('decodes a ranked election through decodeResults too', () => {
    const decoded = decodeResults({
      type: 'ranked',
      voteType: {
        maxCount: 3,
        maxValue: 2,
        maxVoteOverwrites: 0,
        costExponent: 1,
        uniqueChoices: true,
        costFromWeight: false,
      },
      questions: [{ title: { default: 'Q0' }, choices: choices(3) }],
      results: THREE_VOTERS_C2_C0_C1,
    })
    expect(decoded[0].map((row) => row.votes)).toEqual([3, 0, 6])
  })
})

describe('rankedOrderToScores', () => {
  it('turns an ordering into ranks in choice order, highest = best', () => {
    // 3 candidates, voter ranks C2 > C0 > C1.
    expect(rankedOrderToScores({ choices: choices(3) }, [2, 0, 1])).toEqual([1, 0, 2])
  })

  it('gives the first-placed option the top rank', () => {
    const scores = rankedOrderToScores({ choices: choices(4) }, [2, 0, 3, 1])
    expect(scores[2]).toBe(3)
    expect(scores[1]).toBe(0)
    expect(scores).toEqual([2, 0, 3, 1])
  })

  it('follows choice VALUES, not positions', () => {
    const question = {
      choices: [
        { title: { default: 'C7' }, value: 7 },
        { title: { default: 'C8' }, value: 8 },
      ],
    }
    // Voter ranks C8 first → C8 (position 1) gets rank 1.
    expect(rankedOrderToScores(question, [8, 7])).toEqual([0, 1])
  })

  it('refuses a ranking that names an unpublished choice', () => {
    expect(() => rankedOrderToScores({ choices: choices(3) }, [0, 1, 9])).toThrow(/not a choice value/)
  })

  it('refuses a ranking that places the same choice twice', () => {
    expect(() => rankedOrderToScores({ choices: choices(3) }, [0, 1, 1])).toThrow(/more than once/)
  })

  it('refuses a partial ranking, naming what is missing', () => {
    // Not a style preference: a ranked protocol leaves exactly one rank per option,
    // so a short slate repeats a value and the chain drops the whole ballot.
    expect(() => rankedOrderToScores({ choices: choices(3) }, [2, 0])).toThrow(/missing 1/)
  })
})

describe('ranked: encodeQuestionBallot', () => {
  it('passes the ranks through unchanged', () => {
    expect(encodeQuestionBallot(rankedQuestion(4), [2, 0, 3, 1])).toEqual([2, 0, 3, 1])
  })

  it('composes with rankedOrderToScores', () => {
    const question = rankedQuestion(3)
    const ballot = encodeQuestionBallot(question, rankedOrderToScores(question, [2, 0, 1]))
    expect(ballot).toEqual([1, 0, 2])
  })

  it('refuses a duplicated rank rather than casting a ballot the chain drops', () => {
    expect(() => encodeQuestionBallot(rankedQuestion(3), [2, 2, 0])).toThrow(/repeats value 2/)
  })

  it('refuses a rank above maxValue', () => {
    expect(() => encodeQuestionBallot(rankedQuestion(3), [5, 1, 0])).toThrow(/above maxValue 2/)
  })

  it('encodes a ranked election through encodeBallot too', () => {
    const ballot = encodeBallot(
      {
        type: 'ranked',
        voteType: {
          maxCount: 3,
          maxValue: 2,
          maxVoteOverwrites: 0,
          costExponent: 1,
          uniqueChoices: true,
          costFromWeight: false,
        },
        questions: [{ title: { default: 'Q0' }, choices: choices(3) }],
      },
      [[1, 0, 2]]
    )
    expect(ballot).toEqual([1, 0, 2])
  })
})

describe('ranked: round-trip through a one-voter histogram', () => {
  it.each([
    { n: 3, order: [2, 0, 1] },
    { n: 4, order: [2, 0, 3, 1] },
    { n: 5, order: [4, 3, 2, 1, 0] },
  ])('recovers the voter\'s own order ($n options)', ({ n, order }) => {
    const question = rankedQuestion(n)
    const ballot = encodeQuestionBallot(question, rankedOrderToScores(question, order))

    // One voter's ballot as the chain would histogram it: results[field][value] = 1.
    const matrix = ballot.map((rank) =>
      Array.from({ length: n }, (_, value) => (value === rank ? '1' : '0'))
    )

    const decoded = decodeQuestionResults(question, matrix)
    const recovered = [...decoded].sort((a, b) => b.votes - a.votes).map((row) => row.choice)
    expect(recovered).toEqual(order)
  })

  it('would elect the loser if either side flipped the orientation', () => {
    // The guard for the one thing no matrix can reveal: encode and decode agree on
    // "highest = best" by convention only. A 0-is-best ballot is perfectly valid and
    // decodes to the exact reverse ranking, which is why the orientation is pinned in
    // both docstrings and here.
    const question = rankedQuestion(3)
    const inverted = [1, 2, 0] // C1 ranked "best" under a 0-is-best reading
    const matrix = inverted.map((rank) =>
      Array.from({ length: 3 }, (_, value) => (value === rank ? '1' : '0'))
    )
    const decoded = decodeQuestionResults(question, matrix)
    expect(decoded.map((row) => row.votes)).toEqual([1, 2, 0])
    expect([...decoded].sort((a, b) => b.votes - a.votes).map((row) => row.choice)).toEqual([1, 0, 2])
  })
})

describe('ranked: surrounding guards', () => {
  it('is satisfiable — uniqueValues is exactly affordable', () => {
    expect(unsatisfiableQuestionReason(rankedQuestion(4))).toBeNull()
  })

  it('publishes no uncastable choice, whatever the choice values are', () => {
    // Position-addressed: choice.value never reaches the wire, so the pick-slot
    // sentinel rule (which demands exactly 0..n-1) must not fire here.
    const question = {
      ballotProtocol: rankedProtocol(3),
      metadata: { type: { name: 'ranked' } },
      choices: [
        { title: { default: 'C7' }, value: 7 },
        { title: { default: 'C8' }, value: 8 },
        { title: { default: 'C9' }, value: 9 },
      ],
    }
    expect(uncastableChoicesReason(question)).toBeNull()
    // Undeclared, the same question is a pick-slot multichoice and IS broken —
    // proof that the declaration, not the shape, is doing the work.
    expect(uncastableChoicesReason({ ...question, metadata: undefined })).toMatch(/pick-slot/)
  })

  it('asks the voter for a full slate', () => {
    expect(questionSelectionRange(rankedQuestion(4))).toEqual({ min: 4, max: 4 })
  })

  it('validateSelections accepts a full distinct ranking and rejects the rest', () => {
    const election = {
      type: 'ranked',
      voteType: {
        maxCount: 3,
        maxValue: 2,
        maxVoteOverwrites: 0,
        costExponent: 1,
        uniqueChoices: true,
        costFromWeight: false,
      },
      questions: [{ title: { default: 'Q0' }, choices: choices(3) }],
    }
    expect(() => validateSelections(election, [[1, 0, 2]])).not.toThrow()
    expect(() => validateSelections(election, [[1, 0]])).toThrow(/one rank per option/)
    expect(() => validateSelections(election, [[1, 1, 0]])).toThrow(/used twice/)
    expect(() => validateSelections(election, [[5, 1, 0]])).toThrow(/above maxValue 2/)
  })
})
