---
'@vocdoni/ballot': patch
---

Fix the codec for backend-derived (named-type) multichoice questions. The backend derives a dense layout for `type: 'multichoice'` — one 0/1 ballot field per choice (`maxCount = numChoices`, `maxValue = 1`), with `maxTotalCost` bounding the number of picks — but the codec routed `uniqueValues: true` protocols to the legacy pick-slot layout, producing ballots the chain silently discards at tally and misreading the dense results histogram.

- `maxValue === 1` now always selects the dense wire layout (a pick-slot layout needs `maxValue >= numChoices - 1`, so `maxValue === 1` can only be dense): `encodeQuestionBallot` emits the 0/1 vector (capped at `maxTotalCost` picks) and `decodeQuestionResults` reads the per-choice `[notSelected, selected]` rows.
- `inferQuestionBallotType` keeps the `MultiChoice` label for named multichoice questions (badges, tips and pick caps stay multichoice-flavoured) and returns `Approval` for any other `maxValue === 1` protocol — including `uniqueValues: true`, which previously fell through to pick-slot. `inferBallotType` (election-level) likewise drops the `!uniqueChoices` guard.
- `questionSelectionRange` understands the dense layout: `max` is `maxTotalCost` (falling back to the number of choices), `min` comes from `typeSetup.minChoices`, since `maxCount` is the choice count there, not the pick bound.

Note: elections whose on-chain protocol combines the dense layout with `uniqueChoices: true` are unsatisfiable at the scrutinizer (uniqueness applies to raw 0/1 field values) — that needs a saas-backend fix; no client-side encoding can produce a valid multi-pick ballot for them.
