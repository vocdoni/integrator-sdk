import { EphemeralSigner } from './ephemeral-signer'

describe('EphemeralSigner', () => {
  it('generates a random keypair when no private key is provided', () => {
    const s1 = new EphemeralSigner()
    const s2 = new EphemeralSigner()
    // Two random signers should have different private keys
    expect(s1.privateKey).not.toEqual(s2.privateKey)
  })

  it('accepts a provided private key and produces a deterministic public key', () => {
    const pk = new Uint8Array(32).fill(1)
    const s1 = new EphemeralSigner(pk)
    const s2 = new EphemeralSigner(pk)
    expect(s1.publicKey).toEqual(s2.publicKey)
    expect(s1.address).toBe(s2.address)
  })

  it('public key is 65 bytes (uncompressed secp256k1)', () => {
    const signer = new EphemeralSigner()
    expect(signer.publicKey).toHaveLength(65)
    // uncompressed prefix
    expect(signer.publicKey[0]).toBe(0x04)
  })

  it('derived address is a valid Ethereum hex address', () => {
    const signer = new EphemeralSigner()
    expect(signer.address).toMatch(/^0x[0-9a-f]{40}$/)
  })

  it('sign returns a 65-byte signature (v || r || s)', () => {
    const signer = new EphemeralSigner()
    const message = new Uint8Array(32).fill(0xab)
    const sig = signer.sign(message)
    expect(sig).toHaveLength(65)
    // v is 27 or 28
    expect(sig[0]).toBeGreaterThanOrEqual(27)
    expect(sig[0]).toBeLessThanOrEqual(28)
  })

  it('produces deterministic signatures for the same message and key', () => {
    const pk = new Uint8Array(32).fill(42)
    const signer = new EphemeralSigner(pk)
    const message = new Uint8Array(32).fill(0xcd)
    const sig1 = signer.sign(message)
    const sig2 = signer.sign(message)
    expect(sig1).toEqual(sig2)
  })
})
