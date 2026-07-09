---
'@vocdoni/api-types': minor
'@vocdoni/api-client': minor
---

Expand `Organization` to faithfully match the SaaS `apicommon.OrganizationInfo`
schema returned by `GET /organizations/{address}`.

**Breaking:** `Organization.name`, `description`, and `logo` are now
`MultilingualText` (locale maps, e.g. `{ default: 'Acme' }`) instead of plain
`string`s — they are shorthands for `meta["name"]` / `meta["description"]` /
`meta["logo"]`. Resolve `.default` (or the first value) when displaying them.

New `MultilingualText` type (`Record<string, string>`). `Organization` now also
carries `color`, `size`, `type`, `country`, `timezone`, `subdomain`, `active`,
`communications`, `integrator`, `createdAt`, `managedBy`, `meta`, `counters`
(`SubscriptionUsage`), `subscription` (`SubscriptionDetails`), and a recursive
`parent`. `address` stays a hex `string` (the swagger models it as a byte array).
`SubscriptionUsage` gains `sentVotes`. The standalone `OrganizationInfo` interface
is now a type alias of `Organization` (same schema, used by managed-org flows).

`CreateOrganizationRequest` accepts `string | MultilingualText` for `name` /
`description` / `logo` (a plain string is stored as `{ default: value }`) and gains
the writable profile fields; `provisionAccount` is unchanged.
