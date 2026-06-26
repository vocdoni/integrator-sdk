<p align="center" width="100%">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://developer.vocdoni.io/img/vocdoni_logotype_full_blank.svg" />
      <source media="(prefers-color-scheme: light)" srcset="https://developer.vocdoni.io/img/vocdoni_logotype_full_white.svg" />
      <img alt="Vocdoni" src="https://developer.vocdoni.io/img/vocdoni_logotype_full_white.svg" />
  </picture>
</p>

<p align="center" width="100%">
    <a href="https://github.com/vocdoni/integrator-sdk/commits/main/"><img src="https://img.shields.io/github/commit-activity/m/vocdoni/integrator-sdk" /></a>
    <a href="https://github.com/vocdoni/integrator-sdk/issues"><img src="https://img.shields.io/github/issues/vocdoni/integrator-sdk" /></a>
    <a href="https://discord.gg/xFTh8Np2ga"><img src="https://img.shields.io/badge/discord-join%20chat-blue.svg" /></a>
    <a href="https://twitter.com/vocdoni"><img src="https://img.shields.io/twitter/follow/vocdoni.svg?style=social&label=Follow" /></a>
</p>

# @vocdoni/api-voting

The client-side voting primitives for the Vocdoni SaaS API. This package owns the
cryptography and transaction building that turn a voter's choices into a signed Vochain
vote envelope, which is then relayed to the SaaS API.

It provides:

- **`VotingClient`** — the high-level entry point. `vote()` builds, signs and relays a vote
  in one call, returning an async job id.
- **`buildVotePackage`** — assembles the vote package, optionally encrypting the ballot for
  `secretUntilTheEnd` elections.
- **`buildVoteTransaction`** — builds the protobuf Vochain vote transaction with its CSP
  (CA) proof and signs it (EIP-191).
- **`EphemeralSigner`** / **`BallotEncryptor`** — the per-vote signer and ballot encryption
  helpers used under the hood.

Authentication and the CSP signature (and census weight) are obtained beforehand from the
bundle auth/sign flow — typically through [`@vocdoni/api-client`](../api-client). This
package picks up from there and produces the vote.

## Install

~~~bash
pnpm add @vocdoni/api-voting
~~~

## Usage

~~~ts
import { VotingClient } from '@vocdoni/api-voting'

const client = new VotingClient()

const jobId = await client.vote({
  processId,
  chainId, // Vochain chain id the vote is destined for
  choices: [1],
  signer, // ephemeral signer whose address the CSP signed
  cspSignature, // signature returned by the bundle sign endpoint
  relayFn: (req) => api.relayVote(req),
})

// Poll GET /jobs/{jobId} to obtain the vote nullifier once the job completes.
~~~

## License

This package is licensed under the [GNU General Public License v3.0](../../LICENSE).
