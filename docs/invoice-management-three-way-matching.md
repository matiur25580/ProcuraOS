# Supplier invoice management and three-way matching

## Scope
This milestone adds supplier invoice submission against an issued purchase order, server-side three-way checks, finance approval/rejection, and auditable decisions. OCR, PDF ingestion, payment execution, tax calculation, and ERP integration are not included.

## Three-way match
Each invoice line references a line from the selected purchase order. The server compares the ordered quantity and unit price, cumulative goods received, and supplier-invoiced quantity and price. Invoice quantity cannot exceed ordered or received quantity; invoice unit price must equal the PO unit price; cumulative invoices cannot bill more than the ordered quantity. Any discrepancy creates a needs_review invoice with machine-readable findings. A clean match enters matched but is not approved automatically.

All monetary values are integer minor units in the PO currency. Subtotal and total are recomputed by the server; client-supplied totals, supplier IDs and organization IDs are not trusted.

## Lifecycle
1. needs_review — one or more matching checks failed; finance must reject or have the supplier submit a corrected invoice.
2. matched — strict PO/receipt/invoice checks passed; awaiting finance approval.
3. approved — finance approved after fresh step-up verification.
4. rejected — finance rejected with a reason.

Approval is a control decision, not proof of payment or settlement. No payment endpoint is exposed.

## API
All routes are mounted under /api/v1/invoices:
- GET / — finance:read; list current-tenant invoices.
- POST / — procurement:write; submit against an issued PO.
- POST /:invoiceId/approve — finance:approve + step-up.
- POST /:invoiceId/reject — finance:approve + step-up.

Invoice numbers are unique within an organization. Rejected invoices do not consume cumulative billed quantity.

## Limitations
- Exact price matching only; configurable tolerances, freight, discounts, withholding and tax jurisdiction rules are not implemented.
- Attachments, malware scanning, OCR, supplier portal submission, payment execution, credit/debit notes and ERP integrations remain future work.
- Invoice and audit records are currently written separately; add a transactional outbox / MongoDB transaction before high-volume production use.
- Currency exponent metadata must replace the current two-decimal UI assumptions before zero- or three-decimal currencies are enabled.
