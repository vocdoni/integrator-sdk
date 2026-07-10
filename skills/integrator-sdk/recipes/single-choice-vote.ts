/**
 * Single-choice vote — pick one option from a list.
 *
 * Election config (as created by the backend):
 *   voteType.maxCount = 1, voteType.maxValue = numOptions - 1
 *
 * The on-chain `choices` vector is built by encodeBallot (@vocdoni/ballot): you
 * pass high-level selections — the chosen choice *value* per question — and it
 * returns the array to relay. For single-choice it is 1:1:
 *   encodeBallot(election, [[value]]) → [value]
 *
 * This is the most common election format and the one used by the integration tests.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-voting @vocdoni/ballot
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { encodeBallot } from '@vocdoni/ballot'

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = 'https://saas-api.vocdoni.net'
const BUNDLE_ID = '<your-bundle-id>'
const ELECTION_MONGO_ID = '<election-mongo-id>'
const VOTER = { memberNumber: '42' } // fields required by bundle.census.authFields

// ─── Setup ───────────────────────────────────────────────────────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

// ─── 1. Bundle info → chainId ────────────────────────────────────────────────

const bundle = await client.bundle.get(BUNDLE_ID)
if (!bundle.chainId) throw new Error('Bundle has no chainId')

// ─── 2. Fetch election → vochain processId ───────────────────────────────────
// elections.get() merges the vochain data (address, chainId, encryptionPublicKeys)
// into the Mongo record. Use election.address (not election.id) for voting.

const election = await client.elections.get(ELECTION_MONGO_ID)
const processId = election.address // hex vochain id
if (!processId) throw new Error('Election has no vochain address (not yet published?)')

// Log the available options so we can pick one. Election text is a language map
// ({ default, … }), so resolve it rather than casting to string.
const text = (t: string | Record<string, string>) => (typeof t === 'string' ? t : t.default)
console.log('Questions:')
for (const [qi, q] of election.questions.entries()) {
  console.log(`  Q${qi}: ${text(q.title)}`)
  for (const [ci, c] of q.choices.entries()) {
    console.log(`    [${ci}] ${text(c.title)}`)
  }
}

// ─── 3. Auth (auth-only census — no 2FA step) ────────────────────────────────
// For a 2FA census: call authStep0() then authStep1(otp).
// Detect auth type: bundle.census.twoFaFields is empty/absent → auth-only.

const isAuthOnly = (bundle.census?.twoFaFields?.length ?? 0) === 0

const res0 = await client.bundle.authStep0(BUNDLE_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')

let authToken = res0.authToken

if (!isAuthOnly) {
  // Prompt for OTP here (SMS / email / TOTP)
  const otp = await promptForOtp() // your UI
  const res1 = await client.bundle.authStep1(BUNDLE_ID, { authToken, authData: [otp] })
  authToken = res1.authToken ?? authToken
}

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

// ─── 6. Cast the vote ────────────────────────────────────────────────────────
// encodeBallot builds the on-chain `choices` vector from high-level selections.
// For single-choice, selections is [[chosenValue]] — one array holding the
// `value` of the choice the voter picked. Read it from the election's choices
// rather than assuming value === display position.

const CHOSEN_VALUE = election.questions[0].choices[0].value // ← the choice the voter picked

const jobId = await voting.vote({
  processId,
  chainId: bundle.chainId,
  choices: encodeBallot(election, [[CHOSEN_VALUE]]),
  signer,
  cspSignature: signature,
  cspWeight: weight,
})

// ─── 7. Poll for the nullifier ───────────────────────────────────────────────

const job = await client.jobs.waitFor(jobId, { timeoutMs: 90_000 })
console.log('Vote cast — nullifier:', job.result?.voteID)

// ─── Helpers (replace with your own) ─────────────────────────────────────────

async function promptForOtp(): Promise<string> {
  // Your UI: show an OTP input, return the string the voter typed
  throw new Error('Implement promptForOtp() with your own UI')
}
