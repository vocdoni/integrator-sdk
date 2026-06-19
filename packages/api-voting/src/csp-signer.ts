import { up } from 'up-fetch'
import type { CspSignRequest, CspSignResponse } from '@vocdoni/api-types'

/**
 * Requests a blind CSP signature from the census URI.
 *
 * The CSP signs the payload (hex of the hash of the vote package)
 * using the voter's auth token and the election ID.
 */
export class CspSigner {
  private readonly fetch: ReturnType<typeof up>

  constructor(private readonly censusUri: string) {
    this.fetch = up(fetch, () => ({
      baseUrl: censusUri,
    }))
  }

  /**
   * Request a blind signature from the CSP.
   * @param payload    Hex-encoded hash of the vote package to sign
   * @param authToken  The auth token from CSP step1
   * @param electionId The election ID
   */
  async sign(payload: string, authToken: string, electionId: string): Promise<CspSignResponse> {
    return this.fetch<CspSignResponse>('/sign', {
      method: 'POST',
      body: { payload, authToken, electionId } satisfies CspSignRequest,
    })
  }
}
