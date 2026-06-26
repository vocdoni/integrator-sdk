// Arbo / finite-field / hex byte utilities for anonymous voting, ported
// verbatim from the Vocdoni SDK's AnonymousService static helpers
// (arbo_utils, hex_utils, ff_utils). The byte ordering here is consensus
// -critical for nullifier/SIK derivation — do not "simplify".

import { sha256 } from '@noble/hashes/sha256'
import { strip0x } from '@vocdoni/api-voting'

// ─── hex ────────────────────────────────────────────────────────────────────

/** BigInt → even-length hex string (no `0x`). */
export function bigIntToHex(bi: bigint): string {
  const hex = bi.toString(16)
  return hex.length % 2 != 0 ? '0' + hex : hex
}

/** Bytes → lowercase hex string (no `0x`). */
export function arrayBufferToHex(input: Uint8Array): string {
  const res: string[] = []
  input.forEach((i) => res.push(('0' + i.toString(16)).slice(-2)))
  return res.join('')
}

/**
 * Hex string → bytes. Note the SDK pads an odd-length input by appending a
 * trailing `0` (not leading) — kept identical because arbo reversal depends on it.
 */
export function hexToArrayBuffer(input: string): Uint8Array {
  if (input.length % 2 !== 0) {
    input = input + '0'
  }
  const view = new Uint8Array(input.length / 2)
  for (let i = 0; i < input.length; i += 2) {
    view[i / 2] = parseInt(input.substring(i, i + 2), 16)
  }
  return view
}

// ─── arbo (little-endian field encoding used by the Vochain merkle tree) ──────

export const arbo = {
  toBigInt: (str: string): bigint => {
    const strBuff = hexToArrayBuffer(str)
    const hexArbo = arrayBufferToHex(strBuff.reverse())
    return BigInt('0x' + hexArbo)
  },

  toString: (n: bigint): string => {
    const nStr = bigIntToHex(n)
    const nBuff = hexToArrayBuffer(nStr)
    return arrayBufferToHex(nBuff.reverse())
  },

  toHash: async (input: string): Promise<string[]> => {
    const inputBuff = hexToArrayBuffer(input)
    const inputHash = arrayBufferToHex(sha256(inputBuff))
    const inputHashBuff = hexToArrayBuffer(strip0x(inputHash))

    const splitArboInput = [
      arrayBufferToHex(inputHashBuff.subarray(0, 16).reverse()),
      arrayBufferToHex(inputHashBuff.subarray(16, 32).reverse()),
    ]

    return [BigInt('0x' + splitArboInput[0]).toString(), BigInt('0x' + splitArboInput[1]).toString()]
  },
}

// ─── finite field (BN254 scalar field) ───────────────────────────────────────

export const ff = {
  q: BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617'),

  bigIntToFF: (bi: bigint): bigint => {
    if (bi == ff.q) {
      return BigInt(0)
    } else if (bi < ff.q && bi != BigInt(0)) {
      return bi
    }
    return bi % ff.q
  },

  hexToFFBigInt: (hexStr: string): bigint => {
    hexStr = strip0x(hexStr)
    if (hexStr.length % 2) {
      hexStr = '0' + hexStr
    }
    const bi = BigInt('0x' + hexStr)
    return ff.bigIntToFF(bi)
  },
}
