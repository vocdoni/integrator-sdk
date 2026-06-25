import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockElection } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { TestProvider } from '../test-utils'
import { ActionsProvider, useActions } from './ActionsProvider'
import { ElectionProvider, useElection } from './ElectionProvider'

const BASE = 'http://localhost'

/** Records the body of every PUT /process/:id/status the provider sends. */
function captureStatus(): { last: () => unknown } {
  const seen: unknown[] = []
  server.use(
    http.put(`${BASE}/process/:id/status`, async ({ request }) => {
      seen.push(await request.json())
      return HttpResponse.json({}, { status: 200 })
    }),
  )
  return { last: () => seen.at(-1) }
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TestProvider>
      <ElectionProvider id={mockElection.id}>
        <ActionsProvider>{children}</ActionsProvider>
      </ElectionProvider>
    </TestProvider>
  )
}

const useActor = () => ({ actions: useActions(), election: useElection() })

describe('ActionsProvider', () => {
  it.each([
    ['pause', 'paused'],
    ['resume', 'ready'],
    ['end', 'ended'],
    ['cancel', 'canceled'],
  ] as const)('%s sends status "%s"', async (method, status) => {
    const capture = captureStatus()
    const { result } = renderHook(useActor, { wrapper })
    await waitFor(() => expect(result.current.election.election).not.toBeNull())

    await act(async () => {
      await result.current.actions[method]()
    })

    expect(capture.last()).toEqual({ status })
    expect(result.current.actions.loading).toBe(false)
  })

  it('rejects with "Election not loaded" when the election failed to load', async () => {
    // 404 the process so ElectionProvider never resolves an election.
    server.use(
      http.get(`${BASE}/process/:id`, () => new HttpResponse(null, { status: 404 })),
    )
    const { result } = renderHook(useActor, { wrapper })
    await waitFor(() => expect(result.current.election.loading).toBe(false))
    expect(result.current.election.election).toBeNull()

    await expect(result.current.actions.pause()).rejects.toThrow('Election not loaded')
  })

  it('throws a clear error when useActions() is used outside a provider', () => {
    expect(() => renderHook(useActions)).toThrow('useActions() must be used inside <ActionsProvider>')
  })
})
