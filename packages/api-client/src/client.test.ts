import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import {
  mockAuthToken,
  mockElection,
  mockOrganization,
  mockProcess,
} from '../../../mocks/handlers'
import { VocdoniApiClient } from './client'

const BASE_URL = 'http://localhost'

describe('VocdoniApiClient', () => {
  let client: VocdoniApiClient

  beforeEach(() => {
    client = new VocdoniApiClient({ apiUrl: BASE_URL })
  })

  describe('elections.get', () => {
    it('returns process data for the given id', async () => {
      const process = await client.elections.get('abc123')
      expect(process.id).toBe('abc123')
      expect(process.title).toEqual(mockProcess.title)
      expect(process.published).toBe(true)
      expect(process.questions).toHaveLength(mockProcess.questions.length)
    })
  })

  describe('elections.vote', () => {
    it('relays the tx to POST /vote and returns an async job id', async () => {
      const payload = { txPayload: 'encoded-tx-payload' }
      const result = await client.elections.vote(payload)
      expect(result.jobId).toMatch(/^job-/)
    })
  })

  describe('organizations.get', () => {
    it('returns organization data for the given address', async () => {
      const org = await client.organizations.get('0xdeadbeef')
      expect(org.address).toBe('0xdeadbeef')
      expect(org.name).toEqual(mockOrganization.name)
    })
  })

  describe('auth header injection', () => {
    it('injects a static token into the Authorization header', async () => {
      let capturedAuth: string | null = null

      server.use(
        http.get(`${BASE_URL}/processes/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockProcess, id: 'abc123' })
        }),
      )

      const authedClient = new VocdoniApiClient({
        apiUrl: BASE_URL,
        authToken: 'my-static-token',
      })
      await authedClient.elections.get('abc123')

      expect(capturedAuth).toBe('Bearer my-static-token')
    })

    it('injects a token from a sync getter function', async () => {
      let capturedAuth: string | null = null

      server.use(
        http.get(`${BASE_URL}/processes/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockProcess, id: 'abc123' })
        }),
      )

      const authedClient = new VocdoniApiClient({
        apiUrl: BASE_URL,
        authToken: () => 'sync-getter-token',
      })
      await authedClient.elections.get('abc123')

      expect(capturedAuth).toBe('Bearer sync-getter-token')
    })

    it('injects a token from an async getter function', async () => {
      let capturedAuth: string | null = null

      server.use(
        http.get(`${BASE_URL}/processes/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockProcess, id: 'abc123' })
        }),
      )

      const authedClient = new VocdoniApiClient({
        apiUrl: BASE_URL,
        authToken: async () => 'async-getter-token',
      })
      await authedClient.elections.get('abc123')

      expect(capturedAuth).toBe('Bearer async-getter-token')
    })

    it('sends no Authorization header when no token is configured', async () => {
      let capturedAuth: string | null = null

      server.use(
        http.get(`${BASE_URL}/processes/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockProcess, id: 'abc123' })
        }),
      )

      await client.elections.get('abc123')

      expect(capturedAuth).toBeNull()
    })
  })

  describe('auth.login', () => {
    it('returns an AuthToken on successful email/password login', async () => {
      const token = await client.auth.login('user@example.com', 'secret')
      expect(token.token).toBe(mockAuthToken.token)
      expect(token.expirity).toBe(mockAuthToken.expirity)
    })
  })
})
