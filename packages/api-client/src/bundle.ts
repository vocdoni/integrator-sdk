import type {
  AuthResendRequest,
  AuthResponse,
  Bundle,
  BundleAuthChallengeRequest,
  BundleAuthRequest,
  BundleParticipantsCheckRequest,
  BundleParticipantsCheckResponse,
  CheckMembershipRequest,
  CheckMembershipResponse,
  CreateProcessBundleRequest,
  CreateProcessBundleResponse,
  OrgMember,
  SignRequest,
  UserWeightRequest,
  UserWeightResponse,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

/** A created/updated bundle plus its parsed id (the last segment of `uri`). */
export interface CreatedBundle extends CreateProcessBundleResponse {
  bundleId: string
}

/** Extract the bundle id from the `uri` the create/update endpoints return. */
function bundleIdFromUri(uri: string): string {
  return uri.replace(/\/+$/, '').split('/').pop() ?? ''
}

/**
 * Client for the SaaS bundle endpoints. A bundle groups processes that share a
 * census; it is created by an organizer ({@link create}) and then used by voters
 * for the CSP auth flow under /process/bundle/{bundleId}/* (a voter authenticates
 * once via auth step 0 + step 1 and reuses the verified `authToken` for every
 * process in the bundle — check, sign, weight).
 */
export class BundleClient {
  constructor(private readonly fetch: UpFetch) {}

  /** Create a process bundle from a census and one or more on-chain processes. */
  async create(body: CreateProcessBundleRequest): Promise<CreatedBundle> {
    const res = await this.fetch<CreateProcessBundleResponse>('/process/bundle', {
      method: 'POST',
      body,
    }).catch(handleError)
    return { ...res, bundleId: bundleIdFromUri(res.uri) }
  }

  /** Update an existing bundle's process list. */
  async update(bundleId: string, body: CreateProcessBundleRequest): Promise<CreatedBundle> {
    const res = await this.fetch<CreateProcessBundleResponse>(`/process/bundle/${bundleId}`, {
      method: 'PUT',
      body,
    }).catch(handleError)
    return { ...res, bundleId: bundleIdFromUri(res.uri) }
  }

  /** Fetch public bundle info (processes, census, Vochain chain id). */
  async get(bundleId: string): Promise<Bundle> {
    return this.fetch<Bundle>(`/process/bundle/${bundleId}`).catch(handleError)
  }

  /**
   * Auth step 0 — identify the participant. Returns a token; for auth-only
   * censuses that token is already verified, otherwise a 2FA challenge is sent
   * and the token must be confirmed via {@link authStep1}.
   */
  async authStep0(bundleId: string, body: BundleAuthRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/process/bundle/${bundleId}/auth/0`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Auth step 1 — confirm the 2FA challenge (OTP) for the step-0 token. */
  async authStep1(bundleId: string, body: BundleAuthChallengeRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/process/bundle/${bundleId}/auth/1`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Resend the challenge for an existing, non-verified auth token. */
  async resend(bundleId: string, body: AuthResendRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/process/bundle/${bundleId}/auth/resend`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Check whether the token's voter is an eligible participant of the bundle's census. */
  async check(bundleId: string, body: CheckMembershipRequest): Promise<CheckMembershipResponse> {
    return this.fetch<CheckMembershipResponse>(`/process/bundle/${bundleId}/check`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Request the CSP signature over the voter's (ephemeral) address for a process. */
  async sign(bundleId: string, body: SignRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/process/bundle/${bundleId}/sign`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Get the voter's census weight for the bundle. */
  async weight(bundleId: string, body: UserWeightRequest): Promise<UserWeightResponse> {
    return this.fetch<UserWeightResponse>(`/process/bundle/${bundleId}/weight`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Public info for a single participant of the bundle. */
  async getParticipant(bundleId: string, participantId: string): Promise<OrgMember> {
    return this.fetch<OrgMember>(`/process/bundle/${bundleId}/${participantId}`).catch(handleError)
  }

  /** Look up participants by a member field and report whether they have voted. */
  async participantsCheck(
    bundleId: string,
    body: BundleParticipantsCheckRequest,
  ): Promise<BundleParticipantsCheckResponse> {
    return this.fetch<BundleParticipantsCheckResponse>(
      `/process/bundle/${bundleId}/participants/check`,
      { method: 'POST', body },
    ).catch(handleError)
  }
}
