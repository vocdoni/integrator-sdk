import { describe, expect, it } from 'vitest'
import { arbo, arrayBufferToHex, bigIntToHex, ff, hexToArrayBuffer } from './field'

describe('hex byte helpers', () => {
  it('round-trips bytes ↔ hex', () => {
    const bytes = Uint8Array.from([0x00, 0x0a, 0xff, 0x42])
    expect(arrayBufferToHex(bytes)).toBe('000aff42')
    expect(Array.from(hexToArrayBuffer('000aff42'))).toEqual([0, 10, 255, 66])
  })

  it('bigIntToHex pads to even length', () => {
    expect(bigIntToHex(BigInt(0xa))).toBe('0a')
    expect(bigIntToHex(BigInt(0xabc))).toBe('0abc')
  })
})

describe('arbo little-endian field encoding', () => {
  it('toBigInt and toString are inverses', () => {
    const hex = '01020304'
    const n = arbo.toBigInt(hex)
    // little-endian: bytes reversed → 0x04030201
    expect(n).toBe(BigInt('0x04030201'))
    expect(arbo.toString(n)).toBe(hex)
  })

  it('toHash splits a sha256 digest into two little-endian field halves', async () => {
    const [lo, hi] = await arbo.toHash('00')
    expect(typeof lo).toBe('string')
    expect(typeof hi).toBe('string')
    expect(BigInt(lo)).toBeGreaterThan(0n)
    expect(BigInt(hi)).toBeGreaterThan(0n)
  })
})

describe('finite field reduction', () => {
  it('maps q to 0 and reduces values above q', () => {
    expect(ff.bigIntToFF(ff.q)).toBe(0n)
    expect(ff.bigIntToFF(ff.q + 5n)).toBe(5n)
    expect(ff.bigIntToFF(7n)).toBe(7n)
  })

  it('hexToFFBigInt parses and reduces', () => {
    expect(ff.hexToFFBigInt('0x0a')).toBe(10n)
  })
})
