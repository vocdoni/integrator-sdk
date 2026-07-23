---
'@vocdoni/api-voting': patch
---

Bump `@vocdoni/proto` to 1.15.13. The only upstream proto change is the new
optional `VoteEnvelope.memo` field (voter free-text note, max 256 bytes) —
additive, not yet set by this SDK.

The 1.15.13 build also bundles a newer protobufjs whose `Writer.finish()`
returns a `Buffer` whenever a global one is reachable; in jsdom/VM test realms
that Buffer fails `instanceof Uint8Array`, which noble's strict byte checks
reject. `buildVoteTransaction` now normalizes the encoded bytes to the local
realm, so consumers' jsdom test suites keep working.
