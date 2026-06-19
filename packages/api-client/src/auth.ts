import type { AuthToken } from '@vocdoni/api-types'
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
}
