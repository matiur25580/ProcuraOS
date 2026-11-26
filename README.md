# ProcuraOS

**AI-assisted Enterprise Procurement & Supplier Collaboration Platform**

ProcuraOS is a multi-tenant procurement operations platform designed to connect purchase requisitions, supplier sourcing, approvals, purchase orders, goods receiving and invoice controls in one auditable workflow.

> **Project status:** Active development. Implemented milestones are identified below; remaining roadmap items are planned.

## Product goals

- Give each organization an isolated workspace with configurable roles and permissions.
- Manage the source-to-pay lifecycle from requisition through invoice verification.
- Support configurable approval workflows and traceable business decisions.
- Help procurement teams compare supplier quotations using transparent, configurable criteria.
- Provide finance and operations teams with reliable budget, receiving and invoice controls.
- Apply AI as decision support with human review, never as an autonomous financial approver.

## Technology

- **Frontend:** React, TypeScript, Vite
- **Backend:** Node.js, Express, TypeScript
- **Database:** MongoDB, Mongoose
- **Async / real-time:** Redis, BullMQ and Socket.IO (planned)
- **Quality:** Vitest, Supertest, Playwright, GitHub Actions
- **Deployment:** Docker and GitHub Actions

## Repository structure

```text
ProcuraOS/
├── apps/
│   ├── api/                 # Express REST API
│   └── web/                 # React application
├── docs/                    # Architecture and product documentation
├── .env.example
├── docker-compose.yml
└── package.json             # npm workspaces
```

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- MongoDB 7+ (local or MongoDB Atlas)

### Setup

1. Clone the repository.
2. Copy .env.example to .env and set the required values.
3. Start local MongoDB with docker compose up -d mongodb (or configure an Atlas connection).
4. Install dependencies with npm install.
5. Start the API and web app with npm run dev.

The API health endpoint is available at http://localhost:4000/api/v1/health; the web app runs at http://localhost:5173.

## Implemented milestones

- [x] Monorepo, API/web foundation, MongoDB connection and CI.
- [x] Authentication, refresh-session rotation, organizations, tenant-aware RBAC.
- [x] Organization administration, invitations, membership management and audit events.
- [x] Purchase requisition drafts, line items, sequential approvals, rejection reasons and cost-centre budget checks.

The requisition workspace is available at /requisitions. See docs/requisition-approval-workflow.md for API contracts, budget rules and known limitations.

## Engineering principles

- Enforce tenant scope and authorization in the API; never trust client-supplied organization IDs.
- Validate all external input at system boundaries.
- Keep business rules in domain/application services, not route handlers.
- Store money as integer minor units and avoid floating-point persistence.
- Make state-changing operations auditable and concurrency-safe.
- Design background jobs to be retryable and idempotent.
- Treat AI output as untrusted input and require human approval for consequential actions.
- Test critical business rules and tenant-isolation boundaries.

## Validation

Run npm run typecheck, npm run test and npm run build from the repository root. GitHub Actions runs the same checks for pushed commits.

## Roadmap

- [x] Initial monorepo and application scaffolding
- [x] Authentication, organizations and tenant-aware authorization
- [x] Organization administration
- [x] Requisitions, budgets and approval workflows
- [ ] Supplier onboarding, RFQs and quotation evaluation
- [ ] Purchase orders, goods receipts and invoice matching
- [ ] Notifications, audit analytics and operational reporting
- [ ] AI-assisted procurement insights with human oversight
- [ ] Integration testing, observability and production deployment

## License

No license has been selected yet. All rights are reserved by default until a license is added.
