import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import { CSP_BASE } from '../../../mocks/handlers'
import { CspAuth } from './csp-auth'

describe('CspAuth', () => {
  let auth: CspAuth

  beforeEach(() => {
    auth = new CspAuth(CSP_BASE)
  })

  describe('step0', () => {
    it('returns authToken and response from the CSP', async () => {
      const result = await auth.step0()
      expect(result.authToken).toBe('csp-step0-token')
      expect(result.response).toEqual({ challenge: '123456' })
    })

    it('sends authData in the request body', async () => {
      let capturedBody: unknown

      server.use(
        http.post(`${CSP_BASE}/auth/0`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ authToken: 'tok', response: null })
        }),
      )

      await auth.step0({ email: 'test@example.com' })
      expect(capturedBody).toEqual({ authData: { email: 'test@example.com' } })
    })

    it('sends authData as undefined when no data provided', async () => {
      let capturedBody: unknown

      server.use(
        http.post(`${CSP_BASE}/auth/0`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ authToken: 'tok' })
        }),
      )

      await auth.step0()
      expect((capturedBody as Record<string, unknown>).authData).toBeUndefined()
    })
  })

  describe('step1', () => {
    it('sends authToken and authData in the request body', async () => {
      let capturedBody: unknown

      server.use(
        http.post(`${CSP_BASE}/auth/1`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ authToken: 'confirmed-tok' })
        }),
      )

      await auth.step1('my-token', '654321')
      expect(capturedBody).toEqual({ authToken: 'my-token', authData: '654321' })
    })

    it('returns the confirmed authToken', async () => {
      const result = await auth.step1('csp-step0-token', '123456')
      expect(result.authToken).toBe('confirmed-csp-step0-token')
    })
  })

  describe('check', () => {
    it('sends authToken and electionId in the request body', async () => {
      let capturedBody: unknown

      server.use(
        http.post(`${CSP_BASE}/check`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ belongs: true, hasVoted: false })
        }),
      )

      await auth.check('my-token', 'election-42')
      expect(capturedBody).toEqual({ authToken: 'my-token', electionId: 'election-42' })
    })

    it('omits electionId when not provided', async () => {
      let capturedBody: unknown

      server.use(
        http.post(`${CSP_BASE}/check`, async ({ request }) => {
          capturedBody = await request.json()
          return HttpResponse.json({ belongs: true, hasVoted: false })
        }),
      )

      await auth.check('my-token')
      expect(capturedBody).toEqual({ authToken: 'my-token' })
    })

    it('returns belongs, weight and hasVoted', async () => {
      const result = await auth.check('my-token', 'election-1')
      expect(result.belongs).toBe(true)
      expect(result.hasVoted).toBe(false)
    })
  })
})
