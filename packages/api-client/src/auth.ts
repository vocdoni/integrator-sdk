import type { AuthToken, OrganizationAddresses } from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export class AuthClient {
  constructor(private readonly fetch: UpFetch) {}

  async login(address: string, signature: string): Promise<AuthToken> {
    return this.fetch<AuthToken>('/auth/login', {
      method: 'POST',
      body: { address, signature },
    }).catch(handleError)
  }

  async refresh(refreshToken: string): Promise<AuthToken> {
    return this.fetch<AuthToken>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    }).catch(handleError)
  }

  /** List the blockchain addresses of the organizations the user belongs to. */
  async addresses(): Promise<OrganizationAddresses> {
    return this.fetch<OrganizationAddresses>('/auth/addresses').catch(handleError)
  }
}
