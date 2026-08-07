---
"@vocdoni/ballot": patch
"@vocdoni/api-client": patch
"@vocdoni/react-components": patch
---

Refuse questions that publish an option no voter can cast.

A ballot config can be perfectly satisfiable and still carry a choice that is dead on
arrival. That failure is nastier than an all-zero tally: the election runs, most votes
count, and the unreachable option quietly polls zero while `voteCount` keeps rising.
Confirmed against a live chain (`integration/value-skew.itest.ts`) — the API accepts the
config, the relay accepts the ballot, the chain counts the envelope, and the scrutinizer
discards it at aggregation with no error on any surface:

```
API ACCEPTED the malformed election (values 1/2/3 under maxValue 2)
member 1 → wire [1] relay=completed
member 2 → wire [3] relay=completed
voteCount  = 2
raw matrix = [["0","1","0"]]     ← C1 counted, C3 lost
```

- New `uncastableChoicesReason(question)` / `hasUncastableChoices(question)` explain
  the defect, or return `null`/`false` when every choice is reachable. The rule follows
  how each layout addresses its fields:
  - **single-choice** is *value*-addressed (the field carries `choice.value` and the
    results row is indexed by it), so every value must fit `0..maxValue` and no two
    choices may share a value — duplicates read the same column, so one vote is counted
    for both and the percentages sum past 100. Sparse values are legal and deliberate;
    `maxValue` is derived from the highest value, not the option count, and unused
    columns simply stay empty. `maxValue: 0` means unbounded, not a ceiling of zero.
  - **pick-slot multichoice** shares one value space with the abstain sentinels
    (`choices.length`, `+1`, …, and decode claims every column `>= choices.length`), so
    its values must be exactly the *set* `0..choices.length-1` — in any order, since
    nothing in that layout is positional — and `maxValue` must still clear the highest
    of them.
  - **approval / dense multichoice / budget / quadratic** are position-addressed, where
    `choice.value` is a display label the wire never sees, and carry no constraint.
- `client.elections.create/update` rejects the config at creation, where it is still
  fixable; after publish the only remedy is a new election. This is a gap the backend
  does not cover — `VoteTypeFromQuestion` passes a raw `ballotProtocol` straight through
  without ever comparing it to the question's own choice values.
- At **encode** time the two halves of the rule are treated differently, because they
  fail differently:
  - A value above `maxValue` is already caught per ballot by `assertEncodedBallot`, so
    only the voter picking the unreachable option is refused. The live run above shows
    why the line is drawn there: on such an election the in-range votes are still
    tallied correctly, and refusing everybody would discard ballots the chain records
    fine. `encodeBallot` / `encodeQuestionBallot` now explain *why* when this happens,
    replacing the wire-level "field 0 is 3, above maxValue 2" with the election-level
    diagnosis. Failure path only — a healthy vote pays nothing for it.
  - A pick-slot value colliding with the abstain sentinels has no per-ballot backstop:
    the colliding values are *within* `maxValue`, so no individual ballot is wrong while
    abstentions and real picks are being conflated. That one is refused up front, for
    every voter.
- `validateSelections` mirrors the same split, so a UI gating its submit button on it no
  longer enables a vote that `encodeBallot` then refuses.
- `isPickSlotLayout(question)` is now the single home for the pick-slot/dense
  discrimination, replacing three hand-written copies (one of them a de Morgan'd
  negation) in encode, decode and the reachability check.
- `@vocdoni/react-components` no longer renders the encoder's creator-facing explanation
  as a voter's field error. A question that cannot accept votes shows a voter-appropriate
  message (`errors.question_not_votable`); the technical detail goes to the console.

Only reachable through a raw `ballotProtocol`: the named types either derive their bounds
*from* the values (`singlechoice`) or ignore them entirely (`multichoice`). Decoding is
unchanged — single-choice results are read by `choice.value`, which is the backend
contract (saas-backend `account/ballot.go` and `db/types.go`) and is now pinned by unit
tests and a live round-trip (`raw matrix = [["0","1","1","1"]]` for values 1/2/3, column 0
empty) so it is not "fixed" into positional indexing. See integrator-sdk#28.
