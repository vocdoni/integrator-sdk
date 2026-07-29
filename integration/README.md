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
so there are no dev-DB fixtures to rot. It runs in CI
(`.github/workflows/integration.yml`) against a disposable saas-api + vochain
container on every pull request, on pushes to `main`, and on a nightly
schedule. The whole job takes ~3.5 minutes.

To run the same stack locally:

```bash
pnpm test:integration:stack
```

This boots `mongo` + `vocone` + `saas-backend` (`integration/docker-compose.ci.yml`),
seeds a default plan, mints an integrator API key, and runs the suite against it —
identical to what CI does. Tear it down afterwards with:

```bash
scripts/integration-stack.sh down
```

To drive the stack and the suite as separate steps (e.g. to reuse the same
stack across repeated test runs), use `scripts/integration-stack.sh up` to
start it — it prints `INTEGRATION_API_URL` and `INTEGRATION_API_KEY` — then
export those and run `pnpm test:integration` directly. If port `8080` (or
`8025`) is already taken locally, set `INTEGRATION_HOST_PORT` (and/or
`INTEGRATION_MAILHOG_PORT`) to an alternate port before calling `up`.

## What it covers

1. Create a managed organization.
2. Load a 100-member memberbase (`memberNumber` 1..100), polling the unified
   jobs endpoint for the import.
3. Read the auto-created "All members" group.
4. Build and publish a CSP census from that group.
5. Create and publish 3 processes (each embedding its census via
   `census: { groupId, authFields }` — publish rejects censusless processes) —
   single-choice, multi-choice, and a `secretUntilTheEnd` single-choice whose
   per-question encryption keys are polled after publish. For each, prove the
   **public voter surface** (saas-backend#599): the draft 404s on the
   token-less process read before publish; once published the process read is
   fully public — `chainId`, census `size`/`totalWeight`, questions — with
   `eligibleMemberIds` stripped; plus the token-less question read (choices,
   `ballotProtocol`/`type`, `upstreamId`, and the secret question's
   `encryptionKeys`) and the public process list.
6. Bundle every question's on-chain process; 3 members vote on every question
   through the **legacy bundle CSP flow** — the secret question's ballots
   sealed with its encryption keys.
7. A 4th member votes every process through the **process-scoped CSP flow**
   (`client.processes`: `authStep0` → `check` → `sign`), with `chainId` read
   straight off the **public** process read — no integrator handoff.
8. Assert one distinct vote nullifier per (member, question) — 12 in total.
9. Read the live public tallies (`getResults` + single reads): every question
   reaches `voteCount = 4` with `finalResults = false`, `maxVoters` = census
   size, and a tally matrix for cleartext questions (a secret question's
   matrix stays hidden until key reveal).

## Configuration

| Env var               | Default                            | Purpose                       |
| --------------------- | ---------------------------------- | ----------------------------- |
| `INTEGRATION_API_URL` | `https://saas-api-dev.vocdoni.net` | Target API base URL           |
| `INTEGRATION_API_KEY` | — (suite skips without it)         | Integrator API key (`vsk_…`)  |

The key's organization must be an **integrator** with scopes `managed:write` +
`members:write` + `voting:write`, and quota for ≥3 processes / ≥300 census
size. The suite creates real on-chain elections and votes.
