// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthToken {
  token: string
  expiresAt: string
  refresh: string
}

export interface JWTPayload {
  sub: string
  iat: number
  exp: number
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface Organization {
  address: string
  name: string
  description: string
  website?: string
  logo?: string
}

export interface CreateOrganizationRequest {
  name: string
  description?: string
  website?: string
  logo?: string
  provisionAccount?: boolean
}

export interface IntegratorLimits {
  maxManagedOrgs: number
  maxProcessesPerOrg: number
  maxTotalProcesses: number
  maxCensusPerProcess: number
  maxCensusPerOrg: number
  maxTotalCensusSize: number
}

export interface IntegratorUsage {
  managedOrgs: number
  managedProcesses: number
  managedCensusSize: number
}

export interface IntegratorInfo {
  enabled: boolean
  limits: IntegratorLimits
  usage: IntegratorUsage
}

// ─── Census ───────────────────────────────────────────────────────────────────

// How census members are sourced — determines how the backend creates the census.
// The backend derives the Vochain census protocol type from this + election options.
export type CensusSource = 'spreadsheet' | 'web3' | 'csp'

export interface Census {
  id: string
  source: CensusSource
  size: number
  uri?: string
}

export interface CreateCensusRequest {
  source: CensusSource
  size?: number
  data?: unknown
}

export interface CensusMember {
  key: string
  weight?: number
}

// ─── Election ─────────────────────────────────────────────────────────────────

export type ElectionStatus = 'READY' | 'PAUSED' | 'ENDED' | 'CANCELED' | 'UPCOMING'

export interface Choice {
  title: string | Record<string, string>
  value: number
}

export interface Question {
  title: string | Record<string, string>
  description?: string | Record<string, string>
  choices: Choice[]
}

export interface VoteType {
  maxCount: number
  maxValue: number
  maxVoteOverwrites: number
  costExponent: number
  uniqueChoices: boolean
  costFromWeight: boolean
}

export interface ElectionType {
  interruptible: boolean
  secretUntilTheEnd: boolean
  anonymous: boolean
  metadata?: { encrypted: boolean }
}

export interface Election {
  id: string
  title: string | Record<string, string>
  description?: string | Record<string, string>
  header?: string
  status: ElectionStatus
  startDate: string
  endDate: string
  organizationId: string
  voteCount: number
  finalResults: boolean
  results?: string[][]
  census?: Census
  questions: Question[]
  voteType: VoteType
  electionType: ElectionType
  encryptionPublicKeys?: EncryptionKey[]
  /** Open-ended metadata stored by the creator — e.g. census.salt / census.fields / census.specs for spreadsheet elections, token.decimals for web3 elections */
  meta?: Record<string, unknown>
}

export interface EncryptionKey {
  index: number
  key: string
}

// ─── Election API ─────────────────────────────────────────────────────────────

export interface CreateElectionRequest {
  organizationId?: string
  title: string | Record<string, string>
  description?: string | Record<string, string>
  header?: string
  startDate?: string
  endDate?: string
  duration?: number
  maxCensusSize?: number
  questions: Question[]
  voteType?: Partial<VoteType>
  electionType?: Partial<ElectionType>
}

export interface UpdateElectionRequest {
  title?: string | Record<string, string>
  description?: string | Record<string, string>
  header?: string
  endDate?: string
}

export interface PublishElectionRequest {
  startDate?: string
}

export interface PublishElectionResponse {
  processId: string
}

export interface SetElectionStatusRequest {
  status: 'ready' | 'paused' | 'ended' | 'canceled'
}

export interface ElectionMetadata {
  title: string | Record<string, string>
  description?: string | Record<string, string>
  questions: Question[]
  media?: { header?: string }
}

export interface ElectionResults {
  status: string
  voteCount: number
  startDate: string
  endDate: string
  results: string[][]
  finalResults: boolean
}

export interface ElectionListParams {
  organizationId?: string
  page?: number
  pageSize?: number
  status?: ElectionStatus
}

export interface PaginatedElections {
  elections: Election[]
  total: number
  page: number
  pageSize: number
}

// ─── Vote relay ───────────────────────────────────────────────────────────────

export interface RelayVoteRequest {
  /** Hex of a marshaled SignedTx whose inner Tx is a Vote envelope. */
  txPayload: string
}

export interface RelayVoteResponse {
  /** Async job id — poll GET /jobs/{jobId} for the resulting vote nullifier. */
  jobId: string
}

// ─── Jobs (async transaction outcomes) ─────────────────────────────────────────

export type JobStatus = 'pending' | 'completed' | 'failed'

export type JobType =
  | 'org_members'
  | 'census_participants'
  | 'publish_process'
  | 'set_process_status'
  | 'relay_vote'

export interface JobResult {
  address?: string
  status?: string
  /** Vote nullifier — present once a relay_vote job completes. */
  voteID?: string
}

export interface JobStatusResponse {
  jobId: string
  status: JobStatus
  type: JobType
  result?: JobResult
  error?: string
}

export interface EnqueuedResponse {
  jobId: string
}

// ─── Bundle ─────────────────────────────────────────────────────────────────────
// A bundle groups processes that share a census. The voter authenticates against
// the bundle once and votes on its processes; the bundle also carries the Vochain
// chain id the votes are signed against.

export interface Bundle {
  id: string
  /** Vochain chain id the bundle's processes live on (used to sign votes). */
  chainId?: string
  /** On-chain process ids included in the bundle. */
  processes: string[]
  /** Owner organization address (hex). */
  orgAddress?: string
  /**
   * Census-management object for the bundle (type, authFields, size…). This is
   * the richer SaaS census shape, distinct from the voting-time {@link Census};
   * left untyped until we need to read it client-side.
   */
  census?: Record<string, unknown>
}

// ─── Bundle CSP auth ────────────────────────────────────────────────────────────
// The CSP / two-factor voter-auth flow is hosted by the SaaS backend under
// /process/bundle/{bundleId}/*. A single verified authToken is reused across
// every process in the bundle.
// Note: `weight` is wire-encoded as a hex string (e.g. "2a" === 42).

/** Auth step 0/1 bodies are free-form (they vary by census auth type). */
/**
 * Auth step 0 — identify the participant. Pass every field the census requires
 * in this one object; the census `authFields` lists which ones (one or several,
 * e.g. just `memberNumber`, or `name` + `surname` + `birthDate`). Extra fields
 * are ignored. For auth-only censuses (no 2FA) step 0 already returns a verified
 * token.
 */
export interface BundleAuthRequest {
  name?: string
  surname?: string
  memberNumber?: string
  nationalId?: string
  birthDate?: string
  email?: string
  phone?: string
}

/** Auth step 1 — confirm the 2FA challenge. Not used by auth-only censuses. */
export interface BundleAuthChallengeRequest {
  authToken: string
  /** Challenge solution(s); the OTP is `authData[0]`. */
  authData: string[]
}

/** Shared response shape of the auth, resend and sign endpoints. */
export interface AuthResponse {
  authToken?: string
  /** Hex CSP signature — present on the sign response. */
  signature?: string
  /** Hex-encoded census weight. */
  weight?: string
}

export interface AuthResendRequest {
  authToken: string
  email?: string
  phone?: string
}

export interface CheckMembershipRequest {
  authToken: string
  /** When provided, the response also reports hasVoted for that process. */
  electionId?: string
}

export interface CheckMembershipResponse {
  belongs: boolean
  hasVoted: boolean
  /** Hex-encoded census weight. */
  weight?: string
}

export interface SignRequest {
  authToken: string
  electionId: string
  /** Hex address to be signed by the CSP. */
  payload: string
  /** Blinding R point — only used by blind-salted censuses. */
  tokenR?: string
}

export interface UserWeightRequest {
  authToken: string
}

export interface UserWeightResponse {
  /** Hex-encoded census weight. */
  weight?: string
}

// ─── Consumed address (sign-info) ──────────────────────────────────────────────

export interface ConsumedAddressRequest {
  authToken: string
}

export interface ConsumedAddressResponse {
  authToken?: string
  /** Vote nullifier of the consumed process. */
  nullifier: string
  /** Consumption timestamp. */
  at: string
}

// ─── Client config ────────────────────────────────────────────────────────────

export interface AppClientConfig {
  apiUrl: string
  authToken?: string | (() => string | null | undefined) | (() => Promise<string | null | undefined>)
}
