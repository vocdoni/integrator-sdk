---
'@vocdoni/api-types': major
---

**Breaking:** remove the organization `active` flag from `Organization` and `CreateOrganizationRequest`. The SaaS backend drops the field entirely (vocdoni/saas-backend#626), so it no longer exists on organization responses or on the create/update request bodies.

The flag was never honoured: no handler, middleware or subscription check gated on it, and both creation paths hardcoded it to `true` while discarding whatever the request body sent. It was also actively harmful — `PUT /organizations/{address}` is a partial update, but `active` was the one field opted out of zero-value protection, so a request body that merely *omitted* it decoded to `false` and was force-persisted, silently deactivating the organization.

`SubscriptionDetails.active` is unrelated (Stripe-driven) and is unchanged.
