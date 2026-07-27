# Reference: @vocdoni/react-providers + @vocdoni/react-components

Two packages that work together. `react-providers` is the headless logic layer (context + hooks); `react-components` is the unstyled UI layer built on top of it.

The voter flow is process-scoped and lives in ONE provider: `ElectionProvider`
fetches the voting process, drives the per-question vote AND holds the voter's
CSP auth session (`client.processes`). `useElection()` exposes everything;
`useElectionAuth()` exposes just the session (for auth-only widgets that
shouldn't re-render on data/results updates). Query keys are exported as
`electionQueryKeys` for cache pre-seeding/invalidation.

```bash
pnpm add @vocdoni/react-providers @vocdoni/react-components
# peer deps:
pnpm add react @tanstack/react-query
```

---

## Provider tree

Providers must be nested in this order. Inner providers consume context from outer ones.

```tsx
<ClientProvider apiUrl="..." authToken={...}>
  <AuthProvider storageKey="vocdoni-auth">   {/* optional — for admin flows */}
    <OrganizationProvider address={orgAddr}> {/* optional — for org management */}
      <ElectionProvider id={processMongoId}> {/* data + auth session + voting */}
        <ActionsProvider>                    {/* optional — pause/end/cancel */}
          <YourVotingUI />
        </ActionsProvider>
      </ElectionProvider>
    </OrganizationProvider>
  </AuthProvider>
</ClientProvider>
```

For read-only views (results, status) just render `ElectionProvider` and never call the auth methods — nothing else is required.

---

## ClientProvider / useClient

Creates and owns the `VocdoniApiClient` instance. All other providers consume it.

```tsx
import { ClientProvider, useClient } from '@vocdoni/react-providers'

// Setup
<ClientProvider
  apiUrl="https://saas-api.vocdoni.net"
  authToken={() => myStore.getJwt()}  // optional; re-evaluated per request
>
  ...
</ClientProvider>

// Inside any child
const { client, apiUrl } = useClient()
// client — VocdoniApiClient (fully typed, all sub-clients available)
```

---

## AuthProvider / useAuth

Normal-SaaS-user session management — a signed-up user logging in with
email/password to drive the SDK under their own organization. Not the integrator
API-key flow, and not the voter CSP flow (that's `ElectionProvider`'s session,
read via `useElectionAuth`). Persists the JWT to `localStorage` when
`storageKey` is provided.

```tsx
import { AuthProvider, useAuth } from '@vocdoni/react-providers'

<AuthProvider storageKey="vocdoni-auth">...</AuthProvider>

const { token, isAuthenticated, login, logout, refresh } = useAuth()

await login('user@example.com', 'secret')  // email + password → JWT
logout()
await refresh()                            // re-issues the JWT using the current token
```

For authenticated calls to actually carry the JWT, wire the same token into
`ClientProvider` (e.g. `authToken={() => readTokenFromStorage()}`) so the client
sends it as Bearer.

---

## ElectionProvider / useElection

Fetches the voting process and exposes its data, results, the full vote flow AND the voter's CSP auth session. The process read is PUBLIC for published processes (drafts 404), so no API key is involved anywhere in the voter path.

```tsx
import { ElectionProvider, useElection } from '@vocdoni/react-providers'

<ElectionProvider id="<processMongoId>">...</ElectionProvider>

// Or with prefetched data (e.g. from SSR or a list view). Rendered instantly —
// no loading state — and seeded into the react-query cache as initialData, so
// the provider still refetches when the data goes stale. `id` is optional here
// (derived from election.id); at least one of the two props is required.
<ElectionProvider election={prefetchedProcess}>...</ElectionProvider>

// Tune the underlying react-query reads: `queryOptions` (election read) and
// `resultsQueryOptions` (results read). queryKey/queryFn/initialData are
// provider-owned; `enabled` is AND-ed with the provider's own guard.
<ElectionProvider
  id="<processMongoId>"
  queryOptions={{ refetchInterval: 30_000 }}        // poll for status changes
  resultsQueryOptions={{ refetchInterval: 10_000 }} // live tallies
>...</ElectionProvider>

const {
  // data
  election,      // VotingProcessResponse | null — full process with questions[]
  status,        // QuestionStatus | null — derived from all question statuses
  chainId,       // string | null — Vochain chain id votes are signed against
  results,       // VotingProcessResultsResponse | null — per-question results
  loading,       // boolean
  error,         // Error | null
  // voter auth session (also available standalone via useElectionAuth())
  authToken,     // string | null — verified CSP token; null until authenticated
  connected,     // boolean — true once the voter holds a verified authToken
  weight,        // number | null — census weight (decoded from hex)
  auth0,         // (participant: AuthRequest) => Promise<void>
  auth1,         // (solution: string | string[]) => Promise<void> — confirm 2FA OTP
  resend,        // ({ email?, phone? }) => Promise<void>
  check,         // () => Promise<ProcessCheckResponse> — per-question canVote/hasVoted
  sign,          // (electionId, address) => Promise<ElectionSignResult> — electionId = question.upstreamId
  // voting
  isInCensus,    // boolean — true if voter belongs to this process's census
  voterQuestions,// ProcessQuestionStatus[] — per-question canVote/hasVoted (empty until connected)
  hasVoted,      // boolean — true once EVERY question is voted (or right after vote())
  isAbleToVote,  // boolean — connected && isInCensus && !hasVoted
  vote,          // (encodedBallots: number[][]) => Promise<string> — per-question ballots
  voteId,        // string | null — nullifier after a successful vote
  clearVoter,    // () => void — clears the auth session and vote state
} = useElection()
```

### Voter authentication

**Auth-only census** (no 2FA): `election?.census?.twoFaFields` is empty/absent. `auth0()` sets `connected = true` immediately; skip `auth1`.

**2FA census**: `auth0()` sends the challenge; call `auth1(otp)` to confirm. `connected` becomes `true` after `auth1`.

```tsx
// Auth-only flow
await auth0({ memberNumber: '42' })
// connected === true

// 2FA flow
await auth0({ email: 'voter@example.com' })
// Show OTP input...
await auth1('123456')
// connected === true
```

`useElectionAuth()` returns just the session slice (`authToken`, `connected`, `weight`, `auth0`, `auth1`, `resend`, `check`, `sign`, `clear`) from its own context — auth-only widgets (identify forms, OTP inputs, logout buttons) using it don't re-render when election data or results update. Its `clear()` is equivalent to `clearVoter()`: clearing the session also resets the vote state.

`vote(encodedBallots, memos?)` takes one pre-encoded `number[]` per question (plus optional per-question memo strings — free-text notes like an open "Other" answer, max 256 UTF-8 bytes each, validated pre-flight; ⚠️ memos ride the envelope in cleartext even for secret questions), casts a separate Vochain vote for each, and returns the first nullifier cast by the call. In `react-components`, registering reserved `memo.{index}` fields (`memo.0`, `memo.1`, …) in the questions form collects memos automatically.

Casting is **phased** so a failure can never half-vote silently:

1. **Pre-flight** — every question is validated up front (`upstreamId` present; `secretUntilTheEnd` questions have published `encryptionKeys` — never casts cleartext). Any problem throws before anything is consumed.
2. **Resume check** — a fresh `processes.check()` marks questions already voted; they are skipped, so calling `vote()` again after a failure completes the remaining questions instead of dying on a double-vote.
3. **Sign + build** — every remaining question gets an ephemeral signer, its one-shot CSP signature (`processes.sign`), and a locally built tx. A failure here aborts with **zero** votes relayed.
4. **Relay + await** — each tx is relayed and its job awaited. A failed question doesn't abort the rest (their signatures are already consumed); if some land and some fail, `vote()` throws `PartialVoteError` (exported from `@vocdoni/react-providers`) with `succeeded: {questionId, voteId}[]` and `failed: {questionId, error}[]`, and refreshes `voterQuestions`/`hasVoted` to the on-chain truth. Catch it and offer a retry — the next `vote()` call resumes.

Use `@vocdoni/ballot` to encode ballots before calling `vote()`:

```tsx
import { encodeQuestionBallot } from '@vocdoni/ballot'

const encodedBallots = election.questions.map((q, i) =>
  encodeQuestionBallot(q, answers[i])
)
const nullifier = await vote(encodedBallots)
```

`status` is computed by `computeProcessStatus(election.questions)` from `@vocdoni/api-client`:
- Any question `ONGOING` → `ONGOING`
- All same status → that status
- All `ENDED` or `RESULTS` → `ENDED`
- Otherwise → `PROCESS_UNKNOWN`

---

## ActionsProvider / useActions

Admin lifecycle controls: pause, resume, end, cancel. Must be inside `<ElectionProvider>`.

```tsx
import { ActionsProvider, useActions } from '@vocdoni/react-providers'

<ElectionProvider id={id}>
  <ActionsProvider>
    <AdminControls />
  </ActionsProvider>
</ElectionProvider>

const { pause, resume, end, cancel, loading, error } = useActions()
await pause()    // → status 'paused'
await resume()   // → status 'ready'
await end()      // → status 'ended'
await cancel()   // → status 'canceled'
```

---

## OrganizationProvider / useOrganization

```tsx
import { OrganizationProvider, useOrganization } from '@vocdoni/react-providers'

<OrganizationProvider address={orgAddress}>...</OrganizationProvider>

// Optional: tune the underlying react-query read (queryKey/queryFn are
// provider-owned; `enabled` is AND-ed with the provider's address guard).
<OrganizationProvider address={orgAddress} queryOptions={{ staleTime: 60_000 }}>
  ...
</OrganizationProvider>

const { organization, loading, error, fetch, update } = useOrganization()
```

`organizationQueryKeys.organization(address)` is exported for cache pre-seeding/invalidation, mirroring `electionQueryKeys`.

---

## @vocdoni/react-components

Unstyled building blocks. Every component reads from the nearest provider context. Components accept standard HTML props and forward them to the root element.

```bash
pnpm add @vocdoni/react-components
```

Key election components (all from `@vocdoni/react-components`):

| Component | What it renders |
|---|---|
| `<ElectionTitle />` | `election.title` as a heading |
| `<ElectionDescription />` | `election.description` |
| `<ElectionHeader />` | Header image / media |
| `<ElectionSchedule />` | Start/end dates |
| `<ElectionStatusBadge />` | Status chip (ONGOING, PAUSED, ENDED…) |
| `<ElectionQuestions />` | Full question + choices form (calls `vote()` on submit) |
| `<VoteButton />` | Submit button; auto-disabled when `!isAbleToVote` |
| `<VoteWeight />` | Voter's census weight |
| `<ElectionResults />` | Results histogram; respects `secretUntilTheEnd` |
| `<ElectionEnvelope />` | Vote envelope / nullifier display |

Components that open a confirmation dialog (`<ElectionQuestions />` via its
`QuestionsFormProvider`, `<ActionCancel />`, `<ActionEnd />`) mount their own
`ConfirmProvider` automatically. Mount one yourself (e.g. app-wide) only to make
them share a single dialog boundary — a provider you mount takes precedence.

**Slot customization** — every component accepts a slot override for rendering:

```tsx
// Not yet documented — check packages/react-components/src/components/ for the current API
```

---

## Complete minimal voting UI

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ClientProvider,
  ElectionProvider,
  useElection,
  useElectionAuth,
} from '@vocdoni/react-providers'

const qc = new QueryClient()

function VoterAuth() {
  const { connected, auth0 } = useElectionAuth()
  if (connected) return null
  return (
    <button onClick={() => auth0({ memberNumber: '42' })}>
      Log in to vote
    </button>
  )
}

function VotingForm() {
  const { election, status, isAbleToVote, vote, hasVoted, voteId } = useElection()
  if (!election) return <p>Loading…</p>
  if (hasVoted) return <p>Your vote: {voteId}</p>
  if (status !== 'ONGOING') return <p>Voting is not open</p>

  // Process text is a language map ({ default, … }); resolve it for display.
  const text = (t: string | Record<string, string>) => (typeof t === 'string' ? t : t.default)
  const q = election.questions[0]
  return (
    <div>
      <h2>{text(q.title)}</h2>
      {q.choices.map((c) => (
        <button key={c.value} onClick={() => vote([[c.value]])} disabled={!isAbleToVote}>
          {text(c.title)}
        </button>
      ))}
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={qc}>
      <ClientProvider apiUrl="https://saas-api.vocdoni.net">
        <ElectionProvider id="<processMongoId>">
          <VoterAuth />
          <VotingForm />
        </ElectionProvider>
      </ClientProvider>
    </QueryClientProvider>
  )
}
```

---

## Cross-references

- [[integrator-sdk]] — provider nesting, vote flow overview
- [[voting]] — `VotingClient` and `choices` format details (what `useElection().vote()` calls internally)
- [[client]] — `VocdoniApiClient` and all sub-clients
