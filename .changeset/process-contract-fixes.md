---
'@vocdoni/api-types': major
'@vocdoni/react-components': minor
---

Align process types with the real backend contract and make confirm dialogs work out of the box.

**Breaking changes (`@vocdoni/api-types`):**

- `VotingProcessResponse` is now a discriminated union on `published`:
  `DraftVotingProcessResponse` (dates optional — drafts legitimately lack them) |
  `PublishedVotingProcessResponse` (dates required). Narrow on `published` before
  reading `startDate`/`endDate`. Note: the published `startDate` guarantee lands
  with saas-backend#586; stay defensive about it until that deploys.
- `VotingProcessQuestionRequest.type` is now `'singlechoice' | 'multichoice'`
  (new `VotingProcessQuestionType` union / `VOTING_PROCESS_QUESTION_TYPES` const)
  instead of `string`. The backend only accepts these lowercase names — camelCase
  (`'singleChoice'`) is rejected with error 40037, and `'approval'` never existed.

**Doc fixes (`@vocdoni/api-types`):**

- Process reads return `orgAddress` as UNPREFIXED lowercase hex, while other
  endpoints (`auth/addresses`, `organizations/{address}`) return the same value
  `0x`-prefixed — never compare the raw strings across endpoints. The create
  request tolerates the `0x`-prefixed form (asymmetry documented).
- Question `type`/`typeSetup`/`ballotProtocol` contract documented: each question
  needs a named `type` or a raw `ballotProtocol` (the latter wins when both are
  given); `'multichoice'` requires `typeSetup`, `'singlechoice'` ignores it.

**New features (`@vocdoni/react-components`):**

- `QuestionsFormProvider`, `ActionCancel` and `ActionEnd` now mount their own
  `ConfirmProvider` when none is present, so they no longer crash without a
  manually-mounted provider. New `EnsureConfirmProvider` export (idempotent —
  an app-provided `ConfirmProvider` still takes precedence).
