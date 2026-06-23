import type { JobStatusResponse } from '@vocdoni/api-types'
import type { UpFetch } from 'up-fetch'
import { handleError } from './errors'

export interface WaitForJobOptions {
  /** Poll interval in ms. Default 1000. */
  intervalMs?: number
  /** Max time to wait before giving up, in ms. Default 60000. */
  timeoutMs?: number
  /** Abort signal to cancel polling. */
  signal?: AbortSignal
}

/** Thrown when a polled job ends in the `failed` state. */
export class JobFailedError extends Error {
  constructor(public readonly job: JobStatusResponse) {
    super(job.error || `Job ${job.jobId} failed`)
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
   * Poll a job until it reaches a terminal state.
   * @returns The completed job (status `completed`).
   * @throws {JobFailedError} when the job ends as `failed`.
   */
  async waitFor(jobId: string, opts: WaitForJobOptions = {}): Promise<JobStatusResponse> {
    const { intervalMs = 1000, timeoutMs = 60000, signal } = opts
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const job = await this.get(jobId)
      if (job.status === 'completed') return job
      if (job.status === 'failed') throw new JobFailedError(job)
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for job ${jobId} after ${timeoutMs}ms`)
      }
      await delay(intervalMs, signal)
    }
  }
}
