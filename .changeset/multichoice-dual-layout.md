---
"@vocdoni/ballot": patch
---

Harden the dense vs index-list multichoice discriminator so both wire layouts route
correctly off the protocol params (no new flag):

- `isDenseBallotProtocol` now requires `!uniqueValues`, so the 2-option index-list corner
  (`maxValue === 1 && uniqueValues`) stops misrouting as dense/approval — its results decode
  as the pick-slot column sum, not the dense per-choice read.
- `encodeMultiChoice` returns a short ballot as-is when the protocol reserves no abstain
  headroom, instead of throwing — the vochain accepts ballots shorter than `maxCount` and the
  legacy SDK sends them unpadded. (Genuinely-unsatisfiable protocols still throw upstream.)
- `questionSelectionRange` pick-slot `min` now follows `typeSetup.minChoices` instead of
  forcing a full `maxCount` slate, matching the dense branch. `minChoices: 0` (an empty
  submission) is honoured only when the protocol reserves abstain headroom — without it an
  empty ballot is accepted by the chain but recorded in no column, so it could not be told
  apart from not voting; the floor stays at 1 there.

Decoding is unchanged: the `{ choice: 'abstain' }` bucket is still always emitted for
multichoice (reporting 0 when the protocol reserves no sentinel headroom). Use the exported
`questionReservesAbstain(question)` to decide whether an "Abstention" field is worth
rendering — it is `false` exactly when abstention is structurally impossible.
