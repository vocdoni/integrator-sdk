import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import { VocdoniApiClient } from './client'

const BASE_URL = 'http://localhost'

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
})
