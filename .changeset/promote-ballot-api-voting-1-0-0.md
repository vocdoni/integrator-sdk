---
'@vocdoni/api-voting': major
'@vocdoni/ballot': major
'@vocdoni/react-components': patch
'@vocdoni/react-providers': patch
---

Promote `@vocdoni/ballot` and `@vocdoni/api-voting` to 1.0.0.

No API changes in either package — this is a versioning fix.

While they sat on `0.x`, every additive change forced a **major** on the React
packages. `^0.1.2` means `>=0.1.2 <0.2.0`, so a minor (`0.1.2` → `0.2.0`) is
*out of range* for a caret dependent and gets majored. That defeats the
`onlyUpdatePeerDependentsWhenOutOfRange` fix, which only helps when the bump is
genuinely in range — and for a `0.x` package a minor never is. The practical
effect was that adding an export to `@vocdoni/ballot` had to ship as a `patch`
just to avoid gratuitously majoring `@vocdoni/react-components`.

At `1.x`, `^1.0.0` covers every later minor, so additive changes cascade as
patches and can be declared honestly.

The React packages take only a **patch**: their peer ranges on these two
packages widen from `workspace:^` to `workspace:>=0.1.2 <2`, which spans both
the old and new majors. That is accurate rather than a workaround — 1.0.0
changes no API, so `react-components` really does work with both. Consumers on
`@vocdoni/react-components@^2` keep working with no range change.
