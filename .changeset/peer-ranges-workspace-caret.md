---
'@vocdoni/react-components': patch
'@vocdoni/react-providers': patch
---

Publish internal peer dependencies as caret ranges instead of exact pins.

`workspace:*` peers resolve to the exact version at publish time, so every
release of a peer forced a lockstep major on its dependents and pinned
consumers to one precise version. Peers now use `workspace:^`, which publishes
as `^x.y.z`, and changesets is configured with
`onlyUpdatePeerDependentsWhenOutOfRange` so an in-range peer bump cascades as
a patch (via `updateInternalDependents: 'always'`) rather than a major.
