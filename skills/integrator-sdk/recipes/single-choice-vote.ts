/**
 * Single-choice vote — pick one option per question.
 *
 * Ballot protocol for a plain single-choice pick:
 *   question.ballotProtocol.maxCount = 1
 *   question.ballotProtocol.maxValue = numOptions - 1
 *
 * choices[0] = 0-based index of the chosen option
 *   [0] → first option ("Yes" / option A / …)
 *   [1] → second option
 *   [N-1] → last option
 *
 * This is the most common election format and the one used by the integration tests.
 *
 * A process casts ONE Vochain transaction per question — `question.upstreamId`
 * is that question's on-chain process id. This recipe loops the questions
 * reported by the process check and votes on each one with the voter's chosen
 * option index.
 *
 * WHO PROVIDES WHAT: the full process read (`GET /processes/{id}`,
 * `client.elections.get`) is Bearer-authed — it belongs to the INTEGRATOR's
 * backend, not the voter app. The backend does that read server-side and hands
 * the voter app the config constants below (processId, chainId, census auth
 * shape). Everything else the voter needs is public or auth-token-identified:
 * the CSP flow lives on `client.processes` (ProcessesCspClient), and question
 * display data (title, choices, ballotProtocol) comes from the public
 * single-question read `client.processes.getQuestion()`. The legacy bundle
 * equivalent (`client.bundle`) only applies to organizer-created bundles.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-voting @vocdoni/ballot
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { encodeQuestionBallot } from '@vocdoni/ballot'

// ─── Config — handed to the voter app by the integrator's backend ────────────
// The backend owns the Bearer-authed process read and passes these through.
// chainId in particular has NO public route in the new model (see GAPS.md) —
// it MUST come from the backend's process read (`election.chainId`).

const API_URL = 'https://saas-api.vocdoni.net'
const PROCESS_ID = '<process-mongo-id>' // election.id from the backend's process read
const CHAIN_ID = '<vochain-chain-id>' // election.chainId — votes are signed against it
const VOTER = { memberNumber: '42' } // fields required by election.census.authFields
const CENSUS_HAS_2FA = false // election.census.twoFaFields non-empty on the backend read

// Voter's chosen option index, keyed by question id. Replace with the voter's
// real picks (e.g. collected from a UI form).
const CHOSEN_OPTION_BY_QUESTION: Record<string, number> = {
  // '<questionId>': 0,
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

// ─── 1. Auth (auth-only census — no 2FA step) ────────────────────────────────
// One auth token is obtained once and reused for every question in the process.

const res0 = await client.processes.authStep0(PROCESS_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')

let authToken = res0.authToken

if (CENSUS_HAS_2FA) {
  // Prompt for OTP here (SMS / email / TOTP)
  const otp = await promptForOtp() // your UI
  const res1 = await client.processes.authStep1(PROCESS_ID, { authToken, authData: [otp] })
  authToken = res1.authToken ?? authToken
}

// ─── 2. Check — membership + per-question eligibility in ONE call ────────────
// Unlike the legacy bundle check (one belongs/hasVoted pair per request), the
// process check reports every question at once — including each question's id
// and its on-chain Vochain id (upstreamId), so no authed process read is needed
// to discover them.

const check = await client.processes.check(PROCESS_ID, { authToken })
if (!check.belongsToProcess) throw new Error('Voter is not in this census')

// ─── 3-7. Read, sign, build, relay and poll — once per question ──────────────
// A multi-question process casts one Vochain transaction per question, so the
// question-read / CSP-sign / build-transaction / relay / poll steps repeat for
// every question.

const text = (t: string | Record<string, string>) => (typeof t === 'string' ? t : t.default)

for (const status of check.questions) {
  if (!status.canVote) {
    console.log(`Not eligible for question ${status.questionId} — skipping`)
    continue
  }
  if (status.hasVoted) {
    console.log(`Already voted on question ${status.questionId} — skipping`)
    continue
  }
  const processId = status.upstreamId
  if (!processId) {
    console.warn(`Question ${status.questionId} has no upstreamId yet (not published?) — skipping`)
    continue
  }

  // Public single-question read — title, choices, ballotProtocol; no API key.
  // (To render the questions BEFORE authenticating, have your backend hand the
  // question ids along with the config above — this read is fully public.)
  const question = await client.processes.getQuestion(PROCESS_ID, status.questionId)
  console.log(`Question ${question.id}: ${text(question.title)}`)
  for (const [ci, c] of question.choices.entries()) {
    console.log(`  [${ci}] ${text(c.title)}`)
  }

  const signer = new EphemeralSigner()
  const { signature, weight } = await client.processes.sign(PROCESS_ID, {
    authToken,
    electionId: processId, // the QUESTION's vochain id (upstreamId), not PROCESS_ID
    payload: signer.address,
  })
  if (!signature) throw new Error(`CSP did not return a signature for question ${question.id}`)

  // choices: [optionIndex] — single element, 0-based index of the chosen option.
  // encodeQuestionBallot infers the ballot type from question.ballotProtocol; for
  // a plain single-choice question it just validates and wraps the index.
  const chosenOption = CHOSEN_OPTION_BY_QUESTION[question.id] ?? 0 // ← set the voter's pick
  const choices = encodeQuestionBallot(question, [chosenOption])

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

// ─── Helpers (replace with your own) ─────────────────────────────────────────

async function promptForOtp(): Promise<string> {
  // Your UI: show an OTP input, return the string the voter typed
  throw new Error('Implement promptForOtp() with your own UI')
}
