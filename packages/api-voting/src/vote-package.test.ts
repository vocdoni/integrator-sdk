import nacl from 'tweetnacl'
import { describe, expect, it } from 'vitest'
import { BallotEncryptor } from './ballot-encryptor'
import { toHex } from './hex'
import { buildVotePackage } from './vote-package'

const votesOf = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)).votes

describe('buildVotePackage', () => {
  it('returns a plain JSON {nonce, votes} package when unencrypted', () => {
    const { votePackage, keyIndexes, encrypted } = buildVotePackage({ choices: [1, 0] })
    expect(encrypted).toBe(false)
    expect(keyIndexes).toEqual([])
    expect(votesOf(votePackage)).toEqual([1, 0])
  })

  it('sorts keys by index and nests seals (key 0 innermost, outermost = highest index)', () => {
    const k0 = nacl.box.keyPair()
    const k1 = nacl.box.keyPair()

    // Pass the keys out of order to prove they get sorted ascending.
    const { votePackage, keyIndexes, encrypted } = buildVotePackage({
      choices: [2, 1],
      encryptionKeys: [
        { index: 1, key: toHex(k1.publicKey) },
        { index: 0, key: toHex(k0.publicKey) },
      ],
    })

    expect(encrypted).toBe(true)
    expect(keyIndexes).toEqual([0, 1])

    // Sealed key 0 first then key 1 ⇒ key 1 is the outer layer: open it first.
    const inner = BallotEncryptor.open(votePackage, k1.publicKey, k1.secretKey)
    const plain = BallotEncryptor.open(inner, k0.publicKey, k0.secretKey)
    expect(votesOf(plain)).toEqual([2, 1])
  })
})
