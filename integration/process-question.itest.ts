import { fixtures, makeClient } from './helpers'

// Read-only proof of the bundle-less voter surface: the public question read
// (`GET /processes/{id}/questions/{qId}`) exposed via `client.processes` returns
// the choices, ballotProtocol and census auth config a voter UI needs, without
// an API key. Question ids are discovered through the public results read
// (`elections.get` is a protected read since saas-backend#582 — a voter app
// can't call it). Non-consuming — runs out of the box against the dev fixture
// (override with INTEGRATION_PROCESS_INFO_ID). Voter auth/check/sign against a
// live census are covered by full-flow.itest.ts follow-up work, not here.
const suite = fixtures.processMongoId ? describe : describe.skip

suite('process question (live, public voter read)', () => {
  it('reads a single question through client.processes.getQuestion', async () => {
    const client = makeClient()
    const { questions: resultEntries } = await client.elections.getResults(fixtures.processMongoId)
    expect(resultEntries.length, 'fixture process has no published questions').toBeGreaterThan(0)

    const questionId = resultEntries[0].questionId
    const question = await client.processes.getQuestion(fixtures.processMongoId, questionId)

    expect(question.id).toBe(questionId)
    expect(question.parentProcessId).toBe(fixtures.processMongoId)
    // Published questions expose their Vochain election id — the `electionId`
    // the CSP sign request takes.
    expect(question.upstreamId).toMatch(/^[0-9a-f]{64}$/i)
    expect(Array.isArray(question.choices)).toBe(true)
    expect(question.ballotProtocol, 'question has no ballotProtocol').toBeTruthy()
    // Cleartext elections never carry encryptionKeys; secretUntilTheEnd ones
    // only do once the keykeepers publish (absent = poll again).
    if (!question.secretUntilTheEnd) {
      expect(question.encryptionKeys).toBeUndefined()
    }

    console.info(
      `[integration] question ${question.id} → upstream ${question.upstreamId} ` +
        `(${question.choices.length} choice(s), secret=${question.secretUntilTheEnd})`,
    )
  })
})
