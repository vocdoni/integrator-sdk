# Reference: @vocdoni/react-providers + @vocdoni/react-components

Two packages that work together. `react-providers` is the headless logic layer (context + hooks); `react-components` is the unstyled UI layer built on top of it.

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
    <OrganizationProvider id={orgId}>        {/* optional — for org management */}
      <BundleProvider id={bundleId}>         {/* required for voting */}
        <ElectionProvider id={electionMongoId}>
          <ActionsProvider>                  {/* optional — pause/end/cancel */}
            <YourVotingUI />
          </ActionsProvider>
        </ElectionProvider>
      </BundleProvider>
    </OrganizationProvider>
  </AuthProvider>
</ClientProvider>
```

`ElectionProvider` can be rendered without `BundleProvider` for read-only views (results, status). The vote functionality requires `BundleProvider` as its parent.

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

Admin/organization session management. Not the voter CSP flow (that's `BundleProvider`). Persists JWT to `localStorage` when `storageKey` is provided.

```tsx
import { AuthProvider, useAuth } from '@vocdoni/react-providers'

<AuthProvider storageKey="vocdoni-auth">...</AuthProvider>

const { token, isAuthenticated, login, logout, refresh } = useAuth()

await login(address, signature)  // EIP-191 signature over a message
logout()
await refresh()                  // rotates the token using the refresh token
```

---

## BundleProvider / useBundle

Holds the voter's CSP auth session for one bundle. Exposes the full auth flow as methods.

```tsx
import { BundleProvider, useBundle } from '@vocdoni/react-providers'

<BundleProvider id="<bundleId>">...</BundleProvider>

const {
  bundle,      // Bundle | null — public bundle info (processes, census, chainId)
  chainId,     // string | null — Vochain chain id
  authToken,   // string | null — verified token; null until authenticated
  connected,   // boolean — true once the voter holds a verified authToken
  weight,      // number | null — census weight (decoded from hex)
  auth0,       // (participant: BundleAuthRequest) => Promise<void>
  auth1,       // (solution: string | string[]) => Promise<void>  — confirm 2FA OTP
  resend,      // ({ email?, phone? }) => Promise<void>
  check,       // (electionId?: string) => Promise<CheckMembershipResponse>
  sign,        // (electionId, address) => Promise<BundleSignResult>
  clear,       // () => void — reset auth state
} = useBundle()
```

**Auth-only census** (no 2FA): `bundle?.census?.twoFaFields` is empty/absent. `auth0()` sets `connected = true` immediately; skip `auth1`.

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

`useBundleOptional()` returns `undefined` instead of throwing when called outside `<BundleProvider>` — useful for components shared between voter and admin views.

---

## ElectionProvider / useElection

Fetches election data and exposes the full vote flow. Automatically uses the enclosing `BundleProvider` for auth when present.

```tsx
import { ElectionProvider, useElection } from '@vocdoni/react-providers'

<ElectionProvider id="<electionMongoId>">...</ElectionProvider>

const {
  election,      // Election | null
  loading,       // boolean
  error,         // Error | null
  connected,     // boolean — delegates to bundle.connected
  weight,        // number | null — voter census weight
  isInCensus,    // boolean — true if voter belongs to this election's census
  hasVoted,      // boolean
  isAbleToVote,  // boolean — connected && isInCensus && !hasVoted
  vote,          // (choices: number[]) => Promise<string>  — returns vote nullifier
  voteId,        // string | null — nullifier after a successful vote
  clearVoter,    // () => void — clears vote state and bundle session
} = useElection()
```

`vote(choices)` does the complete sequence: creates an ephemeral signer → CSP-signs it → builds and relays the tx → polls the job → returns the nullifier. It throws on any step failure.

```tsx
const handleSubmit = async (choices: number[]) => {
  try {
    const nullifier = await vote(choices)
    console.log('vote cast:', nullifier)
  } catch (err) {
    console.error('vote failed:', err)
  }
}
```

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

<OrganizationProvider id={orgAddress}>...</OrganizationProvider>

const { organization, loading, error } = useOrganization()
```

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
| `<ElectionStatusBadge />` | Status chip (READY, PAUSED, ENDED…) |
| `<ElectionQuestions />` | Full question + choices form (calls `vote()` on submit) |
| `<VoteButton />` | Submit button; auto-disabled when `!isAbleToVote` |
| `<VoteWeight />` | Voter's census weight |
| `<ElectionResults />` | Results histogram; respects `secretUntilTheEnd` |
| `<ElectionEnvelope />` | Vote envelope / nullifier display |

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
  BundleProvider,
  ElectionProvider,
  useElection,
  useBundle,
} from '@vocdoni/react-providers'

const qc = new QueryClient()

function VoterAuth() {
  const { connected, auth0 } = useBundle()
  if (connected) return null
  return (
    <button onClick={() => auth0({ memberNumber: '42' })}>
      Log in to vote
    </button>
  )
}

function VotingForm() {
  const { election, isAbleToVote, vote, hasVoted, voteId } = useElection()
  if (!election) return <p>Loading…</p>
  if (hasVoted) return <p>Your vote: {voteId}</p>

  // Election text is a language map ({ default, … }); resolve it for display.
  const text = (t: string | Record<string, string>) => (typeof t === 'string' ? t : t.default)
  return (
    <div>
      <h2>{text(election.questions[0].title)}</h2>
      {election.questions[0].choices.map((c, i) => (
        <button key={i} onClick={() => vote([i])} disabled={!isAbleToVote}>
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
        <BundleProvider id="<bundleId>">
          <ElectionProvider id="<electionMongoId>">
            <VoterAuth />
            <VotingForm />
          </ElectionProvider>
        </BundleProvider>
      </ClientProvider>
    </QueryClientProvider>
  )
}
```

---

## Cross-references

- [[app-sdk]] — provider nesting, vote flow overview
- [[voting]] — `VotingClient` and `choices` format details (what `useElection().vote()` calls internally)
- [[client]] — `VocdoniApiClient` and all sub-clients
