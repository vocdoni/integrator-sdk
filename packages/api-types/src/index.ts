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

// ─── Vote ─────────────────────────────────────────────────────────────────────

export interface RelayVoteRequest {
  txPayload: string
}

export interface RelayVoteResponse {
  voteId: string
}

// ─── CSP ─────────────────────────────────────────────────────────────────────

export interface CspStep0Request {
  authData?: unknown
}

export interface CspStep0Response {
  authToken: string
  response?: unknown
}

export interface CspStep1Request {
  authToken: string
  authData?: unknown
}

export interface CspStep1Response {
  authToken: string
}

export interface CspSignRequest {
  payload: string
  authToken: string
  electionId: string
}

export interface CspSignResponse {
  signature: string
  weight?: number
}

export interface CspCheckRequest {
  authToken: string
  electionId?: string
}

export interface CspCheckResponse {
  belongs: boolean
  weight?: number
  hasVoted: boolean
}

export interface CspSignInfoRequest {
  authToken: string
}

export interface CspSignInfoResponse {
  address: string
  nullifier: string
  at: string
}

// ─── Client config ────────────────────────────────────────────────────────────

export interface AppClientConfig {
  apiUrl: string
  authToken?: string | (() => string | null | undefined) | (() => Promise<string | null | undefined>)
}
