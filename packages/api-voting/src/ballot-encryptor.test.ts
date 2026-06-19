import nacl from 'tweetnacl'
import { BallotEncryptor } from './ballot-encryptor'

describe('BallotEncryptor', () => {
  let recipientKeypair: nacl.BoxKeyPair
  let publicKeyHex: string

  beforeEach(() => {
    recipientKeypair = nacl.box.keyPair()
    publicKeyHex = Array.from(recipientKeypair.publicKey)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  })

  it('returns a base64-encoded string and the key index', () => {
    const result = BallotEncryptor.encrypt([1, 0, 2], publicKeyHex, 0)
    expect(result.keyIndex).toBe(0)
    expect(typeof result.encrypted).toBe('string')
    // must be valid base64
    expect(() => atob(result.encrypted)).not.toThrow()
  })

  it('encrypts different choices to different ciphertexts (ephemeral nonce)', () => {
    const r1 = BallotEncryptor.encrypt([1], publicKeyHex, 0)
    const r2 = BallotEncryptor.encrypt([1], publicKeyHex, 0)
    // Two encryptions of the same plaintext should differ (random nonce)
    expect(r1.encrypted).not.toBe(r2.encrypted)
  })

  it('round-trips: decrypt recovers the original choices', () => {
    const choices = [1, 0, 2]
    const { encrypted } = BallotEncryptor.encrypt(choices, publicKeyHex, 0)
    const recovered = BallotEncryptor.decrypt(encrypted, recipientKeypair.secretKey)
    expect(recovered).toEqual(choices)
  })

  it('round-trips with a single-element choice array', () => {
    const choices = [3]
    const { encrypted } = BallotEncryptor.encrypt(choices, publicKeyHex, 2)
    const recovered = BallotEncryptor.decrypt(encrypted, recipientKeypair.secretKey)
    expect(recovered).toEqual(choices)
  })

  it('preserves the keyIndex in the result', () => {
    const result = BallotEncryptor.encrypt([0], publicKeyHex, 7)
    expect(result.keyIndex).toBe(7)
  })

  it('throws on decryption with the wrong secret key', () => {
    const { encrypted } = BallotEncryptor.encrypt([1], publicKeyHex, 0)
    const wrongKey = nacl.box.keyPair().secretKey
    expect(() => BallotEncryptor.decrypt(encrypted, wrongKey)).toThrow()
  })
})
