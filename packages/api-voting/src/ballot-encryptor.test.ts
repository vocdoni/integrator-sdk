import nacl from 'tweetnacl'
import { utf8ToBytes } from '@noble/hashes/utils'
import { BallotEncryptor } from './ballot-encryptor'
import { toHex } from './hex'

describe('BallotEncryptor (sealed box)', () => {
  let recipient: nacl.BoxKeyPair
  let publicKeyHex: string

  beforeEach(() => {
    recipient = nacl.box.keyPair()
    publicKeyHex = toHex(recipient.publicKey)
  })

  it('seals to raw bytes prefixed with the 32-byte ephemeral public key', () => {
    const message = utf8ToBytes('hello')
    const sealed = BallotEncryptor.seal(message, publicKeyHex)
    expect(sealed).toBeInstanceOf(Uint8Array)
    // ephemeralPk(32) + box(overhead 16 + len)
    expect(sealed.length).toBe(32 + nacl.box.overheadLength + message.length)
  })

  it('uses a fresh ephemeral key each time (different ciphertexts)', () => {
    const message = utf8ToBytes('same')
    const a = BallotEncryptor.seal(message, publicKeyHex)
    const b = BallotEncryptor.seal(message, publicKeyHex)
    expect(toHex(a)).not.toBe(toHex(b))
  })

  it('round-trips: open recovers the original message', () => {
    const message = utf8ToBytes(JSON.stringify({ nonce: 'abc', votes: [1, 0, 2] }))
    const sealed = BallotEncryptor.seal(message, publicKeyHex)
    const opened = BallotEncryptor.open(sealed, recipient.publicKey, recipient.secretKey)
    expect(toHex(opened)).toBe(toHex(message))
  })

  it('throws when opened with the wrong recipient key', () => {
    const sealed = BallotEncryptor.seal(utf8ToBytes('secret'), publicKeyHex)
    const wrong = nacl.box.keyPair()
    expect(() => BallotEncryptor.open(sealed, wrong.publicKey, wrong.secretKey)).toThrow()
  })
})
