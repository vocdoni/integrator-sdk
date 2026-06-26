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
| `INTEGRATION_BUNDLE_ID`   | —                                    | Real bundle id — unlocks the bundle + vote suites |
| `INTEGRATION_PROCESS_ID`  | —                                    | A process id within that bundle (vote flow) |
| `INTEGRATION_AUTH0_DATA`  | —                                    | JSON array for auth step-0 `authData` (participant id + contact) |
| `INTEGRATION_OTP`         | —                                    | OTP / challenge solution for auth step 1 |
| `INTEGRATION_ENCRYPTED_PROCESS_ID`  | `6a3e5e3e…` (dev secret election) | Mongo id of a `secretUntilTheEnd` process (info proof) |
| `INTEGRATION_ENCRYPTED_BUNDLE_ID`   | `6a3e5e93…`                          | Bundle of that encrypted election (vote flow) |
| `INTEGRATION_ENCRYPTED_VOTE_MEMBER` | —                                    | Member number (1–100) — unlocks the encrypted vote flow (consumes it) |

## Suites

- **connectivity** — always runs; only needs a reachable API (`/ping` + error contract).
- **bundle** — runs when `INTEGRATION_BUNDLE_ID` is set; validates the bundle shape
  and asserts `chainId` is present (this is the field the vote signature depends on).
- **vote** — the full end-to-end flow (auth → sign → relay → nullifier). Runs only
  when `BUNDLE_ID`, `PROCESS_ID`, `AUTH0_DATA` and `OTP` are all provided. Because the
  OTP arrives by email/SMS, this is a manual, opt-in run.
- **vote-encrypted** — `secretUntilTheEnd` voting. The info proof (process carries
  `encryptionPublicKeys`) runs out of the box against the dev fixture; the full
  seal-and-cast flow runs only when `INTEGRATION_ENCRYPTED_VOTE_MEMBER` is set to a
  fresh member (1–100), since each success burns that member.

Example full run:

```bash
INTEGRATION_BUNDLE_ID=deadbeef… \
INTEGRATION_PROCESS_ID=cafe… \
INTEGRATION_AUTH0_DATA='["participant-id","voter@example.com"]' \
INTEGRATION_OTP=123456 \
pnpm test:integration
```
