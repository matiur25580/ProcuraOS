# Partial payments & payment allocations

## Allocation model
An approved supplier invoice can have multiple payment records. Each record is an allocation in the invoice currency and uses integer minor units. The sum of allocations in `scheduled` and `paid` states cannot exceed the invoice total. Failed and cancelled schedules release their reserved amount; settlement changes a schedule from reserved to paid without changing the committed total.

Every schedule request supplies an organization-scoped idempotency key. Replaying the same key and payload returns the original record; reusing it with a different invoice, amount or method returns HTTP 409. The invoice's `paymentAllocationVersion` is incremented in the same MongoDB transaction before commitments are calculated, serializing concurrent allocations against the same invoice. A conflict or over-allocation is rejected; callers may retry a transient transaction failure with the same idempotency key.

All monetary values are integer minor units. Currency is inherited from the approved invoice and cannot be supplied by the client. Tenant identity is taken from the authenticated session, never from the request body.

## API
- `POST /payments` — schedule an allocation with `invoiceId`, `amountMinor`, `idempotencyKey`, `paymentMethod` and optional `dueDate`.
- `GET /payments` — list tenant-scoped payment allocations, including invoice totals for balance presentation.
- Existing settle, fail and cancel actions remain step-up protected. Their state changes and audit events are committed in one transaction.
- Reconciliation remains one-to-one: each paid allocation must match a distinct statement line by exact amount, currency and external reference. One invoice may therefore reconcile across multiple statement lines.

## Index migration
Before deploying this version to an existing production database, run `npm run migrate:partial-payments -w @procuraos/api` once with the normal production environment configured. The migration drops only the obsolete unique `organizationId_1_invoiceId_1` index (if present) and creates the new tenant-scoped idempotency index. Existing payment documents and their settlement history are preserved. Take a database backup and run the migration during a controlled deployment window.

## Controls and limitations
- Scheduling, settlement, failure and cancellation are audited. Settlement does not transfer money; an authorized finance user records an externally executed settlement reference after verifying it in the bank.
- Failed/cancelled allocations do not reserve invoice balance. Paid allocations remain committed.
- Partial allocations are not cross-currency; FX, bank fees, split bank transactions, automatic bank feeds and automatic transfers are outside this milestone.
- The API requires MongoDB transactions (replica set or sharded cluster), consistent with the existing procurement workflows.
