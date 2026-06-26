import type { AuthToken, OrganizationAddresses } from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export class AuthClient {
  constructor(private readonly fetch: UpFetch) {}

  /**
   * Log in a SaaS user with email + password → JWT. This is the normal-org auth
   * flow (a signed-up user driving the SDK under their own organization), not the
   * integrator API-key flow. Feed the returned `token` back as the client's
   * Bearer (`new VocdoniApiClient({ authToken })`) to authenticate later calls.
   */
  async login(email: string, password: string): Promise<AuthToken> {
    return this.fetch<AuthToken>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }).catch(handleError)
  }

  /**
   * Re-issue the JWT. The API reads the user from the current Bearer token (there
   * is no separate refresh token), so the client must already be authenticated.
   */
  async refresh(): Promise<AuthToken> {
    return this.fetch<AuthToken>('/auth/refresh', { method: 'POST' }).catch(handleError)
  }

  /** List the blockchain addresses of the organizations the user belongs to. */
  async addresses(): Promise<OrganizationAddresses> {
    return this.fetch<OrganizationAddresses>('/auth/addresses').catch(handleError)
  }
}
