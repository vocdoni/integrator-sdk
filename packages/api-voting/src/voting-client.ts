import type { EncryptionKey, RelayVoteRequest, RelayVoteResponse } from '@vocdoni/api-types'
import { EphemeralSigner } from './ephemeral-signer'
import { CspSigner } from './csp-signer'
import { buildVotePackage } from './vote-package'

export interface VoteOptions {
  /** The on-chain election / process ID */
  electionId: string
  /** CSP census URI (base URL for /sign, /check, etc.) */
  censusUri: string
  /** Array of choice indices, one per question */
  choices: number[]
  /** Encryption keys for secretUntilTheEnd elections */
  encryptionKeys?: EncryptionKey[]
  /** Auth token obtained from CSP step1 */
  cspAuthToken: string
  /** Function that relays the encoded vote to the API */
  relayFn: (req: RelayVoteRequest) => Promise<RelayVoteResponse>
}

/**
 * Orchestrates the full CSP vote flow:
 * 1. Generate ephemeral signer
 * 2. Build vote package (encrypt if needed)
 * 3. Get CSP blind signature
 * 4. Assemble vote envelope
 * 5. Relay to the SaaS API
 */
export class VotingClient {
  async vote(opts: VoteOptions): Promise<string> {
    const { electionId, censusUri, choices, encryptionKeys, cspAuthToken, relayFn } = opts

    // Step 1: ephemeral identity for this vote
    const signer = new EphemeralSigner()

    // Step 2: build the vote package (plain or encrypted)
    const votePackage = buildVotePackage({ choices, electionId, encryptionKeys })

    // Step 3: request CSP blind signature using the signer address as payload
    const cspSigner = new CspSigner(censusUri)
    const { signature: cspSignature, weight } = await cspSigner.sign(
      signer.address,
      cspAuthToken,
      electionId
    )

    // Step 4: assemble the vote envelope
    // TODO: replace with protobuf SignedTx once @vocdoni/proto is available
    const envelopeObj: Record<string, unknown> = {
      electionId,
      votes: votePackage.votes,
      encrypted: votePackage.encrypted,
      proof: { type: 'csp', signature: cspSignature },
      signerAddress: signer.address,
    }
    if (votePackage.encrypted && votePackage.encryptedVotes !== undefined) {
      envelopeObj.encryptedVotes = votePackage.encryptedVotes
    }
    if (weight !== undefined) {
      envelopeObj.weight = weight
    }

    const txPayload = btoa(JSON.stringify(envelopeObj))

    // Step 5: relay vote
    const { voteId } = await relayFn({ txPayload })
    return voteId
  }
}
