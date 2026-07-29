---
'@vocdoni/api-client': minor
'@vocdoni/ballot': minor
'@vocdoni/api-types': patch
---

Stop creating multichoice elections whose votes are silently discarded at tally.

The backend derives the **dense** layout for `type: 'multichoice'` (one 0/1 field per
choice, `maxTotalCost = typeSetup.maxChoices`) while also mapping
`typeSetup.uniqueChoices` onto the on-chain `voteMode.uniqueValues`. The scrutinizer
applies `uniqueValues` to the raw field values, so a 0/1 vector over more than two
choices always repeats one — even a single pick, `[1, 0, 0, 0]`, repeats `0`. Every
ballot was rejected during aggregation while the vote still counted towards
`voteCount`, producing elections that reported an all-zero tally with
`finalResults: true`.

- `@vocdoni/api-client`: `elections.create` / `elections.update` now force
  `typeSetup.uniqueChoices` to `false` on `multichoice` questions (lossless — the dense
  layout already gives each choice its own field, so a voter cannot pick one twice), and
  throw when a raw `ballotProtocol` is unsatisfiable instead of publishing an election
  that cannot be tallied. Multichoice questions consequently read back with
  `uniqueChoices: false` regardless of what was sent. Adds `@vocdoni/ballot` as a
  dependency.
- `@vocdoni/ballot`: new `unsatisfiableProtocolReason`, `unsatisfiableQuestionReason`,
  `isUnsatisfiableProtocol`, `isUnsatisfiableQuestion`, `voteTypeBounds` and the
  `ProtocolBounds` type, plus `isDenseBallotProtocol` is now exported.
  `encodeBallot`, `encodeQuestionBallot` and `validateSelections` throw on an
  unsatisfiable config rather than encoding a ballot that will never count.
  `unsatisfiableQuestionReason` works off `type` + `typeSetup` too, so a UI can flag an
  already-created broken question from a public read (which omits the derived protocol).
- `@vocdoni/api-types`: documents the constraint on `BallotProtocol.uniqueValues` and
  `QuestionTypeSetup.uniqueChoices`.

Already-published elections with this config cannot be repaired — their votes are on
chain but were never aggregated.
