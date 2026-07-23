---
'@vocdoni/react-providers': minor
'@vocdoni/react-components': minor
---

Per-question vote memos in React (`VoteEnvelope.memo`, proto 1.15.13):

- `ElectionProvider.vote(encodedBallots, memos?)` — optional per-question
  memo strings, validated pre-flight (memo count and the chain's 256
  UTF-8-byte cap are checked before any one-shot CSP signature is consumed).
- `react-components`: reserved `memo.{index}` form fields (`memo.0`, …) in
  the questions form are collected as per-question memos; empty strings are
  dropped. No memo input is rendered by default — register one in the form
  slot to collect it.
- Memos ride the vote envelope in cleartext, even on `secretUntilTheEnd`
  elections — only the vote package is encrypted.
