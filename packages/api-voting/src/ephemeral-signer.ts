import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils'
import { toHex } from './hex'

const EIP191_PREFIX = '\x19Ethereum Signed Message:\n'

/**
 * Generates a per-vote ephemeral secp256k1 keypair.
 * The derived Ethereum address is used as the signer identity for CSP, and the
 * key signs the Vochain vote transaction (EIP-191 personal_sign).
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
   * Signs a UTF-8 message using the EIP-191 `personal_sign` scheme, exactly as
   * ethers' `Wallet.signMessage` does — which is what the Vochain validates:
   *
   *   keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
   *
   * @returns 65-byte signature as `0x{r}{s}{v}` hex, with v ∈ {27, 28}.
   */
  signMessage(message: Uint8Array): string {
    const prefix = utf8ToBytes(`${EIP191_PREFIX}${message.length}`)
    const digest = keccak_256(concatBytes(prefix, message))
    const sig = secp256k1.sign(digest, this.privateKey, { lowS: true })
    const v = sig.recovery + 27
    const out = new Uint8Array(65)
    out.set(sig.toCompactRawBytes(), 0) // r || s (64 bytes)
    out[64] = v
    return '0x' + toHex(out)
  }
}
