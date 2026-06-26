import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import {
  mockAuthToken,
  mockElection,
  mockOrganization,
  MOCK_PROCESS_ADDRESS,
} from '../../../mocks/handlers'
import { VocdoniApiClient } from './client'

const BASE_URL = 'http://localhost'

describe('VocdoniApiClient', () => {
  let client: VocdoniApiClient

  beforeEach(() => {
    client = new VocdoniApiClient({ apiUrl: BASE_URL })
  })

  describe('elections.get', () => {
    it('returns election data for the given id', async () => {
      const election = await client.elections.get('abc123')
      expect(election.id).toBe('abc123')
      expect(election.title).toBe(mockElection.title)
      expect(election.status).toBe('READY')
      // The merged process info surfaces the vochain id + chain id.
      expect(election.address).toBe(MOCK_PROCESS_ADDRESS)
      expect(election.chainId).toBe('test')
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
      expect(org.name).toBe(mockOrganization.name)
    })
  })

  describe('auth header injection', () => {
    it('injects a static token into the Authorization header', async () => {
      let capturedAuth: string | null = null

      server.use(
        http.get(`${BASE_URL}/process/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockElection, id: 'abc123', address: MOCK_PROCESS_ADDRESS })
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
        http.get(`${BASE_URL}/process/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockElection, id: 'abc123', address: MOCK_PROCESS_ADDRESS })
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
        http.get(`${BASE_URL}/process/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockElection, id: 'abc123', address: MOCK_PROCESS_ADDRESS })
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
        http.get(`${BASE_URL}/process/:id`, ({ request }) => {
          capturedAuth = request.headers.get('Authorization')
          return HttpResponse.json({ ...mockElection, id: 'abc123', address: MOCK_PROCESS_ADDRESS })
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
