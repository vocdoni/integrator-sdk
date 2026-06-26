import type { RelayVoteRequest, RelayVoteResponse } from '@vocdoni/api-types'
import { buildVoteTransaction, type BuildVoteTransactionOptions } from './vote-transaction'

/**
 * The slice of `@vocdoni/api-client`'s client this needs to relay a vote. The
 * full `VocdoniApiClient` satisfies it structurally, so you pass the client you
 * already have — api-voting never imports api-client, keeping the two packages
 * (and their bundle sizes) independent.
 */
export interface VoteApiClient {
  elections: {
    /** Relays a signed vote transaction to the SaaS API (`POST /vote`). */
    vote(req: RelayVoteRequest): Promise<RelayVoteResponse>
  }
}

export interface VotingClientOptions {
  /** The api-client instance used to relay votes (`new VocdoniApiClient(...)`). */
  client: VoteApiClient
}

/**
 * Builds + signs the Vochain vote transaction and relays it through api-client.
 *
 * The client is injected once at construction; `vote()` knows it relays through
 * `client.elections.vote`. The CSP signature (and weight) must already have been
 * obtained from the bundle sign endpoint; relaying returns an async job id whose
 * completion yields the vote nullifier (poll GET /jobs/{jobId}).
 */
export class VotingClient {
  private readonly client: VoteApiClient

  constructor(options: VotingClientOptions) {
    this.client = options.client
  }

  async vote(opts: BuildVoteTransactionOptions): Promise<string> {
    const txPayload = buildVoteTransaction(opts)
    const { jobId } = await this.client.elections.vote({ txPayload })
    return jobId
  }
}
