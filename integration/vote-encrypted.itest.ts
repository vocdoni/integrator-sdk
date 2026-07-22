import { fixtures, makeClient } from './helpers'

// Non-consuming proof that a `secretUntilTheEnd` election surfaces the data the
// vote builder needs to seal a ballot. Since saas-backend#594 the encryption
// keys live per question — on the Bearer-authed process read and on the PUBLIC
// single-question read — so this proof runs fully unauthenticated: the public
// results read (`GET /processes/{id}/results`) reveals the question ids, and the
// public question read (`GET /processes/{id}/questions/{qId}`) carries
// `secretUntilTheEnd` + `encryptionKeys`.

const infoSuite = fixtures.encryptedProcessMongoId ? describe : describe.skip

infoSuite('encrypted election info (live, non-consuming)', () => {
  it('surfaces secretUntilTheEnd + encryption keys on the public question read', async () => {
    const client = makeClient()
    const mongoId = fixtures.encryptedProcessMongoId

    // Public results read → one entry per published question, with questionId.
    const { questions: resultEntries } = await client.elections.getResults(mongoId)
    expect(resultEntries.length, 'process has no published questions').toBeGreaterThan(0)

    // Public single-question reads → secrecy flag + keys.
    const questions = await Promise.all(
      resultEntries.map((r) => client.processes.getQuestion(mongoId, r.questionId)),
    )
    const secret = questions.filter((q) => q.secretUntilTheEnd)
    expect(secret.length, 'election has no secretUntilTheEnd question').toBeGreaterThan(0)

    // The encryption keys must be present and well-formed — without them the
    // ballot can't be sealed. Each key is a hex string at an integer index.
    // The keykeepers publish them asynchronously after publish; on a live
    // fixture they must have appeared long ago, so absence here is a failure.
    for (const q of secret) {
      const keys = q.encryptionKeys
      expect(keys, `no encryption keys on secret question ${q.id}`).toBeTruthy()
      expect(keys!.length).toBeGreaterThan(0)
      for (const k of keys!) {
        expect(typeof k.index).toBe('number')
        expect(k.key).toMatch(/^[0-9a-f]+$/i)
      }
      console.info(
        `[integration] secret question ${q.id} → ${keys!.length} key(s), ` +
          `index(es) ${keys!.map((k) => k.index).join(',')}`,
      )
    }
  })
})
