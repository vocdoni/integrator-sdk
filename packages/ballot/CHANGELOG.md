# @vocdoni/ballot

## 1.1.0

### Minor Changes

- a5f94b1: Infer the ballot type from the declared type name first, and fall back to protocol shape —
  shape is a lossy reconstruction of intent, and at `maxValue === 1` it cannot recover it.

  A legacy `MultiChoiceElection` over two choices with repeatable picks and no abstain
  allowance generates `{maxCount: 2, maxValue: 1, uniqueChoices: false}` — byte-identical to a
  two-option `ApprovalElection` (both verified against `@vocdoni/sdk` 0.9.3's
  `generateVoteOptions`/`generateEnvelopeType`). The `uniqueChoices` discriminator splits the
  _other_ `maxValue === 1` pair but not this one, so such an election encoded as a dense 0/1
  vector and decoded off the wrong axis, reporting zeros. The legacy SDK never had this
  problem because it dispatches on `resultsType.name`, never on shape.

  - `inferQuestionBallotType` now consults `question.type` before the protocol rather than
    only inside the `maxValue === 1` branch. **Behaviour change:** a question with a
    recognized name and a conflicting protocol now follows the name. In practice this only
    moves `{type: 'multichoice', maxCount: 1}` from the single-choice label to multichoice,
    which is the correct read — the backend derives the dense layout _from_ the named type, so
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

### Patch Changes

- 4491324: Harden the dense vs index-list multichoice discriminator so both wire layouts route
  correctly off the protocol params (no new flag):

  - `isDenseBallotProtocol` now requires `!uniqueValues`, so the 2-option index-list corner
    (`maxValue === 1 && uniqueValues`) stops misrouting as dense/approval — its results decode
    as the pick-slot column sum, not the dense per-choice read.
  - `encodeMultiChoice` returns a short ballot as-is when the protocol reserves no abstain
    headroom, instead of throwing — the vochain accepts ballots shorter than `maxCount` and the
    legacy SDK sends them unpadded. (Genuinely-unsatisfiable protocols still throw upstream.)
  - `questionSelectionRange` pick-slot `min` now follows `typeSetup.minChoices` instead of
    forcing a full `maxCount` slate, matching the dense branch. `minChoices: 0` (an empty
    submission) is honoured only when the protocol reserves abstain headroom — without it an
    empty ballot is accepted by the chain but recorded in no column, so it could not be told
    apart from not voting; the floor stays at 1 there.

  Decoding is unchanged: the `{ choice: 'abstain' }` bucket is still always emitted for
  multichoice (reporting 0 when the protocol reserves no sentinel headroom). Use the exported
  `questionReservesAbstain(question)` to decide whether an "Abstention" field is worth
  rendering — it is `false` exactly when abstention is structurally impossible.

- fbe32bf: Refuse questions that publish an option no voter can cast.

  A ballot config can be perfectly satisfiable and still carry a choice that is dead on
  arrival. That failure is nastier than an all-zero tally: the election runs, most votes
  count, and the unreachable option quietly polls zero while `voteCount` keeps rising.
  Confirmed against a live chain (`integration/value-skew.itest.ts`) — the API accepts the
  config, the relay accepts the ballot, the chain counts the envelope, and the scrutinizer
  discards it at aggregation with no error on any surface:

  ```
  API ACCEPTED the malformed election (values 1/2/3 under maxValue 2)
  member 1 → wire [1] relay=completed
  member 2 → wire [3] relay=completed
  voteCount  = 2
  raw matrix = [["0","1","0"]]     ← C1 counted, C3 lost
  ```

  - New `uncastableChoicesReason(question)` / `hasUncastableChoices(question)` explain
    the defect, or return `null`/`false` when every choice is reachable. The rule follows
    how each layout addresses its fields:
    - **single-choice** is _value_-addressed (the field carries `choice.value` and the
      results row is indexed by it), so every value must fit `0..maxValue` and no two
      choices may share a value — duplicates read the same column, so one vote is counted
      for both and the percentages sum past 100. Sparse values are legal and deliberate;
      `maxValue` is derived from the highest value, not the option count, and unused
      columns simply stay empty. `maxValue: 0` means unbounded, not a ceiling of zero.
    - **pick-slot multichoice** shares one value space with the abstain sentinels
      (`choices.length`, `+1`, …, and decode claims every column `>= choices.length`), so
      its values must be exactly the _set_ `0..choices.length-1` — in any order, since
      nothing in that layout is positional — and `maxValue` must still clear the highest
      of them.
    - **approval / dense multichoice / budget / quadratic** are position-addressed, where
      `choice.value` is a display label the wire never sees, and carry no constraint.
  - `client.elections.create/update` rejects the config at creation, where it is still
    fixable; after publish the only remedy is a new election. This is a gap the backend
    does not cover — `VoteTypeFromQuestion` passes a raw `ballotProtocol` straight through
    without ever comparing it to the question's own choice values.
  - At **encode** time the two halves of the rule are treated differently, because they
    fail differently:
    - A value above `maxValue` is already caught per ballot by `assertEncodedBallot`, so
      only the voter picking the unreachable option is refused. The live run above shows
      why the line is drawn there: on such an election the in-range votes are still
      tallied correctly, and refusing everybody would discard ballots the chain records
      fine. `encodeBallot` / `encodeQuestionBallot` now explain _why_ when this happens,
      replacing the wire-level "field 0 is 3, above maxValue 2" with the election-level
      diagnosis. Failure path only — a healthy vote pays nothing for it.
    - A pick-slot value colliding with the abstain sentinels has no per-ballot backstop:
      the colliding values are _within_ `maxValue`, so no individual ballot is wrong while
      abstentions and real picks are being conflated. That one is refused up front, for
      every voter.
  - `validateSelections` mirrors the same split, so a UI gating its submit button on it no
    longer enables a vote that `encodeBallot` then refuses.
  - `isPickSlotLayout(question)` is now the single home for the pick-slot/dense
    discrimination, replacing three hand-written copies (one of them a de Morgan'd
    negation) in encode, decode and the reachability check.
  - `@vocdoni/react-components` no longer renders the encoder's creator-facing explanation
    as a voter's field error. A question that cannot accept votes shows a voter-appropriate
    message (`errors.question_not_votable`); the technical detail goes to the console.

  Only reachable through a raw `ballotProtocol`: the named types either derive their bounds
  _from_ the values (`singlechoice`) or ignore them entirely (`multichoice`). Decoding is
  unchanged — single-choice results are read by `choice.value`, which is the backend
  contract (saas-backend `account/ballot.go` and `db/types.go`) and is now pinned by unit
  tests and a live round-trip (`raw matrix = [["0","1","1","1"]]` for values 1/2/3, column 0
  empty) so it is not "fixed" into positional indexing. See integrator-sdk#28.

- Updated dependencies [d9212f0]
  - @vocdoni/api-types@1.2.0

## 1.0.0

### Major Changes

- 242f6f0: Promote `@vocdoni/ballot` and `@vocdoni/api-voting` to 1.0.0.

  No API changes in either package — this is a versioning fix.

  While they sat on `0.x`, every additive change forced a **major** on the React
  packages. `^0.1.2` means `>=0.1.2 <0.2.0`, so a minor (`0.1.2` → `0.2.0`) is
  _out of range_ for a caret dependent and gets majored. That defeats the
  `onlyUpdatePeerDependentsWhenOutOfRange` fix, which only helps when the bump is
  genuinely in range — and for a `0.x` package a minor never is. The practical
  effect was that adding an export to `@vocdoni/ballot` had to ship as a `patch`
  just to avoid gratuitously majoring `@vocdoni/react-components`.

  At `1.x`, `^1.0.0` covers every later minor, so additive changes cascade as
  patches and can be declared honestly.

  The React packages take only a **patch**: their peer ranges on these two
  packages widen from `workspace:^` to `workspace:>=0.1.2 <2`, which spans both
  the old and new majors. That is accurate rather than a workaround — 1.0.0
  changes no API, so `react-components` really does work with both. Consumers on
  `@vocdoni/react-components@^2` keep working with no range change.

### Minor Changes

- e7a7dae: Stop creating multichoice elections whose votes are silently discarded at tally.

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

    The guard covers the _product_ as well as the config: both encoders now run
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

### Patch Changes

- e7a7dae: Fix budget / quadratic results decoding, which returned **0 for every option** on
  every budget and quadratic election. Found while extending the integration suite to
  vote every supported ballot type — the same silent all-zero symptom as the
  multichoice `uniqueChoices` bug, with an unrelated cause.

  `maxValue === 0` does not just mark budget/quadratic — it switches the scrutinizer to
  _discrete aggregation_: it accumulates `Σ amount × weight` into column 0 of each
  option's row and leaves the row one cell wide, rather than building a histogram.
  `decodeResults` / `decodeQuestionResults` index-weighted that row (`Σ value × count`),
  which reads the sole column at index 0 and therefore always produced zero. They now
  read the aggregated cell.

  Verified live: a 4-option budget question where 3 voters each allocated `[4, 0, 6, 0]`
  returns `[["12"],["0"],["18"],["0"]]` on chain and now decodes to `[12, 0, 18, 0]`
  instead of `[0, 0, 0, 0]`.

- Updated dependencies [e7a7dae]
  - @vocdoni/api-types@1.1.2

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
