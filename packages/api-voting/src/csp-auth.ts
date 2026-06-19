import { up } from 'up-fetch'
import type {
  CspCheckRequest,
  CspCheckResponse,
  CspStep0Request,
  CspStep0Response,
  CspStep1Request,
  CspStep1Response,
} from '@vocdoni/api-types'

/**
 * Handles the CSP multi-step auth flow against the census URI.
 *
 * The census URI is the base URL, e.g.:
 *   https://csp.example.com/v1/auth/elections/{bundleId}
 *
 * Step0 POSTs to {censusUri}/auth/0
 * Step1 POSTs to {censusUri}/auth/1
 * Check POSTs to {censusUri}/check
 */
export class CspAuth {
  private readonly fetch: ReturnType<typeof up>

  constructor(private readonly censusUri: string) {
    this.fetch = up(fetch, () => ({
      baseUrl: censusUri,
    }))
  }

  /**
   * Step 0 — request an OTP challenge from the CSP.
   * @param data Optional auth data (e.g. email or phone for OTP delivery)
   */
  async step0(data?: unknown): Promise<CspStep0Response> {
    return this.fetch<CspStep0Response>('/auth/0', {
      method: 'POST',
      body: { authData: data } satisfies CspStep0Request,
    })
  }

  /**
   * Step 1 — confirm the OTP challenge.
   * @param authToken The token received from step0
   * @param authData  The OTP or other verification data
   */
  async step1(authToken: string, authData?: unknown): Promise<CspStep1Response> {
    return this.fetch<CspStep1Response>('/auth/1', {
      method: 'POST',
      body: { authToken, authData } satisfies CspStep1Request,
    })
  }

  /**
   * Check membership and voting status for an election.
   * @param authToken  The token from step1
   * @param electionId Optional election ID to scope the check
   */
  async check(authToken: string, electionId?: string): Promise<CspCheckResponse> {
    return this.fetch<CspCheckResponse>('/check', {
      method: 'POST',
      body: {
        authToken,
        ...(electionId ? { electionId } : {}),
      } satisfies CspCheckRequest,
    })
  }
}
