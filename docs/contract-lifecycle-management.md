# Contract lifecycle management

Contracts are mounted at `/api/v1/contracts`. All endpoints require authentication and derive the organization from the verified session. A client cannot provide an organization identifier.

## Workflow

```text
draft -> pending_approval -> approved -> active -> terminated
                         \-> rejected
```

- Drafts are created only against an approved supplier in the same organization.
- An optional purchase order must belong to that supplier and organization.
- The contract owner must be an active member of the organization.
- The creator submits the draft for review.
- Finance approval uses the existing step-up authentication middleware.
- The creator cannot approve or reject their own contract.
- Activation requires approval and the current date to fall within the effective term.
- Termination requires a reason and step-up authentication.
- Contract obligations can be completed or waived only while the agreement is active. Waivers require an explanatory note.

## API

| Method | Endpoint | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/` | `procurement:read` | Filtered and paginated contract register |
| GET | `/summary` | `procurement:read` | Active, pending, expiring and overdue obligation counts |
| POST | `/` | `procurement:write` | Create a draft agreement |
| GET | `/:contractId` | `procurement:read` | Read contract and linked supplier/order |
| POST | `/:contractId/submit` | `procurement:write` | Submit draft for approval |
| POST | `/:contractId/review` | `finance:approve` + step-up | Approve or reject independently |
| POST | `/:contractId/activate` | `procurement:write` + step-up | Activate an approved agreement in its effective window |
| POST | `/:contractId/terminate` | `finance:approve` + step-up | Terminate with a reason |
| PATCH | `/:contractId/obligations/:obligationId` | `procurement:write` | Complete or waive an open obligation |

## Query parameters

- `page` and `limit` (maximum 100)
- `status`: draft, pending_approval, approved, active, rejected, terminated, or derived expired
- `supplierId`, `expiresBefore`, `search`
- `sortBy`: createdAt, updatedAt, startDate, endDate, valueMinor
- `sortOrder`: asc or desc

Money is stored as integer minor units with a three-character ISO currency code. Expiry days and overdue obligations are derived from saved dates; no background scheduler or external notification is implied.

## CI and delivery\n\nThe repository CI workflow now accepts pull requests targeting stacked `feat/**` branches as well as `main`, so dependent milestones can be validated before they reach the default branch.\n\n## Limitations and next hardening

- This milestone stores contract metadata and obligation records; it does not store signed contract files. Attachments require a private object-storage adapter, malware scanning, access logging and retention controls.
- No automatic renewal, e-signature, ERP/legal-system integration or supplier portal notifications are included.
- The event is written to the existing audit collection after the business write; a transactional outbox and tamper-evident audit pipeline are recommended before production.
- Currency conversion is not performed. Financial values must not be aggregated across currencies without an explicit FX source and valuation date.
