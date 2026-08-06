---
"@vocdoni/react-components": patch
---

`<ElectionResults />` no longer renders an "Abstention" row for elections where abstaining
is impossible.

The decoder always emits the multichoice `{ choice: 'abstain' }` bucket, so a pick-slot
protocol reserving no sentinel headroom (`maxValue < numChoices - 1 + (uniqueValues ?
maxCount : 1)`) surfaced a permanent "Abstention: 0" on a ballot no voter can abstain on —
the matrix has no sentinel column, so the chain has nowhere to record one. Confirmed against
a dev election whose own metadata reports `canAbstain: false`.

The row is now suppressed only when abstention is both structurally impossible **and**
unmeasured:

- headroom reserved → shown, including at `0`, because that zero is a real measurement;
- no headroom, bucket `0` → hidden (the fix);
- no headroom but a non-zero bucket → still shown. Sentinel *columns* appear at
  `maxValue >= numChoices`, slightly before headroom is formally reserved, so a protocol
  in between can carry real abstentions. Hiding those would lose a measurement and leave
  the visible percentages summing to under 100%, since the decoder counts abstain in the
  denominator either way.

This also reconciles the two multichoice wire layouts, which previously disagreed: the dense
layout decodes as approval and emits no bucket at all, while pick-slot always emitted one.
Both now reach the same verdict for the same election.

Integrators overriding the `ElectionResults` slot who index `choices` positionally, or who
assume a trailing abstain entry, will see one fewer row for no-headroom multichoice
questions. Decoding is unchanged — `@vocdoni/ballot` is untouched.
