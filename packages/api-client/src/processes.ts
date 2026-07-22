import type {
  AuthChallengeRequest,
  AuthRequest,
  AuthResendRequest,
  AuthResponse,
  CheckMembershipRequest,
  ConsumedAddressRequest,
  ProcessCheckResponse,
  ProcessSignInfoResponse,
  PublicQuestionResponse,
  SignRequest,
  UserWeightRequest,
  UserWeightResponse,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

/**
 * Voter-side client for the process-scoped CSP routes
 * (`/processes/{processId}/auth|check|sign|weight|sign-info` and the public
 * question read). This is the `/processes` replacement of the legacy
 * {@link BundleClient} flow — no bundle is involved; the auth token is anchored
 * directly to the voting process.
 *
 * Not to be confused with `client.elections` ({@link ElectionsClient}), which
 * wraps the ADMIN side of the same `/processes/{id}` resource (create, publish,
 * census and status management — API-key/JWT authenticated). Everything here is
 * public: the voter is identified by the CSP `authToken`, never by an API key.
 *
 * Ids to keep straight:
 * - `processId` is the process's Mongo ObjectID (the id `elections.get` takes),
 *   NOT a bundle id — the bundle routes 404 on it and vice versa.
 * - `electionId` in {@link sign} is the QUESTION's on-chain Vochain election id
 *   (`question.upstreamId` from the process read), not the process id.
 *
 * Typical voter flow: {@link authStep0} → {@link authStep1} (skip for auth-only
 * censuses) → {@link check} to learn per-question eligibility → per question,
 * {@link sign} the ephemeral address and cast the vote via `elections.vote`.
 */
export class ProcessesCspClient {
  constructor(private readonly fetch: UpFetch) {}

  /**
   * Auth step 0 — identify the participant. Returns a token; for auth-only
   * censuses that token is already verified, otherwise a 2FA challenge is sent
   * and the token must be confirmed via {@link authStep1}.
   */
  async authStep0(processId: string, body: AuthRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/processes/${processId}/auth/0`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Auth step 1 — confirm the 2FA challenge (OTP) for the step-0 token. */
  async authStep1(processId: string, body: AuthChallengeRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/processes/${processId}/auth/1`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Resend the challenge for an existing, non-verified auth token. */
  async resend(processId: string, body: AuthResendRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/processes/${processId}/auth/resend`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /**
   * The voter's status for the process: census membership, weight and
   * per-question eligibility/vote status. Ineligibility is reported as
   * `belongsToProcess: false` with HTTP 200, not an error.
   */
  async check(processId: string, body: CheckMembershipRequest): Promise<ProcessCheckResponse> {
    return this.fetch<ProcessCheckResponse>(`/processes/${processId}/check`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /**
   * Request the CSP signature over the voter's (ephemeral) address for one
   * question's on-chain election. `body.electionId` is the question's
   * `upstreamId`; each question can only be signed once.
   */
  async sign(processId: string, body: SignRequest): Promise<AuthResponse> {
    return this.fetch<AuthResponse>(`/processes/${processId}/sign`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** Get the voter's census weight for the process. */
  async weight(processId: string, body: UserWeightRequest): Promise<UserWeightResponse> {
    return this.fetch<UserWeightResponse>(`/processes/${processId}/weight`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /**
   * Consumed sign info: per-question address, nullifier and timestamp for the
   * questions the voter has already cast (others are omitted).
   */
  async signInfo(processId: string, body: ConsumedAddressRequest): Promise<ProcessSignInfoResponse> {
    return this.fetch<ProcessSignInfoResponse>(`/processes/${processId}/sign-info`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /**
   * Public voter read of a single question — choices, `ballotProtocol`, census
   * auth config and `encryptionKeys`, no API key needed. For
   * `secretUntilTheEnd` questions, `encryptionKeys` is absent until the
   * keykeepers publish the keys — poll until present before building an
   * encrypted ballot.
   */
  async getQuestion(processId: string, questionId: string): Promise<PublicQuestionResponse> {
    return this.fetch<PublicQuestionResponse>(
      `/processes/${processId}/questions/${questionId}`,
    ).catch(handleError)
  }
}
