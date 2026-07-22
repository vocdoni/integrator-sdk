---
'@vocdoni/react-components': patch
---

`ElectionResults` now pairs results entries to questions by `questionId`
instead of array position, so reordered or sparse results responses (e.g. a
question not yet published) can no longer render tallies under the wrong
question.
