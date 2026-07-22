import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import { VocdoniApiClient } from './client'
import { JobFailedError } from './jobs'

const BASE_URL = 'http://localhost'
const ORG = '0xorg'

describe('jobs.list', () => {
  let client: VocdoniApiClient

  beforeEach(() => {
    client = new VocdoniApiClient({ apiUrl: BASE_URL })
  })

  it('GETs /jobs with orgAddress, type, page and limit as query params', async () => {
    let search: URLSearchParams | undefined
    server.use(
      http.get(`${BASE_URL}/jobs`, ({ request }) => {
        search = new URL(request.url).searchParams
        return HttpResponse.json({
          jobs: [{ jobId: 'j1', type: 'org_members', status: 'completed' }],
        })
      }),
    )

    const res = await client.jobs.list({ orgAddress: ORG, type: 'org_members', page: 2, limit: 5 })
    expect(res.jobs).toHaveLength(1)
    expect(res.jobs[0].jobId).toBe('j1')
    expect(search?.get('orgAddress')).toBe(ORG)
    expect(search?.get('type')).toBe('org_members')
    expect(search?.get('page')).toBe('2')
    expect(search?.get('limit')).toBe('5')
  })
})

describe('jobs.waitFor', () => {
  let client: VocdoniApiClient

  beforeEach(() => {
    client = new VocdoniApiClient({ apiUrl: BASE_URL })
  })

  it('resolves as before when expectType is not set, even if types differ', async () => {
    server.use(
      http.get(`${BASE_URL}/jobs/:jobId`, ({ params }) =>
        HttpResponse.json({
          jobId: params.jobId as string,
          status: 'completed',
          type: 'set_process_status',
          result: {},
        }),
      ),
    )

    const job = await client.jobs.waitFor('job-1')
    expect(job.status).toBe('completed')
    expect(job.type).toBe('set_process_status')
  })

  it('rejects when a completed job has a type that does not match expectType', async () => {
    server.use(
      http.get(`${BASE_URL}/jobs/:jobId`, ({ params }) =>
        HttpResponse.json({
          jobId: params.jobId as string,
          status: 'completed',
          type: 'set_process_status',
          result: {},
        }),
      ),
    )

    await expect(client.jobs.waitFor('job-1', { expectType: 'relay_vote' })).rejects.toThrow(
      'Job job-1 completed with unexpected type "set_process_status" (expected "relay_vote")',
    )
  })

  it('resolves when the completed job type matches expectType', async () => {
    server.use(
      http.get(`${BASE_URL}/jobs/:jobId`, ({ params }) =>
        HttpResponse.json({
          jobId: params.jobId as string,
          status: 'completed',
          type: 'relay_vote',
          result: { voteID: 'nullifier-job-1' },
        }),
      ),
    )

    const job = await client.jobs.waitFor('job-1', { expectType: 'relay_vote' })
    expect(job.status).toBe('completed')
    expect(job.type).toBe('relay_vote')
  })

  it('throws JobFailedError with the joined errors when the job fails', async () => {
    server.use(
      http.get(`${BASE_URL}/jobs/failed-1`, () =>
        HttpResponse.json({
          jobId: 'failed-1',
          type: 'org_members',
          status: 'failed',
          errors: ['row 3: invalid email', 'row 7: duplicate memberNumber'],
        }),
      ),
    )

    await expect(client.jobs.waitFor('failed-1', { intervalMs: 1 })).rejects.toMatchObject({
      name: 'JobFailedError',
      message: 'row 3: invalid email; row 7: duplicate memberNumber',
    })
  })

  it('falls back to a generic message when the job has no errors', async () => {
    server.use(
      http.get(`${BASE_URL}/jobs/failed-2`, () =>
        HttpResponse.json({ jobId: 'failed-2', type: 'relay_vote', status: 'failed' }),
      ),
    )

    let caught: unknown
    try {
      await client.jobs.waitFor('failed-2', { intervalMs: 1 })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(JobFailedError)
    expect((caught as Error).message).toBe('Job failed-2 failed')
  })
})
