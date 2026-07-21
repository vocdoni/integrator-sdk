import type { VotingProcessQuestion } from '@vocdoni/api-types'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { apiKey, makeAdminClient, makeClient } from './helpers'

// End-to-end organizer→voter flow, SaaS-only, driven entirely through the SDK
// with a single integrator API key as the only configuration. It:
//   1. creates a managed organization
//   2. loads a 100-member memberbase (memberNumber 1..100)
//   3. reads the auto-created "All members" group
//   4. builds + publishes a CSP census from that group
//   5. creates and publishes 2 processes (single-choice and multi-choice)
//      sharing that one group census
//   6. bundles every question's on-chain process and has 3 members vote on all
//      of them (chainId comes from the bundle info, not the process)
//   7. asserts a distinct vote nullifier per (member, question)
//
// TODO(encrypted): re-enable when encryption keys are exposed on the process read
// — a third, secretUntilTheEnd draft (and its key-polling + sealed-vote
// assertions) is commented out below because `GET /processes/{id}`
// (VotingProcessResponse) carries no encryption-keys field yet.
//
// Opt-in: needs INTEGRATION_API_KEY (a `vsk_…` key whose org is an integrator
// with scopes managed:write + members:write + voting:write, and quota for >=2
// processes / >=200 census). It creates real on-chain elections and votes, so it
// is excluded from the default run.
const suite = apiKey ? describe : describe.skip

const MEMBER_COUNT = 100
const VOTERS = ['1', '2', '3']

interface ProcessSpec {
  label: string
  draftId: string
  /**
   * Questions read back after publish — each question is its own on-chain
   * Vochain process (`question.upstreamId`), and the vote loop casts one
   * transaction per question.
   */
  questions: VotingProcessQuestion[]
  secret: boolean
  /** Vote package choices cast on every question of this process. */
  choices: number[]
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
        meta: { name: `e2e-${Date.now()}` },
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

      // 5. Two processes sharing the one census, as flat
      // CreateVotingProcessRequest drafts: the ballot semantics now live on each
      // question (`type` / `typeSetup`), not on a process-level voteType.
      // endDate is required; omitting startDate makes each election start
      // immediately on publish, so the voters below can cast right away.
      const endDate = new Date(Date.now() + 2 * 60 * 60_000).toISOString()
      const drafts: Array<{ label: string; secret: boolean; choices: number[]; body: Parameters<typeof admin.elections.create>[0] }> = [
        {
          label: 'single-choice',
          secret: false,
          // singlechoice ballot: one value — the chosen option ("Yes" = 1).
          choices: [1],
          body: {
            orgAddress,
            // Plain strings on purpose: the SDK normalizes them to language maps.
            title: 'Single choice',
            endDate,
            questions: [
              {
                title: 'Approve?',
                choices: [
                  { title: 'No', value: 0 },
                  { title: 'Yes', value: 1 },
                ],
                type: 'singlechoice',
              },
            ],
          },
        },
        {
          label: 'multi-choice',
          secret: false,
          // multichoice ballot: one picked option index per slot (maxChoices
          // slots) — pick "A" (0) and "C" (2), filling both slots so no
          // abstain padding is needed.
          choices: [0, 2],
          body: {
            orgAddress,
            title: 'Multi choice',
            endDate,
            questions: [
              {
                title: 'Pick options',
                choices: [
                  { title: 'A', value: 0 },
                  { title: 'B', value: 1 },
                  { title: 'C', value: 2 },
                ],
                type: 'multichoice',
                typeSetup: { maxChoices: 2, minChoices: 1, uniqueChoices: true },
              },
            ],
          },
        },
        // TODO(encrypted): re-enable when encryption keys are exposed on the process read
        // {
        //   label: 'secret single-choice',
        //   secret: true,
        //   choices: [1],
        //   body: {
        //     orgAddress,
        //     title: 'Secret single choice',
        //     endDate,
        //     questions: [
        //       {
        //         title: 'Approve (secret)?',
        //         choices: [
        //           { title: 'No', value: 0 },
        //           { title: 'Yes', value: 1 },
        //         ],
        //         type: 'singlechoice',
        //         secretUntilTheEnd: true,
        //       },
        //     ],
        //   },
        // },
      ]

      const processes: ProcessSpec[] = []
      for (const d of drafts) {
        const draftId = await admin.elections.create(d.body)
        step(`5. draft created — ${d.label} (${draftId})`)
        const published = await admin.elections.publishAndWait(draftId, {
          timeoutMs: 120000,
          intervalMs: 2000,
        })
        expect(published.status, `${d.label} not published`).toBeTruthy()

        // Re-fetch the merged process: each question now carries its on-chain
        // Vochain process id as `upstreamId` (chainId lives on the bundle, not
        // here).
        const info = await admin.elections.get(draftId)
        expect(info.questions.length, `${d.label} has no questions`).toBeGreaterThan(0)
        for (const q of info.questions) {
          expect(q.upstreamId, `${d.label} question has no upstreamId`).toMatch(/^[0-9a-f]{64}$/i)
        }
        step(
          `5. process published — ${d.label} → ${info.questions.map((q) => q.upstreamId).join(', ')}`,
        )

        // TODO(encrypted): re-enable when encryption keys are exposed on the process read
        // A secretUntilTheEnd election's encryption keys are published by the
        // keykeepers asynchronously once it is live, so they may not be present
        // the moment publish returns — poll until they appear.
        // let encryptionKeys = info.encryptionPublicKeys
        // if (d.secret) {
        //   const deadline = Date.now() + 120000
        //   while ((encryptionKeys?.length ?? 0) === 0 && Date.now() < deadline) {
        //     await new Promise((r) => setTimeout(r, 3000))
        //     encryptionKeys = (await admin.elections.get(draftId)).encryptionPublicKeys
        //   }
        //   expect(encryptionKeys?.length, 'secret process has no encryption keys').toBeGreaterThan(0)
        //   step(`5. encryption keys ready — ${encryptionKeys!.length} key(s) for ${d.label}`)
        // }

        processes.push({
          label: d.label,
          draftId,
          questions: info.questions,
          secret: d.secret,
          choices: d.choices,
        })
      }

      // 6. One bundle holding every question's on-chain process. The bundle is
      // also where the Vochain chainId (which the vote signature depends on)
      // comes from.
      const bundle = await admin.bundle.create({
        censusId,
        processes: processes.flatMap((p) => p.questions.map((q) => q.upstreamId!)),
      })
      const bundleId = bundle.bundleId
      expect(bundleId, 'bundle has no id').toBeTruthy()
      const bundleInfo = await voterClient.bundle.get(bundleId)
      expect(bundleInfo.chainId, 'bundle has no chainId').toBeTruthy()
      const chainId = bundleInfo.chainId!
      const questionCount = processes.reduce((n, p) => n + p.questions.length, 0)
      step(`6. bundle created — ${bundleId} (${questionCount} on-chain processes, chain ${chainId})`)

      // 7. Each of 3 members votes on every question of every process.
      const nullifiers = new Set<string>()
      for (const memberNumber of VOTERS) {
        const step0 = await voterClient.bundle.authStep0(bundleId, { memberNumber })
        const authToken = step0.authToken
        expect(authToken, `auth failed for member ${memberNumber}`).toBeTruthy()
        step(`7. member ${memberNumber} authenticated`)

        for (const p of processes) {
          for (const question of p.questions) {
            const processId = question.upstreamId!
            const membership = await voterClient.bundle.check(bundleId, {
              authToken: authToken!,
              electionId: processId,
            })
            expect(membership.belongs, `member ${memberNumber} not in census`).toBe(true)

            const signer = new EphemeralSigner()
            const sign = await voterClient.bundle.sign(bundleId, {
              authToken: authToken!,
              electionId: processId,
              payload: signer.address,
            })
            expect(sign.signature, `no CSP signature (${p.label})`).toBeTruthy()

            // Build + sign + relay through the public VotingClient — the path an
            // integrator uses. It returns the relay job id to poll for the nullifier.
            const jobId = await voting.vote({
              processId,
              choices: p.choices,
              chainId,
              signer,
              cspSignature: sign.signature!,
              cspWeight: sign.weight,
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
      }

      expect(nullifiers.size).toBe(VOTERS.length * questionCount)
      step(`done — ${nullifiers.size} votes cast across ${questionCount} on-chain processes`)
    },
    600000,
  )
})
