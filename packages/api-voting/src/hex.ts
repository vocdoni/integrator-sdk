import { bytesToHex, hexToBytes } from '@noble/hashes/utils'

/** Removes a leading `0x`/`0X` if present. */
export function strip0x(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
}

/** Ensures the string has a leading `0x`. */
export function ensure0x(value: string): string {
  return value.startsWith('0x') ? value : `0x${value}`
}

/** Decodes a hex string (with or without `0x`) into bytes. */
export function fromHex(value: string): Uint8Array {
  return hexToBytes(strip0x(value))
}

/** Encodes bytes into a lowercase hex string (no `0x`). */
export function toHex(bytes: Uint8Array): string {
  return bytesToHex(bytes)
}
