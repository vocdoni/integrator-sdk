# @vocdoni/react-components

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
