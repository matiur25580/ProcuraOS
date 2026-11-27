# ProcuraOS

**AI-assisted Enterprise Procurement & Supplier Collaboration Platform**

ProcuraOS is a multi-tenant procurement operations platform designed to connect purchase requisitions, supplier sourcing, approvals, purchase orders, goods receiving and invoice controls in one auditable workflow.

> **Project status:** Active development. Implemented milestones are identified below; remaining roadmap items are planned.

## Technology
- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** MongoDB, Mongoose
- **Quality:** Vitest, GitHub Actions
- **Deployment:** Docker and GitHub Actions

## Implemented milestones
- [x] Monorepo, API/web foundation, MongoDB connection and CI.
- [x] Authentication, refresh-session rotation, organizations, tenant-aware RBAC.
- [x] Organization administration, invitations, membership management and audit events.
- [x] Purchase requisition drafts, sequential approvals and cost-centre budget checks.
- [x] Supplier onboarding, RFQ issuance, one-time supplier quote portal and quotation award.
- [x] Purchase order generation from awarded quotations, finance approval, issuance, revisions and goods receipts.
- [x] Supplier invoice submission, PO/receipt three-way matching and finance approval.
- [x] Controlled supplier payment scheduling and externally executed settlement recording.
- [x] Tenant-scoped bank statement line registration, exact-match reconciliation and currency-separated payment reporting.
- [x] Multiple partial/final invoice payment allocations with idempotency, concurrency-safe balance reservations and settlement history.

The requisition workspace is available at /requisitions, supplier sourcing at /suppliers, purchase orders at /purchase-orders, invoice controls at /invoices, payment allocations at /payments, and bank reconciliation/reporting at /reconciliation.

## Engineering principles
- Enforce tenant scope and authorization in the API; never trust client-supplied organization IDs.
- Validate external input at system boundaries.
- Keep business rules in domain services, not route handlers.
- Store money as integer minor units and avoid floating-point persistence.
- Make state-changing operations auditable and concurrency-safe.
- Require human approval for consequential financial actions.
- Never combine financial totals across different currencies.

## Validation
Run npm run typecheck, npm run test and npm run build from the repository root. GitHub Actions runs the same checks for pushed commits.

## Roadmap
- [x] Application foundation, authentication, tenancy and organization administration
- [x] Requisitions, budgets and approval workflows
- [x] Supplier onboarding, RFQs and quotation evaluation
- [x] Purchase orders and goods receipts
- [x] Invoice ingestion and three-way matching
- [x] Controlled payment lifecycle and settlement recording
- [x] Manual bank statement reconciliation and payment ageing report
- [x] Partial payments and payment allocations
- [ ] Fees, split bank settlements and FX handling
- [ ] Bank statement CSV ingestion and supported bank integrations
- [ ] Contract lifecycle, supplier delivery integrations and notifications
- [ ] Audit analytics, AI-assisted procurement insights with human oversight
- [ ] Integration testing, observability and production deployment

See docs/purchase-orders-goods-receipts.md, docs/supplier-onboarding-rfq.md, docs/invoice-management-three-way-matching.md and docs/payment-reconciliation-financial-reporting.md and docs/partial-payments-and-allocations.md for workflow rules, API contracts, migration instructions and known limitations.
