import { fixtures, makeClient } from './helpers'

// Auth-only census (authField "memberNumber", no 2FA): auth step 0 returns a
// pre-verified token, so login + membership check run without an OTP. These
// calls do NOT consume the member (only signing/voting does), so the suite is
// safely repeatable. Needs a real member number (defaults to the dev fixture).
const suite = fixtures.bundleId && fixtures.processId && fixtures.memberNumber ? describe : describe.skip

suite('auth-only login (live)', () => {
  it('authenticates with a member number (no OTP) and confirms membership', async () => {
    const client = makeClient()
    const { bundleId, processId, memberNumber } = fixtures

    const step0 = await client.bundle.authStep0(bundleId, { memberNumber })
    // Auth-only censuses return a pre-verified token directly from step 0.
    expect(step0.authToken, 'auth/0 returned no token').toBeTruthy()

    const membership = await client.bundle.check(bundleId, {
      authToken: step0.authToken!,
      electionId: processId,
    })
    expect(membership.belongs).toBe(true)
    expect(typeof membership.hasVoted).toBe('boolean')
  })
})
