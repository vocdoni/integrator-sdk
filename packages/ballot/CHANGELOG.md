# @vocdoni/ballot

## 0.1.2

### Patch Changes

- Updated dependencies [f84bf33]
  - @vocdoni/api-types@1.1.1

## 0.1.1

### Patch Changes

- aaa4765: Fix the codec for backend-derived (named-type) multichoice questions. The backend derives a dense layout for `type: 'multichoice'` — one 0/1 ballot field per choice (`maxCount = numChoices`, `maxValue = 1`), with `maxTotalCost` bounding the number of picks — but the codec routed `uniqueValues: true` protocols to the legacy pick-slot layout, producing ballots the chain silently discards at tally and misreading the dense results histogram.

  - `maxValue === 1` now always selects the dense wire layout (a pick-slot layout needs `maxValue >= numChoices - 1`, so `maxValue === 1` can only be dense): `encodeQuestionBallot` emits the 0/1 vector (capped at `maxTotalCost` picks) and `decodeQuestionResults` reads the per-choice `[notSelected, selected]` rows.
  - `inferQuestionBallotType` keeps the `MultiChoice` label for named multichoice questions (badges, tips and pick caps stay multichoice-flavoured) and returns `Approval` for any other `maxValue === 1` protocol — including `uniqueValues: true`, which previously fell through to pick-slot. `inferBallotType` (election-level) likewise drops the `!uniqueChoices` guard.
  - `questionSelectionRange` understands the dense layout: `max` is `maxTotalCost` (falling back to the number of choices), `min` comes from `typeSetup.minChoices`, since `maxCount` is the choice count there, not the pick bound.

  Note: elections whose on-chain protocol combines the dense layout with `uniqueChoices: true` are unsatisfiable at the scrutinizer (uniqueness applies to raw 0/1 field values) — that needs a saas-backend fix; no client-side encoding can produce a valid multi-pick ballot for them.

- Updated dependencies [180a9b3]
- Updated dependencies [41497df]
- Updated dependencies [8212fcd]
  - @vocdoni/api-types@1.1.0

## 0.1.0

### Minor Changes

- 0b4c33b: Confirmed-review fixes across the per-question model surface.

  **`@vocdoni/api-client` (breaking):**

  - `elections.update()` now resolves `void` — the backend answers a bare
    `200 OK` with no body, so the previous `Promise<string>` never carried the
    process id it claimed to. Re-`get()` the process if you need the updated shape.
  - `elections.delete()` now targets the new-model `DELETE /processes/{id}` route.
  - `elections.signInfo()` migrated to `POST /processes/{id}/sign-info` and now
    returns the per-question `ProcessSignInfoResponse` (`{ consumed: [...] }`)
    instead of the legacy single-election `ConsumedAddressResponse`.
  - `setStatus()`/`setStatusAndWait()` and `getMetadata()` are documented as
    legacy-only (single-election model, vochain ids); new-model lifecycle goes
    through `setQuestionStatus()`/`bulkSetQuestionStatus()`.
  - Fix: the client's response parser no longer throws `SyntaxError` on the bare
    `200 OK` (`"\n"`) bodies the backend writes for update/delete/status
    endpoints — blank bodies now resolve as empty instead of failing JSON.parse.

  **`@vocdoni/api-types`:** new `ProcessSignInfoResponse` /
  `QuestionConsumedAddress` types; `QuestionStatusID` JSDoc corrected (it is the
  per-question entry of `SetQuestionsStatusRequest`, not a request body).

  **`@vocdoni/ballot`:** the per-question helpers no longer guess.
  `inferQuestionBallotType()` falls back to the named question `type`
  (`singlechoice`/`multichoice`) when `ballotProtocol` is missing and throws
  instead of silently assuming single-choice; `encodeQuestionBallot()` throws on
  more than one selection for single-choice questions (previously extras were
  silently dropped) and on multichoice questions lacking a `ballotProtocol`.

- 2a0cbed: Migrate from monolithic `Election` to `VotingProcessResponse` with per-question model.

  **Breaking changes:**

  - `@vocdoni/api-types`: Introduces `VotingProcessResponse`, `VotingProcessQuestion`, `BallotProtocol`, `QuestionStatus`, and `VotingProcessResultsResponse`. The old `Election` type is removed.
  - `@vocdoni/api-client`: `elections.get()` now returns `VotingProcessResponse` (hits `GET /processes/{id}`). New `elections.getResults()` method (`GET /processes/{id}/results`). Exports `computeProcessStatus(questions)` which derives a top-level `QuestionStatus` from all question statuses.

  **New features:**

  - `@vocdoni/ballot`: New exports `inferQuestionBallotType`, `encodeQuestionBallot`, `decodeQuestionResults`, `questionReservesAbstain`, `questionSelectionRange` — per-question ballot helpers based on `BallotProtocol`.

  (The react-providers/react-components side of this migration is tracked in a
  separate changeset, held back until the React packages release.)

### Patch Changes

- Updated dependencies [915f278]
- Updated dependencies [d65439b]
- Updated dependencies [9bb1937]
- Updated dependencies [a280996]
- Updated dependencies [7801e6d]
- Updated dependencies [0d630b3]
- Updated dependencies [19a0b09]
- Updated dependencies [0f27337]
- Updated dependencies [0b4c33b]
- Updated dependencies [2a0cbed]
  - @vocdoni/api-types@1.0.0

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
