# Deferred changesets

These changesets target `@vocdoni/react-providers` and `@vocdoni/react-components`,
which are still marked `"private": true` and are in the `ignore` list of
`.changeset/config.json` — they are not being published yet.

They live here (outside changesets' view — note this directory cannot be a
subdirectory of `.changeset/`, changesets treats those as legacy-format
changesets and crashes) because leftover changesets that only reference ignored
packages make `changesets/action` take the "version + PR" path on every push to
main: `changeset version` no-ops, the release branch matches main, PR creation
fails, and the publish step is never reached.

When the react packages are ready to release: remove them from the `ignore`
list, drop their `private` flags, and move these files back into `.changeset/`
before running `changeset version`.
