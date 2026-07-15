import type {
  ConsumedAddressRequest,
  ConsumedAddressResponse,
  CreateVotingProcessRequest,
  CreateVotingProcessResponse,
  ElectionListParams,
  ElectionMetadata,
  EnqueuedResponse,
  LocalizedInput,
  MultiLangString,
  PublicQuestionResponse,
  PublishProcessResponse,
  QuestionStatusID,
  RelayVoteRequest,
  RelayVoteResponse,
  SetElectionStatusRequest,
  SetQuestionsStatusRequest,
  VotingProcessListResponse,
  VotingProcessResponse,
  VotingProcessResultsResponse,
  VotingProcessValidateResponse,
} from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'
import { JobsClient, type WaitForJobOptions } from './jobs'

/** True when a publish response is the async enqueued form (vs. already published). */
function isEnqueued(res: PublishProcessResponse | EnqueuedResponse): res is EnqueuedResponse {
  return (res as EnqueuedResponse).jobId !== undefined
}

/**
 * Coerce election text to the API's language-map form: a plain string becomes
 * `{ default: value }`, an existing {@link MultiLangString} is passed through.
 * The SaaS API rejects a bare string, so this lets callers pass either form.
 */
function toMultiLang(value: LocalizedInput | undefined): MultiLangString | undefined {
  if (value == null) return undefined
  return typeof value === 'string' ? { default: value } : value
}

/** Normalize every human-facing string in a voting process draft to a language map. */
function normalizeVotingProcessRequest(req: CreateVotingProcessRequest): CreateVotingProcessRequest {
  return {
    ...req,
    title: toMultiLang(req.title)!,
    description: toMultiLang(req.description),
    questions: req.questions?.map((q) => ({
      ...q,
      title: toMultiLang(q.title)!,
      description: toMultiLang(q.description),
      choices: q.choices?.map((c) => ({ ...c, title: toMultiLang(c.title)! })),
    })),
  }
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
   * Fetch a voting process by its Mongo ObjectID from `GET /processes/{id}`.
   * Returns the flat multi-question shape ({@link VotingProcessResponse}) with
   * per-question ballot protocols. The vochain id per question lives on
   * `questions[i].upstreamId`.
   */
  async get(id: string): Promise<VotingProcessResponse> {
    return this.fetch<VotingProcessResponse>(`/processes/${id}`).catch(handleError)
  }

  async getResults(id: string): Promise<VotingProcessResultsResponse> {
    return this.fetch<VotingProcessResultsResponse>(`/processes/${id}/results`).catch(handleError)
  }

  async getMetadata(id: string): Promise<ElectionMetadata> {
    return this.fetch<ElectionMetadata>(`/process/${id}/metadata`).catch(handleError)
  }

  async list({ orgAddress, ...params }: ElectionListParams): Promise<VotingProcessListResponse> {
    return this.fetch<VotingProcessListResponse>('/processes', { params: { orgAddress, ...params } }).catch(handleError)
  }

  /**
   * Create a process draft via `POST /processes`. Returns the draft id (Mongo
   * ObjectID hex). Each question carries its own `ballotProtocol`; title,
   * description, and choice titles may be plain strings (normalized to
   * `{ default }`) or explicit {@link MultiLangString} maps.
   */
  async create(draft: CreateVotingProcessRequest): Promise<string> {
    const body = normalizeVotingProcessRequest(draft)
    return this.fetch<CreateVotingProcessResponse>('/processes', {
      method: 'POST',
      body,
    })
      .then((res) => res.processId)
      .catch(handleError)
  }

  /**
   * Update a draft process via `PUT /processes/{id}`. Takes the same flat
   * {@link CreateVotingProcessRequest} shape as `create`. Returns the process id.
   */
  async update(draftId: string, data: CreateVotingProcessRequest): Promise<string> {
    const body = normalizeVotingProcessRequest(data)
    return this.fetch<string>(`/processes/${draftId}`, {
      method: 'PUT',
      body,
    }).catch(handleError)
  }

  async delete(id: string): Promise<void> {
    return this.fetch<void>(`/process/${id}`, { method: 'DELETE' }).catch(handleError)
  }

  /**
   * Publish-readiness dry-run via `GET /processes/{id}/check`. Returns
   * `{ valid, errors }` without touching the process.
   */
  async validate(id: string): Promise<VotingProcessValidateResponse> {
    return this.fetch<VotingProcessValidateResponse>(`/processes/${id}/check`).catch(handleError)
  }

  /**
   * Publish a draft on-chain. Returns the enqueued job (`{ jobId }`) to poll, or
   * the already-published `{ address, status }` if it was published before.
   * Prefer {@link publishAndWait} unless you want to manage polling yourself.
   */
  async publish(draftId: string): Promise<PublishProcessResponse | EnqueuedResponse> {
    return this.fetch<PublishProcessResponse | EnqueuedResponse>(`/processes/${draftId}/publish`, {
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

  /**
   * Change the status of a single question in a process.
   * `PUT /processes/{processId}/questions/{questionId}/status`.
   */
  async setQuestionStatus(processId: string, questionId: string, status: string): Promise<EnqueuedResponse> {
    return this.fetch<EnqueuedResponse>(`/processes/${processId}/questions/${questionId}/status`, {
      method: 'PUT',
      body: { status },
    }).catch(handleError)
  }

  /**
   * Bulk-change the status of multiple questions in a process.
   * `PUT /processes/{processId}/questions/status`.
   */
  async bulkSetQuestionStatus(processId: string, req: SetQuestionsStatusRequest): Promise<EnqueuedResponse> {
    return this.fetch<EnqueuedResponse>(`/processes/${processId}/questions/status`, {
      method: 'PUT',
      body: req,
    }).catch(handleError)
  }

  /**
   * Public read of a single question including its synced status and eligibility.
   * `GET /processes/{processId}/questions/{questionId}`.
   */
  async getQuestion(processId: string, questionId: string): Promise<PublicQuestionResponse> {
    return this.fetch<PublicQuestionResponse>(`/processes/${processId}/questions/${questionId}`).catch(handleError)
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
