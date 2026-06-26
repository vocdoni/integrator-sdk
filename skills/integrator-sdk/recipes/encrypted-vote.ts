/**
 * Encrypted vote — secretUntilTheEnd elections.
 *
 * The ballot is sealed with the election's curve25519 public keys (NaCl SealedBox)
 * before being submitted. The Vochain holds the private keys in escrow until the
 * election ends, at which point it decrypts and tallies all ballots atomically.
 *
 * The only difference from a plain vote is passing `encryptionKeys` to
 * buildVoteTransaction (or VotingClient.vote). Everything else — auth, sign,
 * relay, job polling — is identical.
 *
 * choices format: same as single-choice-vote.ts or multichoice-vote.ts; the
 * encryption is transparent to the choices encoding.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-voting
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'

const API_URL = 'https://saas-api.vocdoni.net'
const BUNDLE_ID = '<your-bundle-id>'
const ELECTION_MONGO_ID = '<election-mongo-id>'
const VOTER = { memberNumber: '42' }

// ─── Setup ───────────────────────────────────────────────────────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

// ─── 1. Bundle info → chainId ────────────────────────────────────────────────

const bundle = await client.bundle.get(BUNDLE_ID)
if (!bundle.chainId) throw new Error('Bundle has no chainId')

// ─── 2. Election info → verify encryption keys are present ───────────────────
// elections.get() merges vochain data including encryptionPublicKeys.
// These keys are required to seal the ballot; the vote will be rejected
// on-chain if they are absent or malformed.

const election = await client.elections.get(ELECTION_MONGO_ID)
const processId = election.address
if (!processId) throw new Error('Election has no vochain address (not yet published?)')

if (!election.electionType.secretUntilTheEnd) {
  throw new Error('This election is not secretUntilTheEnd — use single-choice-vote.ts instead')
}

const encryptionKeys = election.encryptionPublicKeys
if (!encryptionKeys || encryptionKeys.length === 0) {
  throw new Error(
    'Election is secretUntilTheEnd but has no encryptionPublicKeys. ' +
      'The backend may not have published the election yet, or the process mapper ' +
      'failed to include the encryptionKeys field.',
  )
}

console.log(
  `Encryption keys: ${encryptionKeys.length} key(s), ` +
    `index(es) ${encryptionKeys.map((k) => k.index).join(', ')}`,
)
// Each key: { index: number, key: string (hex curve25519 public key) }
// Multiple keys are applied innermost-first (ascending index order).

// ─── 3. Auth ─────────────────────────────────────────────────────────────────

const res0 = await client.bundle.authStep0(BUNDLE_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')
const authToken = res0.authToken
// For 2FA censuses, also call authStep1 — see single-choice-vote.ts.

// ─── 4. Check membership ─────────────────────────────────────────────────────

const { belongs, hasVoted } = await client.bundle.check(BUNDLE_ID, {
  authToken,
  electionId: processId,
})
if (!belongs) throw new Error('Voter is not in this census')
if (hasVoted) throw new Error('Voter has already voted in this election')

// ─── 5. CSP sign ─────────────────────────────────────────────────────────────

const signer = new EphemeralSigner()
const { signature, weight } = await client.bundle.sign(BUNDLE_ID, {
  authToken,
  electionId: processId,
  payload: signer.address,
})
if (!signature) throw new Error('CSP did not return a signature')

// ─── 6. Cast the encrypted vote ──────────────────────────────────────────────
// Pass encryptionKeys — buildVoteTransaction seals the ballot automatically.
// The NaCl SealedBox uses ephemeralPublicKey(32) || box layout.
// If multiple keys are present, they are applied in ascending index order.
//
// The choices format is the same as for a plain election:
//   [0]       → single choice, option 0
//   [1, 0, 1] → multi-choice / approval
//   [2, 0, 1] → multi-question
// See single-choice-vote.ts and multichoice-vote.ts for format details.

const jobId = await voting.vote({
  processId,
  chainId: bundle.chainId,
  choices: [0], // ← voter's choice(s); same format as unencrypted elections
  signer,
  cspSignature: signature,
  cspWeight: weight,
  encryptionKeys, // ← triggers NaCl sealing; omit for unencrypted elections
})

// ─── 7. Poll for the nullifier ───────────────────────────────────────────────

const job = await client.jobs.waitFor(jobId, { timeoutMs: 90_000 })
console.log('Encrypted vote cast — nullifier:', job.result?.voteID)

// ─── Note on result reading ───────────────────────────────────────────────────
// election.electionType.secretUntilTheEnd === true means:
//   - election.finalResults will be false until the election ends
//   - election.results will be null / empty until decryption completes
// After the election ends, the Vochain decrypts all sealed ballots on-chain
// and the results become available via client.elections.getResults(mongoId).
