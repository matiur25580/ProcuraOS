# Organization administration milestone

This milestone adds tenant-scoped organization administration to the existing authentication foundation.

## Features

- Organization details read and update.
- Member directory scoped to the active organization in the signed access-token context.
- Role updates for non-owner memberships using the central role matrix.
- Member suspension and removal; active refresh sessions for that member in the organization are revoked.
- Invitation creation, listing, revocation and acceptance.
- One-time cryptographically random invitation tokens; only SHA-256 token hashes are stored.
- Invitations expire after seven days and acceptance requires an authenticated account whose email exactly matches the invitation.
- Organization audit events for organization changes, invitation lifecycle and membership changes.
- User session listing and per-session-family revocation.

## API

All paths below are under `/api/v1`.

| Method | Path | Permission |
|---|---|---|
| GET | `/organization` | `organization:read` |
| PATCH | `/organization` | `organization:update` |
| GET | `/organization/members` | `members:read` |
| PATCH | `/organization/members/:membershipId` | `members:manage` |
| DELETE | `/organization/members/:membershipId` | `members:manage` |
| GET | `/organization/invitations` | `members:read` |
| POST | `/organization/invitations` | `members:manage` |
| DELETE | `/organization/invitations/:invitationId` | `members:manage` |
| POST | `/organization/invitations/accept` | Authenticated user |
| GET | `/organization/audit-events` | `audit:read` |
| GET | `/auth/sessions` | Authenticated user |
| DELETE | `/auth/sessions/:sessionId` | Authenticated user |

## Invitation delivery

The API returns the raw invitation token exactly once in the create-invitation response so the current UI can construct a shareable invitation URL. The database stores only the token hash, and the token is never returned by the invitation-list endpoint. This is a development-stage delivery mechanism, not an email delivery integration. Before production, connect a transactional email provider and deliver the URL privately instead of displaying the raw token to the inviter.

## Ownership and consistency safeguards

Owner memberships cannot be edited or removed through the generic member endpoints. Ownership transfer needs a dedicated, audited workflow and is intentionally not exposed here. The membership and audit writes are separate MongoDB operations; production deployment should use replica-set transactions or a durable outbox pattern to guarantee atomic audit coverage for administrative changes.

## Tenant security

The organization ID is taken only from the authenticated request context. Member, invitation, audit and session database queries all include that organization ID. The organization ID in a client request body is not accepted by these schemas. Every route revalidates the user's active membership and active session family.

## Remaining production work

- Email delivery and verified-email onboarding.
- Ownership transfer and administrator invitation acceptance UX for users who are not signed in.
- Replica-set integration tests, transaction/outbox strategy and audit tamper-evidence/retention policy.
- Pagination and export controls for large member and audit datasets.
- MFA, password recovery and account lifecycle controls.
