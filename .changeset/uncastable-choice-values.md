---
"@vocdoni/ballot": patch
"@vocdoni/api-client": patch
---

Refuse questions that publish an option no voter can cast.

A ballot config can be perfectly satisfiable and still carry a choice that is dead on
arrival. That failure is nastier than an all-zero tally: the election runs, most votes
count, and the unreachable option quietly polls zero while `voteCount` keeps rising.
Confirmed against a live chain (`integration/value-skew.itest.ts`) — the relay accepts
such a ballot, the chain counts the envelope, and the scrutinizer discards it at
aggregation with no error on any surface.

- New `uncastableChoicesReason(question)` / `hasUncastableChoices(question)` explain
  the defect, or return `null`/`false` when every choice is reachable. The rule follows
  how each layout addresses its fields:
  - **single-choice** is *value*-addressed (the field carries `choice.value` and the
    results row is indexed by it), so every value must fit `0..maxValue`. Sparse values
    are legal and deliberate — `maxValue` is derived from the highest value, not the
    option count, and unused columns simply stay empty.
  - **pick-slot multichoice** shares one value space with the abstain sentinels
    (`choices.length`, `+1`, …, and decode claims every column `>= choices.length`), so
    its values must be exactly `0..choices.length-1` — contiguity, not just a bound.
  - **approval / dense multichoice / budget / quadratic** are position-addressed, where
    `choice.value` is a display label the wire never sees, and carry no constraint.
- `encodeQuestionBallot` and `encodeBallot` now refuse such a question for **every**
  voter, not only the one who picks the unreachable option — the defect belongs to the
  election, whose tally cannot represent the electorate regardless of who votes.
  Previously only the offending ballot was caught, by `assertEncodedBallot`.
- `client.elections.create/update` rejects the config at creation, where it is still
  fixable; after publish the only remedy is a new election. This is a gap the backend
  does not cover — `VoteTypeFromQuestion` passes a raw `ballotProtocol` straight through
  without ever comparing it to the question's own choice values.

Only reachable through a raw `ballotProtocol`: the named types either derive their bounds
*from* the values (`singlechoice`) or ignore them entirely (`multichoice`). Decoding is
unchanged — single-choice results are read by `choice.value`, which is the backend
contract (saas-backend `account/ballot.go` and `db/types.go`) and is now pinned by unit
tests and a live round-trip so it is not "fixed" into positional indexing. See
integrator-sdk#28.
