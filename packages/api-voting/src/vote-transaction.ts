import type { EncryptionKey } from '@vocdoni/api-types'
import { CAbundle, Proof, ProofCA, ProofCA_Type, SignedTx, Tx, VoteEnvelope } from '@vocdoni/proto/vochain'
import { keccak_256 } from '@noble/hashes/sha3'
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils'
import { EphemeralSigner } from './ephemeral-signer'
import { fromHex, strip0x, toHex } from './hex'
import { buildVotePackage } from './vote-package'

const VOTE_MESSAGE =
  'You are signing a Vocdoni transaction of type VOTE for process ID {processId}.\n\n' +
  'The hash of this transaction is {hash} and the destination chain is {chainId}.'

export interface BuildVoteTransactionOptions {
  /** On-chain process id (hex). */
  processId: string
  /** Vote choices, one per question. */
  choices: number[]
  /** Vochain chain id the vote is destined for (e.g. "vocdoni-stage-12"). */
  chainId: string
  /** Ephemeral signer whose address was signed by the CSP. */
  signer: EphemeralSigner
  /** CSP signature (hex) returned by the bundle sign endpoint. */
  cspSignature: string
  /** Hex-encoded census weight returned alongside the CSP signature. */
  cspWeight?: string
  /** Election encryption keys, for secretUntilTheEnd elections. */
  encryptionKeys?: EncryptionKey[]
  /** CSP proof type. Defaults to ECDSA_PIDSALTED (the SaaS bundle signer). */
  proofType?: ProofCA_Type
}

/**
 * Builds and signs a Vochain vote transaction carrying a CSP (CA) proof, and
 * returns the hex-encoded `SignedTx` ready for POST /process/{processId}/vote.
 *
 * The proof reconstructs the exact `CAbundle{processId, address, voteWeight}`
 * the CSP signed, so the Vochain can verify the signature. The transaction is
 * then signed by the ephemeral key via EIP-191, which is what the chain expects.
 */
export function buildVoteTransaction(opts: BuildVoteTransactionOptions): string {
  const {
    processId,
    choices,
    chainId,
    signer,
    cspSignature,
    cspWeight,
    encryptionKeys,
    proofType = ProofCA_Type.ECDSA_PIDSALTED,
  } = opts

  const processIdBytes = fromHex(processId)
  const { votePackage, keyIndexes } = buildVotePackage({ choices, encryptionKeys })

  const proof = Proof.fromPartial({
    payload: {
      $case: 'ca',
      ca: ProofCA.fromPartial({
        type: proofType,
        signature: fromHex(cspSignature),
        bundle: CAbundle.fromPartial({
          processId: processIdBytes,
          address: fromHex(signer.address),
          voteWeight: cspWeight ? fromHex(cspWeight) : undefined,
        }),
      }),
    },
  })

  const vote = VoteEnvelope.fromPartial({
    proof,
    processId: processIdBytes,
    nonce: randomBytes(32),
    votePackage,
    encryptionKeyIndexes: keyIndexes,
  })

  const tx = Tx.encode({ payload: { $case: 'vote', vote } }).finish()

  // EIP-191 personal_sign over the human-readable VOTE message, exactly as the
  // Vochain validates it (keccak256 of the raw tx fills the {hash} field).
  const hash = toHex(keccak_256(tx))
  const message = VOTE_MESSAGE.replace('{processId}', strip0x(processId))
    .replace('{hash}', hash)
    .replace('{chainId}', chainId)
  const signature = signer.signMessage(utf8ToBytes(message))

  const signedTx = SignedTx.encode({ tx, signature: fromHex(signature) }).finish()
  return toHex(signedTx)
}
