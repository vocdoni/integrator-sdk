---
'@vocdoni/api-types': minor
'@vocdoni/api-client': major
'@vocdoni/ballot': minor
---

Confirmed-review fixes across the per-question model surface.

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
