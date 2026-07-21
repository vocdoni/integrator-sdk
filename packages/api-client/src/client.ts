import type { ApiClientConfig } from '@vocdoni/api-types'
import { up } from 'up-fetch'
import { AuthClient } from './auth'
import { BundleClient } from './bundle'
import { CensusClient } from './census'
import { ElectionsClient } from './elections'
import { JobsClient } from './jobs'
import { OrganizationsClient } from './organizations'

async function resolveToken(
  authToken: ApiClientConfig['authToken'],
): Promise<string | null | undefined> {
  if (typeof authToken === 'function') {
    return authToken()
  }
  return authToken
}

export class VocdoniApiClient {
  readonly elections: ElectionsClient
  readonly organizations: OrganizationsClient
  readonly census: CensusClient
  readonly auth: AuthClient
  readonly bundle: BundleClient
  readonly jobs: JobsClient

  constructor(config: ApiClientConfig) {
    const fetcher = up(fetch, async () => {
      const token = await resolveToken(config.authToken)
      return {
        baseUrl: config.apiUrl,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        parseResponse: async (res) => {
          if (res.status === 204) return undefined as never
          const text = await res.text()
          // Write endpoints (process update/delete, status changes) answer a
          // bare 200 with a "\n" body — treat any blank body as empty, not JSON.
          if (!text.trim()) return undefined as never
          return JSON.parse(text)
        },
      }
    })

    this.elections = new ElectionsClient(fetcher)
    this.organizations = new OrganizationsClient(fetcher)
    this.census = new CensusClient(fetcher)
    this.auth = new AuthClient(fetcher)
    this.bundle = new BundleClient(fetcher)
    this.jobs = new JobsClient(fetcher)
  }
}
