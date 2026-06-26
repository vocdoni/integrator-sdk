import type {
  AddCensusParticipantsRequest,
  AddMembersResponse,
  CensusParticipantsResponse,
  CreateCensusRequest,
  CreateCensusResponse,
  OrganizationCensus,
  PublishCensusGroupRequest,
  PublishCensusRequest,
  PublishedCensusResponse,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

/**
 * Client for the SaaS census endpoints. A census is created empty at the
 * organization level (carrying its auth fields), then populated either from the
 * organization memberbase (participants) or, more commonly, published from a
 * member group via {@link publishGroup}.
 */
export class CensusClient {
  constructor(private readonly fetch: UpFetch) {}

  /** Fetch a census by id. */
  async get(id: string): Promise<OrganizationCensus> {
    return this.fetch<OrganizationCensus>(`/census/${id}`).catch(handleError)
  }

  /** Create an (empty) org-level CSP census. Returns the new census `id`. */
  async create(data: CreateCensusRequest): Promise<CreateCensusResponse> {
    return this.fetch<CreateCensusResponse>('/census', {
      method: 'POST',
      body: data,
    }).catch(handleError)
  }

  /** Add existing organization members (by id) to the census. */
  async addParticipants(
    id: string,
    body: AddCensusParticipantsRequest,
  ): Promise<AddMembersResponse> {
    return this.fetch<AddMembersResponse>(`/census/${id}`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /** List the member ids currently in the census. */
  async getParticipants(id: string): Promise<CensusParticipantsResponse> {
    return this.fetch<CensusParticipantsResponse>(`/census/${id}/participants`).catch(handleError)
  }

  /** Publish the census (builds the Merkle census from its current participants). */
  async publish(id: string, body?: PublishCensusRequest): Promise<PublishedCensusResponse> {
    return this.fetch<PublishedCensusResponse>(`/census/${id}/publish`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }

  /**
   * Publish the census from an organization member group. Supplying only
   * `authFields` (no `twoFaFields`) yields an auth-only (no OTP) CSP census.
   */
  async publishGroup(
    id: string,
    groupId: string,
    body: PublishCensusGroupRequest,
  ): Promise<PublishedCensusResponse> {
    return this.fetch<PublishedCensusResponse>(`/census/${id}/group/${groupId}/publish`, {
      method: 'POST',
      body,
    }).catch(handleError)
  }
}
