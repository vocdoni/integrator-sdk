---
"@vocdoni/ballot": minor
---

Infer the ballot type from the declared type name first, and fall back to protocol shape —
shape is a lossy reconstruction of intent, and at `maxValue === 1` it cannot recover it.

A legacy `MultiChoiceElection` over two choices with repeatable picks and no abstain
allowance generates `{maxCount: 2, maxValue: 1, uniqueChoices: false}` — byte-identical to a
two-option `ApprovalElection` (both verified against `@vocdoni/sdk` 0.9.3's
`generateVoteOptions`/`generateEnvelopeType`). The `uniqueChoices` discriminator splits the
*other* `maxValue === 1` pair but not this one, so such an election encoded as a dense 0/1
vector and decoded off the wrong axis, reporting zeros. The legacy SDK never had this
problem because it dispatches on `resultsType.name`, never on shape.

- `inferQuestionBallotType` now consults `question.type` before the protocol rather than
  only inside the `maxValue === 1` branch. **Behaviour change:** a question with a
  recognized name and a conflicting protocol now follows the name. In practice this only
  moves `{type: 'multichoice', maxCount: 1}` from the single-choice label to multichoice,
  which is the correct read — the backend derives the dense layout *from* the named type, so
  the name is the input and the protocol the output.
- Backwards compatibility with the legacy `@vocdoni/sdk` metadata format: when no `type`
  field resolves, `type.name` is read out of the open-ended metadata bag —
  `Election.meta` at the election level and `VotingProcessQuestion.metadata` per question
  (reachable per question because in the SaaS model each question is its own vochain
  process). Recognized names are the legacy `ElectionResultsTypeNames`:
  `single-choice-multiquestion`, `multiple-choice`, `approval`, `budget-based`,
  `quadratic`. The bag is probed defensively, so a malformed one falls through instead of
  throwing.
- `inferBallotType` — and with it `encodeBallot`, `decodeResults`, `validateSelections`,
  `normalizeSelections` and `multichoiceReservesAbstain` — accepts `type` and `meta` on its
  input object. Integrators no longer have to synthesize a fake `voteType` to express a
  type they already know.
- `decodeQuestionResults` and `encodeQuestionBallot` no longer apply their dense remap when
  the legacy bag declares `multiple-choice`. That name means pick-slot, but at two options
  its protocol satisfies `isDenseBallotProtocol` as well, so the remap would have read the
  tally off the wrong axis and inverted it. `encodeQuestionBallot` throws for a legacy
  pick-slot question with no `ballotProtocol` rather than guessing the slate size.

The vocabulary follows the field a name came from, not the function: legacy
`multiple-choice` is the pick-slot index list while the SaaS `multichoice` is the dense 0/1
layout, so reading one as the other column-sums a dense matrix or inverts a two-option
tally. An absent, empty or unrecognized name falls through to the existing shape rules
unchanged, so callers with nothing to declare are unaffected. There is no `ranked` name in
either vocabulary yet — see issue #22.

Covered end to end by `integration/full-flow.itest.ts`, which casts real votes on a
two-option `{maxCount: 2, maxValue: 1, uniqueValues: false}` question declared via the
legacy metadata name and asserts both the raw on-chain matrix and the decoded tally — the
dense reading of that same matrix is the exact inverse.
