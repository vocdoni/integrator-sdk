---
'@vocdoni/react-components': patch
---

Fix the multichoice selection counter in `QuestionTip`: it read form field `0` regardless of which question it belonged to, and through a non-reactive `getValues()` snapshot, so the "you selected X options" count never followed the voter's selections. The tip now subscribes to its own question's field via `useWatch`.
