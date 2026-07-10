# @vocdoni/ballot

## 0.0.1

### Patch Changes

- Initial release of `@vocdoni/ballot` — a framework-agnostic package for Vocdoni ballot semantics.

  Exports:

  - `inferBallotType(election)` — classify an election (`single-choice` / `multichoice` / `approval` / `budget` / `quadratic`); replaces the old-SDK `instanceof PublishedElection` check.
  - `encodeBallot(election, selections)` — build the on-chain `choices` vector from high-level selections. Accepts a flat `number[]` or a nested `number[][]` (one array per question). Handles approval dense 0/1 vectors and multichoice abstain padding.
  - `decodeResults(election)` — turn the raw results histogram into per-question / per-choice tallies with percentages, unifying multichoice abstain sentinels into a single bucket.
  - `validateSelections(election, selections)` — basic pre-cast validation of selections against ballot config.
  - `multichoiceReservesAbstain(election)` — whether a multichoice election reserves enough `maxValue` room to abstain-pad a partial selection (useful for UI validation).
  - `BallotType` — runtime const and matching type.
