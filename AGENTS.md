# AI Agent Guidance for Changesets/Release Workflow

## Overview
This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing. The release workflow is automated via GitHub Actions using npm's **trusted publishing** (OIDC/trust token). No `NPM_TOKEN` is required or should be configured.

## Quick Rules
- **Use Changesets:** For any change to a publishable package, run `changeset add` and describe the change (major/minor/patch).
- **Do not edit versions/changelogs manually:** Changesets manages version bumps and changelog generation via `changeset version`.
- **Publish flow:** CI owns publishing. When a release PR is merged with changesets, GitHub Actions runs `changeset publish` automatically. If there are no pending changesets after merge, you may run `pnpm release` directly.
- **Private package:** `packages/tsconfig` is private and must never be published. Changesets respects this via its `package.json` `"private": true`.
- **Workflow filename matters:** The workflow file is `.github/workflows/release.yml`. Keep this name for npm trusted publishing.

## Typical Workflow
1. Make changes to publishable packages under `packages/*`.
2. Run `pnpm changeset` (or `changeset add`) to create a changeset describing your change.
3. Commit the changeset files.
4. Open/submit a PR. CI will verify and prepare release artifacts.
5. Merge the release PR → GitHub Actions publishes the packages using OIDC.

## npm Trusted Publishing Setup
- Configure trusted publisher on npmjs.com for each publishable package: go to the package page → Settings → Trusted publishing → Add GitHub Actions (select this repo and `.github/workflows/release.yml` workflow).
- Workflow filename must be `.github/workflows/release.yml`. It's the standard name npm's OIDC templates expect.
