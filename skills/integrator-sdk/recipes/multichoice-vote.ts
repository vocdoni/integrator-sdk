/**
 * Multi-choice voting patterns.
 *
 * A process casts ONE Vochain transaction per question — this recipe loops
 * `election.questions` and encodes each question's raw `selections` (the
 * voter's picks) into the on-chain `choices` array via `encodeQuestionBallot`,
 * which infers the ballot type from that question's `ballotProtocol`. The
 * auth + CSP-sign steps are identical to single-choice-vote.ts; only how you
 * build `selections` per question changes.
 *
 * ─── Format A: Single choice, pick one option ─────────────────────────────
 *   question.ballotProtocol.maxCount = 1
 *   question.ballotProtocol.maxValue = numOptions - 1
 *   selections = [optionIndex]   (the 0-based index of the chosen option)
 *
 * ─── Format B: Approval voting (binary per option) ────────────────────────
 *   question.ballotProtocol.maxCount = numOptions
 *   question.ballotProtocol.maxValue = 1
 *   selections = the option indexes the voter approved, e.g. [0, 2, 4]
 *   encodeQuestionBallot turns that into the dense 0/1 vector expected on-chain.
 *   question.ballotProtocol.maxTotalCost, if set, caps the number of approvals.
 *
 * ─── Format C: Ranked voting (unique values) ──────────────────────────────
 *   question.ballotProtocol.maxCount = numOptions
 *   question.ballotProtocol.uniqueValues = true
 *   selections = rank value per option in choice order, e.g. [2, 0, 3, 1]
 *   (must be a permutation of 0..numOptions-1 — no repeated ranks)
 *
 * ─── Format D: Multichoice (pick up to N options) ─────────────────────────
 *   question.ballotProtocol.maxCount = maximum number of picks allowed
 *   selections = the option indexes the voter picked, e.g. [1, 3]
 *   encodeQuestionBallot pads any unpicked slots with abstain sentinels for you
 *   when the question's ballotProtocol reserves room for them.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-voting @vocdoni/ballot
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { encodeQuestionBallot } from '@vocdoni/ballot'

const API_URL = 'https://saas-api.vocdoni.net'
const BUNDLE_ID = '<your-bundle-id>'
const ELECTION_MONGO_ID = '<election-mongo-id>'
const VOTER = { memberNumber: '42' }

// ─── Shared setup + auth (identical to single-choice-vote.ts) ────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

const bundle = await client.bundle.get(BUNDLE_ID)
if (!bundle.chainId) throw new Error('Bundle has no chainId')

// elections.get() returns a VotingProcessResponse: one process, many questions.
// Each question is its own on-chain Vochain process (question.upstreamId).
const election = await client.elections.get(ELECTION_MONGO_ID)

const res0 = await client.bundle.authStep0(BUNDLE_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')
const authToken = res0.authToken
// (add authStep1 here for 2FA censuses — see single-choice-vote.ts)

const { belongs } = await client.bundle.check(BUNDLE_ID, { authToken })
if (!belongs) throw new Error('Voter is not in this census')

// ─── Per-question selections ──────────────────────────────────────────────
// Replace this with however your UI collects the voter's picks. Each entry is
// the RAW selections for that question (see the Format A-D comments above) —
// encodeQuestionBallot maps them to the on-chain `choices` array using that
// question's ballotProtocol.

const SELECTIONS_BY_QUESTION: Record<string, number[]> = {
  // Format A — single choice: pick option 2
  // '<questionId>': [2],

  // Format B — approval: approve options 0, 2 and 4
  // '<questionId>': [0, 2, 4],

  // Format C — ranked: 4 options ranked 3rd, 1st, 4th, 2nd (0-indexed ranks 2,0,3,1)
  // '<questionId>': [2, 0, 3, 1],

  // Format D — multichoice: pick options 1 and 3 (out of maxCount slots)
  // '<questionId>': [1, 3],
}

// ─── Vote — once per question ──────────────────────────────────────────────
// A multi-question process casts one Vochain transaction per question, so
// CSP-sign / build-transaction / relay / poll repeat for every question.

for (const question of election.questions) {
  const processId = question.upstreamId
  if (!processId) {
    console.warn(`Question ${question.id} has no upstreamId yet (not published?) — skipping`)
    continue
  }

  const selections = SELECTIONS_BY_QUESTION[question.id]
  if (!selections) {
    console.warn(`No selections configured for question ${question.id} — skipping`)
    continue
  }

  console.log(`Question ${question.id} ballotProtocol:`, question.ballotProtocol)
  // question.ballotProtocol.maxCount      — how many picks/slots the ballot has
  // question.ballotProtocol.maxValue      — max encoded value per element
  // question.ballotProtocol.uniqueValues  — true for ranked voting
  // question.ballotProtocol.maxTotalCost  — caps total approvals/weight, if set
  // question.typeSetup?.minChoices/maxChoices — UI-facing pick bounds, if set

  // hasVoted is reported per question when `electionId` is passed to check().
  const { hasVoted } = await client.bundle.check(BUNDLE_ID, { authToken, electionId: processId })
  if (hasVoted) {
    console.log(`Already voted on question ${question.id} — skipping`)
    continue
  }

  const signer = new EphemeralSigner()
  const { signature, weight } = await client.bundle.sign(BUNDLE_ID, {
    authToken,
    electionId: processId,
    payload: signer.address,
  })
  if (!signature) throw new Error(`CSP did not return a signature for question ${question.id}`)

  // encodeQuestionBallot infers the ballot type (single-choice / approval /
  // multichoice / ranked) from question.ballotProtocol and produces the exact
  // on-chain `choices` array — including abstain-padding for multichoice.
  const choices = encodeQuestionBallot(question, selections)

  const jobId = await voting.vote({
    processId,
    chainId: bundle.chainId,
    choices,
    signer,
    cspSignature: signature,
    cspWeight: weight,
  })

  const job = await client.jobs.waitFor(jobId, { timeoutMs: 90_000 })
  console.log(`Vote cast on question ${question.id} — nullifier:`, job.result?.voteID)
}
