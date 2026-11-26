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

The requisition workspace is available at /requisitions, supplier sourcing at /suppliers, and purchase orders at /purchase-orders.

## Engineering principles
- Enforce tenant scope and authorization in the API; never trust client-supplied organization IDs.
- Validate external input at system boundaries.
- Keep business rules in domain services, not route handlers.
- Store money as integer minor units and avoid floating-point persistence.
- Make state-changing operations auditable and concurrency-safe.
- Require human approval for consequential financial actions.

## Validation
Run npm run typecheck, npm run test and npm run build from the repository root. GitHub Actions runs the same checks for pushed commits.

## Roadmap
- [x] Application foundation, authentication, tenancy and organization administration
- [x] Requisitions, budgets and approval workflows
- [x] Supplier onboarding, RFQs and quotation evaluation
- [x] Purchase orders and goods receipts
- [ ] Editable commercial amendments, contract lifecycle and supplier delivery integrations
- [ ] Invoice ingestion and three-way matching
- [ ] Notifications, audit analytics and operational reporting
- [ ] AI-assisted procurement insights with human oversight
- [ ] Integration testing, observability and production deployment

See docs/purchase-orders-goods-receipts.md and docs/supplier-onboarding-rfq.md for workflow rules, API contracts and known limitations.
