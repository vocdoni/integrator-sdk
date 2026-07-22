# Integration tests

A single suite, `full-flow.itest.ts`, runs the entire organizer→voter lifecycle
against a **live SaaS API**. It is excluded from the normal unit run
(`pnpm test`); run it explicitly:

```bash
INTEGRATION_API_KEY=vsk_… pnpm test:integration
```

The command builds the workspace packages first, then runs vitest with
`integration/vitest.config.ts`. No MSW mocking is loaded — requests hit the
real API.

## Why one suite

Everything that needs a real backend is asserted inside the lifecycle, which
creates all of its own data — org, members, group, census, processes, votes —
so there are no dev-DB fixtures to rot. The intended future is running this in
CI against a disposable saas-api + vochain container on every PR and push;
until that lands, run it manually against dev with an integrator API key.

## What it covers

1. Create a managed organization.
2. Load a 100-member memberbase (`memberNumber` 1..100), polling the unified
   jobs endpoint for the import.
3. Read the auto-created "All members" group.
4. Build and publish a CSP census from that group.
5. Create and publish 3 processes sharing that census — single-choice,
   multi-choice, and a `secretUntilTheEnd` single-choice whose per-question
   encryption keys are polled after publish. For each, prove the **public
   voter surface**: the token-less question read (choices, `ballotProtocol`,
   `upstreamId`, and the secret question's `encryptionKeys`) and the 401 on
   the protected process read.
6. Bundle every question's on-chain process; 3 members authenticate, are
   checked against the census, get CSP signatures, and vote on every question
   — the secret question's ballots sealed with its encryption keys.
7. Assert one distinct vote nullifier per (member, question).

## Configuration

| Env var               | Default                            | Purpose                       |
| --------------------- | ---------------------------------- | ----------------------------- |
| `INTEGRATION_API_URL` | `https://saas-api-dev.vocdoni.net` | Target API base URL           |
| `INTEGRATION_API_KEY` | — (suite skips without it)         | Integrator API key (`vsk_…`)  |

The key's organization must be an **integrator** with scopes `managed:write` +
`members:write` + `voting:write`, and quota for ≥3 processes / ≥300 census
size. The suite creates real on-chain elections and votes.
