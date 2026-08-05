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
  forcing a full `maxCount` slate, matching the dense branch.
- `decodeResults` / `decodeQuestionResults` omit the `{ choice: 'abstain' }` bucket when the
  protocol reserves no sentinel headroom (abstention is structurally impossible), so a
  no-headroom election no longer surfaces a misleading always-empty "Abstention" field.
