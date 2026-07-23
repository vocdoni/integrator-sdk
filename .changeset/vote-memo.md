---
'@vocdoni/api-voting': minor
---

New optional `memo` on `buildVoteTransaction` / `VotingClient.vote()` —
attaches a free-text note (e.g. an open "Other" answer) to the vote envelope
(`VoteEnvelope.memo`, new in `@vocdoni/proto` 1.15.13). Validated client-side
against the chain's 256 UTF-8-byte cap (exported as `MAX_MEMO_BYTES`), since
the protocol leaves memo validation to the app layer. Note the memo rides the
envelope in cleartext even on `secretUntilTheEnd` elections — only the vote
package is encrypted.
