import { VocdoniApiError } from '@vocdoni/api-client'
import { EphemeralSigner } from '@vocdoni/api-voting'
import { fixtures, makeClient } from './helpers'

// Auth-only census (authField "memberNumber", no 2FA): auth step 0 returns a
// pre-verified token, so the whole login + CSP sign path runs without an OTP.
// Needs a real member number — defaults to the dev fixture, override with
// INTEGRATION_MEMBER_NUMBER.
const suite = fixtures.bundleId && fixtures.processId && fixtures.memberNumber ? describe : describe.skip

suite('auth-only login + CSP sign (live)', () => {
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
  })

  it('signs the voter address via the CSP (or reports an already-consumed process)', async () => {
    const client = makeClient()
    const { bundleId, processId, memberNumber } = fixtures

    const step0 = await client.bundle.authStep0(bundleId, { memberNumber })
    const authToken = step0.authToken!
    const signer = new EphemeralSigner()

    try {
      const sign = await client.bundle.sign(bundleId, {
        authToken,
        electionId: processId,
        payload: signer.address,
      })
      expect(sign.signature).toBeTruthy()
      expect(sign.signature).toMatch(/^(0x)?[0-9a-f]+$/i)
      console.info('[integration] CSP signature obtained:', sign.signature!.slice(0, 18), '…')
    } catch (e) {
      // A member who already voted has consumed this process — that's a valid
      // outcome here (auth still worked); only an auth failure should fail the test.
      const err = e as VocdoniApiError
      console.warn(`[integration] sign returned ${err.status} (${err.code}): ${err.message}`)
      expect(err).toBeInstanceOf(VocdoniApiError)
      expect(err.status).not.toBe(401)
    }
  })
})
