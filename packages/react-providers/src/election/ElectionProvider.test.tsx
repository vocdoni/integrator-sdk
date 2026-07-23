import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { MOCK_CSP_SIGNATURE, MOCK_WEIGHT_HEX, mockProcess } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { ProcessProvider, useProcess } from '../process/ProcessProvider'
import { TestProvider } from '../test-utils'
import { ElectionProvider, useElection } from './ElectionProvider'

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TestProvider>
      <ProcessProvider id={mockProcess.id}>
        <ElectionProvider id={mockProcess.id}>{children}</ElectionProvider>
      </ProcessProvider>
    </TestProvider>
  )
}

const useVoter = () => ({ election: useElection(), process: useProcess() })

async function connect(result: { current: ReturnType<typeof useVoter> }) {
  await act(async () => {
    await result.current.process.auth0({ memberNumber: '5' })
  })
  await act(async () => {
    await result.current.process.auth1(['123456'])
  })
}

/** Hex of the plain vote package prefix `{"nonce"` — present iff the ballot is cleartext. */
const PLAIN_PACKAGE_MARKER = '7b226e6f6e6365'

describe('ElectionProvider', () => {
  it('starts loading then resolves the election', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    expect(result.current.election.loading).toBe(true)
    await waitFor(() => expect(result.current.election.loading).toBe(false))
    expect(result.current.election.election?.id).toBe(mockProcess.id)
  })

  it('initialises with no vote and unable to vote', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    expect(result.current.election.voteId).toBeNull()
    expect(result.current.election.hasVoted).toBe(false)
    expect(result.current.election.isAbleToVote).toBe(false)
    expect(result.current.election.connected).toBe(false)
  })

  it('exposes the chainId once the process read loads', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.process.chainId).toBe('test'))
  })

  it('connects through the process auth flow and resolves membership + weight', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())

    await connect(result)

    expect(result.current.election.connected).toBe(true)
    // weight "2a" === 42, decoded from the process auth/check responses
    await waitFor(() => expect(result.current.election.weight).toBe(42))
    // membership check runs once connected — per-question state exposed
    await waitFor(() => expect(result.current.election.isInCensus).toBe(true))
    expect(result.current.election.voterQuestions).toEqual([
      {
        questionId: 'q-0',
        upstreamId: mockProcess.questions[0].upstreamId,
        canVote: true,
        hasVoted: false,
      },
    ])
    expect(result.current.election.isAbleToVote).toBe(true)
  })

  it('derives hasVoted when the check reports every question as voted', async () => {
    server.use(
      http.post(`http://localhost/processes/:processId/check`, () =>
        HttpResponse.json({
          belongsToProcess: true,
          weight: MOCK_WEIGHT_HEX,
          questions: mockProcess.questions.map((q) => ({
            questionId: q.id,
            upstreamId: q.upstreamId,
            canVote: true,
            hasVoted: true,
          })),
        }),
      ),
    )

    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)

    await waitFor(() => expect(result.current.election.hasVoted).toBe(true))
    expect(result.current.election.isInCensus).toBe(true)
    expect(result.current.election.isAbleToVote).toBe(false)
  })

  it('casts a vote and resolves the nullifier from the relay job', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())

    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    let voteId = ''
    await act(async () => {
      voteId = await result.current.election.vote([[0]])
    })

    expect(voteId).toMatch(/^nullifier-job-/)
    expect(result.current.election.voteId).toBe(voteId)
    expect(result.current.election.hasVoted).toBe(true)
  })

  it('refuses to vote when the process read provides no chainId', async () => {
    // Strip chainId from the process read so the vote() guard fires.
    const { chainId: _chainId, ...processWithoutChainId } = mockProcess
    server.use(
      http.get(`http://localhost/processes/:id`, ({ params }) =>
        HttpResponse.json({ ...processWithoutChainId, id: params.id as string }),
      ),
    )
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    await expect(result.current.election.vote([[0]])).rejects.toThrow('Missing chainId')
  })

  it('refuses to vote with a ballot-count mismatch — before consuming any CSP sign', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    // No ballots at all, and fewer ballots than questions: both must fail fast
    // (a silent `?? []` here would cast an empty ballot and half-vote the process).
    await expect(result.current.election.vote([])).rejects.toThrow('Expected one encoded ballot per question')
    expect(result.current.election.hasVoted).toBe(false)
    expect(result.current.election.voteId).toBeNull()
  })

  it('resolves per-question results from the results endpoint', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.results).not.toBeNull())
    expect(result.current.election.results?.questions).toHaveLength(1)
    expect(result.current.election.results?.questions[0].questionId).toBe('q-0')
  })

  it('treats a results 404 as "no results yet" (results stay null, no error surfaced)', async () => {
    let resultsCalls = 0
    server.use(
      http.get(`http://localhost/processes/:id/results`, () => {
        resultsCalls++
        return HttpResponse.json({ error: 'process results not found', code: 40401 }, { status: 404 })
      }),
    )

    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())

    // The results query fires once the election loads; the 404 must resolve to null.
    await waitFor(() => expect(resultsCalls).toBeGreaterThanOrEqual(1))
    // No retry hammering: the 404 resolves the query instead of erroring it.
    expect(resultsCalls).toBe(1)
    expect(result.current.election.results).toBeNull()
    expect(result.current.election.error).toBeNull()
  })

  it('signs and casts one vote per question in a multi-question process', async () => {
    const UPSTREAM_A = 'aa'.repeat(32)
    const UPSTREAM_B = 'bb'.repeat(32)
    const signBodies: Array<{ electionId: string; payload: string }> = []
    const voteJobIds: string[] = []
    const polledJobIds: string[] = []

    server.use(
      http.get(`http://localhost/processes/:id`, ({ params }) =>
        HttpResponse.json({
          ...mockProcess,
          id: params.id as string,
          questions: [
            { ...mockProcess.questions[0], id: 'q-0', upstreamId: UPSTREAM_A },
            {
              ...mockProcess.questions[0],
              id: 'q-1',
              upstreamId: UPSTREAM_B,
              title: { default: 'Second Question' },
            },
          ],
        }),
      ),
      http.post(`http://localhost/processes/:processId/sign`, async ({ request }) => {
        const body = (await request.json()) as { electionId: string; payload: string }
        signBodies.push(body)
        return HttpResponse.json({ signature: MOCK_CSP_SIGNATURE, weight: MOCK_WEIGHT_HEX })
      }),
      http.post(`http://localhost/vote`, () => {
        const jobId = `job-${voteJobIds.length}`
        voteJobIds.push(jobId)
        return HttpResponse.json({ jobId }, { status: 202 })
      }),
      http.get(`http://localhost/jobs/:jobId`, ({ params }) => {
        polledJobIds.push(params.jobId as string)
        return HttpResponse.json({
          jobId: params.jobId as string,
          status: 'completed',
          type: 'relay_vote',
          result: { voteID: `nullifier-${params.jobId}` },
        })
      }),
    )

    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    let voteId = ''
    await act(async () => {
      voteId = await result.current.election.vote([[0], [1]])
    })

    // one CSP sign per question, keyed by each question's upstreamId, in order
    expect(signBodies).toHaveLength(2)
    expect(signBodies.map((b) => b.electionId)).toEqual([UPSTREAM_A, UPSTREAM_B])

    // a fresh ephemeral signer per question: two distinct addresses were signed
    expect(signBodies[0].payload).toMatch(/^0x[0-9a-f]{40}$/i)
    expect(signBodies[1].payload).toMatch(/^0x[0-9a-f]{40}$/i)
    expect(signBodies[0].payload).not.toBe(signBodies[1].payload)

    // two vote submissions, each awaited through the jobs endpoint
    expect(voteJobIds).toEqual(['job-0', 'job-1'])
    expect(polledJobIds).toEqual(['job-0', 'job-1'])

    // the returned vote id is the FIRST question's vote id
    expect(voteId).toBe('nullifier-job-0')
    expect(result.current.election.voteId).toBe('nullifier-job-0')
  })

  it('refuses to cast a cleartext ballot for a secret question without published keys', async () => {
    let signCalls = 0
    server.use(
      http.get(`http://localhost/processes/:id`, ({ params }) =>
        HttpResponse.json({
          ...mockProcess,
          id: params.id as string,
          questions: [{ ...mockProcess.questions[0], secretUntilTheEnd: true }],
        }),
      ),
      http.post(`http://localhost/processes/:processId/sign`, () => {
        signCalls++
        return HttpResponse.json({ signature: MOCK_CSP_SIGNATURE, weight: MOCK_WEIGHT_HEX })
      }),
    )

    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    await expect(result.current.election.vote([[0]])).rejects.toThrow(
      /encryption keys are not published yet/,
    )
    // The guard fires BEFORE the one-shot CSP sign gets consumed.
    expect(signCalls).toBe(0)
    expect(result.current.election.hasVoted).toBe(false)
  })

  it('passes the encryption keys through — secret ballots go out sealed', async () => {
    const UPSTREAM_A = 'aa'.repeat(32)
    const UPSTREAM_B = 'bb'.repeat(32)
    const txPayloads: string[] = []

    server.use(
      http.get(`http://localhost/processes/:id`, ({ params }) =>
        HttpResponse.json({
          ...mockProcess,
          id: params.id as string,
          questions: [
            { ...mockProcess.questions[0], id: 'q-0', upstreamId: UPSTREAM_A },
            {
              ...mockProcess.questions[0],
              id: 'q-1',
              upstreamId: UPSTREAM_B,
              secretUntilTheEnd: true,
              // Any 32-byte curve25519 public key seals fine — we only assert
              // the package went out encrypted, never decrypt it.
              encryptionKeys: [{ index: 0, key: 'cd'.repeat(32) }],
            },
          ],
        }),
      ),
      http.post(`http://localhost/vote`, async ({ request }) => {
        const body = (await request.json()) as { txPayload: string }
        txPayloads.push(body.txPayload)
        return HttpResponse.json({ jobId: `job-${txPayloads.length - 1}` }, { status: 202 })
      }),
    )

    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    await act(async () => {
      await result.current.election.vote([[0], [1]])
    })

    expect(txPayloads).toHaveLength(2)
    // The plain question's package is cleartext JSON ({"nonce"…)…
    expect(txPayloads[0]).toContain(PLAIN_PACKAGE_MARKER)
    // …the secret question's package is sealed — no cleartext JSON in the wire.
    expect(txPayloads[1]).not.toContain(PLAIN_PACKAGE_MARKER)
  })

  it('clearVoter resets connection and vote state', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())

    await connect(result)
    expect(result.current.election.connected).toBe(true)

    act(() => result.current.election.clearVoter())

    expect(result.current.election.connected).toBe(false)
    expect(result.current.election.weight).toBeNull()
    expect(result.current.election.hasVoted).toBe(false)
    expect(result.current.election.voteId).toBeNull()
  })
})
