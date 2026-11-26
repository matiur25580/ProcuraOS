# ProcuraOS

**AI-assisted Enterprise Procurement & Supplier Collaboration Platform**

ProcuraOS is a multi-tenant procurement operations platform designed to connect purchase requisitions, supplier sourcing, approvals, purchase orders, goods receiving and invoice controls in one auditable workflow.

> **Project status:** Foundation scaffold — active development. Features described in the roadmap are planned unless explicitly marked implemented.

## Product goals

- Give each organization an isolated workspace with configurable roles and permissions.
- Manage the source-to-pay lifecycle from requisition through invoice verification.
- Support configurable approval workflows and traceable business decisions.
- Help procurement teams compare supplier quotations using transparent, configurable criteria.
- Provide finance and operations teams with reliable budget, receiving and invoice controls.
- Apply AI as decision support with human review, never as an autonomous financial approver.

## Technology

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** MongoDB, Mongoose
- **Async / real-time (planned):** Redis, BullMQ, Socket.IO
- **Quality:** Vitest, Supertest, Playwright, ESLint, Prettier
- **Deployment:** Docker, GitHub Actions

## Repository structure

```text
ProcuraOS/
├── apps/
│   ├── api/                 # Express REST API
│   └── web/                 # React application
├── docs/                    # Architecture and product documentation
├── .env.example
├── .gitignore
├── package.json             # npm workspace root
└── README.md
```

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- MongoDB 7+ (local or MongoDB Atlas)

### Setup

1. Clone the repository.
2. Copy `.env.example` to `.env` and set the required values.
3. Start local MongoDB with `docker compose up -d mongodb` (or configure an Atlas connection).
4. Install workspace dependencies with `npm install`.
5. Start the API and web app with `npm run dev`.

The API health endpoint is available at `http://localhost:4000/api/v1/health`; the web app runs at `http://localhost:5173`.

## Environment variables

See `.env.example`. Never commit real credentials, private keys, production URLs containing secrets, or customer data.

## Engineering principles

- Enforce tenant scope and authorization in the API; never trust client-supplied organization IDs.
- Validate all external input at system boundaries.
- Keep business rules in domain/application services, not route handlers.
- Use decimal-safe arithmetic for money.
- Make state-changing operations auditable and concurrency-safe.
- Design background jobs to be retryable and idempotent.
- Treat AI output as untrusted input and require human approval for consequential actions.
- Test critical business rules and tenant-isolation boundaries.

## Roadmap

- [x] Initial monorepo and application scaffolding
- [ ] API configuration, health checks and centralized error handling
- [ ] MongoDB connection and persistence layer
- [ ] Authentication, organizations and tenant-aware authorization
- [ ] Requisitions, budgets and approval workflows
- [ ] Supplier onboarding, RFQs and quotation evaluation
- [ ] Purchase orders, goods receipts and invoice matching
- [ ] Notifications, audit events and analytics
- [ ] AI-assisted procurement insights with human oversight
- [ ] Automated tests, observability and production deployment

## License

No license has been selected yet. All rights are reserved by default until a license is added.
