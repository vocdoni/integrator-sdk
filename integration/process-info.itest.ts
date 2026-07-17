import { computeProcessStatus } from '@vocdoni/api-client'
import { fixtures, makeClient } from './helpers'

// Read-only proof that the multi-question remodel maps real backend data:
// fetching a process by its Mongo id returns the merged VotingProcessResponse,
// exposing each question's on-chain Vochain id as `questions[i].upstreamId` and
// its lifecycle as `questions[i].status`. The chainId a vote signs against is
// NOT on the process — it comes from the bundle info (see bundle.itest.ts).
// Non-consuming — runs out of the box against the dev fixture (override with
// INTEGRATION_PROCESS_INFO_ID).
const suite = fixtures.processMongoId ? describe : describe.skip

suite('process info (live, by mongo id)', () => {
  it('maps /processes/{mongoId} onto a multi-question process with per-question upstream ids', async () => {
    const client = makeClient()
    const election = await client.elections.get(fixtures.processMongoId)

    // The id stays the Mongo id we asked for.
    expect(election.id).toBe(fixtures.processMongoId)
    // Definition mapped onto per-question ballots.
    expect(Array.isArray(election.questions)).toBe(true)
    expect(election.questions.length, 'process has no questions').toBeGreaterThan(0)
    for (const question of election.questions) {
      // Once published, every question surfaces its Vochain process id (64-hex).
      expect(question.upstreamId, `question ${question.id} has no upstreamId`).toMatch(
        /^[0-9a-f]{64}$/i,
      )
      // Lifecycle is tracked per question now.
      expect(question.status, `question ${question.id} has no status`).toBeTruthy()
    }
    // The aggregate status derives from the per-question statuses.
    expect(computeProcessStatus(election.questions)).toBeTruthy()
    // Census info (auth fields for the login form) is on the process.
    expect(Array.isArray(election.census?.authFields)).toBe(true)

    console.info(
      `[integration] process ${election.id} → ` +
        `${election.questions.length} question(s), upstream ` +
        `${election.questions.map((q) => q.upstreamId).join(', ')} ` +
        `(status ${computeProcessStatus(election.questions)})`,
    )
  })
})
