# Payment reconciliation & financial reporting

## Scope
This milestone adds tenant-scoped bank statement line registration, exact-match reconciliation and payment register reporting. It does not connect to a bank, initiate transfers, or parse arbitrary bank CSV formats.

## Statement line workflow
- Finance users register an outgoing bank transaction with account label, unique transaction ID, date, positive amount in minor units, ISO currency and external reference.
- A tenant-scoped unique index prevents importing the same transaction ID twice.
- A statement line can be matched only to a settled payment in the same organization.
- Amount, currency and external reference must match exactly. A payment or statement line cannot be reconciled more than once.
- Imports and matches create audit events. Matching requires finance:pay and step-up verification.

## Reporting
GET /payments/report returns payment totals grouped by currency, never a cross-currency grand total. Scheduled payables are separated into current and overdue amounts, with overdue ageing buckets of 1–30, 31–60 and 61+ days.

## API
- GET /reconciliation — list recent statement lines (finance:read).
- POST /reconciliation/statement-lines — register a statement line (finance:pay).
- POST /reconciliation/:lineId/match — match a settled payment (finance:pay, step-up).
- GET /reconciliation/report — reconciliation-compatible payment report (finance:read).

## Limitations
- This is a controlled manual statement-entry workflow, not a bank feed or CSV importer.
- Only exact one-to-one settlement matches are supported; partial payments, fees, FX conversions and split transactions need a separate design.
- The reporting endpoint reports recorded payment rows. It does not yet calculate all approved-but-unscheduled invoice liabilities.
