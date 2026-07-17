import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { BUNDLE_ID, MOCK_CSP_SIGNATURE, MOCK_WEIGHT_HEX, mockProcess } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { BundleProvider, useBundle } from '../bundle/BundleProvider'
import { TestProvider } from '../test-utils'
import { ElectionProvider, useElection } from './ElectionProvider'

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TestProvider>
      <BundleProvider id={BUNDLE_ID}>
        <ElectionProvider id={mockProcess.id}>{children}</ElectionProvider>
      </BundleProvider>
    </TestProvider>
  )
}

const useVoter = () => ({ election: useElection(), bundle: useBundle() })

async function connect(result: { current: ReturnType<typeof useVoter> }) {
  await act(async () => {
    await result.current.bundle.auth0({ memberNumber: '5' })
  })
  await act(async () => {
    await result.current.bundle.auth1(['123456'])
  })
}

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

  it('exposes the bundle chainId once bundle info loads', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.bundle.chainId).toBe('test'))
  })

  it('connects through the bundle auth flow and resolves membership + weight', async () => {
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())

    await connect(result)

    expect(result.current.election.connected).toBe(true)
    // weight "2a" === 42, decoded from the bundle auth/check responses
    await waitFor(() => expect(result.current.election.weight).toBe(42))
    // membership check runs once connected
    await waitFor(() => expect(result.current.election.isInCensus).toBe(true))
    expect(result.current.election.isAbleToVote).toBe(true)
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

  it('refuses to vote when the bundle provides no chainId', async () => {
    // Strip chainId from the bundle so the vote() guard fires.
    server.use(
      http.get(`http://localhost/process/bundle/:bundleId`, ({ params }) =>
        HttpResponse.json({
          id: params.bundleId as string,
          processes: [mockProcess.id],
          orgAddress: '0xorg',
          census: { id: 'census-1', type: 'sms', authFields: ['memberNumber'], twoFaFields: ['phone'] },
          // no chainId
        }),
      ),
    )
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)
    await waitFor(() => expect(result.current.election.isAbleToVote).toBe(true))

    await expect(result.current.election.vote([[0]])).rejects.toThrow('Missing chainId')
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
      http.post(`http://localhost/process/bundle/:bundleId/sign`, async ({ request }) => {
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
