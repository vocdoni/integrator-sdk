import { describe, it, expect } from 'vitest'
import { encodeBallot, encodeQuestionBallot } from './encode'
import { BallotType } from './types'
import { inferBallotType } from './infer'
import type { Election } from '@vocdoni/api-types'

describe('encodeBallot', () => {
  const createElection = (voteType: Partial<Election['voteType']>, questions: number = 1): Pick<Election, 'questions' | 'voteType'> => ({
    voteType: {
      maxCount: 1,
      maxValue: 0,
      maxVoteOverwrites: 0,
      costExponent: 0,
      uniqueChoices: false,
      costFromWeight: false,
      ...voteType,
    },
    questions: Array.from({ length: questions }, (_, i) => ({
      title: { default: `Question ${i}` },
      description: { default: `Description ${i}` },
      choices: Array.from({ length: 5 }, (_, j) => ({
        title: { default: `Choice ${j}` },
        value: j,
      })),
    })),
  })

  describe('Single-choice encoding', () => {
    it('encodes single choice for single-question election', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      const selections = [[2]] // Select choice at index 2
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([2])
    })

    it('encodes single choice for multi-question election', () => {
      // maxValue must cover the highest selected choice value — the old fixture's
      // maxValue 2 with a pick of 4 encoded a ballot the chain drops at tally,
      // which encodeBallot now refuses.
      const election = createElection({ maxCount: 1, maxValue: 4 }, 3)
      const selections = [[0], [2], [4]] // Select different choices per question
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 2, 4])
    })

    it('throws when a single-choice question has no selection (no abstain concept)', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 }, 2)
      const selections = [[], [1]] // First question empty — invalid, not an abstention
      expect(() => encodeBallot(election, selections)).toThrow(/exactly one choice/i)
    })

    it('picks first selection when multiple are provided (should not happen in practice)', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      const selections = [[1, 2]] // Invalid for single-choice, but encode should pick first
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1])
    })
  })

  describe('Approval encoding (dense 0/1 vector)', () => {
    it('encodes approval as dense 0/1 vector', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[0, 2]] // Select choices 0 and 2
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 0, 1, 0, 0])
    })

    it('encodes empty approval selection as all zeros', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 0, 0, 0, 0])
    })

    it('encodes full approval selection as all ones', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[0, 1, 2, 3, 4]] // Select all choices
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 1, 1, 1, 1])
    })

    it('handles non-contiguous selections', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[1, 3]] // Select choices 1 and 3 only
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 1, 0, 1, 0])
    })
  })

  describe('Multichoice encoding', () => {
    // 5 choices per question (values 0..4). maxValue === 4 means no abstain room;
    // maxValue >= 5 reserves abstain sentinels starting at 5.
    it('passes a full selection through when it already fills maxCount', () => {
      const election = createElection({ maxCount: 3, maxValue: 4 })
      const selections = [[0, 2, 4]] // Exactly maxCount picks
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 2, 4])
    })

    it('pads unfilled slots with a repeated abstain sentinel (uniqueChoices === false)', () => {
      // maxValue 5 === choices.length reserves a single abstain value (5).
      const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: false })
      expect(encodeBallot(election, [[1, 3]])).toEqual([1, 3, 5])
      expect(encodeBallot(election, [[]])).toEqual([5, 5, 5])
      expect(encodeBallot(election, [[0, 2, 4]])).toEqual([0, 2, 4])
    })

    it('pads unfilled slots with distinct ascending sentinels (uniqueChoices === true)', () => {
      // Unique choices need unique abstain values: 5, 6, 7, …
      const election = createElection({ maxCount: 3, maxValue: 7, uniqueChoices: true })
      expect(encodeBallot(election, [[1, 3]])).toEqual([1, 3, 5])
      expect(encodeBallot(election, [[1]])).toEqual([1, 5, 6])
      expect(encodeBallot(election, [[]])).toEqual([5, 6, 7])
    })

    it('returns a short ballot when there is no abstain room (no padding, no throw)', () => {
      // maxValue 4 === choices-1: no sentinel headroom. A partial selection is returned
      // as-is — the vochain accepts ballots shorter than maxCount (it enforces only the
      // upper bound) and the legacy SDK sends them unpadded.
      const election = createElection({ maxCount: 3, maxValue: 4 }) // maxValue === choices-1
      expect(encodeBallot(election, [[1, 3]])).toEqual([1, 3])
      expect(encodeBallot(election, [[0]])).toEqual([0])
      expect(encodeBallot(election, [[]])).toEqual([])
    })

    it('returns a short ballot when uniqueChoices under-reserves the ascending sentinels', () => {
      // uniqueChoices would need maxValue >= numChoices-1+maxCount = 7 to pad with distinct
      // ascending sentinels; maxValue 5 has none to spare, so the partial selection is
      // returned as-is rather than padded or rejected.
      const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: true })
      expect(encodeBallot(election, [[1]])).toEqual([1])
    })

    it('throws when there are more selections than maxCount', () => {
      const election = createElection({ maxCount: 2, maxValue: 4 })
      expect(() => encodeBallot(election, [[0, 1, 2]])).toThrow(/too many selections/i)
    })

    it('refuses an election whose uniqueChoices cannot be satisfied (pigeonhole)', () => {
      // 5 choices, 3 fields, but maxValue 1 only offers the values 0 and 1 —
      // no ballot can fill three fields without repeating one, so every vote
      // would be dropped at tally.
      const election = createElection({ maxCount: 3, maxValue: 1, uniqueChoices: true })
      expect(() => encodeBallot(election, [[0, 2]])).toThrow(/cannot encode a ballot for this election/)
    })

    it('leaves a satisfiable uniqueChoices election alone', () => {
      // Pick-slot multichoice: maxValue 7 >= maxCount 3, so ascending sentinels fit.
      const election = createElection({ maxCount: 3, maxValue: 7, uniqueChoices: true })
      expect(encodeBallot(election, [[1]])).toEqual([1, 5, 6])
    })

    it('leaves budget/quadratic alone (maxValue 0 means unbounded, not one value)', () => {
      const election = createElection({ maxValue: 0, costExponent: 2, maxCount: 5, uniqueChoices: true })
      expect(encodeBallot(election, [[1, 2, 3, 4, 5]])).toEqual([1, 2, 3, 4, 5])
    })

    it('handles the 2-option edge case (maxValue === 1)', () => {
      // This is a documented ambiguity: 2-option multichoice can produce maxValue === 1
      // When uniqueChoices is false and maxValue === 1, it's treated as approval
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const selections = [[0]] // Select only choice 0
      const ballot = encodeBallot(election, selections)
      // Encoded as approval (dense 0/1 vector) with 5 choices total
      expect(ballot).toEqual([1, 0, 0, 0, 0])
    })
  })

  describe('Budget encoding', () => {
    it('encodes budget as per-option amounts', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      const selections = [[10, 20, 30, 40, 50]] // Allocate amounts to each option
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([10, 20, 30, 40, 50])
    })

    it('encodes zero budget for all options', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      const selections = [[0, 0, 0, 0, 0]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 0, 0, 0, 0])
    })

    it('handles partial budget (should have one amount per choice)', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      const selections = [[10, 20]] // Only 2 amounts for 5 choices
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([10, 20])
    })
  })

  describe('Quadratic encoding', () => {
    it('encodes quadratic as per-option amounts (same format as budget)', () => {
      const election = createElection({ maxValue: 0, costExponent: 2 })
      const selections = [[5, 10, 15, 20, 25]] // Allocate quadratic weights to each option
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([5, 10, 15, 20, 25])
    })

    it('handles zero quadratic allocation', () => {
      const election = createElection({ maxValue: 0, costExponent: 2 })
      const selections = [[0, 0, 0]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([0, 0, 0])
    })
  })

  describe('Type inference consistency', () => {
    it('inferred type matches encoding behavior', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      const ballotType = inferBallotType(election)
      expect(ballotType).toBe(BallotType.SingleChoice)

      const selections = [[2]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([2])
    })

    it('approval inference matches dense 0/1 encoding', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      const ballotType = inferBallotType(election)
      expect(ballotType).toBe(BallotType.Approval)

      const selections = [[0, 2]]
      const ballot = encodeBallot(election, selections)
      expect(ballot).toEqual([1, 0, 1, 0, 0]) // Dense 0/1 vector
    })
  })

  describe('Flat vs nested selections', () => {
    // A flat number[] and its nested number[][] equivalent must encode identically.
    it('single-choice, single question: [2] === [[2]]', () => {
      const election = createElection({ maxCount: 1, maxValue: 2 })
      expect(encodeBallot(election, [2])).toEqual([2])
      expect(encodeBallot(election, [2])).toEqual(encodeBallot(election, [[2]]))
    })

    it('single-choice, multi-question: [0,2,4] === [[0],[2],[4]]', () => {
      const election = createElection({ maxCount: 1, maxValue: 4 }, 3)
      expect(encodeBallot(election, [0, 2, 4])).toEqual([0, 2, 4])
      expect(encodeBallot(election, [0, 2, 4])).toEqual(encodeBallot(election, [[0], [2], [4]]))
    })

    it('approval: [0,2] === [[0,2]]', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      expect(encodeBallot(election, [0, 2])).toEqual([1, 0, 1, 0, 0])
      expect(encodeBallot(election, [0, 2])).toEqual(encodeBallot(election, [[0, 2]]))
    })

    it('multichoice: [1,3] === [[1,3]]', () => {
      const election = createElection({ maxCount: 3, maxValue: 5, uniqueChoices: false })
      expect(encodeBallot(election, [1, 3])).toEqual([1, 3, 5])
      expect(encodeBallot(election, [1, 3])).toEqual(encodeBallot(election, [[1, 3]]))
    })

    it('budget: [10,20,30,40,50] === [[10,20,30,40,50]]', () => {
      const election = createElection({ maxValue: 0, costExponent: 1 })
      expect(encodeBallot(election, [10, 20, 30, 40, 50])).toEqual([10, 20, 30, 40, 50])
      expect(encodeBallot(election, [10, 20, 30, 40, 50])).toEqual(
        encodeBallot(election, [[10, 20, 30, 40, 50]])
      )
    })

    it('an empty flat array is treated as no selection (approval → all zeros)', () => {
      const election = createElection({ maxCount: 2, maxValue: 1, uniqueChoices: false })
      expect(encodeBallot(election, [])).toEqual([0, 0, 0, 0, 0])
      expect(encodeBallot(election, [])).toEqual(encodeBallot(election, [[]]))
    })
  })
})

describe('encodeQuestionBallot', () => {
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
  const choices = [
    { title: { default: 'A' }, value: 0 },
    { title: { default: 'B' }, value: 1 },
    { title: { default: 'C' }, value: 2 },
  ]

  describe('single-choice strictness', () => {
    it('encodes exactly one selection', () => {
      // maxValue 2 covers the picked choice value — the default bp() maxValue of 1
      // would make this ballot droppable on chain, which the encoder now refuses.
      expect(encodeQuestionBallot({ ballotProtocol: bp({ maxValue: 2 }), choices }, [2])).toEqual([2])
    })

    it('throws on zero selections', () => {
      expect(() => encodeQuestionBallot({ ballotProtocol: bp(), choices }, [])).toThrow(
        /exactly one choice \(got 0\)/
      )
    })

    it('throws on more than one selection instead of silently dropping extras', () => {
      expect(() => encodeQuestionBallot({ ballotProtocol: bp(), choices }, [0, 2])).toThrow(
        /exactly one choice \(got 2\)/
      )
    })
  })

  it('encodes a multichoice named type without a ballotProtocol as dense', () => {
    // Public reads of named-type questions may omit the derived protocol; the
    // named type fully determines the dense layout, with the pick bound coming
    // from typeSetup.
    expect(encodeQuestionBallot({ type: 'multichoice', choices }, [0, 2])).toEqual([1, 0, 1])
    expect(
      encodeQuestionBallot(
        { type: 'multichoice', typeSetup: { maxChoices: 2, minChoices: 1, uniqueChoices: false }, choices },
        [1]
      )
    ).toEqual([0, 1, 0])
    expect(() =>
      encodeQuestionBallot(
        { type: 'multichoice', typeSetup: { maxChoices: 2, minChoices: 1, uniqueChoices: false }, choices },
        [0, 1, 2]
      )
    ).toThrow(/at most 2/)
  })

  describe('dense multichoice (the backend derivation for the named type)', () => {
    // Named multichoice derives maxCount = numChoices, maxValue = 1, and
    // maxTotalCost = maxChoices — a dense 0/1 field per choice. Pick-slot values
    // (choice values + abstain sentinels) would exceed maxValue and get silently
    // discarded by the chain at tally. uniqueValues MUST be false here: with it
    // set the protocol is unsatisfiable and the encoder refuses (see below).
    const dense = bp({ maxCount: 3, maxValue: 1, maxTotalCost: 2, uniqueValues: false })

    it('encodes picks as a dense 0/1 vector, not pick-slots', () => {
      expect(
        encodeQuestionBallot({ ballotProtocol: dense, type: 'multichoice', choices }, [0, 2])
      ).toEqual([1, 0, 1])
    })

    it('encodes a partial selection without abstain sentinels', () => {
      expect(
        encodeQuestionBallot({ ballotProtocol: dense, type: 'multichoice', choices }, [1])
      ).toEqual([0, 1, 0])
    })

    it('throws when the selection exceeds maxTotalCost', () => {
      expect(() =>
        encodeQuestionBallot({ ballotProtocol: dense, type: 'multichoice', choices }, [0, 1, 2])
      ).toThrow(/at most 2/)
    })

    it('encodes dense whatever maxTotalCost says, as long as the picks fit', () => {
      const roomy = bp({ maxCount: 3, maxValue: 1, maxTotalCost: 3, uniqueValues: false })
      expect(
        encodeQuestionBallot({ ballotProtocol: roomy, type: 'multichoice', choices }, [0, 1, 2])
      ).toEqual([1, 1, 1])
    })
  })

  describe('index-list multichoice (legacy pick-slot)', () => {
    // Raw ballotProtocol only — the named multichoice type derives dense. Protocol from the
    // live dev election 6a7316275fe6ad98c8c97a3c: 4 choices, maxCount 4, maxValue 3
    // (=== numChoices-1, so no abstain headroom). Ballots may be shorter than maxCount.
    const fourChoices = Array.from({ length: 4 }, (_, j) => ({ title: { default: `C${j}` }, value: j }))
    const pickSlot = bp({ maxCount: 4, maxValue: 3, maxTotalCost: 0, uniqueValues: true })

    it('returns a short ballot as-is when there is no abstain headroom', () => {
      expect(encodeQuestionBallot({ ballotProtocol: pickSlot, choices: fourChoices }, [1, 2])).toEqual([1, 2])
    })

    it('passes a full maxCount selection through', () => {
      expect(
        encodeQuestionBallot({ ballotProtocol: pickSlot, choices: fourChoices }, [0, 1, 2, 3])
      ).toEqual([0, 1, 2, 3])
    })

    it('throws when there are more selections than maxCount', () => {
      expect(() =>
        encodeQuestionBallot({ ballotProtocol: pickSlot, choices: fourChoices }, [0, 1, 2, 3, 0])
      ).toThrow(/too many selections/i)
    })
  })

  describe('unsatisfiable configs are refused instead of silently discarded at tally', () => {
    // Regression for the live processes 6a69c4ea06ae8a7235e3183b /
    // 6a6912fef6bfe54e0369bc3a on saas-api-dev: 4 choices, maxChoices 4,
    // uniqueChoices true. The backend derived maxCount 4 / maxValue 1 /
    // maxTotalCost 4 with voteMode.uniqueValues true; every dense 0/1 ballot
    // repeats a value, so the scrutinizer dropped all of them and the tally came
    // back all zeros while voteCount said 2.
    const fourChoices = Array.from({ length: 4 }, (_, j) => ({ title: { default: `C${j}` }, value: j }))

    it('throws for a named multichoice question with typeSetup.uniqueChoices (no protocol on the read)', () => {
      expect(() =>
        encodeQuestionBallot(
          {
            type: 'multichoice',
            typeSetup: { minChoices: 0, maxChoices: 4, uniqueChoices: true },
            choices: fourChoices,
          },
          [0, 2]
        )
      ).toThrow(/only 2 distinct value\(s\) for 4 ballot fields/)
    })

    it('throws even for a single pick — the layout, not the pick count, is what breaks', () => {
      expect(() =>
        encodeQuestionBallot(
          {
            type: 'multichoice',
            typeSetup: { minChoices: 0, maxChoices: 4, uniqueChoices: true },
            choices: fourChoices,
          },
          [1]
        )
      ).toThrow(/only 2 distinct value\(s\) for 4 ballot fields/)
    })

    it('throws for an explicit dense ballotProtocol with uniqueValues', () => {
      const broken = bp({ maxCount: 4, maxValue: 1, maxTotalCost: 4, uniqueValues: true })
      expect(() =>
        encodeQuestionBallot({ ballotProtocol: broken, type: 'multichoice', choices: fourChoices }, [0, 2])
      ).toThrow(/only 2 distinct value\(s\) for 4 ballot fields/)
    })

    it('encodes the same question fine once uniqueChoices is false', () => {
      expect(
        encodeQuestionBallot(
          {
            type: 'multichoice',
            typeSetup: { minChoices: 0, maxChoices: 4, uniqueChoices: false },
            choices: fourChoices,
          },
          [0, 2]
        )
      ).toEqual([1, 0, 1, 0])
    })

  })

  describe('the produced ballot is checked too, not just the config', () => {
    // A satisfiable config still admits unsatisfying ballots. Every rejection here
    // used to encode successfully — into a wire ballot the chain accepts, counts in
    // voteCount, and silently drops during tally aggregation.
    const fourChoices = Array.from({ length: 4 }, (_, j) => ({ title: { default: `C${j}` }, value: j }))
    const ranked = bp({ maxCount: 4, maxValue: 3, uniqueValues: true })

    it('encodes a valid ranked ballot unchanged', () => {
      expect(
        encodeQuestionBallot({ ballotProtocol: ranked, choices: fourChoices }, [2, 0, 3, 1])
      ).toEqual([2, 0, 3, 1])
    })

    it('throws on duplicate ranks instead of passing them through verbatim', () => {
      expect(() =>
        encodeQuestionBallot({ ballotProtocol: ranked, choices: fourChoices }, [1, 1, 2, 0])
      ).toThrow(/repeats value 1 \(fields 0 and 1\)/)
    })

    it('throws on a rank above maxValue instead of passing it through verbatim', () => {
      expect(() =>
        encodeQuestionBallot({ ballotProtocol: ranked, choices: fourChoices }, [4, 0, 3, 1])
      ).toThrow(/above maxValue 3/)
    })

    it('encodes the 2-option index-list as pick-slots, not a dense 0/1 vector', () => {
      // The one dense+uniqueValues shape the pigeonhole allows is {maxCount:2, maxValue:1,
      // uniqueValues:true} — a 2-option index-list (wire-identical to a 2-option ranked
      // ballot). It now routes to pick-slots: [0] is a short single-slot ballot, and [0,1]
      // fills both slots with distinct values (no repeat to reject).
      const twoChoices = fourChoices.slice(0, 2)
      const indexList = bp({ maxCount: 2, maxValue: 1, maxTotalCost: 2, uniqueValues: true })
      expect(encodeQuestionBallot({ ballotProtocol: indexList, choices: twoChoices }, [0])).toEqual([0])
      expect(
        encodeQuestionBallot({ ballotProtocol: indexList, choices: twoChoices }, [0, 1])
      ).toEqual([0, 1])
    })

    it('matches the legacy SDK wire ballot for a 2-option multichoice', () => {
      // Verbatim from a legacy @vocdoni/sdk 0.9.3 run on vocone (election
      // 1adff8077b187c6ffd52f4a2d64d4c08762b7c7e89b6f6efee0b020800000000). Picking only
      // choice B, the SDK's own checkVote passed and the signed protobuf carried
      // {"votes":[1]} — a SHORT ballot, not padded to maxCount. Before this change the
      // encoder threw here, so partial voting was impossible on an election the chain
      // accepts and tallies.
      const twoChoices = fourChoices.slice(0, 2)
      const legacy = bp({
        maxCount: 2,
        maxValue: 1,
        maxTotalCost: 0,
        costExponent: 1,
        uniqueValues: true,
        maxVoteOverwrites: 0,
        costFromWeight: false,
      })
      const question = { ballotProtocol: legacy, choices: twoChoices }
      expect(encodeQuestionBallot(question, [1])).toEqual([1])
      expect(encodeQuestionBallot(question, [0, 1])).toEqual([0, 1])
    })

    it('throws on an out-of-range value for a named singlechoice without a protocol', () => {
      // The named type derives maxValue = highest Choice.value on chain
      // (saas-backend BallotProtocolFromType) — a stray selection value encodes a
      // ballot that can never count, and there is no protocol on the read to check
      // it against, so the bounds are derived the same way the backend derives them.
      expect(encodeQuestionBallot({ type: 'singlechoice', choices: fourChoices }, [3])).toEqual([3])
      expect(() =>
        encodeQuestionBallot({ type: 'singlechoice', choices: fourChoices }, [7])
      ).toThrow(/above maxValue 3/)
    })

    it('throws on an out-of-range value on a repeatable pick-slot protocol too', () => {
      // uniqueValues false, so the verbatim pass-through path with no uniqueness —
      // the range check alone must still catch a value the chain would drop.
      const capped = bp({ maxCount: 4, maxValue: 5, maxTotalCost: 10, costExponent: 1 })
      expect(() =>
        encodeQuestionBallot({ ballotProtocol: capped, choices: fourChoices }, [6, 0, 0, 0])
      ).toThrow(/above maxValue 5/)
    })
  })
})
