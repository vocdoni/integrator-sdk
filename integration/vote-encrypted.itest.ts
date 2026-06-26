import { buildVoteTransaction, EphemeralSigner } from '@vocdoni/api-voting'
import { fixtures, makeClient } from './helpers'

// Encrypted (`secretUntilTheEnd`) voting against a live election. Split in two:
//
//  - a NON-CONSUMING proof that runs out of the box: fetching the process by its
//    Mongo id surfaces `encryptionPublicKeys` (the backend's `encryptionKeys`
//    field) — the exact data the vote builder needs to seal a ballot.
//  - the full CONSUMING flow (auth → sign → SEAL → relay → nullifier), gated on
//    INTEGRATION_ENCRYPTED_VOTE_MEMBER because each success burns a member.

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

// Casts a REAL encrypted vote on-chain and CONSUMES the member — opt-in only.
// Set INTEGRATION_ENCRYPTED_VOTE_MEMBER to a fresh member number (1–100).
const voteMember = fixtures.encryptedVoteMember
const voteSuite =
  fixtures.encryptedBundleId && fixtures.encryptedProcessMongoId && voteMember
    ? describe
    : describe.skip

voteSuite('full encrypted vote flow (live — consumes the member)', () => {
  it('authenticates, seals the ballot, relays and resolves a nullifier', async () => {
    const client = makeClient()
    const { encryptedBundleId: bundleId, encryptedProcessMongoId } = fixtures

    // 1. Process info → on-chain id (address), chainId, and the encryption keys.
    const election = await client.elections.get(encryptedProcessMongoId)
    expect(election.electionType.secretUntilTheEnd).toBe(true)
    expect(election.address, 'process has no vochain address').toBeTruthy()
    expect(election.chainId, 'process has no chainId').toBeTruthy()
    expect(election.encryptionPublicKeys?.length, 'process has no encryption keys').toBeGreaterThan(
      0,
    )
    const processId = election.address!

    // 2. Auth-only login (memberNumber census, no OTP).
    const step0 = await client.bundle.authStep0(bundleId, { memberNumber: voteMember! })
    const authToken = step0.authToken!
    expect(authToken).toBeTruthy()

    // 3. Membership — and make sure this member hasn't already voted.
    const membership = await client.bundle.check(bundleId, { authToken, electionId: processId })
    expect(membership.belongs).toBe(true)
    expect(membership.hasVoted, `member ${voteMember} already voted — pick another`).toBe(false)

    // 4. CSP signs the ephemeral voter address (consumes the process).
    const signer = new EphemeralSigner()
    const sign = await client.bundle.sign(bundleId, {
      authToken,
      electionId: processId,
      payload: signer.address,
    })
    expect(sign.signature).toBeTruthy()

    // 5. Build + sign the protobuf vote tx, SEALING the package with the
    //    election's encryption keys, and relay it.
    const txPayload = buildVoteTransaction({
      processId,
      choices: [0],
      chainId: election.chainId!,
      signer,
      cspSignature: sign.signature!,
      cspWeight: sign.weight,
      encryptionKeys: election.encryptionPublicKeys,
    })
    const { jobId } = await client.elections.vote({ txPayload })
    expect(jobId).toBeTruthy()

    // 6. Poll the relay job for the resulting nullifier.
    const job = await client.jobs.waitFor(jobId, { timeoutMs: 90000, intervalMs: 2000 })
    expect(job.status).toBe('completed')
    expect(job.result?.voteID, 'no vote nullifier returned').toBeTruthy()
    console.info('[integration] encrypted vote cast — nullifier:', job.result?.voteID)
  }, 120000)
})
