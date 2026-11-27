# Authentication, authorization and tenant isolation

## Implemented flows

- Registration creates a user, an organization and an owner membership.
- Login verifies the password with bcrypt and starts a session in the user's first active organization.
- Access tokens are short-lived JWTs signed with HS256 and contain user, organization and membership identifiers.
- Refresh tokens are cryptographically random opaque values. Only SHA-256 hashes are stored in MongoDB; the raw token is sent in an HTTP-only, SameSite=Strict cookie.
- Refresh rotates the token, invalidates the previous record and revokes the token family when reuse is detected.
- Refresh lifetime is configured through `REFRESH_TOKEN_TTL` (for example, `7d`) and validated at startup.
- Logout revokes the current refresh token; logout-all revokes all refresh sessions for the user.
- Cookie-setting authentication endpoints validate the exact configured frontend Origin and reject cross-site Fetch Metadata requests.
- Organization listing, creation and switching are membership-checked.
- Profile read, display-name update and active-session management are available to authenticated users.

## Tenant isolation

The access token selects an organization context, but it is not sufficient on its own. Every authenticated request re-checks that the user is active and that the referenced membership is active and belongs to the exact user and organization in the token. Domain repositories must additionally scope every tenant-owned query by `req.auth.organizationId`; never accept a tenant ID from request body or query string as authorization.

## Roles

- `owner`: full organization permissions.
- `admin`: organization and membership administration plus procurement, supplier, finance and audit permissions.
- `procurement_manager`: procurement and supplier operations with finance/audit read access.
- `procurement_officer`: procurement and supplier operations.
- `finance_manager`: finance approvals and read access to relevant operational records.
- `auditor`: read-only audit, finance, supplier and procurement access.

Use `requirePermission("domain:action")` on each business route. Add new permissions to the central role matrix rather than checking role names in controllers.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/auth/register` | Create user + organization + owner membership |
| POST | `/api/v1/auth/login` | Authenticate and issue tokens |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Revoke current refresh session |
| POST | `/api/v1/auth/logout-all` | Revoke all user refresh sessions |
| GET | `/api/v1/auth/me` | Read current profile and organization |
| PATCH | `/api/v1/auth/me` | Update display name |
| GET | `/api/v1/auth/sessions` | List active sessions in the current organization |
| DELETE | `/api/v1/auth/sessions/:sessionId` | Revoke a session family |
| GET | `/api/v1/auth/organizations` | List active memberships |
| POST | `/api/v1/auth/organizations` | Create another organization membership |
| POST | `/api/v1/auth/switch-organization` | Switch to an organization the user belongs to |

## Account verification and recovery

New registrations provision the user, organization and owner membership inside a MongoDB transaction. The account remains unable to sign in until its email is verified. Verification and password-reset credentials are cryptographically random, stored only as SHA-256 hashes, expire automatically, and are consumed atomically once. Password reset hashes the replacement password with bcrypt and revokes every active refresh-token session.

Public endpoints:
- `POST /api/v1/auth/verify-email` with `{ "token": "..." }`
- `POST /api/v1/auth/forgot-password` with `{ "email": "..." }` (always returns a generic accepted response)
- `POST /api/v1/auth/reset-password` with `{ "token": "...", "password": "..." }`

Configure SMTP in the API environment:
- `SMTP_HOST`
- `SMTP_PORT` (587 by default; 465 uses implicit TLS)
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`

All five settings are required in production. In development without SMTP, email delivery is skipped and tokens are not printed to logs; configure a local SMTP catcher or test mail account to complete verification manually. The web origin in `WEB_ORIGIN` is used to construct links.

## Multi-factor authentication

Users can enroll an authenticator app using the standard RFC 6238 TOTP format. The API encrypts pending and active TOTP secrets with AES-256-GCM using the dedicated `MFA_ENCRYPTION_KEY`; recovery codes are stored only as SHA-256 hashes. Enabling MFA requires a valid authenticator code and returns ten one-time recovery codes once. Login accepts a six-digit TOTP code or one unused recovery code in the `otp` field. Recovery codes are atomically consumed, and disabling MFA requires both the account password and a valid TOTP/recovery credential.

Authenticated endpoints:
- `POST /api/v1/auth/mfa/setup` creates an enrollment secret and otpauth URI.
- `POST /api/v1/auth/mfa/enable` with `{ "code": "123456" }` activates MFA and returns recovery codes.
- `POST /api/v1/auth/mfa/disable` with `{ "password": "...", "code": "..." }` disables MFA.

Treat recovery codes like passwords: display and store them securely when first returned. Set `MFA_ENCRYPTION_KEY` to 32 cryptographically random bytes encoded as 64 hexadecimal characters. Keep it separate from `JWT_ACCESS_SECRET`, back it up in a secrets manager, and use a planned versioned-key migration when rotating it.

## Integration tests

`apps/api/src/modules/auth/auth.integration.test.ts` starts a disposable single-node MongoDB replica set with WiredTiger. It exercises persisted registration records, bcrypt verification, login, refresh rotation and replay revocation, logout-all, and organization membership enforcement against real MongoDB collections and indexes. The test manages its own replica-set lifecycle and does not use a developer database.

Run it with the API workspace test command:

```bash
npm run test -w @procuraos/api
```

The first run may download the MongoDB binary used by `mongodb-memory-server`. CI runs on Node.js 22 and executes the same test suite.

## Local configuration

Set `JWT_ACCESS_SECRET` to a cryptographically random secret of at least 32 characters. Configure `ACCESS_TOKEN_TTL` (default `15m`), `REFRESH_TOKEN_TTL` (default `7d`) and `WEB_ORIGIN` to the exact trusted frontend origin. In production, serve over HTTPS so the refresh cookie is marked Secure. Never store access tokens in localStorage.

## Remaining production work

- Multi-document registration and organization creation require a replica-set or sharded MongoDB deployment because they use MongoDB transactions.
- Add step-up authentication for high-risk actions such as payment-detail changes, ownership transfer and privileged exports.
- Add a cross-tab refresh coordination strategy or carefully designed rotation grace policy.
- Extend authentication audit events to cover login failures, session revocation and organization switching.
- Extend replica-set tests to API-level end-to-end tests, failure injection and concurrency/race scenarios.
- Use a shared rate-limit store when deploying multiple API instances.
