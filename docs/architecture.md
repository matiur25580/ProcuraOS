# ProcuraOS — Architecture Notes

## Architecture decision: modular monolith

The first production-oriented release uses one deployable Express API organized by business capability. This keeps local development, deployment and transactional boundaries manageable while preserving clear module ownership for future extraction.

## Initial module boundaries

- Identity & access: users, organizations, memberships, roles and permissions.
- Procurement: requisitions, purchase orders and purchasing policies.
- Supplier network: onboarding, supplier profiles and catalogues.
- Sourcing: RFQs, quotations and evaluation criteria.
- Workflow: versioned workflow definitions and approval instances.
- Finance: budgets, invoices and three-way matching.
- Operations: goods receipts, inspections and disputes.
- Governance: audit events, retention and reporting.

## Cross-cutting requirements

### Tenant isolation

Every tenant-owned document carries an `organizationId`. The authenticated organization context must be resolved from a verified membership and enforced by server-side repository/service methods. Client-provided tenant identifiers are never sufficient authorization.

### Money and quantities

Persist monetary values using integer minor units with an explicit ISO currency code, or a decimal representation with a documented rounding policy. Never use binary floating-point arithmetic for financial totals.

### Workflow consistency

Approval transitions must validate the current state, actor permission and workflow version. Use conditional updates or transactions where multiple records must change together. Record each decision as an append-only audit event.

### Background work

Long-running work (document extraction, notifications, report generation) belongs in a queue. Jobs must be idempotent, retryable with bounded backoff, observable and safe to execute more than once.

### AI governance

AI output is advisory and untrusted. Validate structured output, record model/provider metadata where appropriate, protect tenant data, and require an authorized human for financial or contractual decisions.

## Initial request flow

1. HTTP request enters Express middleware.
2. Boundary validation parses untrusted input.
3. Authentication establishes the actor.
4. Authorization resolves tenant membership and permissions.
5. Application service enforces business invariants.
6. Repository persists changes.
7. Audit event is recorded.
8. A response DTO is returned; internal database documents are not exposed directly.
