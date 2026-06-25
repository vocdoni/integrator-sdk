import { fixtures, makeClient } from './helpers'

// Read-only proof that the #551 id remodel maps real backend data: fetching a
// process by its Mongo id returns the merged info, exposing the vochain id as
// `address` and the `chainId` the vote signs against. Non-consuming — runs out
// of the box against the dev fixture (override with INTEGRATION_PROCESS_INFO_ID).
const suite = fixtures.processMongoId ? describe : describe.skip

suite('process info (live, by mongo id)', () => {
  it('maps /process/{mongoId} onto a flat election with address + chainId', async () => {
    const client = makeClient()
    const election = await client.elections.get(fixtures.processMongoId)

    // The id stays the Mongo id we asked for.
    expect(election.id).toBe(fixtures.processMongoId)
    // The vochain process id is surfaced as `address` (64-hex).
    expect(election.address, 'no vochain address on the process').toMatch(/^[0-9a-f]{64}$/i)
    // The chain id the vote must sign against.
    expect(typeof election.chainId).toBe('string')
    expect(election.chainId, 'no chainId on the process').toBeTruthy()
    // Definition mapped out of electionParams.
    expect(election.status).toBeTruthy()
    expect(Array.isArray(election.questions)).toBe(true)

    console.info(
      `[integration] process ${election.id} → address ${election.address} on ${election.chainId}`,
    )
  })
})
