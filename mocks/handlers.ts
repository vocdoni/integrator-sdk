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

export const mockProcess = {
  id: 'abc123',
  // Process reads return orgAddress as unprefixed lowercase hex.
  orgAddress: '1a9ffe1f4c2493578ce4a7dbebd7d95433eee6f0',
  title: { default: 'Test Process' },
  description: { default: 'A test process' },
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-12-31T23:59:59Z',
  published: true,
  census: {},
  questions: [
    {
      id: 'q-0',
      parentProcessId: 'abc123',
      upstreamId: MOCK_PROCESS_ADDRESS,
      title: { default: 'Test Question' },
      choices: [],
      ballotProtocol: {
        maxCount: 1,
        maxValue: 1,
        maxVoteOverwrites: 0,
        maxTotalCost: 0,
        costExponent: 1,
        uniqueValues: false,
        costFromWeight: false,
      },
      type: 'singlechoice',
      secretUntilTheEnd: false,
      status: 'ONGOING',
    },
  ],
}

// name/description are locale maps on read (shorthands for meta["name"] etc.).
export const mockOrganization = {
  address: '0xdeadbeef',
  name: { default: 'Test Org' },
  description: { default: 'A test organization' },
}

export const mockAuthToken = {
  token: 'test-jwt-token',
  expirity: '2099-01-01T00:00:00Z',
}

export const handlers = [
  // New multi-question process endpoint (`GET /processes/:id`).
  http.get(`${BASE}/processes/:id`, ({ params }) =>
    HttpResponse.json({ ...mockProcess, id: params.id as string }),
  ),

  // Per-process results endpoint.
  http.get(`${BASE}/processes/:id/results`, ({ params }) =>
    HttpResponse.json({
      id: params.id as string,
      questions: mockProcess.questions.map((q) => ({
        questionId: q.id,
        upstreamId: q.upstreamId,
        status: q.status,
        voteCount: 0,
        startDate: mockProcess.startDate,
        endDate: mockProcess.endDate,
        finalResults: false,
        results: null,
      })),
    }),
  ),

  // Legacy single-process endpoint — kept for tests that still exercise old paths.
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

  // Org update — echo the merged organization so update() assertions can see the change.
  http.put(`${BASE}/organizations/:address`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      ...mockOrganization,
      address: params.address as string,
      ...body,
    })
  }),

  // Process status change (pause/resume/end/cancel) — 200, body is { status }.
  http.put(`${BASE}/process/:id/status`, () => HttpResponse.json({}, { status: 200 })),

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

  // ─── Process-scoped CSP voter routes (bundle-less flow) ──────────────────────
  http.post(`${BASE}/processes/:processId/auth/0`, () =>
    HttpResponse.json({ authToken: 'csp-step0-token' }),
  ),

  http.post(`${BASE}/processes/:processId/auth/1`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({
      authToken: `confirmed-${body.authToken ?? ''}`,
      weight: MOCK_WEIGHT_HEX,
    })
  }),

  http.post(`${BASE}/processes/:processId/auth/resend`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>
    return HttpResponse.json({ authToken: body.authToken ?? 'csp-step0-token' })
  }),

  http.post(`${BASE}/processes/:processId/check`, () =>
    HttpResponse.json({
      belongsToProcess: true,
      weight: MOCK_WEIGHT_HEX,
      questions: mockProcess.questions.map((q) => ({
        questionId: q.id,
        upstreamId: q.upstreamId,
        canVote: true,
        hasVoted: false,
      })),
    }),
  ),

  http.post(`${BASE}/processes/:processId/sign`, () =>
    HttpResponse.json({ signature: MOCK_CSP_SIGNATURE, weight: MOCK_WEIGHT_HEX }),
  ),

  http.post(`${BASE}/processes/:processId/weight`, () =>
    HttpResponse.json({ weight: MOCK_WEIGHT_HEX }),
  ),

  http.get(`${BASE}/processes/:processId/questions/:questionId`, ({ params }) =>
    HttpResponse.json({
      ...mockProcess.questions[0],
      id: params.questionId as string,
      parentProcessId: params.processId as string,
    }),
  ),
]
