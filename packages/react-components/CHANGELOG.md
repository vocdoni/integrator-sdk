# @vocdoni/react-components

## 2.1.1

### Patch Changes

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

## 2.1.0

### Minor Changes

- 26228bf: Surface every question's vote id, not just the first one.

  **`@vocdoni/react-providers`:** `useElection()` gains `voteIds: Record<questionId, string>` — every nullifier the voter holds for the process. It is populated from the outcomes of `vote()`, from the questions that _did_ land when `vote()` throws `PartialVoteError` (a partial cast no longer loses the ids it produced), and, on connect, recovered from `POST /processes/{id}/sign-info` when the membership check reports something voted — so a voter returning after a page reload still sees all of their ids instead of none. A sign-info failure is swallowed and leaves membership resolved. `voteId` keeps working unchanged and is now marked `@deprecated`: votes are relayed per question, so it only ever exposes one of them.

  **`@vocdoni/react-components`:** `<Voted />` now renders one entry per voted question, pairing each question's title with its vote id (still link-ified), in process order. The `Voted` slot gains an additive `votes: VotedVote[]` prop (`{ questionId, questionTitle, voteId, description }`); the existing `description` prop now carries every line joined, so slot overrides written against the old single-string API keep showing all of the ids. A single voted question still renders the exact `vote.voted_description` sentence it did before; multiple questions use the new `vote.voted_question_description` key.

### Patch Changes

- 3e867d2: Publish internal peer dependencies as caret ranges instead of exact pins.

  `workspace:*` peers resolve to the exact version at publish time, so every
  release of a peer forced a lockstep major on its dependents and pinned
  consumers to one precise version. Peers now use `workspace:^`, which publishes
  as `^x.y.z`, and changesets is configured with
  `onlyUpdatePeerDependentsWhenOutOfRange` so an in-range peer bump cascades as
  a patch (via `updateInternalDependents: 'always'`) rather than a major.

## 2.0.1

### Patch Changes

- f84bf33: Surface extended choice info (per-choice image and description) on process reads

  The API stores a choice's image/description on its **parent question**, under
  `metadata.choices` keyed by choice `value` — `db.Choice` is `{Title, Value}` and
  has nowhere to put it. The display components have always read it off
  `choice.meta`, and nothing mapped between the two, so images and descriptions
  were stored correctly and dropped on read: every question rendered
  `basic`/`list`.

  - `@vocdoni/api-types`: `Choice` gains a `meta?: ChoiceMeta`
    (`{ description?, image?: { default?, thumbnail? } }`), plus a
    `ChoiceMetadataEntry` type documenting the storage form. Both are open bags —
    creator-defined keys are part of the contract, not stripped.
  - `@vocdoni/api-client`: `elections.get`, `elections.list`,
    `elections.getQuestion` and `processes.getQuestion` now fold
    `metadata.choices` onto the matching choice as `choice.meta`. Both stored
    image shapes are tolerated — a plain URL string is normalized to
    `{ default: url }`, an object is passed through — and entries matching no
    choice are ignored. `description`/`image` are validated; every other key on
    the entry rides along untouched, so custom `QuestionChoice` slots keep seeing
    the open bag they saw when meta lived on the choice directly. The `value` join
    key is stripped. Exported as `normalizeQuestionChoiceMeta` for hand-normalizing
    raw wire data.
  - `@vocdoni/react-providers`: `<ElectionProvider election>` runs a prefetched
    process through the same normalization, so extended choices (and normalized
    statuses) are right on the first paint instead of only after the refetch.
  - `@vocdoni/react-components`: questions with extended choice info render the
    `extended` presentation again, and the `grid` layout when a choice has an
    image. `ipfs://` URLs and empty descriptions keep behaving as before.

  Two rendering fixes ride along, where the layout and `compact` checks read
  `choice.meta.image.default` raw while the presentation check read it through
  `getQuestionChoiceMeta`:

  - A whitespace-only image URL no longer flips a question to the `grid` layout
    with nothing to show in it — it is trimmed away like every other empty-ish
    string, and the question stays `basic`/`list`.
  - A thumbnail-only image now counts for the layout too. The default choice
    renderer resolves `image.thumbnail ?? image.default`, so such a choice did
    render an image, but inside a control styled as image-less.

  No stored data is migrated — both image shapes are tolerated on read.

  Released as a patch across the board on purpose. `api-types`/`api-client` are
  additive (a new optional field and a new export), which would normally be a
  minor — but `react-components`/`react-providers` **peer**-depend on them, and
  Changesets bumps a peer dependent to _major_ on any peer bump. That would push
  them to `3.0.0` and out of the `^2.0.0` range the consuming app pins, for what
  is a read-side bug fix.

- Updated dependencies [f84bf33]
  - @vocdoni/react-providers@2.0.1
  - @vocdoni/api-types@1.1.1
  - @vocdoni/ballot@0.1.2

## 2.0.0

### Major Changes

- dac953d: Merge `ProcessProvider` into `ElectionProvider`. The CSP voter session (auth0/auth1/resend/check/sign) and the election data + vote flow always target the same voting process, so the two-provider split bought no real composability — one provider now does everything, matching the pre-migration SDK's mental model.

  - `useElection()` additionally exposes the session: `authToken`, `auth0`, `auth1`, `resend`, `check`, `sign`, plus `chainId`. `clearVoter()` clears the session and the vote state.
  - New `useElectionAuth()` hook reads the session from its own context, so auth-only widgets (identify forms, OTP inputs, logout buttons) don't re-render on election data/results updates. Its `clear()` also resets the vote state (`hasVoted`, `voteId`, `isInCensus`).
  - BREAKING: `ProcessProvider`, `useProcess`, `useProcessOptional`, `ProcessContextValue`, `ProcessProviderProps` and `ProcessSignResult` are removed. Replace `<ProcessProvider id><ElectionProvider id>` nesting with a single `<ElectionProvider id>`; replace `useProcess()` with `useElectionAuth()` (session) or `useElection()` (everything). `ProcessSignResult` is now `ElectionSignResult`.
  - BREAKING: `processQueryKeys` is renamed to `electionQueryKeys` (`.process(id)` → `.election(id)`; key shapes are unchanged, so seeded caches keep working).

- bf2f39e: Complete rewrite for the Vocdoni SaaS API. Both packages are rebuilt on `@vocdoni/api-client`/`@vocdoni/api-voting` (the SaaS multi-question `/processes` model) instead of `@vocdoni/sdk` and direct chain access: one `ElectionProvider` per voting process drives election data, the CSP voter auth session (`useElectionAuth`) and the phased multi-question vote flow (`vote()`, `PartialVoteError`, per-question `voteStatus`), with `ClientProvider`/`AuthProvider`/`OrganizationProvider`/`ActionsProvider` around it and react-query as the fetching layer. Peer dependencies change accordingly: `@vocdoni/sdk`, `@ethersproject/*` and `react-router` are gone; `@tanstack/react-query` and the `@vocdoni/api-*` workspace packages are required. APIs kept from the old packages keep their names and props (`id`/`election` prefetching, `queryOptions`, `useElection`, the `<Election* />` components); anything tied to the legacy single-election/bundle model is removed.
- 80bef5b: Pagination and cache-control surface (previously uncovered by any changeset):

  **Breaking (`@vocdoni/react-components`):** pagination is always 1-based — the
  `initialPage` abstraction was dropped from `PaginationProvider` /
  `RoutedPaginationProvider` and the `Pagination` components. The
  `RoutedPagination` component is exported from the package root again.

  **`@vocdoni/react-providers` / `@vocdoni/react-components`:** both packages
  export `electionQueryKeys` (the TanStack Query keys `ElectionProvider` uses for
  its election and results fetches) so host apps can invalidate or prefetch that
  cached state.

### Minor Changes

- 80bef5b: Confirm dialogs work out of the box: `QuestionsFormProvider`, `ActionCancel`
  and `ActionEnd` now mount their own `ConfirmProvider` when none is present, so
  they no longer crash without a manually-mounted provider. New
  `EnsureConfirmProvider` export (idempotent — an app-provided `ConfirmProvider`
  still takes precedence).
- 80bef5b: Migrate the React voter flow to the process-scoped CSP routes (the backend dropped the bundle routes):

  - `BundleProvider`/`useBundle` removed; the voter session is anchored to the voting process Mongo id and exposes `auth0`/`auth1`/`resend`/`check`/`sign` — one verified token covers every question of the process.
  - `ElectionProvider`: new `voterQuestions` (per-question `canVote`/`hasVoted` from the CSP check); `hasVoted` derives as "every question voted"; read-only use (results, status) needs no auth session at all.
  - `vote()` signs via `processes.sign` and seals `secretUntilTheEnd` ballots with `question.encryptionKeys` — encrypted voting now works in React. A secret question with unpublished keys throws before the CSP sign is consumed (never casts cleartext).

- f7b332f: Restore per-provider react-query configuration and the organization prefetch prop, matching the old ui-components API. `ElectionProvider` accepts `queryOptions` (the election read) and `resultsQueryOptions` (the results read — e.g. `refetchInterval` for live tallies); `OrganizationProvider` accepts `queryOptions` and an `organization` prop for prefetched data (seeded as `initialData`, with `id` derived from `organization.address` when omitted). As in the old API, `queryKey`/`queryFn`/`enabled`/`initialData` stay provider-owned. `OrganizationProvider`'s fetch prop is `id` (the org address), and `organizationQueryKeys` is exported for cache pre-seeding/invalidation, mirroring `electionQueryKeys`.
- 80bef5b: React layer of the `Election` → `VotingProcessResponse` per-question migration.

  **Breaking (`@vocdoni/react-providers`):** `useElection()` returns
  `election: VotingProcessResponse | null`, `status: QuestionStatus | null`
  (computed via `computeProcessStatus`), and
  `results: VotingProcessResultsResponse | null`. `vote()` signature changed from
  `vote(choices: number[])` to `vote(encodedBallots: number[][])` — one encoded
  ballot array per question.

  **`@vocdoni/react-components`:** components updated for the new process model.
  `QuestionStatus` values now use `ONGOING` (replaces `READY`).

- fa7c1be: Expose the vote-in-flight state. `useElection()` gains `voting: boolean`, true exactly while a `vote()` call runs — from entry until it settles, on both success and error — for "processing your vote" overlays. `<VoteButton />` now disables itself and reports `loading` while a vote is in flight, closing the double-submit window (previously it stayed clickable with `loading` hardcoded to `false`).
- 80bef5b: Per-question vote memos in React (`VoteEnvelope.memo`, proto 1.15.13):

  - `ElectionProvider.vote(encodedBallots, memos?)` — optional per-question
    memo strings, validated pre-flight (memo count and the chain's 256
    UTF-8-byte cap are checked before any one-shot CSP signature is consumed).
  - `react-components`: reserved `memo.{index}` form fields (`memo.0`, …) in
    the questions form are collected as per-question memos; empty strings are
    dropped. No memo input is rendered by default — register one in the form
    slot to collect it.
  - Memos ride the vote envelope in cleartext, even on `secretUntilTheEnd`
    elections — only the vote package is encrypted.

### Patch Changes

- 80bef5b: Use `questionSelectionRange` for the multichoice pick bound in `QuestionsTypeBadge`, `QuestionTip` and the multichoice checkbox fields instead of raw `ballotProtocol.maxCount`. On the dense named-multichoice layout `maxCount` is the number of choices — the real bound is `maxTotalCost` — so the UI previously showed the wrong "select up to N" figure and failed to cap selections, letting voters build ballots the chain silently discards.
- 80bef5b: Fix QuestionsConfirmation slot props: `election` is now typed as `VotingProcessResponse` (was legacy `Election`), matching what the component actually passes.
- 80bef5b: `ElectionResults` now pairs results entries to questions by `questionId`
  instead of array position, so reordered or sparse results responses (e.g. a
  question not yet published) can no longer render tallies under the wrong
  question.
- Updated dependencies [80bef5b]
- Updated dependencies [180a9b3]
- Updated dependencies [aaa4765]
- Updated dependencies [41497df]
- Updated dependencies [180a9b3]
- Updated dependencies [3dc0a36]
- Updated dependencies [80bef5b]
- Updated dependencies [dac953d]
- Updated dependencies [8212fcd]
- Updated dependencies [80bef5b]
- Updated dependencies [bf2f39e]
- Updated dependencies [80bef5b]
- Updated dependencies [f7b332f]
- Updated dependencies [80bef5b]
- Updated dependencies [80bef5b]
- Updated dependencies [fa7c1be]
- Updated dependencies [80bef5b]
- Updated dependencies [80bef5b]
  - @vocdoni/react-providers@2.0.0
  - @vocdoni/api-types@1.1.0
  - @vocdoni/ballot@0.1.1
