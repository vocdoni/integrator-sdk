import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { apiKey, makeAdminClient, makeClient } from './helpers'

// End-to-end organizer→voter flow, SaaS-only, driven entirely through the SDK
// with a single integrator API key as the only configuration. It:
//   1. creates a managed organization
//   2. loads a 100-member memberbase (memberNumber 1..100)
//   3. reads the auto-created "All members" group
//   4. builds + publishes a CSP census from that group
//   5. creates and publishes 3 processes (single-choice, multi-choice, and a
//      secretUntilTheEnd single-choice) sharing that one group census
//   6. bundles the 3 processes and has 3 members vote on every process
//   7. asserts 9 distinct vote nullifiers
//
// Opt-in: needs INTEGRATION_API_KEY (a `vsk_…` key whose org is an integrator
// with scopes managed:write + members:write + voting:write, and quota for >=3
// processes / >=300 census). It creates real on-chain elections and votes, so it
// is excluded from the default run.
const suite = apiKey ? describe : describe.skip

const MEMBER_COUNT = 100
const VOTERS = ['1', '2', '3']

interface ProcessSpec {
  label: string
  draftId: string
  /** On-chain process id (set after publish). */
  address: string
  chainId: string
  secret: boolean
  /** Vote package choices for this process's vote type. */
  choices: number[]
  encryptionKeys?: { index: number; key: string }[]
}

suite('full election lifecycle (live — creates an org, processes and votes)', () => {
  it(
    'runs the whole organizer→voter flow and resolves a nullifier per vote',
    async () => {
      const admin = makeAdminClient()
      const voterClient = makeClient() // public endpoints (bundle auth, vote, jobs)
      const voting = new VotingClient({ client: voterClient }) // builds, signs & relays votes
      const step = (msg: string) => console.info(`[full-flow] ${msg}`)

      // 1. Managed organization.
      const org = await admin.organizations.createManaged({
        type: 'company',
        website: `https://e2e-${Date.now()}.example`,
      })
      const orgAddress = org.address
      expect(orgAddress, 'managed org has no address').toBeTruthy()
      step(`1. organization created — ${orgAddress}`)

      // 2. Memberbase: 100 members, only memberNumber set (1..100).
      const members = Array.from({ length: MEMBER_COUNT }, (_, i) => ({
        memberNumber: String(i + 1),
      }))
      const added = await admin.organizations.addMembers(orgAddress, members)
      if (added.jobId) {
        const job = await admin.organizations.waitForMembersJob(orgAddress, added.jobId, {
          timeoutMs: 120000,
          intervalMs: 2000,
        })
        expect(job.progress).toBe(100)
      }
      step(`2. ${MEMBER_COUNT} members added (memberNumber 1..${MEMBER_COUNT})`)

      // 3. Auto-created "All members" group.
      const groups = await admin.organizations.listGroups(orgAddress)
      expect(groups.groups.length, 'expected exactly one (auto) group').toBe(1)
      const autoGroup = groups.groups[0]
      expect(autoGroup.isAutoGroup, 'group 0 is not the auto group').toBe(true)
      const groupId = autoGroup.id
      step(`3. auto group read — ${groupId}`)

      // 4. CSP census from the group (auth-only: memberNumber, no 2FA).
      const census = await admin.census.create({
        orgAddress,
        authFields: ['memberNumber'],
      })
      const censusId = census.id
      step(`4. census created — ${censusId}`)
      await admin.census.publishGroup(censusId, groupId, {
        authFields: ['memberNumber'],
        weighted: false,
      })
      step(`4. census published from group ${groupId}`)

      // 5. Three processes sharing the one census. endDate is required; omitting
      // startDate (with autostart) makes each election start immediately on
      // publish, so the voters below can cast right away.
      const endDate = new Date(Date.now() + 2 * 60 * 60_000).toISOString()
      const drafts: Array<{ label: string; secret: boolean; choices: number[]; body: Parameters<typeof admin.elections.create>[0] }> = [
        {
          label: 'single-choice',
          secret: false,
          choices: [1],
          body: {
            orgAddress,
            electionParams: {
              // Plain strings on purpose: the SDK normalizes them to language maps.
              title: 'Single choice',
              questions: [
                {
                  title: 'Approve?',
                  choices: [
                    { title: 'No', value: 0 },
                    { title: 'Yes', value: 1 },
                  ],
                },
              ],
              voteType: { maxCount: 1, maxValue: 1 },
              electionType: { autostart: true, interruptible: true },
              maxCensusSize: MEMBER_COUNT,
              endDate,
            },
          },
        },
        {
          label: 'multi-choice',
          secret: false,
          choices: [1, 0, 1],
          body: {
            orgAddress,
            electionParams: {
              title: 'Multi choice',
              questions: [
                {
                  title: 'Pick options',
                  choices: [
                    { title: 'A', value: 0 },
                    { title: 'B', value: 1 },
                    { title: 'C', value: 2 },
                  ],
                },
              ],
              voteType: { maxCount: 3, maxValue: 1 },
              electionType: { autostart: true, interruptible: true },
              maxCensusSize: MEMBER_COUNT,
              endDate,
            },
          },
        },
        {
          label: 'secret single-choice',
          secret: true,
          choices: [1],
          body: {
            orgAddress,
            electionParams: {
              title: 'Secret single choice',
              questions: [
                {
                  title: 'Approve (secret)?',
                  choices: [
                    { title: 'No', value: 0 },
                    { title: 'Yes', value: 1 },
                  ],
                },
              ],
              voteType: { maxCount: 1, maxValue: 1 },
              electionType: { autostart: true, interruptible: true, secretUntilTheEnd: true },
              maxCensusSize: MEMBER_COUNT,
              endDate,
            },
          },
        },
      ]

      const processes: ProcessSpec[] = []
      for (const d of drafts) {
        const draftId = await admin.elections.create(d.body)
        step(`5. draft created — ${d.label} (${draftId})`)
        const published = await admin.elections.publishAndWait(draftId, {
          timeoutMs: 120000,
          intervalMs: 2000,
        })
        expect(published.address, `${d.label} not published`).toBeTruthy()
        step(`5. process published — ${d.label} → ${published.address}`)

        // Merged process info → chainId (+ encryption keys for the secret one).
        const info = await admin.elections.get(draftId)
        expect(info.chainId, `${d.label} has no chainId`).toBeTruthy()

        // A secretUntilTheEnd election's encryption keys are published by the
        // keykeepers asynchronously once it is live, so they may not be present
        // the moment publish returns — poll until they appear.
        let encryptionKeys = info.encryptionPublicKeys
        if (d.secret) {
          const deadline = Date.now() + 120000
          while ((encryptionKeys?.length ?? 0) === 0 && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000))
            encryptionKeys = (await admin.elections.get(draftId)).encryptionPublicKeys
          }
          expect(encryptionKeys?.length, 'secret process has no encryption keys').toBeGreaterThan(0)
          step(`5. encryption keys ready — ${encryptionKeys!.length} key(s) for ${d.label}`)
        }

        processes.push({
          label: d.label,
          draftId,
          address: published.address,
          chainId: info.chainId!,
          secret: d.secret,
          choices: d.choices,
          encryptionKeys,
        })
      }

      // 6. One bundle holding all three processes.
      const bundle = await admin.bundle.create({
        censusId,
        processes: processes.map((p) => p.address),
      })
      const bundleId = bundle.bundleId
      expect(bundleId, 'bundle has no id').toBeTruthy()
      step(`6. bundle created — ${bundleId} (${processes.length} processes)`)

      // 7. Each of 3 members votes on every process.
      const nullifiers = new Set<string>()
      for (const memberNumber of VOTERS) {
        const step0 = await voterClient.bundle.authStep0(bundleId, { memberNumber })
        const authToken = step0.authToken
        expect(authToken, `auth failed for member ${memberNumber}`).toBeTruthy()
        step(`7. member ${memberNumber} authenticated`)

        for (const p of processes) {
          const membership = await voterClient.bundle.check(bundleId, {
            authToken: authToken!,
            electionId: p.address,
          })
          expect(membership.belongs, `member ${memberNumber} not in census`).toBe(true)

          const signer = new EphemeralSigner()
          const sign = await voterClient.bundle.sign(bundleId, {
            authToken: authToken!,
            electionId: p.address,
            payload: signer.address,
          })
          expect(sign.signature, `no CSP signature (${p.label})`).toBeTruthy()

          // Build + sign + relay through the public VotingClient — the path an
          // integrator uses. It returns the relay job id to poll for the nullifier.
          const jobId = await voting.vote({
            processId: p.address,
            choices: p.choices,
            chainId: p.chainId,
            signer,
            cspSignature: sign.signature!,
            cspWeight: sign.weight,
            encryptionKeys: p.encryptionKeys,
          })
          const job = await voterClient.jobs.waitFor(jobId, {
            timeoutMs: 90000,
            intervalMs: 2000,
          })
          expect(job.status, `vote relay failed (${p.label})`).toBe('completed')
          const nullifier = job.result?.voteID
          expect(nullifier, `no nullifier (${p.label}, member ${memberNumber})`).toBeTruthy()
          expect(nullifiers.has(nullifier!), 'duplicate nullifier').toBe(false)
          nullifiers.add(nullifier!)
          step(`7. vote emitted — member ${memberNumber} on ${p.label} → ${nullifier!.slice(0, 12)}…`)
        }
      }

      expect(nullifiers.size).toBe(VOTERS.length * processes.length)
      step(`done — ${nullifiers.size} votes cast across ${processes.length} processes`)
    },
    600000,
  )
})
