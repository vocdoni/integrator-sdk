import type { RelayVoteRequest, RelayVoteResponse } from '@vocdoni/api-types'
import { buildVoteTransaction, type BuildVoteTransactionOptions } from './vote-transaction'

export interface VoteOptions extends BuildVoteTransactionOptions {
  /** Relays the signed transaction to the SaaS API. */
  relayFn: (req: RelayVoteRequest) => Promise<RelayVoteResponse>
}

/**
 * Builds + signs the Vochain vote transaction and relays it to the SaaS API.
 *
 * The CSP signature (and weight) must already have been obtained from the bundle
 * sign endpoint; relaying returns an async job id whose completion yields the
 * vote nullifier (poll GET /jobs/{jobId}).
 */
export class VotingClient {
  async vote(opts: VoteOptions): Promise<string> {
    const { relayFn, ...txOpts } = opts
    const txPayload = buildVoteTransaction(txOpts)
    const { jobId } = await relayFn({ txPayload })
    return jobId
  }
}
