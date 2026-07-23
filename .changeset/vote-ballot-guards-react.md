---
'@vocdoni/react-providers': patch
---

`ElectionProvider.vote()` fails fast — before consuming any one-shot CSP
signature — when the encoded-ballot count doesn't match the question count or
the process has no questions. Previously a missing ballot was silently cast as
an empty one (`?? []`), and a zero-question process "succeeded" with
`hasVoted = true` and an empty voteId.
