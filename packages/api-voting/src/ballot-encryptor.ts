import nacl from 'tweetnacl'
import { blake2b } from '@noble/hashes/blake2b'
import { fromHex } from './hex'

/**
 * Encrypts ballots for `secretUntilTheEnd` elections using the NaCl SealedBox
 * scheme the Vochain expects (libsodium `crypto_box_seal`).
 *
 * Layout of the returned bytes:
 *   ephemeralPublicKey(32) || box
 * where `box = nacl.box(message, nonce, recipientPk, ephemeralSk)` and the
 * nonce is `blake2b(ephemeralPk || recipientPk)` truncated to 24 bytes.
 *
 * The result is raw bytes (it goes straight into VoteEnvelope.votePackage),
 * not base64 — that differs from a standalone "encrypt to string" helper.
 */
export class BallotEncryptor {
  /**
   * Seal `message` to the election's hex-encoded curve25519 public key.
   */
  static seal(message: Uint8Array, hexPublicKey: string): Uint8Array {
    const recipientPk = fromHex(hexPublicKey)
    const ephemeral = nacl.box.keyPair()

    const nonce = blake2b(new Uint8Array([...ephemeral.publicKey, ...recipientPk]), {
      dkLen: nacl.box.nonceLength,
    })
    const boxed = nacl.box(message, nonce, recipientPk, ephemeral.secretKey)

    const out = new Uint8Array(ephemeral.publicKey.length + boxed.length)
    out.set(ephemeral.publicKey, 0)
    out.set(boxed, ephemeral.publicKey.length)

    // wipe the ephemeral secret key
    ephemeral.secretKey.fill(0)
    return out
  }

  /**
   * Open a sealed box given the recipient keypair. Useful for tests.
   */
  static open(
    sealed: Uint8Array,
    recipientPublicKey: Uint8Array,
    recipientSecretKey: Uint8Array,
  ): Uint8Array {
    const ephemeralPk = sealed.slice(0, nacl.box.publicKeyLength)
    const boxed = sealed.slice(nacl.box.publicKeyLength)
    const nonce = blake2b(new Uint8Array([...ephemeralPk, ...recipientPublicKey]), {
      dkLen: nacl.box.nonceLength,
    })
    const opened = nacl.box.open(boxed, nonce, ephemeralPk, recipientSecretKey)
    if (!opened) throw new Error('Failed to open sealed box')
    return opened
  }
}
