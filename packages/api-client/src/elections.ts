import type {
  ConsumedAddressRequest,
  ConsumedAddressResponse,
  CreateProcessRequest,
  Election,
  ElectionListParams,
  ElectionMetadata,
  ElectionResults,
  EnqueuedResponse,
  PaginatedElections,
  PublishProcessResponse,
  RelayVoteRequest,
  RelayVoteResponse,
  SetElectionStatusRequest,
  UpdateElectionRequest,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'
import { JobsClient, type WaitForJobOptions } from './jobs'
import { mapProcessToElection, type ProcessResponse } from './process-mapper'

/** True when a publish response is the async enqueued form (vs. already published). */
function isEnqueued(res: PublishProcessResponse | EnqueuedResponse): res is EnqueuedResponse {
  return (res as EnqueuedResponse).jobId !== undefined
}

/**
 * Client for SaaS processes (elections). Creation and lifecycle changes are
 * SaaS-mediated: `create` stores a draft, while `publish` and `setStatus` submit
 * on-chain transactions asynchronously and return a job id to poll (the
 * `*AndWait` helpers do the polling for you).
 */
export class ElectionsClient {
  private readonly jobs: JobsClient

  constructor(private readonly fetch: UpFetch) {
    this.jobs = new JobsClient(fetch)
  }

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

  async getMetadata(id: string): Promise<ElectionMetadata> {
    return this.fetch<ElectionMetadata>(`/process/${id}/metadata`).catch(handleError)
  }

  async list(params?: ElectionListParams): Promise<PaginatedElections> {
    return this.fetch<PaginatedElections>('/process', { params }).catch(handleError)
  }

  /** Create a process draft. Returns the draft id (Mongo ObjectID hex). */
  async create(draft: CreateProcessRequest): Promise<string> {
    return this.fetch<string>('/process', {
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

  async delete(id: string): Promise<void> {
    return this.fetch<void>(`/process/${id}`, { method: 'DELETE' }).catch(handleError)
  }

  /**
   * Publish a draft on-chain. Returns the enqueued job (`{ jobId }`) to poll, or
   * the already-published `{ address, status }` if it was published before.
   * Prefer {@link publishAndWait} unless you want to manage polling yourself.
   */
  async publish(draftId: string): Promise<PublishProcessResponse | EnqueuedResponse> {
    return this.fetch<PublishProcessResponse | EnqueuedResponse>(`/process/${draftId}/publish`, {
      method: 'POST',
    }).catch(handleError)
  }

  /** Publish a draft and wait for the on-chain result (`{ address, status }`). */
  async publishAndWait(
    draftId: string,
    opts?: WaitForJobOptions,
  ): Promise<PublishProcessResponse> {
    const res = await this.publish(draftId)
    if (!isEnqueued(res)) return res
    const job = await this.jobs.waitFor(res.jobId, opts)
    return { address: job.result?.address ?? '', status: job.result?.status ?? '' }
  }

  /** Change a process status. Returns the enqueued job to poll. */
  async setStatus(id: string, status: SetElectionStatusRequest): Promise<EnqueuedResponse> {
    return this.fetch<EnqueuedResponse>(`/process/${id}/status`, {
      method: 'PUT',
      body: status,
    }).catch(handleError)
  }

  /** Change a process status and wait for the on-chain transaction to complete. */
  async setStatusAndWait(
    id: string,
    status: SetElectionStatusRequest,
    opts?: WaitForJobOptions,
  ): Promise<PublishProcessResponse> {
    const { jobId } = await this.setStatus(id, status)
    const job = await this.jobs.waitFor(jobId, opts)
    return { address: job.result?.address ?? '', status: job.result?.status ?? '' }
  }

  /** Consumed-address / sign-info: report the nullifier consumed for a process. */
  async signInfo(id: string, body: ConsumedAddressRequest): Promise<ConsumedAddressResponse> {
    return this.fetch<ConsumedAddressResponse>(`/process/${id}/sign-info`, {
      method: 'POST',
      body,
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
