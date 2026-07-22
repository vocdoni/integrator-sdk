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
 * Key sourcing: `question.encryptionKeys` — on the process read
 * (elections.get) and on the public single-question read
 * (processes.getQuestion). The keykeepers publish the keys asynchronously
 * right after publish, and the field is ABSENT (not an empty array) until
 * then — treat absence as "not yet published" and poll.
 *
 * choices format: same as single-choice-vote.ts or multichoice-vote.ts; the
 * encryption is transparent to the choices encoding.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-types @vocdoni/api-voting
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import type { EncryptionKey } from '@vocdoni/api-types'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'

const API_URL = 'https://saas-api.vocdoni.net'
const PROCESS_ID = '<process-mongo-id>' // the id elections.get() takes
const VOTER = { memberNumber: '42' }

// ─── Setup ───────────────────────────────────────────────────────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

// ─── 1. Process info → chainId + the secret question ─────────────────────────
// Each question maps to its own upstream Vochain process (question.upstreamId),
// and encryption keys are per question/upstream process.

const election = await client.elections.get(PROCESS_ID)
if (!election.chainId) throw new Error('Process has no chainId (not published yet?)')

const question = election.questions.find((q) => q.secretUntilTheEnd)
if (!question) {
  throw new Error('No secretUntilTheEnd question — use single-choice-vote.ts instead')
}
const processId = question.upstreamId
if (!processId) throw new Error('Question has no upstreamId (process not yet published?)')

// ─── 2. Encryption keys — poll the public question read until published ──────
// Right after publish the keykeepers may not have published the keys yet; the
// field is absent (not an empty array) until they do. The public question read
// needs no API key, so a voter UI can poll it directly.

const encryptionKeys = await pollEncryptionKeys(PROCESS_ID, question.id)
console.log(
  `Encryption keys: ${encryptionKeys.length} key(s), ` +
    `index(es) ${encryptionKeys.map((k) => k.index).join(', ')}`,
)
// Each key: { index: number, key: string (hex curve25519 public key) }
// Multiple keys are applied innermost-first (ascending index order).

// ─── 3. Auth ─────────────────────────────────────────────────────────────────

const res0 = await client.processes.authStep0(PROCESS_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')
const authToken = res0.authToken
// For 2FA censuses, also call authStep1 — see single-choice-vote.ts.

// ─── 4. Check membership + eligibility ───────────────────────────────────────

const check = await client.processes.check(PROCESS_ID, { authToken })
if (!check.belongsToProcess) throw new Error('Voter is not in this census')
const status = check.questions.find((q) => q.questionId === question.id)
if (!status?.canVote) throw new Error('Voter is not eligible for this question')
if (status.hasVoted) throw new Error('Voter has already voted in this election')

// ─── 5. CSP sign ─────────────────────────────────────────────────────────────

const signer = new EphemeralSigner()
const { signature, weight } = await client.processes.sign(PROCESS_ID, {
  authToken,
  electionId: processId, // the QUESTION's vochain id (upstreamId)
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
  chainId: election.chainId,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function pollEncryptionKeys(
  procId: string,
  questionId: string,
  { intervalMs = 2_000, timeoutMs = 60_000 } = {},
): Promise<EncryptionKey[]> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const q = await client.processes.getQuestion(procId, questionId)
    if (q.encryptionKeys?.length) return q.encryptionKeys
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the keykeepers to publish the encryption keys')
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
