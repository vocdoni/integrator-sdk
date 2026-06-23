import type { EncryptionKey } from '@vocdoni/api-types'
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils'
import { BallotEncryptor } from './ballot-encryptor'
import { toHex } from './hex'

export interface VotePackageOptions {
  choices: number[]
  encryptionKeys?: EncryptionKey[]
}

export interface VotePackageResult {
  /** Raw bytes for VoteEnvelope.votePackage (plain JSON or sealed ciphertext). */
  votePackage: Uint8Array
  /** Sorted indexes of the encryption keys used (empty when unencrypted). */
  keyIndexes: number[]
  encrypted: boolean
}

/**
 * Builds the Vochain vote package: a JSON `{nonce, votes}` payload, sealed with
 * the election's encryption keys when the election is `secretUntilTheEnd`.
 *
 * When several keys are present they are applied in ascending index order
 * (key 0 innermost), matching how the Vochain unseals them.
 */
export function buildVotePackage(opts: VotePackageOptions): VotePackageResult {
  const { choices, encryptionKeys } = opts
  // 8-byte random nonce, hex-encoded — mirrors the Vochain vote package format.
  const nonce = toHex(randomBytes(8))
  const plain = utf8ToBytes(JSON.stringify({ nonce, votes: choices }))

  if (encryptionKeys && encryptionKeys.length > 0) {
    const keys = [...encryptionKeys].sort((a, b) => a.index - b.index)
    let pkg = plain
    for (const key of keys) {
      pkg = BallotEncryptor.seal(pkg, key.key)
    }
    return { votePackage: pkg, keyIndexes: keys.map((k) => k.index), encrypted: true }
  }

  return { votePackage: plain, keyIndexes: [], encrypted: false }
}
