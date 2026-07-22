// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Response of `POST /auth/login` and `POST /auth/refresh`. The JWT plus its
 * expiry; there is no refresh token — `refresh()` re-issues using the current
 * token. `expirity` mirrors the API's (misspelled) field name.
 */
export interface AuthToken {
  token: string
  expirity: string
}

export interface JWTPayload {
  sub: string
  iat: number
  exp: number
}

// ─── Organization ─────────────────────────────────────────────────────────────

/**
 * Locale-keyed text, e.g. `{ default: 'Acme', es: 'Acme SA' }`. The SaaS API
 * stores an organization's `name` / `description` / `logo` (shorthands for the
 * matching `meta[...]` keys) this way; the `default` key is the fallback locale.
 */
export type MultilingualText = Record<string, string>

/**
 * The full organization record the SaaS API returns from
 * `GET /organizations/{address}` — the `apicommon.OrganizationInfo` schema. The
 * API marks no field as required and omits absent ones, so everything past
 * `address` is optional.
 */
export interface Organization {
  /**
   * Organization address as a hex string. The swagger models this as a byte
   * array (`[]integer`), but the JSON the client sends and receives is the hex
   * string form, so it is typed as `string` here.
   */
  address: string
  /** Shorthand for `meta["name"]`; a locale map on read. */
  name?: MultilingualText
  /** Shorthand for `meta["description"]`; a locale map on read. */
  description?: MultilingualText
  /** Shorthand for `meta["logo"]`; a locale map on read. */
  logo?: MultilingualText
  website?: string
  /** Brand color in hex format. */
  color?: string
  /** Size category of the organization. */
  size?: string
  /** Organization type (see `GET /organizations/types`). */
  type?: string
  country?: string
  timezone?: string
  subdomain?: string
  active?: boolean
  communications?: boolean
  /** Whether this org is subscribed to the (free) integrator plan. */
  integrator?: boolean
  /** Creation timestamp, RFC3339. */
  createdAt?: string
  /**
   * Integrator org (hex) that manages this org; absent for regular orgs. Lets
   * clients tell managed orgs apart from the user's own orgs.
   */
  managedBy?: string
  /** Arbitrary metadata; `name` / `description` / `logo` mirror `meta[...]`. */
  meta?: Record<string, unknown>
  /** Usage counters for the organization. */
  counters?: SubscriptionUsage
  /** Subscription details for the organization. */
  subscription?: SubscriptionDetails
  /** Parent organization when this is a sub-organization. */
  parent?: Organization
}

/**
 * Body of `POST /organizations` (and, as a `Partial`, `PUT /organizations/{address}`).
 * Mirrors the SaaS `apicommon.CreateOrganizationRequest`: the write shape of
 * {@link Organization} plus `provisionAccount`. On write, `name` / `description` /
 * `logo` accept a plain string (stored as `{ default: value }`) or a locale map.
 */
export interface CreateOrganizationRequest {
  name: string | MultilingualText
  description?: string | MultilingualText
  logo?: string | MultilingualText
  website?: string
  color?: string
  size?: string
  type?: string
  country?: string
  timezone?: string
  subdomain?: string
  active?: boolean
  communications?: boolean
  /** Opt-in to the free integrator plan at creation. */
  integrator?: boolean
  meta?: Record<string, unknown>
  /** Opt-in to eagerly provision the on-chain account at creation (default false). */
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

/**
 * The richer SaaS census-management shape carried by a process (and its bundle).
 * Distinct from the voting-time {@link Census}: this describes how voters
 * authenticate (`authFields` / `twoFaFields`) and the census `type`, which is
 * what a login form needs. An empty/absent `twoFaFields` means an auth-only
 * census (step 0 already returns a verified token, no OTP).
 */
export interface CensusInfo {
  id?: string
  /** SaaS census auth type, e.g. "csp", "sms" — not a {@link CensusSource}. */
  type?: string
  /** Whether votes are weighted by the census. */
  weighted?: boolean
  size?: number
  /** Published census URI (from `published.uri`). */
  uri?: string
  /** Identity fields the voter must supply at auth step 0. */
  authFields?: string[]
  /** 2FA contact fields; empty/absent ⇒ auth-only census. */
  twoFaFields?: string[]
}

/**
 * Member-data fields a CSP census can authenticate on. Listed at census
 * creation / group publish; an auth-only census (no 2FA) is one with only
 * `authFields` set.
 */
export type OrgMemberAuthField = 'name' | 'surname' | 'memberNumber' | 'nationalId' | 'birthDate'
/** Contact fields used for the 2FA OTP challenge. */
export type OrgMemberTwoFaField = 'email' | 'phone'

/** Body of `POST /census` — creates an (empty) org-level CSP census. */
export interface CreateCensusRequest {
  orgAddress: string
  authFields?: OrgMemberAuthField[]
  twoFaFields?: OrgMemberTwoFaField[]
}

/** Response of `POST /census` — only the new census id (as `id`). */
export interface CreateCensusResponse {
  id: string
}

/** The SaaS census record returned by `GET /census/{id}`. */
export interface OrganizationCensus {
  censusId: string
  type?: string
  orgAddress: string
  size?: number
  weighted?: boolean
  groupID?: string
  authFields?: OrgMemberAuthField[]
  twoFaFields?: OrgMemberTwoFaField[]
}

/** Body of `POST /census/{id}/group/{groupId}/publish`. */
export interface PublishCensusGroupRequest {
  authFields?: OrgMemberAuthField[]
  twoFaFields?: OrgMemberTwoFaField[]
  weighted?: boolean
}

/** Body of `POST /census/{id}/publish`. */
export interface PublishCensusRequest {
  authFields?: OrgMemberAuthField[]
  twoFaFields?: OrgMemberTwoFaField[]
  weighted?: boolean
}

/** Response of the census publish endpoints. */
export interface PublishedCensusResponse {
  uri: string
  /** Census Merkle root (hex). */
  root: string
  size: number
}

/** Body of `POST /census/{id}` — adds existing org members to the census. */
export interface AddCensusParticipantsRequest {
  memberIds: string[]
}

/** `GET /census/{id}/participants` — the member ids in the census. */
export interface CensusParticipantsResponse {
  censusId: string
  memberIds: string[]
}

// ─── Election ─────────────────────────────────────────────────────────────────

export type ElectionStatus = 'READY' | 'PAUSED' | 'ENDED' | 'CANCELED' | 'UPCOMING'

/**
 * Per-question (on-chain election) status. Each question in a voting process is
 * a separate Vochain election, so its status follows the Vochain lifecycle.
 * Use {@link computeProcessStatus} (from `@vocdoni/api-client`) to derive a
 * combined status for the whole process.
 */
export type QuestionStatus =
  | 'PROCESS_UNKNOWN'
  | 'UPCOMING'
  | 'ONGOING'
  | 'ENDED'
  | 'CANCELED'
  | 'PAUSED'
  | 'RESULTS'

/**
 * Language-keyed election text, e.g. `{ default: 'Hello', es: 'Hola' }`. The SaaS
 * API stores every human-facing string (titles, descriptions, choice labels) this
 * way and rejects a bare string; the `default` key is the fallback locale.
 */
export type MultiLangString = Record<string, string>

/**
 * Election text as accepted by the SDK: either a plain `string` — which the
 * client normalizes to `{ default: value }` before sending — or an explicit
 * {@link MultiLangString}. Responses always come back as a {@link MultiLangString}.
 */
export type LocalizedInput = string | MultiLangString

export interface Choice {
  title: LocalizedInput
  value: number
}

export interface Question {
  title: LocalizedInput
  description?: LocalizedInput
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
  /** Whether the process starts automatically at its start date. */
  autostart?: boolean
  interruptible: boolean
  /** Whether the census can grow after the process starts. */
  dynamicCensus?: boolean
  secretUntilTheEnd: boolean
  anonymous: boolean
  metadata?: { encrypted: boolean }
}

export interface Election {
  id: string
  /**
   * On-chain (Vochain) process id, 64-hex. Returned as `address` by
   * `GET /process/{id}`; this is the id the vote/sign/check flow signs against.
   * The top-level `id` is the Mongo ObjectID used to fetch the process.
   *
   * Required: the CSP check/sign and the vote envelope are keyed by this id, and
   * the Mongo id is not a valid substitute. {@link mapProcessToElection} throws
   * if the process response omits it.
   */
  address: string
  /** Vochain chain id the vote signs against, e.g. "vocdoni/DEV/36". */
  chainId?: string
  title: LocalizedInput
  description?: LocalizedInput
  header?: string
  status: ElectionStatus
  startDate: string
  endDate: string
  organizationId: string
  voteCount: number
  finalResults: boolean
  results?: string[][]
  /** Process census info (auth fields, type, size) — see {@link CensusInfo}. */
  census?: CensusInfo
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

/** Synchronous response of `POST /process/{id}/publish` when already published. */
export interface PublishProcessResponse {
  /** On-chain (Vochain) process id, hex. */
  address: string
  status: string
}

export interface SetElectionStatusRequest {
  status: 'ready' | 'paused' | 'ended' | 'canceled'
}

export interface ElectionMetadata {
  title: LocalizedInput
  description?: LocalizedInput
  questions: Question[]
  media?: { header?: string }
}

export interface ElectionListParams {
  /**
   * Owner organization address filter. The returned list items echo it as
   * UNPREFIXED lowercase hex regardless of the form passed here — see
   * {@link VotingProcessBase.orgAddress}.
   */
  orgAddress: string
  status?: string
  page?: number
  limit?: number
}

export interface BallotProtocol {
  costExponent: number
  costFromWeight: boolean
  maxCount: number
  maxTotalCost: number
  maxValue: number
  maxVoteOverwrites: number
  uniqueValues: boolean
}

export interface QuestionTypeSetup {
  maxChoices: number
  minChoices: number
  uniqueChoices: boolean
}

export interface VotingProcessQuestion {
  id: string
  parentProcessId: string
  upstreamId?: string
  title: MultiLangString
  description?: MultiLangString
  choices: Choice[]
  eligibleMemberIds?: string[]
  ballotProtocol: BallotProtocol
  /**
   * Named question type as stored — `"singlechoice"` / `"multichoice"` when
   * the question was created with one (see {@link VotingProcessQuestionType}),
   * empty for raw-`ballotProtocol` questions. Kept as `string` defensively.
   */
  type: string
  typeSetup?: QuestionTypeSetup
  secretUntilTheEnd: boolean
  status: QuestionStatus
  metadata?: Record<string, unknown>
}

export interface CensusSpec {
  authFields?: OrgMemberAuthField[]
  groupId?: string
  memberIds?: string[]
  twoFaFields?: OrgMemberTwoFaField[]
  weighted?: boolean
}

/** Per-question member eligibility restriction (subset of the process census). */
export interface EligibilitySpec {
  groupId?: string
  memberIds?: string[]
}

/**
 * Fields shared by both variants of {@link VotingProcessResponse}. Returned by
 * `GET /processes/{id}` and as the list items of `GET /processes`.
 */
export interface VotingProcessBase {
  /** Process id, a Mongo ObjectID (24-hex chars) — never a `0x…` hex id. */
  id: string
  /**
   * Owner organization address as UNPREFIXED lowercase hex (e.g.
   * `"1a9ffe1f4c2493578ce4a7dbebd7d95433eee6f0"`). Beware: other endpoints
   * (`GET /auth/addresses`, `GET /organizations/{address}`) return the same
   * logical value `0x`-prefixed, so never compare the raw strings across
   * endpoints — strip/normalize the `0x` prefix first.
   */
  orgAddress: string
  title: MultiLangString
  description?: MultiLangString
  header?: string
  streamUri?: string
  census: CensusSpec
  questions: VotingProcessQuestion[]
}

/**
 * A process that has not been published yet. Drafts can legitimately lack both
 * dates: `endDate` is optional at creation and `startDate` may be omitted to
 * mean "start immediately on publish". The backend serializes both with
 * `omitempty`, so absent means absent — do not synthesize values.
 */
export interface DraftVotingProcessResponse extends VotingProcessBase {
  published: false
  startDate?: string
  endDate?: string
}

/**
 * A published process. Publish validation hard-requires a future `endDate`, so
 * it is always present.
 *
 * Caveat: the `startDate` guarantee lands with saas-backend#586 (backfills
 * `startDate` at publish), merged 2026-07 — processes published before that
 * deploy may still omit `startDate`, so runtime consumers should stay
 * defensive about its absence when reading older processes.
 */
export interface PublishedVotingProcessResponse extends VotingProcessBase {
  published: true
  startDate: string
  endDate: string
}

/**
 * Response of `GET /processes/{id}` (and list items of `GET /processes`),
 * discriminated on `published`: drafts may lack `startDate`/`endDate`;
 * published processes always carry them. Narrow on `published` before reading
 * the dates.
 */
export type VotingProcessResponse = DraftVotingProcessResponse | PublishedVotingProcessResponse

export interface VotingProcessListResponse {
  processes: VotingProcessResponse[]
  pagination: Pagination
}

/** Public read of a single question; returned by `GET /processes/{id}/questions/{qId}`. */
export interface PublicQuestionResponse {
  id: string
  parentProcessId: string
  upstreamId?: string
  title: MultiLangString
  description?: MultiLangString
  choices: Choice[]
  ballotProtocol?: BallotProtocol
  census?: CensusSpec
  type?: string
  typeSetup?: QuestionTypeSetup
  secretUntilTheEnd: boolean
  status: QuestionStatus
  metadata?: Record<string, unknown>
}

/** Per-question entry in `GET /processes/{id}/results`. */
export interface VotingProcessQuestionResults {
  questionId: string
  upstreamId?: string
  status: QuestionStatus
  voteCount: number
  startDate: string
  endDate: string
  finalResults: boolean
  results?: string[][]
}

/** Response of `GET /processes/{id}/results`. */
export interface VotingProcessResultsResponse {
  id: string
  questions: VotingProcessQuestionResults[]
}

/** Response of `GET /processes/{id}/check` — publish-readiness dry-run. */
export interface VotingProcessValidateResponse {
  valid: boolean
  errors?: string[]
}

/**
 * Named question types the backend accepts — lowercase only. CamelCase
 * variants (`"singleChoice"`, `"multiChoice"`) are rejected with
 * `unsupported type` (error code 40037), and there is no `"approval"` type.
 */
export const VOTING_PROCESS_QUESTION_TYPES = ['singlechoice', 'multichoice'] as const

/** Named question type — see {@link VOTING_PROCESS_QUESTION_TYPES}. */
export type VotingProcessQuestionType = (typeof VOTING_PROCESS_QUESTION_TYPES)[number]

/**
 * Question input for {@link CreateVotingProcessRequest}. Each question carries
 * its own ballot protocol.
 *
 * Each question requires EITHER a named `type` OR a raw `ballotProtocol`;
 * omitting both is rejected with "a type or a ballotProtocol is required".
 * When both are given, `ballotProtocol` wins.
 */
export interface VotingProcessQuestionRequest {
  title: LocalizedInput
  description?: LocalizedInput
  choices?: Choice[]
  /** Raw ballot protocol; overrides `type` + `typeSetup` when both are given. */
  ballotProtocol?: BallotProtocol
  /** Per-question member eligibility restriction. */
  census?: EligibilitySpec
  /**
   * Named question type. Lowercase only — the backend rejects `"singleChoice"`
   * / `"multiChoice"` with `unsupported type` (40037). Required unless
   * `ballotProtocol` is given (which takes precedence over it).
   */
  type?: VotingProcessQuestionType
  /**
   * Type-specific configuration. Required for `"multichoice"`, which validates
   * `1 <= maxChoices <= choices.length` and `minChoices <= maxChoices`.
   * `"singlechoice"` ignores it.
   */
  typeSetup?: QuestionTypeSetup
  secretUntilTheEnd?: boolean
  metadata?: Record<string, unknown>
}

/** Body of `POST /processes` and `PUT /processes/{id}` — flat process draft with per-question ballot protocols. */
export interface CreateVotingProcessRequest {
  /**
   * Owner organization address. The request side tolerates the `0x`-prefixed
   * form (verified live), but note the asymmetry: process reads
   * ({@link VotingProcessResponse}) always return it back as UNPREFIXED
   * lowercase hex, so don't expect to read back what you sent.
   */
  orgAddress: string
  census?: CensusSpec
  title: LocalizedInput
  description?: LocalizedInput
  header?: string
  streamUri?: string
  startDate?: string
  endDate?: string
  questions: VotingProcessQuestionRequest[]
}

/** Response of `POST /processes`. */
export interface CreateVotingProcessResponse {
  /** New process id — a Mongo ObjectID (24-hex chars), never a `0x…` hex id. */
  processId: string
}

/** Identifies one target question by id inside {@link SetQuestionsStatusRequest}. */
export interface QuestionStatusID {
  id: string
}

/** Body of `PUT /processes/{id}/questions/status` — bulk question status change. */
export interface SetQuestionsStatusRequest {
  status: string
  /** Questions to transition; omitted/empty targets every published question. */
  questions?: QuestionStatusID[]
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
  /** Census-management info shared by the bundle's processes — see {@link CensusInfo}. */
  census?: CensusInfo
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

/** Legacy response of `POST /process/{id}/sign-info` (single-election model). */
export interface ConsumedAddressResponse {
  authToken?: string
  /** Vote nullifier of the consumed process. */
  nullifier: string
  /** Consumption timestamp. */
  at: string
}

/** One question's consumed voting info in {@link ProcessSignInfoResponse}. */
export interface QuestionConsumedAddress {
  questionId: string
  /** Vochain election id of the question (64-hex). */
  upstreamId: string
  /** Ephemeral address that consumed the question's election. */
  address: string
  /** Vote nullifier. */
  nullifier: string
  /** Consumption timestamp. */
  at: string
}

/**
 * Response of `POST /processes/{id}/sign-info` — the voter's consumed
 * addresses/nullifiers across a voting process, one entry per question the
 * voter has already cast (questions not voted are omitted).
 */
export interface ProcessSignInfoResponse {
  consumed: QuestionConsumedAddress[]
}

// ─── Pagination ─────────────────────────────────────────────────────────────────

export interface Pagination {
  totalItems: number
  previousPage: number | null
  currentPage: number
  nextPage: number | null
  lastPage: number
}

// ─── Organizations (full SaaS shape) ───────────────────────────────────────────
// The integrator / managed-org flows use the same `apicommon.OrganizationInfo`
// schema as {@link Organization}. Kept as an alias so existing call sites keep
// working without duplicating the field list.

export type OrganizationInfo = Organization

/** Body of `POST /integrator/organizations` — creates a managed organization. */
export interface CreateManagedOrganizationRequest {
  /** Organization type, e.g. "company" (see `GET /organizations/types`). */
  type: string
  website?: string
  size?: string
  color?: string
  country?: string
  timezone?: string
  meta?: Record<string, unknown>
  /** Optionally assign an existing user (by email) as the managed org's admin. */
  ownerEmail?: string
}

export interface ManagedOrganizationsResponse {
  organizations: OrganizationInfo[]
  pagination?: Pagination
}

// ─── Organization members (memberbase) ──────────────────────────────────────────

export interface OrgMember {
  /** Internal member id (member UID); assigned by the backend. */
  id?: string
  email?: string
  phone?: string
  memberNumber?: string
  nationalId?: string
  name?: string
  surname?: string
  birthDate?: string
  weight?: number
  other?: Record<string, unknown>
}

export interface AddMembersRequest {
  members: OrgMember[]
}

/** Response of `POST /organizations/{address}/members`. Async for large batches. */
export interface AddMembersResponse {
  added: number
  errors?: string[]
  /** Present when the add runs asynchronously — poll the members job. */
  jobId?: string
}

/** Status of an async member-add job (`progress === 100` means done). */
export interface AddMembersJobResponse {
  added: number
  total: number
  /** added / total * 100. */
  progress: number
  errors?: string[]
}

export interface OrganizationMembersResponse {
  members: OrgMember[]
  pagination?: Pagination
}

export interface DeleteMembersRequest {
  ids?: string[]
  all?: boolean
}

export interface DeleteMembersResponse {
  count: number
}

// ─── Organization member groups ─────────────────────────────────────────────────
// Uploading members auto-creates the "All members" auto group, listed first.

export interface OrganizationGroup {
  id: string
  title?: string
  description?: string
  memberIds?: string[]
  censusIds?: string[]
  membersCount?: number
  /** The auto-generated "All members" group (cannot be deleted/edited). */
  isAutoGroup?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface OrganizationGroupsResponse {
  groups: OrganizationGroup[]
  pagination?: Pagination
}

export interface CreateGroupRequest {
  title: string
  description?: string
  /** Optional when `includeAllMembers` is true. */
  memberIds?: string[]
  includeAllMembers?: boolean
}

export interface CreateGroupResponse {
  id: string
}

export interface UpdateGroupRequest {
  title?: string
  description?: string
  addMembers?: string[]
  removeMembers?: string[]
}

export interface ListGroupMembersResponse {
  members: OrgMember[]
  pagination?: Pagination
}

export interface ValidateGroupRequest {
  authFields?: OrgMemberAuthField[]
  twoFaFields?: OrgMemberTwoFaField[]
}

// ─── Process bundle creation ────────────────────────────────────────────────────

export interface CreateProcessBundleRequest {
  censusId: string
  /** On-chain process ids (hex) to include in the bundle. */
  processes: string[]
}

/** Response of `POST /process/bundle`. The bundle id is the last segment of `uri`. */
export interface CreateProcessBundleResponse {
  uri: string
  root: string
}

/** Body of `POST /process/bundle/{bundleId}/participants/check`. */
export interface BundleParticipantsCheckRequest {
  /** Member field to match on, e.g. "memberNumber". */
  fieldName: string
  value: string
  /** On-chain process id (hex). */
  processID: string
}

export interface BundleParticipantEntry {
  memberId: string
  name?: string
  surname?: string
  email?: string
  memberNumber?: string
  hasVoted: boolean
}

export interface BundleParticipantsCheckResponse {
  participants: BundleParticipantEntry[]
}

// ─── API keys (integrator) ──────────────────────────────────────────────────────

export interface CreateApiKeyRequest {
  label: string
  /** Subset of: quota:read, managed:read, managed:write, voting:write, members:write. */
  scopes: string[]
  expiresAt?: string
}

export interface ApiKeyInfo {
  id: string
  label: string
  prefix: string
  scopes: string[]
  createdBy: string
  createdAt: string
  lastUsedAt?: string
  expiresAt?: string
  revoked: boolean
}

/** Returned once at creation — `secret` is never retrievable again. */
export interface CreateApiKeyResponse extends ApiKeyInfo {
  secret: string
}

export interface ListApiKeysResponse {
  apiKeys: ApiKeyInfo[]
}

// ─── Organization meta ──────────────────────────────────────────────────────────

export interface OrganizationMetaRequest {
  meta: Record<string, unknown>
}

export interface OrganizationMetaResponse {
  meta: Record<string, unknown>
}

// ─── Misc reads ─────────────────────────────────────────────────────────────────

export interface OrganizationAddresses {
  addresses: string[]
}

export interface JobInfo {
  jobId: string
  type: JobType
  total: number
  added: number
  errors?: string[]
  createdAt: string
  completedAt?: string
  completed: boolean
}

export interface JobsResponse {
  jobs: JobInfo[]
  pagination?: Pagination
}

export interface OrganizationRole {
  role: string
  name: string
  organizationWritePermission: boolean
  processWritePermission: boolean
}

export interface OrganizationType {
  type: string
  name: string
}

export interface OrganizationCensusesResponse {
  censuses: OrganizationCensus[]
}

export interface SubscriptionDetails {
  planId: string
  startDate: string
  renewalDate: string
  lastPaymentDate: string
  active: boolean
  email: string
}

export interface SubscriptionUsage {
  /** Number of voting processes created. */
  processes: number
  /** Number of emails sent. */
  sentEmails: number
  /** Number of SMS messages sent. */
  sentSMS: number
  /** Number of votes relayed. */
  sentVotes: number
  /** Number of sub-organizations created. */
  subOrgs: number
  /** Number of users in the organization. */
  users: number
}

/** A subscription plan (`GET /plans`). Nested limit objects are left open-ended. */
export interface SubscriptionPlan {
  id: string
  name: string
  monthlyPrice: number
  yearlyPrice: number
  default: boolean
  organization?: unknown
  votingTypes?: unknown
  features?: unknown
  integratorLimits?: unknown
}

export interface OrganizationSubscriptionInfo {
  subscriptionDetails: SubscriptionDetails
  usage: SubscriptionUsage
  plan: SubscriptionPlan
}

/** A process bundle owned by an organization (`GET /organizations/{address}/processes`). */
export interface OrganizationBundle {
  bundleId: string
  primaryProcessId: string
  processes: string[]
}

/** `GET /organizations/{address}/processes/drafts`. `processes` are raw process docs. */
export interface OrganizationProcessDraftsResponse {
  processes: unknown[]
  pagination?: Pagination
}

export interface DeleteManagedOrganizationResponse {
  address: string
}

// ─── Client config ────────────────────────────────────────────────────────────

export interface ApiClientConfig {
  apiUrl: string
  authToken?: string | (() => string | null | undefined) | (() => Promise<string | null | undefined>)
}
