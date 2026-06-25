import type {
  CreateElectionRequest,
  Election,
  ElectionListParams,
  ElectionResults,
  PaginatedElections,
  PublishElectionRequest,
  PublishElectionResponse,
  RelayVoteRequest,
  RelayVoteResponse,
  SetElectionStatusRequest,
  UpdateElectionRequest,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'
import { mapProcessToElection, type ProcessResponse } from './process-mapper'

export class ElectionsClient {
  constructor(private readonly fetch: UpFetch) {}

  /**
   * Fetch a process by its Mongo ObjectID. `GET /process/{id}` returns the merged
   * info (vochain `address`, `chainId`, census, nested `electionParams`); we map
   * it onto the flat {@link Election}. The vochain id lives on `election.address`.
   */
  async get(id: string): Promise<Election> {
    return this.fetch<ProcessResponse>(`/process/${id}`)
      .then(mapProcessToElection)
      .catch(handleError)
  }

  async getResults(id: string): Promise<ElectionResults> {
    return this.fetch<ElectionResults>(`/process/${id}/results`).catch(handleError)
  }

  async list(params?: ElectionListParams): Promise<PaginatedElections> {
    return this.fetch<PaginatedElections>('/process', { params }).catch(handleError)
  }

  async create(draft: CreateElectionRequest): Promise<Election> {
    return this.fetch<Election>('/process', {
      method: 'POST',
      body: draft,
    }).catch(handleError)
  }

  async update(draftId: string, data: UpdateElectionRequest): Promise<Election> {
    return this.fetch<Election>(`/process/${draftId}`, {
      method: 'PUT',
      body: data,
    }).catch(handleError)
  }

  async publish(draftId: string, req?: PublishElectionRequest): Promise<PublishElectionResponse> {
    return this.fetch<PublishElectionResponse>(`/process/${draftId}/publish`, {
      method: 'POST',
      body: req,
    }).catch(handleError)
  }

  async setStatus(id: string, status: SetElectionStatusRequest): Promise<void> {
    return this.fetch<void>(`/process/${id}/status`, {
      method: 'PUT',
      body: status,
    }).catch(handleError)
  }

  /**
   * Relay an already-signed vote. The target process is taken from the signed
   * envelope, so the relay endpoint is the flat, public `POST /vote`.
   */
  async vote(payload: RelayVoteRequest): Promise<RelayVoteResponse> {
    return this.fetch<RelayVoteResponse>('/vote', {
      method: 'POST',
      body: payload,
    }).catch(handleError)
  }
}
