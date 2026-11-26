# Purchase orders and goods receipts

## Scope
This milestone converts a winning supplier quotation into a tenant-scoped purchase order, routes it through finance approval, records issuance and captures partial or complete goods receipts.

## Purchase order lifecycle
1. **Pending approval** — generated from the awarded quotation and awaiting a finance-authorized decision.
2. **Approved** — a user with finance:approve records approval.
3. **Issued** — procurement issues the approved order to the supplier.
4. **Partially received** — at least one receipt exists, but one or more ordered quantities remain outstanding.
5. **Received** — every order line has been received in full.
6. **Cancelled** — reserved for a future cancellation workflow; no cancellation endpoint is exposed yet.

Purchase orders are created only from an RFQ and quotation that are both awarded in the same organization. The server checks the supplier remains approved, validates the linked requisition when present, maps every quotation line back to the RFQ, and recomputes the total using integer minor units. A unique organization/quotation index prevents duplicate orders for the same award.

## Goods receiving
A receipt must reference existing purchase-order line IDs and positive integer quantities. Duplicate lines in a receipt are rejected. The service prevents cumulative received quantities from exceeding ordered quantities. Mongoose optimistic concurrency is enabled on purchase orders; a conflicting concurrent save returns HTTP 409 so the operator can refresh and retry. Every receipt stores its receipt number, actor, timestamp, line quantities and notes.

## Revisions
A revision can be recorded while an order is pending approval or approved, but before it is issued. It snapshots the prior commercial terms, increments the revision number and resets the order to pending approval. This milestone records a revision reason and immutable prior snapshot; it does not yet expose editable commercial line-item amendments.

## API
All endpoints are mounted under /api/v1/purchase-orders.

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | / | procurement:read | List organization purchase orders |
| POST | / | procurement:write | Create from awarded RFQ/quotation |
| POST | /:purchaseOrderId/approve | finance:approve | Approve pending PO |
| POST | /:purchaseOrderId/issue | procurement:write | Issue approved PO |
| POST | /:purchaseOrderId/receipts | procurement:write | Record a goods receipt |
| POST | /:purchaseOrderId/revisions | procurement:write | Snapshot and re-route a pre-issue revision |

Organization scope is always taken from the authenticated session. Client-provided organization IDs are not accepted.

## Monetary representation
Prices and totals are persisted as integer minor units. The existing sourcing model and UI assume two decimal places; ISO currency exponent metadata is still required before enabling zero- or three-decimal currencies.

## Not included
Supplier email delivery, PDF generation/e-signature, contract authoring, warehouse/inventory synchronization, invoice ingestion, automatic three-way matching, and production deployment are not implemented. MongoDB replica-set integration tests and true multi-process concurrency tests remain production-readiness work.
