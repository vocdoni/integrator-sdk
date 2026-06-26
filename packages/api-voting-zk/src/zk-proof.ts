// Groth16 proof generation + Vochain proto packaging, ported from the Vocdoni
// SDK (AnonymousService.generateGroth16Proof and Vote.packageSignedProof's
// ANONYMOUS branch). Mirrors api-voting's buildVoteTransaction proof shape.

import { Proof, ProofZkSNARK } from '@vocdoni/proto/vochain'
import { groth16 } from 'snarkjs'
import type { CircuitInputs, ZkProof } from './types'

/**
 * Generates a groth16 ZK proof for the given circuit inputs using the witness
 * wasm and proving key bytes (see {@link fetchCircuits}).
 */
export async function generateGroth16Proof(
  inputs: CircuitInputs,
  wasmData: Uint8Array,
  zKeyData: Uint8Array,
): Promise<ZkProof> {
  return groth16.fullProve(inputs, wasmData, zKeyData)
}

/**
 * Packages a {@link ZkProof} into a Vochain `Proof` carrying a ProofZkSNARK,
 * ready to drop into a VoteEnvelope. `b` (the G2 point) is flattened, matching
 * the SDK encoding.
 */
export function packageZkProof(zk: ZkProof, circuitParametersIndex = 0): Proof {
  const zkSnark = ProofZkSNARK.fromPartial({
    circuitParametersIndex,
    a: zk.proof.pi_a,
    b: zk.proof.pi_b.reduce((acc, row) => acc.concat(row), []),
    c: zk.proof.pi_c,
    publicInputs: zk.publicSignals,
  })
  return Proof.fromPartial({ payload: { $case: 'zkSnark', zkSnark } })
}
