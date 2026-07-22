/**
 * Multi-choice voting patterns.
 *
 * A process casts ONE Vochain transaction per question — this recipe loops the
 * questions reported by the process check and encodes each question's raw
 * `selections` (the voter's picks) into the on-chain `choices` array via
 * `encodeQuestionBallot`, which infers the ballot type from that question's
 * `ballotProtocol`. The auth + CSP-sign steps are identical to
 * single-choice-vote.ts; only how you build `selections` per question changes.
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

// ─── Config — handed to the voter app by the integrator's backend ────────────
// The full process read (GET /processes/{id}) is Bearer-authed; the backend
// does it server-side and passes these through. chainId has NO public route in
// the new model (see GAPS.md).

const API_URL = 'https://saas-api.vocdoni.net'
const PROCESS_ID = '<process-mongo-id>' // election.id from the backend's process read
const CHAIN_ID = '<vochain-chain-id>' // election.chainId — votes are signed against it
const VOTER = { memberNumber: '42' } // fields required by election.census.authFields

// ─── Shared setup + auth (identical to single-choice-vote.ts) ────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

const res0 = await client.processes.authStep0(PROCESS_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')
const authToken = res0.authToken
// (add authStep1 here for 2FA censuses — see single-choice-vote.ts)

// Membership + per-question eligibility in one call. Each entry carries the
// question's id and its on-chain Vochain id (upstreamId) — no authed process
// read needed to discover them.
const check = await client.processes.check(PROCESS_ID, { authToken })
if (!check.belongsToProcess) throw new Error('Voter is not in this census')

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
// question-read / CSP-sign / build-transaction / relay / poll repeat for every
// question.

for (const status of check.questions) {
  const processId = status.upstreamId
  if (!processId) {
    console.warn(`Question ${status.questionId} has no upstreamId yet (not published?) — skipping`)
    continue
  }

  const selections = SELECTIONS_BY_QUESTION[status.questionId]
  if (!selections) {
    console.warn(`No selections configured for question ${status.questionId} — skipping`)
    continue
  }

  if (!status.canVote || status.hasVoted) {
    console.log(`Cannot vote on question ${status.questionId} (ineligible or already voted) — skipping`)
    continue
  }

  // Public single-question read — choices + ballotProtocol; no API key needed.
  const question = await client.processes.getQuestion(PROCESS_ID, status.questionId)
  console.log(`Question ${question.id} ballotProtocol:`, question.ballotProtocol)
  // question.ballotProtocol.maxCount      — how many picks/slots the ballot has
  // question.ballotProtocol.maxValue      — max encoded value per element
  // question.ballotProtocol.uniqueValues  — true for ranked voting
  // question.ballotProtocol.maxTotalCost  — caps total approvals/weight, if set
  // question.typeSetup?.minChoices/maxChoices — UI-facing pick bounds, if set

  const signer = new EphemeralSigner()
  const { signature, weight } = await client.processes.sign(PROCESS_ID, {
    authToken,
    electionId: processId, // the QUESTION's vochain id (upstreamId), not PROCESS_ID
    payload: signer.address,
  })
  if (!signature) throw new Error(`CSP did not return a signature for question ${question.id}`)

  // encodeQuestionBallot infers the ballot type (single-choice / approval /
  // multichoice / ranked) from question.ballotProtocol and produces the exact
  // on-chain `choices` array — including abstain-padding for multichoice.
  const choices = encodeQuestionBallot(question, selections)

  const jobId = await voting.vote({
    processId,
    chainId: CHAIN_ID,
    choices,
    signer,
    cspSignature: signature,
    cspWeight: weight,
  })

  const job = await client.jobs.waitFor(jobId, { timeoutMs: 90_000 })
  console.log(`Vote cast on question ${question.id} — nullifier:`, job.result?.voteID)
}
