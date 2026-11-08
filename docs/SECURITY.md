# Security review and go-live checklist

Last independent review: November 2026 (read-only code review of `src/`, plus `npm audit`).
Scope: the browser app. The backend scaffold in `server/` has its own notes in `server/README.md`.

## The one thing to understand

**Today the web app is a prototype: every rule is enforced in the browser, so anyone with devtools can bypass it.**
Accounts, sessions, roles, share-link passwords and all data live in `localStorage`. This is fine for demos and
internal trials with fake data. It is **not** acceptable for real candidate, salary, client or financial data.

What a person with devtools can do today (all of it disappears once the server enforces access):

| What | Why it works | Server fix |
| --- | --- | --- |
| Become admin | session and `roleId` are plain JSON in `localStorage` | sessions are httpOnly cookies, role read from the DB per request |
| Read other people's data | the whole store is loaded into every browser | API returns only what the caller may see (salary stripped without `salary.view`) |
| Open a password-protected share link | the page reads the same local store; the password is compared in the browser | `GET /share/:token` verifies a hashed password, rate-limits, returns only permitted fields |
| Reset the login lockout, crack reset codes | counters and code hashes are in `localStorage` | server-side rate limiting; reset codes emailed, hashed, single use |
| Read demo password / reset codes | `DEMO_PASSWORD` and on-screen reset codes exist for demos | disabled with `VITE_DEMO_MODE=false` |

## Fixed in the web app

- Security headers on Vercel (`vercel.json`): CSP (no inline script, `frame-ancestors 'none'`, MSAL and Graph allowed), HSTS, `nosniff`, referrer policy, permissions policy. Share pages use `Referrer-Policy: no-referrer` and `noindex` because the token is in the URL.
- CSV export neutralises spreadsheet formula injection (`= + - @`); covered by tests.
- Links from stored data (portfolio, form links) only render for `http`/`https`.
- Login redirect only follows in-app paths.
- Demo accounts, shared password and on-screen reset codes sit behind `VITE_DEMO_MODE` (default on for the prototype; **set to `false` for anything real**).
- Broadcast sending: addresses validated, subject line breaks stripped, a cross-tab lease prevents two tabs sending the same campaign, campaigns left "running" by a closed tab show as paused.
- Delete cascades: deleting a position, lead or user no longer leaves dangling references; the signed-in user and the last admin cannot be deleted.
- Dates use the user's local day (no off-by-one early morning in WIB).
- Pasted numbers in US format are read correctly by `NumberInput`.
- Storage failures (quota, blocked) show a warning instead of silently losing edits.
- Error boundary, lazy-loaded routes, `npm audit --omit=dev` is clean, CI runs typecheck, lint, tests, build and audit.
- Rich text is stored as HTML produced by TipTap, whose schema drops scripts and styles. **Never render that HTML anywhere else without sanitising it again server-side** (e.g. DOMPurify).

## Known gaps (need the server)

1. Authentication, sessions, RBAC, user approval, rate limiting, password reset by email. (`server/` implements these.)
2. Share links (see table).
3. `localStorage` is capped (~5 MB). 4,300 leads plus send logs approach it; the app warns, but the real fix is the database.
4. Bulk email sends from the browser through Microsoft Graph. It stops when the tab closes and tokens sit in the browser. Move to the server queue (`server/` has throttling, retries, suppression, signed unsubscribe).
5. The unsubscribe line is plain text ("reply STOP"). Real bulk mail needs a one-click unsubscribe link and `List-Unsubscribe` headers (server).
6. Money is stored as JavaScript numbers (whole rupiah). Fine for IDR; use integer/decimal columns on the server and round per line.
7. Import heuristic: salary values under 1,000 are read as millions (`750` → Rp 750 jt). Review the preview before importing.

## Go-live checklist

- [ ] Server running; SPA migrated per `docs/FRONTEND_MIGRATION.md`; `VITE_DEMO_MODE=false`.
- [ ] Remove client credentials/sessions, plaintext share passwords and demo seed data from the production bundle.
- [ ] CSP `connect-src` lists the API origin; cookies are `Secure`, `HttpOnly`, `SameSite=Strict`; CORS allow-list is exact.
- [ ] Secrets only in the host's secret store; bootstrap admin password rotated after first login.
- [ ] Postgres backups + restore drill; migrations run in CI/CD.
- [ ] Error reporting (e.g. Sentry) with PII scrubbing; uptime check on `/readyz`.
- [ ] Privacy: retention policy for candidates and leads, a way to delete a person on request, unsubscribe honoured everywhere.
- [ ] Penetration test or at least an OWASP ASVS L1 pass on the API.
- [ ] Add end-to-end tests for login, import, invoice, broadcast (see "Tests" in the README roadmap).
