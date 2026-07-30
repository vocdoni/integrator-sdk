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

- `@vocdoni/api-client`: `elections.create` / `elections.update` now reject
  `typeSetup.uniqueChoices` on `multichoice` questions, and reject a raw
  `ballotProtocol` that is unsatisfiable, instead of publishing an election that cannot
  be tallied. Both checks mirror what the API itself enforces, so this fails fast and
  locally without masking the server's answer — a ranked ballot is expressed as a raw
  `ballotProtocol` instead. Adds `@vocdoni/ballot` as a dependency.
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
chain but were never aggregated. The derivation bug itself is upstream
(vocdoni/saas-backend#619), so processes created outside this SDK are still affected.

---

Also fixes budget / quadratic results decoding to the same symptom, found while
extending the integration suite to cover every supported ballot type.

`maxValue === 0` does not just mark budget/quadratic — it switches the scrutinizer to
*discrete aggregation*: it accumulates `Σ amount × weight` into column 0 of each
option's row and leaves the row one cell wide, rather than building a histogram.
`decodeResults` / `decodeQuestionResults` index-weighted that row (`Σ value × count`),
which reads the sole column at index 0 and therefore returned **0 for every option** on
every budget and quadratic election. They now read the aggregated cell.

Verified live: a 4-option budget question where 3 voters each allocated `[4, 0, 6, 0]`
returns `[["12"],["0"],["18"],["0"]]` on chain and now decodes to `[12, 0, 18, 0]`
instead of `[0, 0, 0, 0]`.
