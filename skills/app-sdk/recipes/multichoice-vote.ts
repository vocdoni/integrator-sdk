/**
 * Multi-choice voting patterns.
 *
 * This recipe shows four distinct choices formats — pick the one that matches
 * the election's voteType configuration. The auth + CSP-sign steps are identical
 * to single-choice-vote.ts; only the `choices` array changes.
 *
 * ─── Format A: Multi-question, one choice per question ───────────────────────
 *   voteType.maxCount = numQuestions
 *   voteType.maxValue = maxOptionsPerQuestion - 1
 *   choices = [q0OptionIndex, q1OptionIndex, q2OptionIndex, ...]
 *   Each element is the 0-based index of the chosen option for that question.
 *
 * ─── Format B: Approval voting (binary per option) ───────────────────────────
 *   voteType.maxCount = numOptions
 *   voteType.maxValue = 1
 *   choices = [1, 0, 1, 0, ...]   (1 = approved, 0 = not approved)
 *   maxTotalCost / minTotalCost enforce min/max number of approvals on-chain.
 *
 * ─── Format C: Ranked voting (unique values) ─────────────────────────────────
 *   voteType.maxCount = numOptions
 *   voteType.maxValue = numOptions - 1
 *   voteType.uniqueChoices = true
 *   choices = [rank0, rank1, rank2, ...]   (each rank used at most once)
 *
 * ─── Format D: Multi-question multi-choice (pick N per question) ─────────────
 *   Each question is independently an "approval" ballot:
 *   choices covers all options across all questions as a flat binary array.
 *   (Exact layout depends on backend election configuration.)
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

// ─── Format A: Multi-question, one choice per question ───────────────────────
//
// Election has N questions, each with their own options.
// choices.length === election.questions.length
//
// Example: 3 questions, voter picks option 2 for Q0, option 0 for Q1, option 1 for Q2.

const choicesA = [2, 0, 1]
// Validate
if (choicesA.length !== election.questions.length) {
  throw new Error(`Expected ${election.questions.length} choices, got ${choicesA.length}`)
}

// ─── Format B: Approval voting ───────────────────────────────────────────────
//
// One binary element per option: 1 = approved, 0 = not approved.
// choices.length === voteType.maxCount === numOptions
//
// Example: 5 options, voter approves options 0, 2, and 4.

const numOptions = voteType.maxCount // for approval elections, maxCount = numOptions
const approved = new Set([0, 2, 4])
const choicesB = Array.from({ length: numOptions }, (_, i) => (approved.has(i) ? 1 : 0))
// → [1, 0, 1, 0, 1]

// Validate: each element must be 0 or 1 (maxValue = 1)
for (const v of choicesB) {
  if (v !== 0 && v !== 1) throw new Error('Approval votes must be 0 or 1')
}
// The on-chain maxTotalCost/minTotalCost will reject ballots with too few/many approvals.

// ─── Format C: Ranked voting ─────────────────────────────────────────────────
//
// Assign each option a unique rank (0 = lowest / last, maxValue = highest / first).
// choices.length === voteType.maxCount === numOptions
// voteType.uniqueChoices === true
//
// Example: 4 candidates, ranked 3rd, 1st, 4th, 2nd (1-indexed = rank values 2, 0, 3, 1)

const choicesC = [2, 0, 3, 1] // ranks for each option (0-based, must all be unique)

// Validate uniqueness
const ranks = new Set(choicesC)
if (ranks.size !== choicesC.length) throw new Error('Ranked vote has duplicate values')
for (const v of choicesC) {
  if (v < 0 || v > voteType.maxValue) throw new Error(`Rank ${v} out of range`)
}

// ─── Format D: Multi-question multi-choice (pick N per question) ──────────────
//
// This is less common and depends heavily on backend election configuration.
// The backend typically flattens all options across questions into a single
// binary array. The exact layout is determined by how the election was created.
//
// Example: 2 questions × 3 options each → 6 elements total.
//   Q0: options 0..2 → elements [0, 1, 2]
//   Q1: options 0..2 → elements [3, 4, 5]
// Voter approves Q0-option1, Q1-option0 and Q1-option2:

const choicesD = [0, 1, 0, 1, 0, 1]
// → Q0: [0,1,0] approve only option 1
// → Q1: [1,0,1] approve options 0 and 2

// ─── Cast the vote with the appropriate choices array ─────────────────────────
// Replace `choicesA` below with whichever format matches your election.

const jobId = await voting.vote({
  processId,
  chainId: bundle.chainId,
  choices: choicesA, // ← swap for choicesB, choicesC, or choicesD as needed
  signer,
  cspSignature: signature,
  cspWeight: weight,
})

const job = await client.jobs.waitFor(jobId, { timeoutMs: 90_000 })
console.log('Vote cast — nullifier:', job.result?.voteID)
