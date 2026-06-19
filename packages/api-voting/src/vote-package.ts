import type { EncryptionKey } from '@vocdoni/api-types'
import { BallotEncryptor } from './ballot-encryptor'

export interface VotePackageOptions {
  choices: number[]
  electionId: string
  encryptionKeys?: EncryptionKey[]
}

export interface VotePackageResult {
  votes: number[]
  encrypted: boolean
  encryptedVotes?: string
}

/**
 * Assembles the vote choices for the vote envelope.
 *
 * When encryption keys are present, the choices are encrypted with the first
 * available key. Otherwise they are returned as plain-text vote indices.
 */
export function buildVotePackage(opts: VotePackageOptions): VotePackageResult {
  const { choices, encryptionKeys } = opts

  if (encryptionKeys && encryptionKeys.length > 0) {
    // Use the last key (highest index) as the active encryption key
    const key = encryptionKeys[encryptionKeys.length - 1]
    const { encrypted } = BallotEncryptor.encrypt(choices, key.key, key.index)
    return {
      votes: choices,
      encrypted: true,
      encryptedVotes: encrypted,
    }
  }

  return {
    votes: choices,
    encrypted: false,
  }
}
