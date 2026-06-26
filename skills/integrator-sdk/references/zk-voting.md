# Reference: @vocdoni/api-voting-zk

> ⚠️ **Phase 2 — not stable.** This package is under active development. The API surface, ZK circuit formats, and SIK (Secret Identity Key) derivation are subject to change without notice. Do not build production flows on top of this package yet.

ZK-proof-based anonymous voting for the Vocdoni SaaS API. When complete, it will let voters prove census membership without revealing their identity to the relayer.

---

## What it will provide

- **`generateZkProof`** — produce a ZK proof of census membership from a SIK
- **`deriveSik`** — derive a Secret Identity Key from a voter's wallet
- **ZK circuit loading** — fetch and instantiate the WASM/zkey circuit files from the API
- **`ZkApiClient`** — fetch circuit metadata and submit ZK vote transactions

## Current exports

```ts
// src/index.ts (current — subject to change)
export { deriveSik } from './sik'
export { generateZkProof } from './zk-proof'
export { ZkApiClient } from './zk-api'
export type { ZkProofOptions, SikOptions } from './types'
```

## Do not use yet

The package exists so it can be developed alongside the rest of the SDK, but the SaaS API ZK endpoints are not yet stable. When this package reaches a usable state, a full reference will replace this stub.

---

## Cross-references

- [[integrator-sdk]] — overview and stable packages
- [[voting]] — the current (non-ZK) CSP-based vote flow
