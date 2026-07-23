# @vocdoni/api-voting

## 0.1.0

### Minor Changes

- da921fc: New optional `memo` on `buildVoteTransaction` / `VotingClient.vote()` —
  attaches a free-text note (e.g. an open "Other" answer) to the vote envelope
  (`VoteEnvelope.memo`, new in `@vocdoni/proto` 1.15.13). Validated client-side
  against the chain's 256 UTF-8-byte cap (exported as `MAX_MEMO_BYTES`), since
  the protocol leaves memo validation to the app layer. Note the memo rides the
  envelope in cleartext even on `secretUntilTheEnd` elections — only the vote
  package is encrypted.

### Patch Changes

- 111b400: Bump `@vocdoni/proto` to 1.15.13. The only upstream proto change is the new
  optional `VoteEnvelope.memo` field (voter free-text note, max 256 bytes) —
  additive, not yet set by this SDK.

  The 1.15.13 build also bundles a newer protobufjs whose `Writer.finish()`
  returns a `Buffer` whenever a global one is reachable; in jsdom/VM test realms
  that Buffer fails `instanceof Uint8Array`, which noble's strict byte checks
  reject. `buildVoteTransaction` now normalizes the encoded bytes to the local
  realm, so consumers' jsdom test suites keep working.

- Updated dependencies [915f278]
- Updated dependencies [d65439b]
- Updated dependencies [9bb1937]
- Updated dependencies [a280996]
- Updated dependencies [7801e6d]
- Updated dependencies [0d630b3]
- Updated dependencies [19a0b09]
- Updated dependencies [0f27337]
- Updated dependencies [0b4c33b]
- Updated dependencies [2a0cbed]
  - @vocdoni/api-types@1.0.0

## 0.0.1

### Patch Changes

- Initial release
- Updated dependencies
  - @vocdoni/api-types@0.0.1
