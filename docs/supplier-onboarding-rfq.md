# Supplier onboarding and RFQ management

## Scope

This milestone adds an organization-scoped supplier directory, qualification review, document-reference tracking, competitive RFQs, secure supplier invitation links, quotation submission and commercial comparison.

## Supplier lifecycle

- **Pending review:** created by an authorized procurement user; not eligible for RFQs.
- **Approved:** reviewed by an organization user; may be invited to RFQs.
- **Rejected:** rejected with a required reason.
- **Suspended:** blocked from future RFQs and quote submission.

Tax identifiers are unique within an organization. Supplier documents are stored as metadata and secure reference URLs; the platform does not upload or store binary files in this milestone. Document verification is a human review responsibility.

## RFQ lifecycle

- **Draft:** created with line items, currency, deadline and approved supplier selection.
- **Open:** issued to selected suppliers; each supplier receives a unique, high-entropy, one-time invitation token.
- **Closed:** submission window is closed and quotation comparison is enabled.
- **Awarded:** one quotation has been selected; other quotations are marked rejected.
- **Cancelled:** reserved for a future cancellation workflow.

RFQs can optionally reference an approved requisition in the same organization. Supplier selection and requisition checks are enforced server-side.

## Supplier invitation security

- Tokens contain 256 bits of cryptographic randomness.
- Only SHA-256 token hashes are persisted.
- The raw token is returned once by the issue operation and is never included in subsequent RFQ reads.
- The frontend places the token in the URL fragment; the supplier portal sends it to the API in a POST body, not a URL query string.
- Public quote portal endpoints are rate-limited.
- An invitation can be consumed once. The service atomically claims the invitation before creating the quotation and restores the invitation state if quote creation fails.
- Quote submission requires an approved supplier, an open RFQ, a non-expired deadline, and exactly one price for every requested RFQ line item.

## API

All routes are mounted under /api/v1.

| Method | Path | Access |
|---|---|---|
| GET | /suppliers | suppliers:read |
| POST | /suppliers | suppliers:write |
| PATCH | /suppliers/:supplierId/review | suppliers:write |
| POST | /suppliers/:supplierId/documents | suppliers:write |
| GET | /rfqs | suppliers:read |
| POST | /rfqs | suppliers:write |
| POST | /rfqs/:rfqId/issue | suppliers:write |
| POST | /rfqs/:rfqId/close | suppliers:write |
| GET | /rfqs/:rfqId/quotations | suppliers:read |
| PATCH | /rfqs/:rfqId/quotations/:quoteId | suppliers:write |
| POST | /supplier-portal/quote-details | Public, token protected and rate limited |
| POST | /supplier-portal/quotes | Public, token protected and rate limited |

The organization ID is derived exclusively from the authenticated user's request context for internal routes. Public supplier portal access resolves the organization and supplier only from the invitation token hash.

## Quotation comparison

Submitted quotations store integer minor-unit prices. The server calculates totals from the RFQ quantities and submitted unit prices; client-supplied totals are never trusted. Procurement users can shortlist quotations and award one after closing the RFQ. Awarding is a one-way transition.

## Current limitations and production follow-ups

- Supplier profile creation is currently performed by internal procurement users. External supplier self-registration, email verification and supplier account identity are future work.
- Document metadata references URLs; private object storage, malware scanning, document extraction and automated expiry reminders are not implemented.
- Invitation delivery is manual: the issue response returns one-time links for the authorized user to share. Transactional email and durable delivery retries need an outbox worker.
- The public quote portal has rate limiting and high-entropy tokens, but production should add abuse monitoring, CAPTCHA or risk-based controls, and a dedicated supplier identity/verification model.
- RFQ line item editing, multiple award/split awards, bid amendments, negotiation rounds, sealed-bid controls, tax/shipping normalization and configurable scoring weights remain future work.
- Awarding is not yet linked to automatic purchase-order generation.
- MongoDB replica-set integration tests, concurrency tests, audit transaction/outbox guarantees, pagination, notification delivery and production deployment remain required before production use.
- Currency values are represented in integer minor units with a two-decimal UI assumption; use ISO currency metadata for currencies with zero or three fractional digits.

