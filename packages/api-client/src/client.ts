import type { AppClientConfig } from '@vocdoni/api-types'
import { up } from 'up-fetch'
import { AuthClient } from './auth'
import { CensusClient } from './census'
import { ElectionsClient } from './elections'
import { OrganizationsClient } from './organizations'

async function resolveToken(
  authToken: AppClientConfig['authToken'],
): Promise<string | null | undefined> {
  if (typeof authToken === 'function') {
    return authToken()
  }
  return authToken
}

export class VocdoniAppClient {
  readonly elections: ElectionsClient
  readonly organizations: OrganizationsClient
  readonly census: CensusClient
  readonly auth: AuthClient

  constructor(config: AppClientConfig) {
    const fetcher = up(fetch, async () => {
      const token = await resolveToken(config.authToken)
      return {
        baseUrl: config.apiUrl,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        parseResponse: async (res) => {
          if (res.status === 204 || res.headers.get('content-length') === '0') {
            return undefined as never
          }
          return res.json()
        },
      }
    })

    this.elections = new ElectionsClient(fetcher)
    this.organizations = new OrganizationsClient(fetcher)
    this.census = new CensusClient(fetcher)
    this.auth = new AuthClient(fetcher)
  }
}

export function createClient(config: AppClientConfig): VocdoniAppClient {
  return new VocdoniAppClient(config)
}
