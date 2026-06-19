import nacl from 'tweetnacl'

const fromHex = (hex: string): Uint8Array => {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

const toBase64 = (bytes: Uint8Array): string => {
  // Use Buffer in Node, btoa in browser
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Encrypts ballot choices for `secretUntilTheEnd` elections.
 *
 * Uses NaCl box (curve25519-xsalsa20-poly1305) with an ephemeral keypair.
 * The election's public encryption key is the recipient key.
 *
 * The returned value is base64(nonce || ciphertext).
 */
export class BallotEncryptor {
  /**
   * Encrypt an array of vote choices using the election's public encryption key.
   *
   * @param choices   Array of choice indices
   * @param publicKey Hex-encoded election encryption public key (32 bytes / curve25519)
   * @param keyIndex  Index of the encryption key used
   */
  static encrypt(
    choices: number[],
    publicKey: string,
    keyIndex: number
  ): { encrypted: string; keyIndex: number } {
    const theirPublicKey = fromHex(publicKey)
    const ephemeralKeypair = nacl.box.keyPair()

    // Wrap in Uint8Array to ensure the same realm as tweetnacl expects
    const encoded = new TextEncoder().encode(JSON.stringify(choices))
    const message = new Uint8Array(encoded.buffer, encoded.byteOffset, encoded.byteLength)
    const nonce = nacl.randomBytes(nacl.box.nonceLength)

    const ciphertext = nacl.box(message, nonce, theirPublicKey, ephemeralKeypair.secretKey)

    // Prepend the ephemeral public key so the recipient can derive the shared secret:
    // format: ephemeralPublicKey(32) || nonce(24) || ciphertext
    const combined = new Uint8Array(
      nacl.box.publicKeyLength + nonce.length + ciphertext.length
    )
    combined.set(ephemeralKeypair.publicKey, 0)
    combined.set(nonce, nacl.box.publicKeyLength)
    combined.set(ciphertext, nacl.box.publicKeyLength + nonce.length)

    return {
      encrypted: toBase64(combined),
      keyIndex,
    }
  }

  /**
   * Decrypt a ballot encrypted with {@link BallotEncryptor.encrypt}.
   * Useful for testing / verification on the recipient side.
   *
   * @param encryptedBase64 The base64 value returned by encrypt()
   * @param secretKey       The recipient's secret key (32 bytes)
   */
  static decrypt(encryptedBase64: string, secretKey: Uint8Array): number[] {
    const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0))

    const ephemeralPublicKey = combined.slice(0, nacl.box.publicKeyLength)
    const nonce = combined.slice(
      nacl.box.publicKeyLength,
      nacl.box.publicKeyLength + nacl.box.nonceLength
    )
    const ciphertext = combined.slice(nacl.box.publicKeyLength + nacl.box.nonceLength)

    const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPublicKey, secretKey)
    if (!decrypted) throw new Error('Decryption failed')

    return JSON.parse(new TextDecoder().decode(decrypted)) as number[]
  }
}
