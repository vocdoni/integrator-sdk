import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { BUNDLE_ID, mockElection } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { BundleProvider, useBundle } from '../bundle/BundleProvider'
import { TestProvider } from '../test-utils'
import { ElectionProvider, useElection } from './ElectionProvider'

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TestProvider>
      <BundleProvider id={BUNDLE_ID}>
        <ElectionProvider id={mockElection.id}>{children}</ElectionProvider>
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
    expect(result.current.election.election?.id).toBe(mockElection.id)
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

  it('surfaces the on-chain encryption keys of a secretUntilTheEnd election', async () => {
    const publicKeys = [
      { index: 1, key: 'e34968e44589b4cdfda2365de5f9404b86fcc88ed015bea3f8b29975d958306e' },
    ]
    server.use(
      http.get(`http://localhost/process/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id as string,
          address: '6be21a5a9dc06e84f132f7257865308a9298b06d6a6273f4e844030400000000',
          chainId: 'test',
          status: 'READY',
          electionParams: {
            questions: [],
            electionType: { interruptible: true, secretUntilTheEnd: true, anonymous: false },
          },
          publicKeys,
        }),
      ),
    )
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    // These flow straight into buildVoteTransaction, which seals the ballot.
    expect(result.current.election.election?.encryptionPublicKeys).toEqual(publicKeys)
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
      voteId = await result.current.election.vote([0])
    })

    expect(voteId).toMatch(/^nullifier-job-/)
    expect(result.current.election.voteId).toBe(voteId)
    expect(result.current.election.hasVoted).toBe(true)
  })

  it('refuses to vote when neither process nor bundle provides a chainId', async () => {
    // chainId now comes from the process first, so strip it there too — plus the
    // bundle (keep a 2FA census so the auth0 → auth1 connect flow still applies).
    server.use(
      http.get(`http://localhost/process/bundle/:bundleId`, ({ params }) =>
        HttpResponse.json({
          id: params.bundleId as string,
          processes: [mockElection.id],
          census: { twoFaFields: ['phone'] },
        }),
      ),
      http.get(`http://localhost/process/:id`, ({ params }) =>
        HttpResponse.json({
          id: params.id as string,
          address: '6be21a5a9dc01036097ea184999095aed31735e7264a19652130030800000001',
          status: mockElection.status,
          metadata: { title: mockElection.title },
          electionParams: {
            questions: mockElection.questions,
            voteType: mockElection.voteType,
            electionType: mockElection.electionType,
          },
        }),
      ),
    )
    const { result } = renderHook(useVoter, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())
    await connect(result)

    await expect(result.current.election.vote([0])).rejects.toThrow('Missing chainId')
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
