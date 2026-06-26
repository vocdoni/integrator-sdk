import { fixtures, makeClient } from './helpers'

// Non-consuming proof that a `secretUntilTheEnd` election surfaces the data the
// vote builder needs to seal a ballot: fetching the process by its Mongo id
// exposes `encryptionPublicKeys` (the backend's `encryptionKeys` field). Runs out
// of the box against the dev fixture and burns nothing.
//
// The full seal-and-cast flow (auth → sign → SEAL → relay → nullifier) is now
// covered end to end, on a freshly created secret election, by full-flow.itest.ts.

const infoSuite = fixtures.encryptedProcessMongoId ? describe : describe.skip

infoSuite('encrypted election info (live, non-consuming)', () => {
  it('surfaces secretUntilTheEnd + encryptionPublicKeys on the merged process', async () => {
    const client = makeClient()
    const election = await client.elections.get(fixtures.encryptedProcessMongoId)

    expect(election.electionType.secretUntilTheEnd, 'election is not secretUntilTheEnd').toBe(true)

    // The encryption keys must be present and well-formed — without them the
    // ballot can't be sealed. Each key is a hex string at an integer index.
    const keys = election.encryptionPublicKeys
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
