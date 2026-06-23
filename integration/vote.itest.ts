import { buildVoteTransaction, EphemeralSigner } from '@vocdoni/api-voting'
import { fixtures, makeClient, parseJsonEnv } from './helpers'

// The full end-to-end vote. Needs a real bundle + process, participant auth data
// and a valid OTP, so it skips unless all of these are provided:
//   INTEGRATION_BUNDLE_ID, INTEGRATION_PROCESS_ID,
//   INTEGRATION_AUTH0_DATA (JSON), INTEGRATION_OTP
const ready = Boolean(
  fixtures.bundleId && fixtures.processId && fixtures.auth0Data && fixtures.otp,
)
const suite = ready ? describe : describe.skip

suite('full vote flow (live)', () => {
  it(
    'authenticates, signs and casts a vote, resolving a nullifier',
    async () => {
      const client = makeClient()
      const bundleId = fixtures.bundleId!
      const processId = fixtures.processId!

      // 1. Bundle info → chainId for signing.
      const bundle = await client.bundle.get(bundleId)
      expect(bundle.chainId, 'bundle has no chainId — cannot sign a vote').toBeTruthy()

      // 2. Auth: step 0 (identify participant) → step 1 (verify OTP).
      const step0 = await client.bundle.authStep0(
        bundleId,
        parseJsonEnv(fixtures.auth0Data) as Record<string, string>,
      )
      expect(step0.authToken).toBeTruthy()
      const step1 = await client.bundle.authStep1(bundleId, {
        authToken: step0.authToken!,
        authData: [fixtures.otp!],
      })
      const authToken = step1.authToken ?? step0.authToken!
      expect(authToken).toBeTruthy()

      // 3. Membership for this process.
      const membership = await client.bundle.check(bundleId, { authToken, electionId: processId })
      expect(membership.belongs).toBe(true)

      // 4. CSP signs the ephemeral voter address.
      const signer = new EphemeralSigner()
      const sign = await client.bundle.sign(bundleId, {
        authToken,
        electionId: processId,
        payload: signer.address,
      })
      expect(sign.signature).toBeTruthy()

      // 5. Build the signed vote tx and relay it.
      const election = await client.elections.get(processId)
      const txPayload = buildVoteTransaction({
        processId,
        choices: [0],
        chainId: bundle.chainId!,
        signer,
        cspSignature: sign.signature!,
        cspWeight: sign.weight,
        encryptionKeys: election.encryptionPublicKeys,
      })
      const { jobId } = await client.elections.vote(processId, { txPayload })
      expect(jobId).toBeTruthy()

      // 6. Poll the relay job for the resulting nullifier.
      const job = await client.jobs.waitFor(jobId, { timeoutMs: 60000, intervalMs: 2000 })
      expect(job.status).toBe('completed')
      expect(job.result?.voteID).toBeTruthy()
    },
    90000,
  )
})
