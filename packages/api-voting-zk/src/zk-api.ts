// Vochain gateway endpoints for anonymous voting, ported from the Vocdoni SDK's
// ZkAPI (/siks, /siks/proof). The SIK tree and its census membership proof come
// from the chain, not the SaaS API.

import { strip0x } from '@vocdoni/api-voting'
import type { SikResponse, ZkCensusProofResponse } from './types'

/** Fetches the registered SIK for an address (`/siks/{address}`). */
export async function fetchSik(gatewayUrl: string, address: string): Promise<SikResponse> {
  const res = await fetch(`${gatewayUrl}/siks/${strip0x(address)}`)
  if (!res.ok) throw new Error(`Failed to fetch SIK: ${res.status}`)
  return (await res.json()) as SikResponse
}

/** Fetches the SIK-tree census membership proof for an address (`/siks/proof/{address}`). */
export async function fetchZkCensusProof(
  gatewayUrl: string,
  address: string,
): Promise<ZkCensusProofResponse> {
  const res = await fetch(`${gatewayUrl}/siks/proof/${strip0x(address)}`)
  if (!res.ok) throw new Error(`Failed to fetch ZK census proof: ${res.status}`)
  return (await res.json()) as ZkCensusProofResponse
}

/**
 * Whether an address has already registered the SIK derived from its signature
 * (and optional password) — used to decide if a REGISTER_SIK tx is needed first.
 */
export async function hasRegisteredSik(
  gatewayUrl: string,
  address: string,
  calcSik: () => Promise<string>,
): Promise<boolean> {
  try {
    const [computed, fetched] = await Promise.all([calcSik(), fetchSik(gatewayUrl, address)])
    return computed === fetched.sik
  } catch {
    return false
  }
}
