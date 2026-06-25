import { http, HttpResponse } from 'msw'

const BASE = 'http://localhost'
export const BUNDLE_ID = 'bundle-1'
/** Vochain process id (64-hex) the process info exposes as `address`. */
export const MOCK_PROCESS_ADDRESS =
  '6be21a5a9dc01036097ea184999095aed31735e7264a19652130030800000001'
/** A valid 64-byte hex CSP signature placeholder (decodable by the vote builder). */
export const MOCK_CSP_SIGNATURE = 'ab'.repeat(64)
/** Hex-encoded weight "2a" === 42. */
export const MOCK_WEIGHT_HEX = '2a'

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
  // Process info, addressed by Mongo id. Returns the merged shape: vochain id as
  // `address`, `chainId`, and the election definition nested under electionParams.
  http.get(`${BASE}/process/:id`, ({ params }) =>
    HttpResponse.json({
      id: params.id as string,
      address: MOCK_PROCESS_ADDRESS,
      chainId: 'test',
      status: mockElection.status,
      orgAdress: mockElection.organizationId,
      census: {
        id: 'census-1',
        type: 'csp',
        weighted: false,
        size: 10,
        published: { uri: 'https://example.org/census-1', root: '0xroot' },
        authFields: ['memberNumber'],
        twoFaFields: [],
      },
      metadata: { title: mockElection.title, description: mockElection.description },
      electionParams: {
        startDate: mockElection.startDate,
        endDate: mockElection.endDate,
        questions: mockElection.questions,
        voteType: mockElection.voteType,
        electionType: mockElection.electionType,
      },
      publishedAt: '2024-01-01T00:00:00Z',
    }),
  ),

  // Vote relay — flat public POST /vote; the process is named in the envelope.
  // Returns an async job id (202).
  http.post(`${BASE}/vote`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json(
      { jobId: `job-${String(body.txPayload ?? '').slice(0, 8)}` },
      { status: 202 },
    )
  }),

  // Job polling — resolves immediately to a completed relay_vote with a nullifier.
  http.get(`${BASE}/jobs/:jobId`, ({ params }) =>
    HttpResponse.json({
      jobId: params.jobId as string,
      status: 'completed',
      type: 'relay_vote',
      result: { voteID: `nullifier-${params.jobId}` },
    }),
  ),

  http.get(`${BASE}/organizations/:address`, ({ params }) =>
    HttpResponse.json({ ...mockOrganization, address: params.address as string }),
  ),

  http.post(`${BASE}/auth/login`, () => HttpResponse.json(mockAuthToken)),
  http.post(`${BASE}/auth/refresh`, () => HttpResponse.json(mockAuthToken)),

  // ─── Bundle info ─────────────────────────────────────────────────────────────
  http.get(`${BASE}/process/bundle/:bundleId`, ({ params }) =>
    HttpResponse.json({
      id: params.bundleId as string,
      chainId: 'test',
      processes: [mockElection.id],
      orgAddress: '0xorg',
      // 2FA census (twoFaFields populated) → exercises the auth0 → auth1 flow.
      census: { id: 'census-1', type: 'sms', authFields: ['memberNumber'], twoFaFields: ['phone'] },
    }),
  ),

  // ─── Bundle CSP auth ─────────────────────────────────────────────────────────
  http.post(`${BASE}/process/bundle/:bundleId/auth/0`, () =>
    HttpResponse.json({ authToken: 'csp-step0-token' }),
  ),

  http.post(`${BASE}/process/bundle/:bundleId/auth/1`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      authToken: `confirmed-${body.authToken ?? ''}`,
      weight: MOCK_WEIGHT_HEX,
    })
  }),

  http.post(`${BASE}/process/bundle/:bundleId/auth/resend`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ authToken: body.authToken ?? 'csp-step0-token' })
  }),

  http.post(`${BASE}/process/bundle/:bundleId/check`, () =>
    HttpResponse.json({ belongs: true, hasVoted: false, weight: MOCK_WEIGHT_HEX }),
  ),

  http.post(`${BASE}/process/bundle/:bundleId/sign`, () =>
    HttpResponse.json({ signature: MOCK_CSP_SIGNATURE, weight: MOCK_WEIGHT_HEX }),
  ),

  http.post(`${BASE}/process/bundle/:bundleId/weight`, () =>
    HttpResponse.json({ weight: MOCK_WEIGHT_HEX }),
  ),
]
