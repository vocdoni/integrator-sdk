---
'@vocdoni/react-components': patch
'@vocdoni/react-providers': patch
'@vocdoni/api-client': patch
'@vocdoni/api-types': patch
---

Surface extended choice info (per-choice image and description) on process reads

The API stores a choice's image/description on its **parent question**, under
`metadata.choices` keyed by choice `value` — `db.Choice` is `{Title, Value}` and
has nowhere to put it. The display components have always read it off
`choice.meta`, and nothing mapped between the two, so images and descriptions
were stored correctly and dropped on read: every question rendered
`basic`/`list`.

- `@vocdoni/api-types`: `Choice` gains a `meta?: ChoiceMeta`
  (`{ description?, image?: { default?, thumbnail? } }`), plus a
  `ChoiceMetadataEntry` type documenting the storage form.
- `@vocdoni/api-client`: `elections.get`, `elections.list` and
  `elections.getQuestion` now fold `metadata.choices` onto the matching choice
  as `choice.meta`. Both stored image shapes are tolerated — a plain URL string
  is normalized to `{ default: url }`, an object is passed through — and
  entries matching no choice are ignored. Exported as
  `normalizeQuestionChoiceMeta` for hand-normalizing raw wire data.
- `@vocdoni/react-providers`: `<ElectionProvider election>` runs a prefetched
  process through the same normalization, so extended choices (and normalized
  statuses) are right on the first paint instead of only after the refetch.
- `@vocdoni/react-components`: questions with extended choice info render the
  `extended` presentation again, and the `grid` layout when a choice has an
  image. `ipfs://` URLs and empty descriptions keep behaving as before.

No stored data is migrated — both image shapes are tolerated on read.

Released as a patch across the board on purpose. `api-types`/`api-client` are
additive (a new optional field and a new export), which would normally be a
minor — but `react-components`/`react-providers` **peer**-depend on them, and
Changesets bumps a peer dependent to *major* on any peer bump. That would push
them to `3.0.0` and out of the `^2.0.0` range the consuming app pins, for what
is a read-side bug fix.
