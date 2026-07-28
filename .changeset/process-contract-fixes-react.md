---
'@vocdoni/react-components': minor
---

Confirm dialogs work out of the box: `QuestionsFormProvider`, `ActionCancel`
and `ActionEnd` now mount their own `ConfirmProvider` when none is present, so
they no longer crash without a manually-mounted provider. New
`EnsureConfirmProvider` export (idempotent — an app-provided `ConfirmProvider`
still takes precedence).
