# API guide

Base URL: `${VITE_API_URL}/api/v1`. Interactive reference with every schema: `GET /docs` (OpenAPI JSON at `/docs/json`).
This page explains the conventions; the OpenAPI document is the source of truth for fields.

## Authenticating

1. `POST /auth/login` with `{ "email", "password", "remember" }`. The response contains
   `{ accessToken, tokenType: "Bearer", expiresIn, user: { id, name, email, roleId, roleKey, status, permissions[] } }`
   and sets the `hf_refresh` cookie (httpOnly, SameSite=Strict, path `/api/v1/auth`).
2. Send `Authorization: Bearer <accessToken>` on every other call. Keep the access token in memory, not in localStorage.
3. Access tokens last 15 minutes. When a call returns 401 (or before expiry), call `POST /auth/refresh` with
   `credentials: "include"`. You get a new access token and a new cookie. The old cookie value is dead after one use,
   so never run two refreshes at once.
4. `POST /auth/logout` ends this login; `POST /auth/logout-all` ends every device.

Other auth endpoints: `register` (account is `pending` until an admin approves; the answer is the same whether or not
the email exists), `forgot-password` (always 202, emails a link `APP_URL/reset-password?token=...`), `reset-password`
(`{ token, password }`, single use, 30 min), `change-password` (`{ currentPassword, newPassword }`, signs out other
devices), `me`. Password rule: 8 to 128 characters with a letter and a number.

Errors to handle on login: `401 INVALID_CREDENTIALS` (wrong password, unknown email or temporarily locked, all look
the same), `403 ACCOUNT_PENDING`, `403 ACCOUNT_DISABLED`, `429 RATE_LIMITED`.

## Conventions

- JSON in, JSON out. Field names are camelCase, ids are UUIDs, dates are `yyyy-mm-dd`, timestamps are ISO 8601 UTC.
  Empty optional dates are `null` (the old mock used `""`). Money is whole rupiah as numbers.
- **Lists** return `{ data: [...], meta: { page, pageSize, total } }` and accept `page`, `pageSize` (max 200, candidates 500),
  `q` (text search) and resource specific filters (for example `?stage=`, `?status=`, `?archived=true|false|all`).
- **PATCH** changes only the fields you send. **PUT** on a sub-resource replaces it.
- **Permissions**: each route needs permissions listed in the OpenAPI summary and in `docs/ARCHITECTURE.md`. Missing
  permission gives `403`. Salary fields (`salaryMin`, `salaryMax`) come back as `null` without `salary.view`, and are
  ignored on write.
- Every response has `x-request-id`; send your own `x-request-id` (8 to 64 safe characters) to correlate logs.
- Responses are `Cache-Control: no-store`.

### Error format

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request is not valid.", "requestId": "…", "details": [ { "path": "body.email", "message": "Invalid email" } ] } }
```

Codes: `VALIDATION_ERROR` 400, `BAD_REQUEST` 400, `UNAUTHORIZED` 401, `INVALID_CREDENTIALS` 401, `FORBIDDEN` 403,
`NOT_FOUND` 404, `CONFLICT` and specific 409s (`DUPLICATE_CANDIDATE`, `DUPLICATE_NUMBER`, `NOT_PENDING`, `STATUS_IN_USE`,
`ALREADY_STARTED`, `BAD_STATE`, `SUPPRESSED`, `LAST_ADMIN`, `ROLE_IN_USE`, `NOTHING_TO_RESCHEDULE`), `PAYLOAD_TOO_LARGE` 413,
`RATE_LIMITED` 429, `INTERNAL_ERROR` 500 (no internals in production). Branch on `code`, show `message`.

### Limits

Global rate limit per IP (default 300 per minute), stricter on `/auth/*` and the public share endpoint
(default 10 per minute), body limit 1 MB, bulk imports at most 5,000 records per call (send several calls).

## Endpoints

`:id` is a UUID. "perm" is what the caller needs (any of, when separated by "or").

### Auth (no bearer unless noted)
`POST /auth/register`, `/auth/login`, `/auth/refresh` (cookie), `/auth/logout` (cookie), `/auth/forgot-password`,
`/auth/reset-password`; with bearer: `POST /auth/logout-all`, `GET /auth/me`, `POST /auth/change-password`.

### Users and roles (`roles.manage`)
`GET /users` (`status`, `roleId`, `q`), `GET|PATCH|DELETE /users/:id`, `POST /users/:id/approve` (optional `roleId`),
`POST /users/:id/disable`, `POST /users/:id/enable`, `PUT /users/:id/role`.
`GET|POST /roles`, `PATCH|DELETE /roles/:id` (permissions are a map of the 15 permission ids to booleans; the Admin role
is locked; a role in use cannot be deleted).

### Projects (`module.hr` or `module.pm`; write `projects.manage`)
`GET|POST /projects`, `GET|PATCH|DELETE /projects/:id`, `DELETE /projects/:id/stages/:stageId?moveTo=`,
`DELETE /projects/:id/pm-stages/:stageId?moveTo=`. PATCH of PM fields (`info`, `pmFeatures`, `pmFields`, `pmStages`)
also works with `pm.edit`. Archive with `{ "status": "archived" }`.
Project statuses: `GET|PUT /settings/project-statuses`, `POST /settings/project-statuses/remap`.

### Positions
`GET|POST /projects/:id/positions`, `GET|PATCH|DELETE /positions/:id` (`positions.edit`),
`PUT /positions/:id/questions` replaces the question bank (`tests.edit`; answer keys are hidden from others).

### Talent pool (`module.hr`; write `candidates.edit`)
`GET|POST /talents`, `GET|PATCH|DELETE /talents/:id`, `POST /talents/import`
(`{ records: [...], onDuplicate: "merge" | "skip" }` -> `{ total, created, merged, skipped }`; matches by email, then phone,
then name).

### Candidates (`module.hr`; write `candidates.edit`, delete `candidates.delete`)
`GET|POST /projects/:id/candidates`, `POST /projects/:id/candidates/from-talents`, `GET|PATCH|DELETE /candidates/:id`,
`POST /candidates/:id/move`, `POST /candidates/:id/archive`, `PATCH /candidates/:id/rounds/:key`,
`PUT /candidates/:id/rounds/:key/result` (pass advances, fail goes to the lost stage),
`POST /candidates/:id/rounds/:key/reschedule` (`{ reason }`; the old attempt moves to `history`).

### Share links (`share.manage`)
`GET|POST /projects/:id/share-links`, `PATCH|DELETE /share-links/:id`, `POST /share-links/:id/rotate`.
Public, no login: `POST /public/share/:token` with `{ "password": "…" }` when the link is password protected.
Answers `401 SHARE_PASSWORD_REQUIRED` / `SHARE_PASSWORD_INVALID`, `404` for unknown or disabled links. Only whitelisted
fields are returned; salary and contact only when the link allows them.

### Project management (`module.pm`; write `pm.edit`; budget read also `pm.invoice`)
For each of `tasks`, `milestones`, `risks`, `members`, `budget-items`, `status-updates`:
`GET|POST /projects/:id/<name>`, `GET|PATCH|DELETE /<name>/:id`. Tasks filter by `stage`, `assignee`, `priority`;
risks by `kind`, `status`; milestones by `status`.

### Billing (`pm.invoice`)
`GET|POST /invoices` (`projectId`, `status` including derived `overdue`, `q`), `GET|PATCH|DELETE /invoices/:id`,
`POST /invoices/:id/status` (`draft|sent|paid`), `POST /invoices/draft-due` (idempotent; `{ today? }`),
`GET|PUT /billing-profile`.
`GET|POST /schedules`, `GET|PATCH|DELETE /schedules/:id`, `GET /schedules/:id/occurrences?from=&to=`,
`PUT|DELETE /schedules/:id/occurrences/:date` (progress: `issuedAt`, `paidAt`, `skipped`),
`POST /schedules/:id/occurrences/:date/invoice` (create the draft for that occurrence, or return the existing one).
Invoice responses include `effectiveStatus`, `items`, `subtotal`, `taxAmount`, `total`.

### Marketing (`module.mkt`; write `mkt.edit`)
`GET|POST /leads`, `GET|PATCH|DELETE /leads/:id`, `POST /leads/import` (skips existing emails),
`GET|POST /lead-columns`, `GET|PATCH|DELETE /lead-columns/:id`, `GET|POST /email-templates`,
`GET|PATCH|DELETE /email-templates/:id`, `GET|PUT /settings/mkt-stages`.
One-off email (`mkt.send`): `GET|POST /leads/:id/emails`.

### Broadcasts (`module.mkt`; write `mkt.send`)
`GET|POST /broadcasts`, `GET|PATCH|DELETE /broadcasts/:id` (patch only while draft),
`POST /broadcasts/audience-preview`, `POST /broadcasts/:id/start`, `/pause` (optional `{ reason, resumeAt }`), `/resume`,
`/cancel`, `/retry-failed`, `/test-send` (to yourself only), `GET /broadcasts/:id/recipients?status=`.
Optional per-broadcast limits on create: `dailyCap`, `windowStart`, `windowEnd`. Server-wide caps live in the environment.
`GET|POST /suppressions`, `DELETE /suppressions/:email`.
Public: `GET|POST /unsubscribe/:token` (HTML; POST is the RFC 8058 one-click).

### Health
`GET /healthz` (process is up), `GET /readyz` (database reachable). Not under `/api/v1`.
