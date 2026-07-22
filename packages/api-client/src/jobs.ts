import type { JobsResponse, JobStatusResponse } from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export interface WaitForJobOptions {
  /** Poll interval in ms. Default 1000. */
  intervalMs?: number
  /** Max time to wait before giving up, in ms. Default 60000. */
  timeoutMs?: number
  /** Abort signal to cancel polling. */
  signal?: AbortSignal
  /**
   * When set, a completed job whose `type` does not match this value throws
   * instead of resolving silently — guards against polling the wrong job id.
   */
  expectType?: string
}

/** Thrown when a polled job ends in the `failed` state. */
export class JobFailedError extends Error {
  constructor(public readonly job: JobStatusResponse) {
    super(job.errors?.length ? job.errors.join('; ') : `Job ${job.jobId} failed`)
    this.name = 'JobFailedError'
  }
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })

/**
 * Client for async transaction jobs (vote relay, publish, status change…).
 * Long-running backend transactions return a jobId; poll until completion.
 */
export class JobsClient {
  constructor(private readonly fetch: UpFetch) {}

  async get(jobId: string): Promise<JobStatusResponse> {
    return this.fetch<JobStatusResponse>(`/jobs/${jobId}`).catch(handleError)
  }

  /**
   * List an organization's async jobs (member/census imports and tx jobs: publish, status
   * change, census update, vote relay), newest first. Requires Manager/Admin of the org.
   * @param params.orgAddress Organization address (required).
   * @param params.type Filter by job type, e.g. `org_members`, `census_participants`, `relay_vote`.
   */
  async list(params: {
    orgAddress: string
    type?: string
    page?: number
    limit?: number
  }): Promise<JobsResponse> {
    return this.fetch<JobsResponse>('/jobs', { params }).catch(handleError)
  }

  /**
   * Poll a job until it reaches a terminal state.
   * @returns The completed job (status `completed`).
   * @throws {JobFailedError} when the job ends as `failed`.
   */
  async waitFor(jobId: string, opts: WaitForJobOptions = {}): Promise<JobStatusResponse> {
    const { intervalMs = 1000, timeoutMs = 60000, signal, expectType } = opts
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const job = await this.get(jobId)
      if (job.status === 'completed') {
        if (expectType && job.type !== expectType) {
          throw new Error(`Job ${jobId} completed with unexpected type "${job.type}" (expected "${expectType}")`)
        }
        return job
      }
      if (job.status === 'failed') throw new JobFailedError(job)
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for job ${jobId} after ${timeoutMs}ms`)
      }
      await delay(intervalMs, signal)
    }
  }
}
