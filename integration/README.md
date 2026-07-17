# Integration tests

These tests run against a **live SaaS API** and are excluded from the normal unit
run (`pnpm test` / `pnpm vitest run`). Run them explicitly:

```bash
pnpm test:integration
```

The command builds the workspace packages first, then runs vitest with
`integration/vitest.config.ts`. No MSW mocking is loaded — requests hit the real API.

## Configuration

| Env var                   | Default                              | Purpose |
| ------------------------- | ------------------------------------ | ------- |
| `INTEGRATION_API_URL`     | `https://saas-api-dev.vocdoni.net`   | Target API base URL |
| `INTEGRATION_BUNDLE_ID`   | `6a2a93d3…` (dev fixture)            | Real bundle id — unlocks the bundle + login suites |
| `INTEGRATION_PROCESS_ID`  | `6be21a5a…` (dev fixture)            | A process id within that bundle (login suite) |
| `INTEGRATION_MEMBER_NUMBER` | `5`                                | Member number for the auth-only login suite |
| `INTEGRATION_PROCESS_INFO_ID` | `6a3cfc6b…`                      | Mongo id of a READY process (process-info mapping proof) |
| `INTEGRATION_ENCRYPTED_PROCESS_ID`  | `6a3e5e3e…` (dev secret election) | Mongo id of a `secretUntilTheEnd` process (info proof) |
| `INTEGRATION_API_KEY`     | —                                    | Integrator API key (`vsk_…`) — unlocks the full-flow suite |

## Suites

- **connectivity** — always runs; only needs a reachable API (`/ping` + error contract).
- **bundle** — validates the bundle shape and asserts `chainId` is present (the field
  the vote signature depends on), against a dev fixture.
- **login** — auth-only `authStep0` + membership `check` (no OTP), non-consuming, against
  a dev fixture.
- **process-info** — proves `GET /processes/{mongoId}` returns the per-question model
  (every `questions[i].upstreamId` is a vochain hex id, per-question `status`,
  `computeProcessStatus`, census fields). Non-consuming.
- **vote-encrypted** — currently `it.skip`: the new-model process read does not expose
  encryption keys yet (backend change pending; see the `TODO(encrypted)` markers).
  Re-enable when `GET /processes/{id}` surfaces the questions' encryption keys.
- **full-flow** — the entire organizer→voter lifecycle driven only by an integrator
  API key: creates a managed org, loads 100 members, reads the auto group, builds and
  publishes a group census, creates and publishes 2 processes (single-choice and
  multi-choice; a third `secretUntilTheEnd` one is TODO-gated on the backend exposing
  encryption keys) sharing that census, bundles their questions' `upstreamId`s, and has
  3 members vote per question — asserting one distinct nullifier per voter×question.
  Runs only when `INTEGRATION_API_KEY` is set. The key's org must be an **integrator**
  with scopes `managed:write` + `members:write` + `voting:write`, and quota for
  ≥2 processes / ≥300 census size. Creates real on-chain elections and votes.

The fixture-based suites (connectivity/bundle/login/process-info/vote-encrypted) run
against the dev defaults out of the box:

```bash
pnpm test:integration
```

Full-flow run (creates a real org, processes and votes):

```bash
INTEGRATION_API_KEY=vsk_… pnpm test:integration
```
