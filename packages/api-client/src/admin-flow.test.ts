import { http, HttpResponse } from 'msw'
import { server } from '../../../mocks/server'
import { VocdoniApiClient } from './client'

const BASE_URL = 'http://localhost'
const ORG = '0xorg'

describe('admin / integrator client methods', () => {
  let client: VocdoniApiClient

  beforeEach(() => {
    client = new VocdoniApiClient({ apiUrl: BASE_URL })
  })

  describe('organizations.createManaged', () => {
    it('POSTs to /integrator/organizations and returns the org', async () => {
      let body: unknown
      server.use(
        http.post(`${BASE_URL}/integrator/organizations`, async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ address: ORG, type: 'company' })
        }),
      )

      const org = await client.organizations.createManaged({ type: 'company', website: 'https://x' })
      expect(org.address).toBe(ORG)
      expect(body).toEqual({ type: 'company', website: 'https://x' })
    })
  })

  describe('organizations.addMembers', () => {
    it('wraps members in { members } and returns a job id', async () => {
      let body: unknown
      server.use(
        http.post(`${BASE_URL}/organizations/${ORG}/members`, async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ added: 0, jobId: 'mjob-1' })
        }),
      )

      const res = await client.organizations.addMembers(ORG, [
        { memberNumber: '1' },
        { memberNumber: '2' },
      ])
      expect(res.jobId).toBe('mjob-1')
      expect(body).toEqual({ members: [{ memberNumber: '1' }, { memberNumber: '2' }] })
    })
  })

  describe('organizations.waitForMembersJob', () => {
    it('polls the members job until progress reaches 100', async () => {
      let calls = 0
      server.use(
        http.get(`${BASE_URL}/organizations/${ORG}/members/job/:jobid`, () => {
          calls += 1
          return HttpResponse.json({ added: calls, total: 2, progress: calls < 2 ? 50 : 100 })
        }),
      )

      const job = await client.organizations.waitForMembersJob(ORG, 'mjob-1', { intervalMs: 1 })
      expect(job.progress).toBe(100)
      expect(calls).toBeGreaterThanOrEqual(2)
    })
  })

  describe('organizations.listGroups', () => {
    it('returns the groups list (autogroup first)', async () => {
      server.use(
        http.get(`${BASE_URL}/organizations/${ORG}/groups`, () =>
          HttpResponse.json({ groups: [{ id: 'g1', isAutoGroup: true, membersCount: 100 }] }),
        ),
      )

      const res = await client.organizations.listGroups(ORG)
      expect(res.groups[0].id).toBe('g1')
      expect(res.groups[0].isAutoGroup).toBe(true)
    })
  })

  describe('census.create + publishGroup', () => {
    it('creates an org census and publishes it from a group', async () => {
      let createBody: unknown
      let publishBody: unknown
      server.use(
        http.post(`${BASE_URL}/census`, async ({ request }) => {
          createBody = await request.json()
          return HttpResponse.json({ id: 'c1' })
        }),
        http.post(`${BASE_URL}/census/c1/group/g1/publish`, async ({ request }) => {
          publishBody = await request.json()
          return HttpResponse.json({ uri: 'ipfs://x', root: '0xroot', size: 100 })
        }),
      )

      const census = await client.census.create({ orgAddress: ORG, authFields: ['memberNumber'] })
      expect(census.id).toBe('c1')
      expect(createBody).toEqual({ orgAddress: ORG, authFields: ['memberNumber'] })

      const published = await client.census.publishGroup('c1', 'g1', { authFields: ['memberNumber'] })
      expect(published.root).toBe('0xroot')
      expect(publishBody).toEqual({ authFields: ['memberNumber'] })
    })
  })

  describe('elections.create', () => {
    it('POSTs a CreateProcessRequest and returns the draft id string', async () => {
      let body: unknown
      server.use(
        http.post(`${BASE_URL}/process`, async ({ request }) => {
          body = await request.json()
          return HttpResponse.json('draft-123')
        }),
      )

      const draftId = await client.elections.create({
        orgAddress: ORG,
        electionParams: {
          title: 'Q',
          questions: [],
          voteType: { maxCount: 1, maxValue: 1 },
          electionType: { autostart: true, interruptible: true },
          maxCensusSize: 100,
        },
      })
      expect(draftId).toBe('draft-123')
      expect((body as { orgAddress: string }).orgAddress).toBe(ORG)
    })

    it('normalizes plain-string election text to { default } language maps', async () => {
      let body: any
      server.use(
        http.post(`${BASE_URL}/process`, async ({ request }) => {
          body = await request.json()
          return HttpResponse.json('draft-ml')
        }),
      )

      await client.elections.create({
        orgAddress: ORG,
        electionParams: {
          title: 'Plain title',
          description: 'Plain description',
          questions: [
            {
              title: 'Question?',
              choices: [
                { title: 'No', value: 0 },
                { title: { default: 'Yes', es: 'Sí' }, value: 1 },
              ],
            },
          ],
          voteType: { maxCount: 1, maxValue: 1 },
          electionType: { autostart: true, interruptible: true },
          maxCensusSize: 100,
        },
      })

      // Plain strings become { default }, existing maps pass through untouched.
      expect(body.electionParams.title).toEqual({ default: 'Plain title' })
      expect(body.electionParams.description).toEqual({ default: 'Plain description' })
      expect(body.electionParams.questions[0].title).toEqual({ default: 'Question?' })
      expect(body.electionParams.questions[0].choices[0].title).toEqual({ default: 'No' })
      expect(body.electionParams.questions[0].choices[1].title).toEqual({ default: 'Yes', es: 'Sí' })
    })
  })

  describe('elections.publishAndWait', () => {
    it('enqueues a publish job and resolves the on-chain address', async () => {
      server.use(
        http.post(`${BASE_URL}/process/draft-1/publish`, () =>
          HttpResponse.json({ jobId: 'pjob-1' }),
        ),
        http.get(`${BASE_URL}/jobs/pjob-1`, () =>
          HttpResponse.json({
            jobId: 'pjob-1',
            status: 'completed',
            type: 'publish_process',
            result: { address: '0xonchain', status: 'READY' },
          }),
        ),
      )

      const res = await client.elections.publishAndWait('draft-1', { intervalMs: 1 })
      expect(res.address).toBe('0xonchain')
      expect(res.status).toBe('READY')
    })

    it('returns directly when the process is already published', async () => {
      server.use(
        http.post(`${BASE_URL}/process/draft-2/publish`, () =>
          HttpResponse.json({ address: '0xalready', status: 'READY' }),
        ),
      )

      const res = await client.elections.publishAndWait('draft-2')
      expect(res.address).toBe('0xalready')
    })
  })

  describe('elections.setStatus', () => {
    it('PUTs the status and returns the enqueued job', async () => {
      let body: unknown
      server.use(
        http.put(`${BASE_URL}/process/p1/status`, async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({ jobId: 'sjob-1' })
        }),
      )

      const res = await client.elections.setStatus('p1', { status: 'ended' })
      expect(res.jobId).toBe('sjob-1')
      expect(body).toEqual({ status: 'ended' })
    })
  })

  describe('bundle.create', () => {
    it('POSTs the census + processes and parses the bundle id from the uri', async () => {
      let body: unknown
      server.use(
        http.post(`${BASE_URL}/process/bundle`, async ({ request }) => {
          body = await request.json()
          return HttpResponse.json({
            uri: `${BASE_URL}/process/bundle/bundle-xyz`,
            root: '0xroot',
          })
        }),
      )

      const res = await client.bundle.create({ censusId: 'c1', processes: ['0xa', '0xb'] })
      expect(res.bundleId).toBe('bundle-xyz')
      expect(res.root).toBe('0xroot')
      expect(body).toEqual({ censusId: 'c1', processes: ['0xa', '0xb'] })
    })
  })
})
