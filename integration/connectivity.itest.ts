import { VocdoniApiError } from '@vocdoni/api-client'
import { API_URL, makeClient } from './helpers'

// These run unconditionally — they need no fixtures, only a reachable API.
describe('SaaS API connectivity', () => {
  it(`reaches ${API_URL}/ping`, async () => {
    const res = await fetch(`${API_URL}/ping`)
    expect(res.status).toBe(200)
  })

  it('rejects an invalid bundle id with a 400 VocdoniApiError', async () => {
    let err: unknown
    try {
      await makeClient().bundle.get('not-a-real-bundle')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(VocdoniApiError)
    expect((err as VocdoniApiError).status).toBe(400)
    // surfaced from the API's `{ error, code }` body
    expect(typeof (err as VocdoniApiError).message).toBe('string')
    expect((err as VocdoniApiError).message.length).toBeGreaterThan(0)
  })

  it('rejects an invalid process id with a 400 VocdoniApiError', async () => {
    let err: unknown
    try {
      await makeClient().elections.get('not-a-real-process')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(VocdoniApiError)
    expect((err as VocdoniApiError).status).toBe(400)
  })
})
