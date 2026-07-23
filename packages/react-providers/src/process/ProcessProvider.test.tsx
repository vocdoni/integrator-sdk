import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mockProcess } from '../../../../mocks/handlers'
import { server } from '../../../../mocks/server'
import { TestProvider } from '../test-utils'
import { ProcessProvider, useProcess } from './ProcessProvider'

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <TestProvider>
      <ProcessProvider id={mockProcess.id}>{children}</ProcessProvider>
    </TestProvider>
  )
}

/** Overrides the process read so the census reads as auth-only (no 2FA fields). */
function useAuthOnlyCensus() {
  server.use(
    http.get('http://localhost/processes/:id', ({ params }) =>
      HttpResponse.json({
        ...mockProcess,
        id: params.id as string,
        census: { authFields: ['memberNumber'], twoFaFields: [] },
      }),
    ),
  )
}

describe('ProcessProvider', () => {
  it('loads the process read and exposes chainId', async () => {
    const { result } = renderHook(() => useProcess(), { wrapper })
    await waitFor(() => expect(result.current.process).not.toBeNull())
    expect(result.current.chainId).toBe('test')
    expect(result.current.connected).toBe(false)
  })

  describe('2FA census', () => {
    it('stays unverified after step 0 and connects only after step 1', async () => {
      const { result } = renderHook(() => useProcess(), { wrapper })
      await waitFor(() => expect(result.current.process).not.toBeNull())

      // Step 0: identify the participant — token issued but NOT yet verified.
      await act(async () => {
        await result.current.auth0({ email: 'voter@example.com' })
      })
      expect(result.current.connected).toBe(false)
      expect(result.current.weight).toBeNull()

      // Step 1: confirm the OTP — now verified, weight resolved.
      await act(async () => {
        await result.current.auth1(['123456'])
      })
      expect(result.current.connected).toBe(true)
      expect(result.current.weight).toBe(42)
    })

    it('auth1 before auth0 throws', async () => {
      const { result } = renderHook(() => useProcess(), { wrapper })
      await waitFor(() => expect(result.current.process).not.toBeNull())
      await expect(result.current.auth1(['123456'])).rejects.toThrow('step 0 first')
    })

    it('resend works on the pending (non-verified) token', async () => {
      const { result } = renderHook(() => useProcess(), { wrapper })
      await waitFor(() => expect(result.current.process).not.toBeNull())
      await act(async () => {
        await result.current.auth0({ email: 'voter@example.com' })
      })
      await act(async () => {
        await result.current.resend({ email: 'voter@example.com' })
      })
      expect(result.current.connected).toBe(false)
    })
  })

  describe('auth-only census', () => {
    it('connects directly at step 0 (no OTP), per-question state + weight via check', async () => {
      useAuthOnlyCensus()
      const { result } = renderHook(() => useProcess(), { wrapper })
      await waitFor(() => expect(result.current.process).not.toBeNull())

      await act(async () => {
        await result.current.auth0({ memberNumber: '5' })
      })
      // Verified straight away — no auth1 needed.
      expect(result.current.connected).toBe(true)

      let membership
      await act(async () => {
        membership = await result.current.check()
      })
      // The process check reports membership plus per-question state.
      expect(membership).toMatchObject({
        belongsToProcess: true,
        questions: [{ questionId: 'q-0', canVote: true, hasVoted: false }],
      })
      expect(result.current.weight).toBe(42)
    })

    it('clear() resets the session', async () => {
      useAuthOnlyCensus()
      const { result } = renderHook(() => useProcess(), { wrapper })
      await waitFor(() => expect(result.current.process).not.toBeNull())
      await act(async () => {
        await result.current.auth0({ memberNumber: '5' })
      })
      expect(result.current.connected).toBe(true)

      act(() => result.current.clear())
      expect(result.current.connected).toBe(false)
      expect(result.current.weight).toBeNull()
    })
  })
})
