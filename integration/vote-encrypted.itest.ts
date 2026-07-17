import type { EncryptionKey } from '@vocdoni/api-types'
import { fixtures, makeClient } from './helpers'

// Non-consuming proof that a `secretUntilTheEnd` election surfaces the data the
// vote builder needs to seal a ballot. In the multi-question model the secrecy
// flag lives per question (`questions[i].secretUntilTheEnd`), but the merged
// process read (`GET /processes/{id}` → VotingProcessResponse) does NOT expose
// the encryption keys yet, so the whole proof is skipped.
//
// TODO(encrypted): re-enable when encryption keys are exposed on the process read

const infoSuite = fixtures.encryptedProcessMongoId ? describe : describe.skip

infoSuite('encrypted election info (live, non-consuming)', () => {
  // TODO(encrypted): re-enable when encryption keys are exposed on the process read
  it.skip('surfaces secretUntilTheEnd + encryption keys on the merged process', async () => {
    const client = makeClient()
    const election = await client.elections.get(fixtures.encryptedProcessMongoId)

    expect(
      election.questions.some((q) => q.secretUntilTheEnd),
      'election has no secretUntilTheEnd question',
    ).toBe(true)

    // The encryption keys must be present and well-formed — without them the
    // ballot can't be sealed. Each key is a hex string at an integer index.
    // TODO(encrypted): re-enable when encryption keys are exposed on the process
    // read — VotingProcessResponse carries no keys field yet, so this placeholder
    // keeps the assertions type-checked until the backend exposes them.
    const readEncryptionKeys = (): EncryptionKey[] | undefined => undefined
    const keys = readEncryptionKeys()
    expect(keys, 'no encryption keys on a secretUntilTheEnd process').toBeTruthy()
    expect(keys!.length).toBeGreaterThan(0)
    for (const k of keys!) {
      expect(typeof k.index).toBe('number')
      expect(k.key).toMatch(/^[0-9a-f]+$/i)
    }

    console.info(
      `[integration] encrypted process ${election.id} → ${keys!.length} key(s), ` +
        `index(es) ${keys!.map((k) => k.index).join(',')}`,
    )
  })
})
