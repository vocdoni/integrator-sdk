---
'@vocdoni/api-client': minor
'@vocdoni/ballot': minor
'@vocdoni/api-types': patch
'@vocdoni/react-components': patch
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
  `isUnsatisfiableProtocol`, `isUnsatisfiableQuestion`, `voteTypeBounds`,
  `assertEncodedBallot` and the `ProtocolBounds` type, plus `isDenseBallotProtocol` is
  now exported. `encodeBallot`, `encodeQuestionBallot` and `validateSelections` throw
  on an unsatisfiable config rather than encoding a ballot that will never count.
  `unsatisfiableQuestionReason` works off `type` + `typeSetup` too, so a UI can flag an
  already-created broken question from a public read (which omits the derived protocol).

  The guard covers the *product* as well as the config: both encoders now run
  `assertEncodedBallot` on every ballot they build and throw when a field exceeds
  `maxValue` or repeats a value the protocol requires unique (duplicate ranks on a
  ranked ballot, both picks of a two-field dense unique layout, an out-of-range
  single-choice value) — a satisfiable config still admits ballots the chain accepts,
  counts in `voteCount`, and silently drops during aggregation, and a vote must either
  count or fail loudly. `validateSelections` mirrors the same rules on raw selections
  (duplicate unique picks, repeated amounts on a legacy unique budget shape), and
  `unsatisfiableProtocolReason` returns `null` on malformed bounds instead of a
  NaN-laden reason.
- `@vocdoni/api-types`: documents the constraint on `BallotProtocol.uniqueValues` and
  `QuestionTypeSetup.uniqueChoices`.
- `@vocdoni/react-components`: the vote form catches these encode-time rejections and
  marks the offending question invalid instead of letting them escape `handleSubmit`
  as an unhandled promise rejection on an already-broken election.

Already-published elections with this config cannot be repaired — their votes are on
chain but were never aggregated. The derivation bug itself is upstream
(vocdoni/saas-backend#619), so processes created outside this SDK are still affected.
