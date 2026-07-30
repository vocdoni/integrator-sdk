import type { VotingProcessQuestion } from '@vocdoni/api-types'
import { EphemeralSigner, VotingClient } from '@vocdoni/api-voting'
import { decodeQuestionResults, encodeQuestionBallot, unsatisfiableQuestionReason } from '@vocdoni/ballot'
import { apiKey, makeAdminClient, makeClient } from './helpers'

// End-to-end organizer→voter flow, SaaS-only, driven entirely through the SDK
// with a single integrator API key as the only configuration. It:
//   1. creates a managed organization
//   2. loads a 100-member memberbase (memberNumber 1..100)
//   3. reads the auto-created "All members" group
//   4. builds + publishes a CSP census from that group
//   5. creates and publishes 4 processes (single-choice, multi-choice, a
//      secretUntilTheEnd single-choice — its per-question encryption keys are
//      polled after publish, per saas-backend#594 — and a ballot-protocol
//      matrix covering every remaining type @vocdoni/ballot supports: approval,
//      capped approval, pick-slot multichoice, ranked, budget and quadratic)
//      sharing that one group
//      census, then proves the PUBLIC voter surface for each: drafts 404 on the
//      token-less process read (draft gating, saas-backend#599) while published
//      processes are fully public — chainId, questions, census size/totalWeight
//      — with the PII `eligibleMemberIds` stripped for non-managers; plus the
//      public single-question read (choices/ballotProtocol/upstreamId, and the
//      secret question's encryption keys) and the public process list
//   6. has 4 members vote on every question of every process via the
//      process-scoped CSP flow (client.processes: authStep0 → check → sign —
//      the only voter flow; the bundle routes are gone), chainId read straight
//      off the PUBLIC process read; the secret question's ballots are sealed
//      with its encryption keys, and each vote resolves a distinct nullifier
//   7. reads the live per-question tallies (QuestionResults, saas-backend#596/
//      #599) publicly and checks the vote counts AND the decoded per-choice
//      tallies — the latter is the only thing that proves a vote was actually
//      counted, since the chain increments voteCount even for ballots the
//      scrutinizer discards during aggregation
//
// This is deliberately the ONLY integration suite: anything needing a live
// backend gets asserted inside this lifecycle (it creates all its own data, so
// there are no rot-prone fixtures). The goal is to run it in CI against a
// disposable saas-api + vochain container on every PR/push.
//
// Opt-in: needs INTEGRATION_API_KEY (a `vsk_…` key whose org is an integrator
// with scopes managed:write + members:write + voting:write, and quota for >=4
// processes / >=9 on-chain elections / >=200 census). It creates real on-chain
// elections and casts 36 real votes, so it is excluded from the default run and
// takes several minutes.
const suite = apiKey ? describe : describe.skip

const MEMBER_COUNT = 100
const VOTERS = ['1', '2', '3', '4']

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
  /**
   * Raw voter selections (choice values) cast on every question of this
   * process — encoded into the wire ballot with `encodeQuestionBallot`.
   */
  choices: number[]
  /**
   * Expected decoded tally per choice (in choice order) after every voter has
   * cast `choices` — asserted via `decodeQuestionResults` for non-secret
   * processes. Guards the whole encode→scrutinize→decode chain: a ballot the
   * chain silently discards, or a decoder misreading the histogram, fails here.
   */
  tally: number[]
  /**
   * Per-question override of `choices`/`tally`, positionally aligned with
   * `questions`. Used by the ballot-protocol matrix process, whose questions each
   * exercise a different ballot type and therefore need their own selections.
   */
  perQuestion?: Array<{ choices: number[]; tally: number[] }>
}

/** The selections + expected tally for one question of a process. */
const specFor = (p: ProcessSpec, questionId: string) => {
  const index = p.questions.findIndex((q) => q.id === questionId)
  return p.perQuestion?.[index] ?? { choices: p.choices, tally: p.tally }
}

suite('full election lifecycle (live — creates an org, processes and votes)', () => {
  it(
    'runs the whole organizer→voter flow and resolves a nullifier per vote',
    async () => {
      const admin = makeAdminClient()
      const voterClient = makeClient() // public endpoints (process reads, CSP auth, vote, jobs)
      const voting = new VotingClient({ client: voterClient }) // builds, signs & relays votes
      const step = (msg: string) => console.info(`[full-flow] ${msg}`)

      // 1. Managed organization.
      const org = await admin.organizations.createManaged({
        name: `e2e-${Date.now()}`,
        type: 'company',
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
        // Member imports poll the unified jobs endpoint (saas-backend#582).
        const job = await admin.jobs.waitFor(added.jobId, {
          timeoutMs: 120000,
          intervalMs: 2000,
          expectType: 'org_members',
        })
        expect(job.result?.progress).toBe(100)
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
      const drafts: Array<{
        label: string
        secret: boolean
        choices: number[]
        tally: number[]
        perQuestion?: ProcessSpec['perQuestion']
        body: Parameters<typeof admin.elections.create>[0]
      }> = [
        {
          label: 'single-choice',
          secret: false,
          // singlechoice ballot: one value — the chosen option ("Yes" = 1).
          choices: [1],
          // 4 voters all pick "Yes": No = 0, Yes = 4.
          tally: [0, VOTERS.length],
          body: {
            orgAddress,
            census: { authFields: ['memberNumber'], groupId },
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
          // Selections "A" (0) and "C" (2); encodeQuestionBallot turns them into
          // the dense 0/1 vector [1, 0, 1] the derived protocol expects.
          choices: [0, 2],
          // 4 voters all pick A and C: A = 4, B = 0, C = 4.
          tally: [VOTERS.length, 0, VOTERS.length],
          body: {
            orgAddress,
            census: { authFields: ['memberNumber'], groupId },
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
                // Deliberately `true` — the backend propagates it into the
                // on-chain UniqueChoices, and the scrutinizer applies uniqueness
                // to the raw 0/1 fields of the derived dense layout, so with it
                // set every multi-pick ballot is silently discarded at tally
                // (saas-backend derivation bug in account/ballot.go). The client
                // forces it back to false on create, and the tally assertion
                // below is what proves that mitigation still works end to end.
                typeSetup: { maxChoices: 2, minChoices: 1, uniqueChoices: true },
              },
            ],
          },
        },
        {
          label: 'secret single-choice',
          secret: true,
          choices: [1],
          // Hidden until the encryption keys are revealed — never asserted live.
          tally: [],
          body: {
            orgAddress,
            census: { authFields: ['memberNumber'], groupId },
            title: 'Secret single choice',
            endDate,
            questions: [
              {
                title: 'Approve (secret)?',
                choices: [
                  { title: 'No', value: 0 },
                  { title: 'Yes', value: 1 },
                ],
                type: 'singlechoice',
                secretUntilTheEnd: true,
              },
            ],
          },
        },
        // Every remaining ballot type @vocdoni/ballot can encode and decode, in
        // one process — one question per protocol, each with its own selections
        // and expected tally. The named types above only reach two of them
        // (singlechoice, dense multichoice); the rest are only expressible via a
        // raw `ballotProtocol`, and each has a distinct wire layout AND a
        // distinct results layout, so nothing here is redundant with the others.
        //
        // This exists because voteCount cannot tell a counted vote from a
        // discarded one — only a decoded tally can, and every protocol decodes
        // differently. Two silent all-zero-results bugs were found exactly here.
        {
          label: 'ballot protocol matrix',
          secret: false,
          choices: [],
          tally: [],
          perQuestion: [
            // approval — dense 0/1 vector, uncapped.
            { choices: [0, 2], tally: [VOTERS.length, 0, VOTERS.length, 0] },
            // approval capped by maxTotalCost (2 picks costs exactly 2).
            { choices: [0, 2], tally: [VOTERS.length, 0, VOTERS.length, 0] },
            // legacy pick-slot multichoice: 3 slots, 2 picks, one abstain
            // sentinel padded in. uniqueValues is TRUE here and satisfiable
            // (maxValue 6 >= maxCount 3) — this is the case the guard must NOT
            // reject, and the ballot [0, 2, 4] does carry three distinct values.
            // Decoding appends the unified abstain bucket, hence the 5th entry.
            { choices: [0, 2], tally: [VOTERS.length, 0, VOTERS.length, 0, VOTERS.length] },
            // ranked: one rank per option, no repeats. NOTE the decoder has no
            // ranked branch — it labels this multichoice and reports "how many
            // voters ranked each option", which is why every option shows the
            // full voter count and a zero abstain bucket. That is a real gap,
            // not a mis-tally: the ranking itself is not recoverable through
            // decodeQuestionResults. Locked in here so it changes deliberately.
            {
              choices: [2, 0, 3, 1],
              tally: [VOTERS.length, VOTERS.length, VOTERS.length, VOTERS.length, 0],
            },
            // budget: per-option amounts, maxValue 0 → the chain aggregates
            // Σ amount × weight into one cell per option.
            { choices: [4, 0, 6, 0], tally: [4 * VOTERS.length, 0, 6 * VOTERS.length, 0] },
            // quadratic: same aggregation, cost is Σ amount² (12 <= 16).
            {
              choices: [2, 0, 2, 2],
              tally: [2 * VOTERS.length, 0, 2 * VOTERS.length, 2 * VOTERS.length],
            },
          ],
          body: {
            orgAddress,
            census: { authFields: ['memberNumber'], groupId },
            title: 'Ballot protocol matrix',
            endDate,
            questions: (
              [
                ['Approval', { maxCount: 4, maxValue: 1 }],
                ['Approval (max 2)', { maxCount: 4, maxValue: 1, maxTotalCost: 2 }],
                ['Multichoice pick-slot', { maxCount: 3, maxValue: 6, uniqueValues: true }],
                ['Ranked', { maxCount: 4, maxValue: 3, uniqueValues: true }],
                ['Budget', { maxCount: 4, maxValue: 0, costExponent: 1, maxTotalCost: 10 }],
                ['Quadratic', { maxCount: 4, maxValue: 0, costExponent: 2, maxTotalCost: 16 }],
              ] as const
            ).map(([title, bp]) => ({
              title,
              choices: Array.from({ length: 4 }, (_, v) => ({ title: `C${v}`, value: v })),
              ballotProtocol: {
                maxVoteOverwrites: 0,
                maxTotalCost: 0,
                costExponent: 1,
                uniqueValues: false,
                costFromWeight: false,
                ...bp,
              },
            })),
          },
        },
      ]

      const processes: ProcessSpec[] = []
      let chainId: string | undefined
      for (const d of drafts) {
        const draftId = await admin.elections.create(d.body)
        step(`5. draft created — ${d.label} (${draftId})`)

        // Draft gating (saas-backend#599): the process read is public, but a
        // draft must 404 to anyone who is not an org manager / scoped API key —
        // deliberately hiding even its existence.
        await expect(voterClient.elections.get(draftId)).rejects.toMatchObject({ status: 404 })

        const published = await admin.elections.publishAndWait(draftId, {
          timeoutMs: 120000,
          intervalMs: 2000,
        })
        expect(published.status, `${d.label} not published`).toBeTruthy()

        // Re-fetch the merged process: each question now carries its on-chain
        // Vochain process id as `upstreamId`.
        let info = await admin.elections.get(draftId)
        expect(info.questions.length, `${d.label} has no questions`).toBeGreaterThan(0)
        for (const q of info.questions) {
          expect(q.upstreamId, `${d.label} question has no upstreamId`).toMatch(/^[0-9a-f]{64}$/i)
        }
        step(
          `5. process published — ${d.label} → ${info.questions.map((q) => q.upstreamId).join(', ')}`,
        )

        // A secretUntilTheEnd question's encryption keys (per-question since
        // saas-backend#594) are published by the keykeepers asynchronously once
        // it is live, so they may be absent the moment publish returns — poll
        // the process read until every secret question carries them.
        if (d.secret) {
          // Assert the round-trip BEFORE anything that keys off the flag. Every
          // secrecy check here — and the `question.secretUntilTheEnd ? keys :
          // undefined` that seals the ballot at vote time — reads the
          // BACKEND-reported flag. If the read ever stopped echoing it,
          // `missingKeys()` would be false over an empty filter, the poll would
          // exit at once, the expectation below would pass vacuously, keyCount
          // would be 0, and 4 votes would be cast in CLEARTEXT on an election
          // that asked to be secret — with nothing in the suite failing.
          expect(
            info.questions.filter((q) => q.secretUntilTheEnd).length,
            `${d.label} process read does not report secretUntilTheEnd — ballots would be cast in cleartext`,
          ).toBeGreaterThan(0)

          const missingKeys = () =>
            info.questions.some((q) => q.secretUntilTheEnd && !q.encryptionKeys?.length)
          const deadline = Date.now() + 120000
          while (missingKeys() && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3000))
            info = await admin.elections.get(draftId)
          }
          expect(missingKeys(), `secret process has no encryption keys (${d.label})`).toBe(false)
          const secretQuestions = info.questions.filter((q) => q.secretUntilTheEnd)
          // Shape, not just presence: a key that is not a hex string with an
          // integer index cannot seal a ballot, and `length > 0` would not notice.
          for (const q of secretQuestions) {
            for (const k of q.encryptionKeys ?? []) {
              expect(Number.isInteger(k.index), `${d.label} key index is not an integer`).toBe(true)
              expect(k.key, `${d.label} key is not hex`).toMatch(/^[0-9a-f]+$/i)
            }
          }
          const keyCount = secretQuestions.reduce((n, q) => n + (q.encryptionKeys?.length ?? 0), 0)
          expect(keyCount, `${d.label} resolved no encryption keys`).toBeGreaterThan(0)
          step(`5. encryption keys ready — ${keyCount} key(s) for ${d.label}`)
        }

        // Public voter surface for this process (no API key): every question is
        // readable through the public single-question route — including, for
        // secret questions, the encryption keys the ballot is sealed with.
        for (const q of info.questions) {
          const pub = await voterClient.processes.getQuestion(draftId, q.id)
          expect(pub.id).toBe(q.id)
          expect(pub.upstreamId).toBe(q.upstreamId)
          expect(pub.choices.length, `${d.label} public question has no choices`).toBeGreaterThan(0)
          // A question needs a named `type` OR a raw `ballotProtocol` — questions
          // created via `type` may omit the protocol (encodeQuestionBallot infers
          // it from the type in that case).
          expect(
            pub.ballotProtocol ?? pub.type,
            `${d.label} public question has neither ballotProtocol nor type`,
          ).toBeTruthy()
          // No question may ship a ballot config the scrutinizer can never
          // tally — that is the all-zero-results failure mode, and it is
          // invisible until the votes are already lost.
          expect(
            unsatisfiableQuestionReason(pub),
            `${d.label} public question has an unsatisfiable ballot config`,
          ).toBeNull()
          // The multichoice question is created with uniqueChoices: true on
          // purpose (see the draft above); the client must have rewritten it,
          // so it reads back false. Without that, the on-chain uniqueValues
          // would discard every ballot and the tally assertion below would
          // come back all zeros.
          if (pub.type === 'multichoice') {
            expect(
              pub.typeSetup?.uniqueChoices,
              `${d.label} multichoice kept uniqueChoices — its votes will not be tallied`,
            ).toBe(false)
          }
          if (q.secretUntilTheEnd) {
            expect(
              pub.encryptionKeys?.length,
              `${d.label} public read misses encryption keys`,
            ).toBeGreaterThan(0)
          }
        }
        // Published processes are PUBLIC (saas-backend#599): a token-less voter
        // client reads the whole process — including the chainId vote signatures
        // are bound to, killing the old integrator-handoff requirement — but the
        // PII eligibleMemberIds restriction lists are stripped for non-managers.
        const pubInfo = await voterClient.elections.get(draftId)
        expect(pubInfo.published, `${d.label} public read is not published`).toBe(true)
        expect(pubInfo.chainId, `${d.label} public read has no chainId`).toBeTruthy()
        // All processes must live on the same chain; the votes below sign
        // against this value — sourced from the public read, no auth involved.
        if (chainId) expect(pubInfo.chainId, 'chainId differs across processes').toBe(chainId)
        chainId = pubInfo.chainId!
        expect(pubInfo.census.size, `${d.label} public read has no census size`).toBe(MEMBER_COUNT)
        expect(
          pubInfo.census.totalWeight,
          `${d.label} totalWeight should equal size for a non-weighted census`,
        ).toBe(pubInfo.census.size)
        for (const q of pubInfo.questions) {
          expect(q.eligibleMemberIds, `${d.label} public read leaks eligibleMemberIds`).toBeUndefined()
        }
        step(`5. public process read verified — ${d.label} (chain ${pubInfo.chainId})`)

        processes.push({
          label: d.label,
          draftId,
          questions: info.questions,
          secret: d.secret,
          choices: d.choices,
          tally: d.tally,
          perQuestion: d.perQuestion,
        })
      }

      // The process list is public too (saas-backend#599): an anonymous caller
      // sees the org's published processes (drafts filtered out — none remain
      // here), and list items never resolve per-question results (N+1 guard).
      const publicList = await voterClient.elections.list({ orgAddress })
      expect(publicList.processes.length, 'public list misses published processes').toBe(
        drafts.length,
      )
      for (const item of publicList.processes) {
        for (const q of item.questions) {
          expect(q.results, 'list items must not resolve results').toBeUndefined()
        }
      }
      step(`5. public process list verified — ${publicList.processes.length} published`)

      // 6. Every member votes on every process through the process-scoped CSP
      // flow (client.processes — the ONLY voter flow since the backend dropped
      // the bundle routes). The auth token is anchored to the process (one
      // authStep0 per member+process), the check reports every question's
      // eligibility at once, and chainId comes straight off the PUBLIC process
      // read (saas-backend#599) — the fully-public voter path.
      const nullifiers = new Set<string>()
      const questionCount = processes.reduce((n, p) => n + p.questions.length, 0)
      for (const memberNumber of VOTERS) {
        for (const p of processes) {
          const auth = await voterClient.processes.authStep0(p.draftId, { memberNumber })
          expect(auth.authToken, `auth failed (member ${memberNumber}, ${p.label})`).toBeTruthy()

          const check = await voterClient.processes.check(p.draftId, { authToken: auth.authToken! })
          expect(check.belongsToProcess, `member ${memberNumber} not in census (${p.label})`).toBe(
            true,
          )

          for (const status of check.questions) {
            expect(status.canVote, `member ${memberNumber} cannot vote (${p.label})`).toBe(true)
            expect(status.hasVoted, `member ${memberNumber} already voted (${p.label})`).toBe(false)
            expect(status.upstreamId, `check misses upstreamId (${p.label})`).toMatch(
              /^[0-9a-f]{64}$/i,
            )
            const question = p.questions.find((q) => q.id === status.questionId)
            expect(question, `check reported unknown question ${status.questionId}`).toBeTruthy()

            // CSP sign over a fresh ephemeral address, then build + seal (for
            // secret questions) + relay through the public VotingClient, and
            // poll the relay job for the vote nullifier.
            const signer = new EphemeralSigner()
            const sign = await voterClient.processes.sign(p.draftId, {
              authToken: auth.authToken!,
              electionId: status.upstreamId!,
              payload: signer.address,
            })
            expect(sign.signature, `no CSP signature (${p.label})`).toBeTruthy()

            const jobId = await voting.vote({
              processId: status.upstreamId!,
              // Encode the raw selections into the question's wire ballot —
              // the same codec path react-components voters go through.
              choices: encodeQuestionBallot(question!, specFor(p, status.questionId).choices),
              chainId: chainId!,
              signer,
              cspSignature: sign.signature!,
              cspWeight: sign.weight,
              encryptionKeys: question!.secretUntilTheEnd ? question!.encryptionKeys : undefined,
              // Exercise the VoteEnvelope.memo field (proto 1.15.13) live: the
              // chain must accept envelopes that carry it.
              memo: `itest member ${memberNumber} (${p.label})`,
            })
            const job = await voterClient.jobs.waitFor(jobId, { timeoutMs: 90000, intervalMs: 2000 })
            expect(job.status, `vote relay failed (${p.label})`).toBe('completed')
            const nullifier = job.result?.voteID
            expect(nullifier, `no nullifier (${p.label}, member ${memberNumber})`).toBeTruthy()
            expect(nullifiers.has(nullifier!), 'duplicate nullifier').toBe(false)
            nullifiers.add(nullifier!)
            step(`6. vote emitted — member ${memberNumber} on ${p.label} → ${nullifier!.slice(0, 12)}…`)
          }
        }
      }

      expect(nullifiers.size).toBe(VOTERS.length * questionCount)

      // 7. Live results (saas-backend#596 + #599): tallies are public and live —
      // no RESULTS status needed. Poll `GET /processes/{id}/results` until every
      // question's voteCount reflects every voter (the chain indexer may lag a
      // few blocks behind the relay jobs), then check the tally shape: live
      // (finalResults=false), maxVoters = census size, and a decodable matrix
      // for cleartext questions — a secret question's matrix stays hidden until
      // the encryption keys are revealed at the end.
      const VOTES_PER_QUESTION = VOTERS.length
      for (const p of processes) {
        let results = await voterClient.elections.getResults(p.draftId)
        const deadline = Date.now() + 120000
        while (
          results.questions.some((q) => (q.voteCount ?? 0) < VOTES_PER_QUESTION) &&
          Date.now() < deadline
        ) {
          await new Promise((r) => setTimeout(r, 3000))
          results = await voterClient.elections.getResults(p.draftId)
        }
        expect(results.questions.length).toBe(p.questions.length)
        for (const q of results.questions) {
          expect(q.voteCount, `${p.label} live voteCount lagging`).toBe(VOTES_PER_QUESTION)
          expect(q.finalResults, `${p.label} results marked final while live`).toBe(false)
          expect(q.maxVoters, `${p.label} maxVoters is not the census size`).toBe(MEMBER_COUNT)
          if (!p.secret) {
            expect(q.results?.length, `${p.label} has no live tally matrix`).toBeGreaterThan(0)
            // Decode the histogram and check the actual per-choice tallies.
            // voteCount alone is NOT enough: it counts envelopes, and the chain
            // accepts envelopes whose ballot the scrutinizer later discards
            // (e.g. a codec/protocol mismatch) — only the decoded tally proves
            // the votes were counted.
            const question = p.questions.find((pq) => pq.id === q.questionId)
            expect(question, `${p.label} results carry unknown question ${q.questionId}`).toBeTruthy()
            const decoded = decodeQuestionResults(question!, q.results!)
            expect(
              decoded.map((c) => c.votes),
              `${p.label} / "${question!.title?.default}" decoded tally mismatch ` +
                `(raw ${JSON.stringify(q.results)})`,
            ).toEqual(specFor(p, q.questionId).tally)
          }
        }
        // The same live tally rides the public single reads (process + question).
        const single = await voterClient.elections.get(p.draftId)
        for (const q of single.questions) {
          expect(q.results?.voteCount, `${p.label} single read misses live results`).toBe(
            VOTES_PER_QUESTION,
          )
        }
        step(`7. live results verified — ${p.label} (${VOTES_PER_QUESTION} votes per question)`)
      }

      step(`done — ${nullifiers.size} votes cast across ${questionCount} on-chain processes`)
    },
    // 4 processes / 9 on-chain elections / 36 votes, each vote a CSP sign + relay
    // + job poll, plus publish jobs and the indexer lag before the tally settles.
    // Kept under the CI job's timeout-minutes (25) so a hang surfaces as a test
    // failure with the suite's own diagnostics, not as a killed runner.
    1200000,
  )
})
