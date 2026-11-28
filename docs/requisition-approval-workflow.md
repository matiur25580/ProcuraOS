# Purchase requisitions and sequential approvals

## Scope

This milestone introduces a tenant-scoped purchase requisition register, sequential human approval, cost-centre budgets and an audit trail. It is a procurement request workflow, not a purchase-order or payment execution system.

## Lifecycle

- **Draft:** requester creates and edits a request; only the requester can update or cancel their draft.
- **Pending approval:** submission snapshots the selected active approvers in order and assigns the first approval step.
- **Approved:** every configured approval level has approved.
- **Rejected:** any assigned approver rejects with a required reason.
- **Cancelled:** requester cancels a draft before submission.

An approver can act only when their user ID is the requisition's current approver. Approval decisions use an atomic conditional update to prevent the same step being processed twice. The requester is excluded from their own approval chain.

## Data and budget controls

- Monetary values are stored as integer minor units; the current UI displays two decimal places.
- A cost-centre budget is configured by organization, cost centre and fiscal year.
- On submission, the service sums other pending and approved requisitions for the same organization, cost centre, currency and fiscal year. A request exceeding the configured limit is rejected.
- If no budget is configured, submission remains allowed and the record is marked **unconfigured**; this is visible for follow-up rather than silently treating an absent budget as zero.
- The fiscal year is derived from the requested-needed-by date in UTC. Organizations with non-calendar fiscal years need a configurable fiscal calendar before production.

## API

All endpoints are under /api/v1/requisitions.

| Method | Path | Permission / rule |
|---|---|---|
| GET | / | procurement:read; list scoped to tenant and visibility |
| GET | /approvers | procurement:write; active members in current tenant |
| POST | / | procurement:write; create draft |
| GET | /:requisitionId | procurement:read; tenant and requester/approver visibility |
| PATCH | /:requisitionId | procurement:write; own draft only |
| POST | /:requisitionId/submit | procurement:write; own draft only |
| POST | /:requisitionId/approve | procurement:read; current assigned approver only |
| POST | /:requisitionId/reject | procurement:read; current assigned approver, reason required |
| POST | /:requisitionId/cancel | procurement:write; own draft only |
| GET | /budgets | finance:read |
| PUT | /budgets/:costCenter | finance:approve |

The organization ID is never accepted from the client. It is derived from the authenticated access-token context for every query and write.

## Current limitations and production follow-ups

- Approval chains are selected per requisition; reusable policy templates, amount-based routing, delegation and out-of-office reassignment are future work.
- Budget checks include pending and approved requisitions, but do not yet include purchase orders, invoices, actuals or encumbrance release.
- The UI assumes two minor currency digits; production should use currency metadata for zero- and three-decimal currencies.
- Budget fiscal years currently follow the calendar year.
- Email, push and real-time notifications are not connected. The assigned approver is visible in the queue; add a durable notification/outbox worker before relying on reminders.
- MongoDB integration/concurrency tests with a replica set, audit transaction/outbox guarantees, pagination and export remain production hardening work.
