---
'@vocdoni/ballot': minor
'@vocdoni/react-components': minor
---

Read a ranking back out of a ranked election.

A ranked question could be encoded but not decoded: its results were only ever readable as
"how many voters ranked each option", which is the same number for every option and
therefore useless. The winner was unrecoverable through the SDK, and any UI built on
`inferQuestionBallotType` rendered a checkbox group for it.

The obstacle is that a ranked `ballotProtocol` is **byte-identical** to a pick-slot
multichoice whose voters fill every slot, while meaning the transpose of it — ranked reads
the field index as the *option* and its value as the *rank*; pick-slot reads the field
index as a *slot* and its value as the *chosen option*. No shape rule can separate them, so
this plugs into the declared-name channel instead:

```ts
// creation — the raw protocol alone is ambiguous, the metadata bag is not
{
  choices: [/* … */],
  ballotProtocol: { maxCount: 4, maxValue: 3, uniqueValues: true, /* … */ },
  metadata: { type: { name: 'ranked' } },
}
```

The backend's own `type` vocabulary is `['singlechoice', 'multichoice']` and rejects
anything else, but it stores and echoes the creator metadata bag verbatim — the same route
the legacy `multiple-choice` name already uses — so no backend change is involved.
`type: 'ranked'` is read too, for callers keeping their own record of the kind.

**`@vocdoni/ballot`**

- `BallotType.Ranked`, selected only by that declaration. It is never inferred from the
  protocol, because nothing in the protocol distinguishes it.
- `decodeQuestionResults` / `decodeResults` aggregate ranked questions with **Borda**
  (`Σ count × rank`) — the only method the tally can express, since it is a per-field
  histogram with the individual ballots already discarded, and what `saas-integrator-demo`
  computes. `votes` is therefore **points, not voters**, and percentages are each option's
  share of the total points. **No `abstain` bucket**: those sentinel columns are a pick-slot
  device for unfilled slots, and a ranking has none.
- `rankedOrderToScores(question, order)` turns the voter's ordering (choice values, best
  first) into the wire ballot, applying the canonical **highest = best** orientation. Use it
  rather than building the array by hand: the decode is an index-weighted sum, so a ballot
  ranked with `0` as "best" is perfectly valid and elects the loser, with nothing on either
  side able to notice. It throws on a ranking that repeats a choice, names an unpublished
  one, or leaves any option unranked.
- `encodeQuestionBallot` / `encodeBallot` keep passing a ranking straight through, and still
  refuse a duplicated rank or one above `maxValue`. `validateSelections` gained the matching
  ranked rules, `questionSelectionRange` reports `{min: n, max: n}` (a partial ranking cannot
  be counted), and `declaresRanked(question)` exposes the check.
- `unrankableProtocolReason(numChoices, maxValue)` catches the one protocol a ranking can
  never survive: `maxValue: 0`. That means "no upper bound" for every other type, but on
  chain it switches the scrutinizer to discrete aggregation — one column per option instead
  of a histogram — so the Borda index-weighted sum scores every option zero however anyone
  votes, and the result is indistinguishable from an election nobody voted in. Folded into
  `unsatisfiableQuestionReason` (whose parameter type gained `metadata`, needed to see the
  declaration) and refused up front by both encoders and `validateSelections`, so the three
  cannot drift apart.

**`@vocdoni/react-components`**

- Ranked questions render a **rank widget** — one position control per option, through a new
  `QuestionRankChoice` slot — instead of the checkbox group they used to get. Assigning an
  option a position another holds swaps the two. The default slot is a `<select>`; override
  it for drag-and-drop.
- `QuestionSelectionMode` gained `'ranked'` alongside `'single'` / `'multiple'`.
- The form collects the voter's ordering and `QuestionsFormProvider` transposes it with
  `rankedOrderToScores`; submitting is blocked until every option is placed.
- `<QuestionsTypeBadge />` and `<QuestionTip />` label and count ranked questions.

The integration suite now casts a real ranked vote and asserts the recovered ordering — plus
the raw matrix the chain produced, and that the pick-slot reading of it disagrees — replacing
the placeholder that had to enshrine a meaningless tally.

Closes #22.
