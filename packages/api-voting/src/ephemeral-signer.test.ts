import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils'
import { EphemeralSigner } from './ephemeral-signer'
import { fromHex, toHex } from './hex'

/** Recovers the signer address from an EIP-191 signMessage signature. */
function recoverAddress(message: Uint8Array, sigHex: string): string {
  const sig = fromHex(sigHex)
  const compact = sig.slice(0, 64)
  const recovery = sig[64] - 27
  const prefix = utf8ToBytes(`\x19Ethereum Signed Message:\n${message.length}`)
  const digest = keccak_256(concatBytes(prefix, message))
  const signature = secp256k1.Signature.fromCompact(compact).addRecoveryBit(recovery)
  const pub = signature.recoverPublicKey(digest).toRawBytes(false)
  return '0x' + toHex(keccak_256(pub.slice(1)).slice(-20))
}

describe('EphemeralSigner', () => {
  it('generates a random keypair when no private key is provided', () => {
    expect(new EphemeralSigner().privateKey).not.toEqual(new EphemeralSigner().privateKey)
  })

  it('accepts a provided private key and is deterministic', () => {
    const pk = new Uint8Array(32).fill(1)
    const a = new EphemeralSigner(pk)
    const b = new EphemeralSigner(pk)
    expect(a.publicKey).toEqual(b.publicKey)
    expect(a.address).toBe(b.address)
  })

  it('public key is 65 bytes (uncompressed secp256k1)', () => {
    const signer = new EphemeralSigner()
    expect(signer.publicKey).toHaveLength(65)
    expect(signer.publicKey[0]).toBe(0x04)
  })

  it('derives a valid lowercase Ethereum address', () => {
    expect(new EphemeralSigner().address).toMatch(/^0x[0-9a-f]{40}$/)
  })

  it('signMessage returns a 0x-prefixed 65-byte signature with v ∈ {27,28}', () => {
    const sigHex = new EphemeralSigner().signMessage(utf8ToBytes('vote'))
    expect(sigHex).toMatch(/^0x[0-9a-f]{130}$/)
    const v = fromHex(sigHex)[64]
    expect(v === 27 || v === 28).toBe(true)
  })

  it('signMessage is recoverable to the signer address (EIP-191 correctness)', () => {
    const signer = new EphemeralSigner(new Uint8Array(32).fill(7))
    const message = utf8ToBytes('You are signing a Vocdoni transaction of type VOTE')
    expect(recoverAddress(message, signer.signMessage(message))).toBe(signer.address)
  })

  it('produces deterministic signatures (lowS, RFC6979)', () => {
    const signer = new EphemeralSigner(new Uint8Array(32).fill(42))
    const message = utf8ToBytes('determinism')
    expect(signer.signMessage(message)).toBe(signer.signMessage(message))
  })
})
