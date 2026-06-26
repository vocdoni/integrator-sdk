import { VocdoniApiClient } from '@vocdoni/api-client'

/** Base URL of the SaaS API under test (trailing slash trimmed). */
export const API_URL = (
  process.env.INTEGRATION_API_URL ?? 'https://saas-api-dev.vocdoni.net'
).replace(/\/$/, '')

export function makeClient(authToken?: () => string | null | undefined): VocdoniApiClient {
  return new VocdoniApiClient({ apiUrl: API_URL, authToken })
}

/** Integrator API key (`vsk_…`) used to drive the organizer-side admin flow. */
export const apiKey = process.env.INTEGRATION_API_KEY

/**
 * A client authenticated with the integrator API key. The key rides the same
 * `Authorization: Bearer` path as a JWT, so we just feed it as the authToken.
 */
export function makeAdminClient(): VocdoniApiClient {
  if (!apiKey) throw new Error('INTEGRATION_API_KEY is required for the admin client')
  return makeClient(() => apiKey)
}

// Known-good dev fixtures (a concluded, auth-only bundle on saas-api-dev). These
// are defaults so the contract + login suites run out of the box; override via
// env for a different target. They may rot if the census is edited/removed.
const DEFAULT_BUNDLE_ID = '6a2a93d3783a1022d6816674'
const DEFAULT_PROCESS_ID = '6be21a5a9dc034ede83966b661e6a648854bd92b7d209d2c97c203000000004f'
const DEFAULT_MEMBER_NUMBER = '5'
/** A live process addressed by its Mongo id (READY), for the process-info proof. */
const DEFAULT_PROCESS_MONGO_ID = '6a3cfc6b3af4e390f5f79291'

// A live `secretUntilTheEnd` election on saas-api-dev whose merged /process/{id}
// carries `encryptionKeys`. Used by the encrypted-info proof.
const DEFAULT_ENCRYPTED_PROCESS_MONGO_ID = '6a3e5e3eb11faba0dee1ac6f'

/**
 * Fixtures for the read-only, fixture-based suites (connectivity/bundle/login/
 * process-info/encrypted-info). They default to the dev fixtures above and may
 * rot if that data is edited; the full lifecycle is proven by full-flow.itest.ts.
 */
export const fixtures = {
  bundleId: process.env.INTEGRATION_BUNDLE_ID ?? DEFAULT_BUNDLE_ID,
  processId: process.env.INTEGRATION_PROCESS_ID ?? DEFAULT_PROCESS_ID,
  /** Mongo id used to fetch merged process info via `elections.get`. */
  processMongoId: process.env.INTEGRATION_PROCESS_INFO_ID ?? DEFAULT_PROCESS_MONGO_ID,
  /** Member number for the auth-only login suite (authField "memberNumber"). */
  memberNumber: process.env.INTEGRATION_MEMBER_NUMBER ?? DEFAULT_MEMBER_NUMBER,
  /** Process (Mongo id) of the live `secretUntilTheEnd` election. */
  encryptedProcessMongoId:
    process.env.INTEGRATION_ENCRYPTED_PROCESS_ID ?? DEFAULT_ENCRYPTED_PROCESS_MONGO_ID,
}
