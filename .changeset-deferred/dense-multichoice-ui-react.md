---
'@vocdoni/react-components': patch
---

Use `questionSelectionRange` for the multichoice pick bound in `QuestionsTypeBadge`, `QuestionTip` and the multichoice checkbox fields instead of raw `ballotProtocol.maxCount`. On the dense named-multichoice layout `maxCount` is the number of choices — the real bound is `maxTotalCost` — so the UI previously showed the wrong "select up to N" figure and failed to cap selections, letting voters build ballots the chain silently discards.
