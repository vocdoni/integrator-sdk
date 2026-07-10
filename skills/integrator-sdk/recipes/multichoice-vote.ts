/**
 * Multi-choice / approval / ranked voting via @vocdoni/ballot.
 *
 * The auth + CSP-sign steps are identical to single-choice-vote.ts; only the way
 * you build `choices` differs. Rather than hand-assembling the dense/abstain
 * layout per election type, let the package do it:
 *   - inferBallotType(election) classifies the election, and
 *   - encodeBallot(election, selections) produces the exact on-chain vector.
 *
 * `selections` is number[][]: one array of chosen choice *values* per question.
 *   approval:      [[0, 2]]         approve the choices with values 0 and 2 → [1,0,1]
 *   multichoice:   [[1]]            pick value 1; empty slots → abstain sentinels
 *   budget/quad:   [[3, 0, 5]]      amount per option, in choice order
 *   single-choice: [[1],[0],[2]]    one value per question (N questions)
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-voting @vocdoni/ballot
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { encodeBallot, inferBallotType } from '@vocdoni/ballot'

const API_URL = 'https://saas-api.vocdoni.net'
const BUNDLE_ID = '<your-bundle-id>'
const ELECTION_MONGO_ID = '<election-mongo-id>'
const VOTER = { memberNumber: '42' }

// ─── Shared setup + auth (identical to single-choice-vote.ts) ────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

const bundle = await client.bundle.get(BUNDLE_ID)
if (!bundle.chainId) throw new Error('Bundle has no chainId')

const election = await client.elections.get(ELECTION_MONGO_ID)
const processId = election.address
if (!processId) throw new Error('Election has no vochain address')

const { voteType } = election
console.log('voteType:', voteType)
// voteType.maxCount     — how many elements choices must have
// voteType.maxValue     — max value per element
// voteType.uniqueChoices — true for ranked voting

const res0 = await client.bundle.authStep0(BUNDLE_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')
const authToken = res0.authToken
// (add authStep1 here for 2FA censuses — see single-choice-vote.ts)

const { belongs, hasVoted } = await client.bundle.check(BUNDLE_ID, {
  authToken,
  electionId: processId,
})
if (!belongs || hasVoted) throw new Error('Cannot vote: ineligible or already voted')

const signer = new EphemeralSigner()
const { signature, weight } = await client.bundle.sign(BUNDLE_ID, {
  authToken,
  electionId: processId,
  payload: signer.address,
})
if (!signature) throw new Error('CSP did not return a signature')

// ─── Build the vote vector with @vocdoni/ballot ──────────────────────────────
//
// inferBallotType classifies the election; encodeBallot turns high-level
// `selections` (chosen choice values per question) into the on-chain `choices`
// vector — dense 0/1 for approval, abstain-sentinel padding for multichoice, etc.

const ballotType = inferBallotType(election)
console.log('ballot type:', ballotType)

// Choose the `selections` that match how the voter answered. Substitute the real
// picked values; the examples assume a single question except single-choice.
let selections: number[][]
switch (ballotType) {
  case 'approval':
    // Approve some options by value → encodeBallot emits a dense 0/1 vector.
    // e.g. 3 choices (values 0,1,2); approve 0 and 2 → [1, 0, 1]
    selections = [[0, 2]]
    break

  case 'multichoice':
    // Pick up to voteType.maxCount options by value. When the election reserves
    // abstain room (maxValue ≥ #choices), picking fewer pads the empty slots with
    // abstain sentinels. e.g. maxCount 3 over 4 choices, pick value 1 → [1, 4, 4]
    selections = [[1]]
    break

  case 'budget':
  case 'quadratic':
    // One amount per option, in choice order.
    selections = [[3, 0, 5]]
    break

  case 'single-choice':
  default:
    // One chosen value per question (works for N-question elections too).
    selections = election.questions.map(() => [/* chosen value for this question */ 0])
    break
}

const choices = encodeBallot(election, selections)
console.log('choices:', choices)

// ─── Cast the vote ────────────────────────────────────────────────────────────

const jobId = await voting.vote({
  processId,
  chainId: bundle.chainId,
  choices,
  signer,
  cspSignature: signature,
  cspWeight: weight,
})

const job = await client.jobs.waitFor(jobId, { timeoutMs: 90_000 })
console.log('Vote cast — nullifier:', job.result?.voteID)
