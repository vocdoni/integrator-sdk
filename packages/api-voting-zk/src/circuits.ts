// Anonymous-voting circuit artifact fetching + integrity checks, ported from
// the Vocdoni SDK's AnonymousService.fetchCircuits / checkCircuitsHashes,
// adapted to plain fetch against the Vochain gateway.

import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'
import { strip0x } from '@vocdoni/api-voting'
import type { ChainCircuitInfo, ChainCircuits } from './types'

/** Fetches `/chain/info/circuit` describing where the circuit artifacts live. */
export async function fetchCircuitInfo(gatewayUrl: string): Promise<ChainCircuitInfo> {
  const res = await fetch(`${gatewayUrl}/chain/info/circuit`)
  if (!res.ok) throw new Error(`Failed to fetch circuit info: ${res.status}`)
  return (await res.json()) as ChainCircuitInfo
}

async function fetchCircuitFile(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri)
  if (!res.ok) throw new Error(`Failed to fetch circuit artifact ${uri}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** Verifies each artifact's sha256 matches the hash advertised by the chain. */
export function checkCircuitsHashes(circuits: ChainCircuits): ChainCircuits {
  const check = (data: Uint8Array, hash: string, name: string) => {
    if (strip0x(bytesToHex(sha256(data))) !== strip0x(hash)) {
      throw new Error(`Invalid hash check for ${name}`)
    }
  }
  check(circuits.zKeyData, circuits.zKeyHash, 'zKey')
  check(circuits.vKeyData, circuits.vKeyHash, 'vKey')
  check(circuits.wasmData, circuits.wasmHash, 'WASM')
  return circuits
}

/**
 * Fetches and integrity-checks the anonymous voting circuits from the gateway.
 * Returns the proving key, verification key and witness wasm as bytes.
 */
export async function fetchCircuits(gatewayUrl: string): Promise<ChainCircuits> {
  const info = await fetchCircuitInfo(gatewayUrl)
  const base = `${info.uri}/${info.circuitPath}`
  const zKeyURI = `${base}/${info.zKeyFilename}`
  const vKeyURI = `${base}/${info.vKeyFilename}`
  const wasmURI = `${base}/${info.wasmFilename}`

  const [zKeyData, vKeyData, wasmData] = await Promise.all([
    fetchCircuitFile(zKeyURI),
    fetchCircuitFile(vKeyURI),
    fetchCircuitFile(wasmURI),
  ])

  return checkCircuitsHashes({
    zKeyData,
    zKeyHash: info.zKeyHash,
    zKeyURI,
    vKeyData,
    vKeyHash: info.vKeyHash,
    vKeyURI,
    wasmData,
    wasmHash: info.wasmHash,
    wasmURI,
  })
}
