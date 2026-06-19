import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

/**
 * Generates a per-vote ephemeral secp256k1 keypair.
 * The derived Ethereum address is used as the signer identity for CSP.
 */
export class EphemeralSigner {
  readonly privateKey: Uint8Array
  readonly publicKey: Uint8Array
  readonly address: string

  constructor(privateKey?: Uint8Array) {
    this.privateKey = privateKey ?? secp256k1.utils.randomPrivateKey()
    // uncompressed public key: 65 bytes (04 || x || y)
    this.publicKey = secp256k1.getPublicKey(this.privateKey, false)
    // Ethereum address: keccak256(pubkey[1:]) → last 20 bytes
    const pubkeyHash = keccak_256(this.publicKey.slice(1))
    this.address = '0x' + toHex(pubkeyHash.slice(-20))
  }

  /**
   * Signs a message with the ephemeral private key.
   * Returns a 65-byte compact+recovery signature (v || r || s).
   */
  sign(message: Uint8Array): Uint8Array {
    const sig = secp256k1.sign(message, this.privateKey)
    // compact: 64 bytes (r || s), recovery: 0 or 1
    const compact = sig.toCompactRawBytes()
    const v = sig.recovery + 27
    const result = new Uint8Array(65)
    result[0] = v
    result.set(compact, 1)
    return result
  }
}
