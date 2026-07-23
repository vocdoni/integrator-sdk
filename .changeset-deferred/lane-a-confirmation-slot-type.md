---
"@vocdoni/react-components": patch
---

Fix QuestionsConfirmation slot props: `election` is now typed as `VotingProcessResponse` (was legacy `Election`), matching what the component actually passes.
