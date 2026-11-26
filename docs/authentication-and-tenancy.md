# Authentication, authorization and tenant isolation

## Implemented flows

- Registration creates a user, an organization and an owner membership.
- Login verifies the password with bcrypt and starts a session in the user's first active organization.
- Access tokens are short-lived JWTs signed with HS256 and contain user, organization and membership identifiers.
- Refresh tokens are cryptographically random opaque values. Only SHA-256 hashes are stored in MongoDB; the raw token is sent in an HTTP-only, SameSite=Strict cookie.
- Refresh rotates the token, invalidates the previous record and revokes the token family when reuse is detected.
- Logout revokes the current refresh token; logout-all revokes all refresh sessions for the user.
- Organization listing, creation and switching are membership-checked.
- Profile read and display-name update endpoints are authenticated.

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
| GET | `/api/v1/auth/organizations` | List active memberships |
| POST | `/api/v1/auth/organizations` | Create another organization membership |
| POST | `/api/v1/auth/switch-organization` | Switch to an organization the user belongs to |

## Local configuration

Set `JWT_ACCESS_SECRET` to a cryptographically random secret of at least 32 characters. Configure `WEB_ORIGIN` to the exact trusted frontend origin. In production, serve over HTTPS so the refresh cookie is marked Secure. Never store access tokens in localStorage.

## Security follow-ups before production

- Add email verification, password reset, MFA and account recovery.
- Add invite-based membership onboarding and administrator-managed role changes.
- Add explicit CSRF tokens if cookie-authenticated state-changing endpoints expand beyond the current SameSite=Strict refresh/logout design.
- Add a replica-set-backed transaction strategy for multi-document registration and organization creation.
- Add a cross-tab refresh coordination strategy or carefully designed rotation grace policy.
- Add audit events for authentication, session revocation, organization switching and membership changes.
- Add integration tests against a disposable MongoDB replica set and run dependency/security scanning.
