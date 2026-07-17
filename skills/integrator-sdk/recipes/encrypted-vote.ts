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
 * ⚠ STATUS: blocked on a backend change. `GET /processes/{id}` (the new
 * per-question model) does not expose the questions' encryption public keys
 * yet — they are only served by the legacy `GET /process/{id}` route. The
 * sealing path below (`encryptionKeys` → NaCl SealedBox) is implemented and
 * tested in @vocdoni/api-voting; once the backend adds the keys to the
 * process read, replace the key-sourcing step (step 2) with the real field.
 * Tracked in GAPS.md.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-types @vocdoni/api-voting
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import type { EncryptionKey } from '@vocdoni/api-types'
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

// ─── 2. Process info → find the secret question ──────────────────────────────
// Each question maps to its own upstream Vochain process (question.upstreamId),
// and encryption keys are per upstream process.

const election = await client.elections.get(ELECTION_MONGO_ID)
const question = election.questions.find((q) => q.secretUntilTheEnd)
if (!question) {
  throw new Error('No secretUntilTheEnd question — use single-choice-vote.ts instead')
}
const processId = question.upstreamId
if (!processId) throw new Error('Question has no upstreamId (process not yet published?)')

// TODO(encrypted): the new-model process read does not expose the questions'
// encryption public keys yet (backend change pending — see the STATUS note in
// the header). When it lands, source them from the question here. The keys are
// required to seal the ballot; the vote is rejected on-chain without them.
const encryptionKeys: EncryptionKey[] = []
if (encryptionKeys.length === 0) {
  throw new Error(
    'Encryption keys are not available on GET /processes/{id} yet — ' +
      'this recipe is blocked on a backend change (see header STATUS note).',
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
// The choices format is the same as for a plain question (one transaction per
// question — prefer encodeQuestionBallot from @vocdoni/ballot):
//   [0]       → single choice, option 0
//   [1, 0, 1] → multi-choice / approval
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
// question.secretUntilTheEnd === true means, in getResults(mongoId).questions[i]:
//   - finalResults stays false until the question's process ends
//   - results (string[][] histogram) stays empty until decryption completes
// After the process ends, the Vochain decrypts all sealed ballots on-chain
// and the per-question results become available via getResults().
