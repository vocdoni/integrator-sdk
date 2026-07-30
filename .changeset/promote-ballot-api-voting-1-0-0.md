---
'@vocdoni/api-voting': major
'@vocdoni/ballot': major
---

Promote `@vocdoni/ballot` and `@vocdoni/api-voting` to 1.0.0.

No API changes — this is a versioning fix.

While these packages sat on `0.x`, every additive change forced a major on the
React packages. `^0.1.2` means `>=0.1.2 <0.2.0`, so a minor (`0.1.2` → `0.2.0`)
is *out of range* for a caret dependent, and changesets correctly majors it.
That defeats the peer-range fix shipped earlier: `onlyUpdatePeerDependentsWhenOutOfRange`
only helps when the bump is actually in range, which for `0.x` a minor never is.
The practical effect was that adding an export to `@vocdoni/ballot` had to be
released as a `patch` to avoid gratuitously majoring `@vocdoni/react-components`.

At `1.x`, `^1.0.0` covers every subsequent minor, so additive changes cascade as
patches the way they were meant to and can be declared honestly.

**This bump is itself the last out-of-range one:** `1.0.0` is outside `^0.1.2`,
so `@vocdoni/react-providers` and `@vocdoni/react-components` take one final
major (2.x → 3.x) with no behavioural change. Consumers pinning
`@vocdoni/react-components@^2` need to widen the range; nothing else is
required.
