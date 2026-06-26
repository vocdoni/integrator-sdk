// Types and constants for anonymous (ZK-SNARK) voting, ported from the
// Vocdoni SDK's AnonymousService and ZK API. Kept paradigm-faithful: plain
// types + functions, no service classes.

/** Payload a voter signs (personal_sign) to derive their Secret Identity Key. */
export const VOCDONI_SIK_PAYLOAD =
  'This signature request is used to create your own secret identity key (SIK) for the Vocdoni protocol and generate your anonymous account.\n' +
  'If you are connecting to a third party service, all your activity will remain anonymous to the rest of users, including this service.'

/** Number of signature bytes kept for SIK derivation (r+s, the recovery byte is dropped). */
export const VOCDONI_SIK_SIGNATURE_LENGTH = 64

/** A groth16 proof as produced by snarkjs `fullProve`. */
export type ZkProof = {
  proof: {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
    protocol: string
    curve: string
  }
  publicSignals: string[]
}

/** Inputs fed to the anonymous voting circuit. */
export interface CircuitInputs {
  // public inputs
  electionId: string[]
  nullifier: string
  availableWeight: string
  voteHash: string[]
  sikRoot: string
  censusRoot: string
  // private inputs
  address: string
  password: string
  signature: string
  voteWeight: string
  sikSiblings: string[]
  censusSiblings: string[]
}

/** The circuit artifacts (proving/verification key + witness wasm) plus their hashes/URIs. */
export type ChainCircuits = {
  zKeyData: Uint8Array
  zKeyHash: string
  zKeyURI: string
  vKeyData: Uint8Array
  vKeyHash: string
  vKeyURI: string
  wasmData: Uint8Array
  wasmHash: string
  wasmURI: string
}

/** `/chain/info/circuit` response — where to fetch the circuit artifacts and their hashes. */
export interface ChainCircuitInfo {
  uri: string
  circuitPath: string
  zKeyHash: string
  zKeyFilename: string
  vKeyHash: string
  vKeyFilename: string
  wasmHash: string
  wasmFilename: string
}

/** `/siks/{address}` response. */
export interface SikResponse {
  sik: string
}

/** `/siks/proof/{address}` response — the census membership proof for the SIK tree. */
export interface ZkCensusProofResponse {
  censusRoot: string
  censusProof: string
  value: string
  censusSiblings: string[]
}
