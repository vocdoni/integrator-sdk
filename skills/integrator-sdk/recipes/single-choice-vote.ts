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
 * is that question's on-chain process id. This recipe loops `election.questions`
 * and votes on each one with the voter's chosen option index.
 *
 * Everything a voter needs comes from the process's Mongo id — no bundle. The
 * voter CSP flow lives on `client.processes` (ProcessesCspClient); the legacy
 * bundle equivalent (`client.bundle`) only applies to organizer-created bundles.
 *
 * Prerequisites:
 *   pnpm add @vocdoni/api-client @vocdoni/api-voting @vocdoni/ballot
 */

import { VocdoniApiClient } from '@vocdoni/api-client'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { encodeQuestionBallot } from '@vocdoni/ballot'

// ─── Config ──────────────────────────────────────────────────────────────────

const API_URL = 'https://saas-api.vocdoni.net'
const PROCESS_ID = '<process-mongo-id>' // the id elections.get() takes
const VOTER = { memberNumber: '42' } // fields required by election.census.authFields

// Voter's chosen option index, keyed by question id. Replace with the voter's
// real picks (e.g. collected from a UI form).
const CHOSEN_OPTION_BY_QUESTION: Record<string, number> = {
  // '<questionId>': 0,
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const client = new VocdoniApiClient({ apiUrl: API_URL })
const voting = new VotingClient({ client })

// ─── 1. Fetch the process → chainId + per-question Vochain ids ───────────────
// elections.get() returns a VotingProcessResponse: one process, many questions.
// Each question is its own on-chain Vochain process; question.upstreamId is its
// hex process id (undefined until that question is published). The chainId the
// votes sign against is on the process read too.

const election = await client.elections.get(PROCESS_ID)
if (!election.chainId) throw new Error('Process has no chainId (not published yet?)')

// Log the available options so we can pick one per question. Election text is a
// language map ({ default, … }), so resolve it rather than casting to string.
const text = (t: string | Record<string, string>) => (typeof t === 'string' ? t : t.default)
console.log('Questions:')
for (const [qi, q] of election.questions.entries()) {
  console.log(`  Q${qi} (${q.id}): ${text(q.title)}`)
  for (const [ci, c] of q.choices.entries()) {
    console.log(`    [${ci}] ${text(c.title)}`)
  }
}

// ─── 2. Auth (auth-only census — no 2FA step) ────────────────────────────────
// For a 2FA census: call authStep0() then authStep1(otp).
// Detect auth type: election.census.twoFaFields is empty/absent → auth-only.
// One auth token is obtained once and reused for every question in the process.

const isAuthOnly = (election.census?.twoFaFields?.length ?? 0) === 0

const res0 = await client.processes.authStep0(PROCESS_ID, VOTER)
if (!res0.authToken) throw new Error('Auth step 0 did not return a token')

let authToken = res0.authToken

if (!isAuthOnly) {
  // Prompt for OTP here (SMS / email / TOTP)
  const otp = await promptForOtp() // your UI
  const res1 = await client.processes.authStep1(PROCESS_ID, { authToken, authData: [otp] })
  authToken = res1.authToken ?? authToken
}

// ─── 3. Check — membership + per-question eligibility in ONE call ────────────
// Unlike the legacy bundle check (one belongs/hasVoted pair per request), the
// process check reports every question's canVote/hasVoted at once.

const check = await client.processes.check(PROCESS_ID, { authToken })
if (!check.belongsToProcess) throw new Error('Voter is not in this census')
const statusByQuestion = new Map(check.questions.map((q) => [q.questionId, q]))

// ─── 4-7. Sign, build, relay and poll — once per question ───────────────────
// A multi-question process casts one Vochain transaction per question, so the
// CSP-sign / build-transaction / relay / poll steps repeat for every question.

for (const question of election.questions) {
  const processId = question.upstreamId
  if (!processId) {
    console.warn(`Question ${question.id} has no upstreamId yet (not published?) — skipping`)
    continue
  }

  const status = statusByQuestion.get(question.id)
  if (!status?.canVote) {
    console.log(`Not eligible for question ${question.id} — skipping`)
    continue
  }
  if (status.hasVoted) {
    console.log(`Already voted on question ${question.id} — skipping`)
    continue
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
    chainId: election.chainId,
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
