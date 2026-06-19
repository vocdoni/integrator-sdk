import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost'
export const CSP_BASE = 'https://csp.example.com/v1/auth/elections/bundle-1'

export const mockElection = {
  id: 'abc123',
  title: 'Test Election',
  description: 'A test election',
  status: 'READY',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  organizationId: 'org1',
  voteCount: 0,
  finalResults: false,
  questions: [],
  voteType: {
    maxCount: 1,
    maxValue: 1,
    maxVoteOverwrites: 0,
    costExponent: 1,
    uniqueChoices: false,
    costFromWeight: false,
  },
  electionType: {
    interruptible: true,
    secretUntilTheEnd: false,
    anonymous: false,
  },
}

export const mockOrganization = {
  address: '0xdeadbeef',
  name: 'Test Org',
  description: 'A test organization',
}

export const mockAuthToken = {
  token: 'test-jwt-token',
  expiresAt: '2099-01-01T00:00:00Z',
  refresh: 'test-refresh-token',
}

export const handlers = [
  http.get(`${BASE}/process/:id/metadata`, ({ params }) =>
    HttpResponse.json({ ...mockElection, id: params.id as string }),
  ),

  http.post(`${BASE}/process/:id/vote`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    const voteId = `vote-${params.id}-${body.txPayload ?? ''}`
    return HttpResponse.json({ voteId })
  }),

  http.get(`${BASE}/organizations/:address`, ({ params }) =>
    HttpResponse.json({ ...mockOrganization, address: params.address as string }),
  ),

  http.post(`${BASE}/auth/login`, () => HttpResponse.json(mockAuthToken)),

  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(mockAuthToken)),

  // ─── CSP handlers ──────────────────────────────────────────────────────────
  http.post(`${CSP_BASE}/auth/0`, () =>
    HttpResponse.json({ authToken: 'csp-step0-token', response: { challenge: '123456' } }),
  ),

  http.post(`${CSP_BASE}/auth/1`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ authToken: `confirmed-${body.authToken ?? ''}` })
  }),

  http.post(`${CSP_BASE}/check`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      belongs: true,
      weight: 1,
      hasVoted: false,
      electionId: body.electionId ?? null,
    })
  }),

  http.post(`${CSP_BASE}/sign`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ signature: `sig-of-${body.payload ?? ''}`, weight: 1 })
  }),
]
