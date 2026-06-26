import { createClient, type VocdoniAppClient } from '@vocdoni/api-client'

/** Base URL of the SaaS API under test (trailing slash trimmed). */
export const API_URL = (
  process.env.INTEGRATION_API_URL ?? 'https://saas-api-dev.vocdoni.net'
).replace(/\/$/, '')

export function makeClient(authToken?: () => string | null | undefined): VocdoniAppClient {
  return createClient({ apiUrl: API_URL, authToken })
}

// Known-good dev fixtures (a concluded, auth-only bundle on saas-api-dev). These
// are defaults so the contract + login suites run out of the box; override via
// env for a different target. They may rot if the census is edited/removed.
const DEFAULT_BUNDLE_ID = '6a2a93d3783a1022d6816674'
const DEFAULT_PROCESS_ID = '6be21a5a9dc034ede83966b661e6a648854bd92b7d209d2c97c203000000004f'
const DEFAULT_MEMBER_NUMBER = '5'
/** A live process addressed by its Mongo id (READY), for the process-info proof. */
const DEFAULT_PROCESS_MONGO_ID = '6a3cfc6b3af4e390f5f79291'

// A live `secretUntilTheEnd` election on saas-api-dev: auth-only census of
// memberNumbers 1–100, whose merged /process/{id} now carries `encryptionKeys`.
// Used by the encrypted-vote suite to prove the seal-and-cast path end to end.
const DEFAULT_ENCRYPTED_BUNDLE_ID = '6a3e5e93b11faba0dee1ac73'
const DEFAULT_ENCRYPTED_PROCESS_MONGO_ID = '6a3e5e3eb11faba0dee1ac6f'

/**
 * Fixtures used by the data-dependent suites. The bundle/process/member default
 * to the dev fixtures above; the full vote flow additionally needs auth0Data/otp
 * and otherwise skips.
 */
export const fixtures = {
  bundleId: process.env.INTEGRATION_BUNDLE_ID ?? DEFAULT_BUNDLE_ID,
  processId: process.env.INTEGRATION_PROCESS_ID ?? DEFAULT_PROCESS_ID,
  /** Mongo id used to fetch merged process info via `elections.get`. */
  processMongoId: process.env.INTEGRATION_PROCESS_INFO_ID ?? DEFAULT_PROCESS_MONGO_ID,
  /** Member number for the auth-only login suite (authField "memberNumber"). */
  memberNumber: process.env.INTEGRATION_MEMBER_NUMBER ?? DEFAULT_MEMBER_NUMBER,
  /** Bundle + process (Mongo id) of the live `secretUntilTheEnd` election. */
  encryptedBundleId: process.env.INTEGRATION_ENCRYPTED_BUNDLE_ID ?? DEFAULT_ENCRYPTED_BUNDLE_ID,
  encryptedProcessMongoId:
    process.env.INTEGRATION_ENCRYPTED_PROCESS_ID ?? DEFAULT_ENCRYPTED_PROCESS_MONGO_ID,
  /** Member number (1–100) that the encrypted-vote flow consumes when set. */
  encryptedVoteMember: process.env.INTEGRATION_ENCRYPTED_VOTE_MEMBER,
  /** JSON array passed as the auth step-0 `authData` for 2FA censuses. */
  auth0Data: process.env.INTEGRATION_AUTH0_DATA,
  /** OTP / challenge solution for auth step 1 (2FA censuses only). */
  otp: process.env.INTEGRATION_OTP,
}

/** Parses a JSON env var; returns the raw string if it isn't valid JSON. */
export function parseJsonEnv(value: string | undefined): unknown {
  if (!value) return undefined
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
