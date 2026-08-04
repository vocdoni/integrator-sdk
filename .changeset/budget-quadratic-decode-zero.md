---
'@vocdoni/ballot': patch
---

Fix budget / quadratic results decoding, which returned **0 for every option** on
every budget and quadratic election. Found while extending the integration suite to
vote every supported ballot type — the same silent all-zero symptom as the
multichoice `uniqueChoices` bug, with an unrelated cause.

`maxValue === 0` does not just mark budget/quadratic — it switches the scrutinizer to
*discrete aggregation*: it accumulates `Σ amount × weight` into column 0 of each
option's row and leaves the row one cell wide, rather than building a histogram.
`decodeResults` / `decodeQuestionResults` index-weighted that row (`Σ value × count`),
which reads the sole column at index 0 and therefore always produced zero. They now
read the aggregated cell.

Verified live: a 4-option budget question where 3 voters each allocated `[4, 0, 6, 0]`
returns `[["12"],["0"],["18"],["0"]]` on chain and now decodes to `[12, 0, 18, 0]`
instead of `[0, 0, 0, 0]`.
