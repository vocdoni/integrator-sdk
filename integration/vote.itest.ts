import { buildVoteTransaction, EphemeralSigner } from '@vocdoni/api-voting'
import { fixtures, makeClient } from './helpers'

// Casts a REAL vote on-chain and CONSUMES the member — opt-in only. Set
// INTEGRATION_VOTE_MEMBER to a fresh member number to run it (each successful
// run burns that member, so it is skipped by default).
//
// This is the end-to-end proof: bundle chainId → auth-only login → membership →
// CSP sign → build+sign the protobuf vote tx → relay → poll the job → nullifier.
const voteMember = process.env.INTEGRATION_VOTE_MEMBER
const suite = fixtures.bundleId && fixtures.processId && voteMember ? describe : describe.skip

suite('full vote flow (live, auth-only — consumes the member)', () => {
  it('authenticates, signs, relays and resolves a vote nullifier', async () => {
    const client = makeClient()
    const { bundleId, processId } = fixtures

    // 1. Bundle info → chainId for signing.
    const bundle = await client.bundle.get(bundleId)
    expect(bundle.chainId, 'bundle has no chainId').toBeTruthy()

    // 2. Auth-only login (pre-verified token, no OTP).
    const step0 = await client.bundle.authStep0(bundleId, { memberNumber: voteMember! })
    const authToken = step0.authToken!
    expect(authToken).toBeTruthy()

    // 3. Membership — and make sure this member hasn't already voted.
    const membership = await client.bundle.check(bundleId, { authToken, electionId: processId })
    expect(membership.belongs).toBe(true)
    expect(membership.hasVoted, `member ${voteMember} already voted — pick another`).toBe(false)

    // 4. CSP signs the ephemeral voter address (this consumes the process).
    const signer = new EphemeralSigner()
    const sign = await client.bundle.sign(bundleId, {
      authToken,
      electionId: processId,
      payload: signer.address,
    })
    expect(sign.signature).toBeTruthy()

    // 5. Build + sign the protobuf vote tx and relay it. The election is
    //    unencrypted (no process metadata / encryption keys needed).
    const txPayload = buildVoteTransaction({
      processId,
      choices: [0],
      chainId: bundle.chainId!,
      signer,
      cspSignature: sign.signature!,
      cspWeight: sign.weight,
    })
    const { jobId } = await client.elections.vote(processId, { txPayload })
    expect(jobId).toBeTruthy()

    // 6. Poll the relay job for the resulting nullifier.
    const job = await client.jobs.waitFor(jobId, { timeoutMs: 90000, intervalMs: 2000 })
    expect(job.status).toBe('completed')
    expect(job.result?.voteID, 'no vote nullifier returned').toBeTruthy()
    console.info('[integration] vote cast — nullifier:', job.result?.voteID)
  }, 120000)
})
