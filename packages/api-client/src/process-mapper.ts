import type {
  CensusInfo,
  Election,
  ElectionStatus,
  ElectionType,
  EncryptionKey,
  Question,
  VoteType,
} from '@vocdoni/api-types'

/** A localized string field as returned by the API: `{ default: "…" }`. */
interface LocalizedString {
  default?: string
  [lang: string]: string | undefined
}

/**
 * Raw shape of `GET /process/{id}` (addressed by Mongo ObjectID). The old
 * `/process/{id}/metadata` flat shape is gone — the bundle info is now merged in
 * here: the vochain id arrives as `address`, the chain id as `chainId`, and the
 * election definition is nested under `electionParams`.
 *
 * Note the API typo `orgAdress` (single "d") at the top level.
 */
export interface ProcessResponse {
  id: string
  /** Vochain process id (64-hex). */
  address?: string
  /** Vochain chain id, e.g. "vocdoni/DEV/36". */
  chainId?: string
  status?: ElectionStatus
  /** Owner organization address (hex). API typo: single "d". */
  orgAdress?: string
  census?: {
    id?: string
    type?: string
    weighted?: boolean
    size?: number
    published?: { uri?: string; root?: string }
    authFields?: string[]
    twoFaFields?: string[]
  }
  metadata?: {
    title?: string | LocalizedString
    description?: string | LocalizedString
  }
  electionParams?: {
    title?: string | LocalizedString
    description?: string | LocalizedString
    startDate?: string
    endDate?: string
    questions?: Question[]
    voteType?: VoteType
    electionType?: ElectionType
    maxCensusSize?: number
  }
  voteCount?: number
  finalResults?: boolean
  encryptionPublicKeys?: EncryptionKey[]
  publishedAt?: string
}

/** Vote defaults for a single-choice, non-weighted election (used when the process omits voteType). */
const DEFAULT_VOTE_TYPE: VoteType = {
  maxCount: 1,
  maxValue: 1,
  maxVoteOverwrites: 0,
  costExponent: 1,
  uniqueChoices: false,
  costFromWeight: false,
}

/** Election defaults for a standard interruptible, public, non-anonymous election. */
const DEFAULT_ELECTION_TYPE: ElectionType = {
  interruptible: true,
  secretUntilTheEnd: false,
  anonymous: false,
}

/** Picks a plain string from either a raw string or a `{ default }` localized object. */
function plain(value?: string | LocalizedString): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  return value.default
}

/** Flattens the process census onto the public {@link CensusInfo} (uri from published). */
function mapCensus(c?: ProcessResponse['census']): CensusInfo | undefined {
  if (!c) return undefined
  return {
    id: c.id,
    type: c.type,
    weighted: c.weighted,
    size: c.size,
    uri: c.published?.uri,
    authFields: c.authFields,
    twoFaFields: c.twoFaFields,
  }
}

/**
 * Maps the raw `GET /process/{id}` response onto the public, flat {@link Election}.
 * Keeps `id` as the Mongo id and exposes the vochain id as `address` plus the
 * `chainId` — the two values the voting flow needs.
 */
export function mapProcessToElection(p: ProcessResponse): Election {
  const params = p.electionParams ?? {}

  // The vochain id is what the vote/sign/check flow signs against; the Mongo id
  // is a different identifier space and not a valid substitute. Surface a missing
  // address loudly rather than letting a wrong-id vote fail opaquely downstream.
  if (!p.address) {
    throw new Error(`Process ${p.id} has no vochain address; cannot map to a votable Election`)
  }

  return {
    id: p.id,
    address: p.address,
    chainId: p.chainId,
    status: (p.status ?? 'READY') as ElectionStatus,
    // API exposes the owner as `orgAdress` (typo) — keep our field name stable.
    organizationId: p.orgAdress ?? '',
    title: plain(p.metadata?.title) ?? plain(params.title) ?? '',
    description: plain(p.metadata?.description) ?? plain(params.description),
    startDate: params.startDate ?? '',
    endDate: params.endDate ?? '',
    questions: params.questions ?? [],
    voteType: params.voteType ?? DEFAULT_VOTE_TYPE,
    electionType: params.electionType ?? DEFAULT_ELECTION_TYPE,
    census: mapCensus(p.census),
    voteCount: p.voteCount ?? 0,
    finalResults: p.finalResults ?? false,
    encryptionPublicKeys: p.encryptionPublicKeys,
  }
}
