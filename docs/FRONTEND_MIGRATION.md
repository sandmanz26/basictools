# Moving the SPA from localStorage to the API

Today `src/store.ts` (zustand, persisted to localStorage) is the database and `src/auth.ts` is a client-side login.
Goal: the server is the source of truth, the browser only caches. Do it in small steps so the app keeps working
after each one.

## 0. Ground rules

- Switch with `VITE_API_URL`. Empty or missing = keep the demo (mock) mode; set = use the API. Keep `VITE_DEMO_MODE`
  (already in `src/lib/auth.ts`) as `false` whenever the API is on.
- Same-site hosting is required for the refresh cookie (see "Cookies and domains" in `ARCHITECTURE.md`): custom domain
  for the SPA and `api.` subdomain, or a Vercel rewrite of `/api/*`. Add the SPA origin to the API's `CORS_ORIGINS`.
- Ids change from `p1`, `c-abc123` to UUIDs. Nothing in the UI should depend on the id format.
- Empty dates are `null` on the API, `""` in the mock. Map at the api-client edge (`d ?? ''` on read, `d || null` on write)
  so components do not change.

## 1. An API client layer (new `src/api/`)

```
src/api/client.ts     fetch wrapper: base URL, bearer header, JSON, error envelope -> ApiError(code, message, details)
src/api/session.ts    in-memory access token, single-flight refresh, login/logout, onUnauthorized hook
src/api/<area>.ts     typed functions per area (projects, candidates, talents, positions, invoices, schedules, share,
                      pm, leads, broadcasts, users)
```

Client rules:

- `credentials: "include"` only for `/auth/*` calls. Access token lives in a module variable, never in localStorage.
- On `401`: call `refresh()` **once at a time** (share one promise), retry the original request once, otherwise send the
  user to the login page. Two simultaneous refreshes make the second one look like token theft and kills the session.
- Throw `ApiError` with the server `code`; screens branch on `code` (`DUPLICATE_CANDIDATE`, `INVALID_CREDENTIALS`, ...).
- Use TanStack Query (or a small cache) for reads and invalidate after writes. Keep zustand only for UI state
  (active project, filters, column prefs, drafts).

## 2. Order of migration

1. **Auth.** Replace `useAuth` internals with the API session (`login`, `register`, `logout`, `changePassword`,
   `requestReset` -> `forgot-password`, `confirmReset` -> `reset-password`). On app start call `POST /auth/refresh`; if it
   works the user is signed in. Reset codes become emailed links: the reset page reads `?token=` and posts it. Show the
   generic messages the server returns. Delete the code listed in section 4.
2. **Current user and permissions.** `GET /auth/me` gives `permissions[]`. Build `can(p)` from it instead of from the
   local role table. `lib/access.ts` keeps working unchanged.
3. **Settings: users and roles** (admin screens): `/users`, `/roles`.
4. **Projects and settings** (stages, PM stages, info, features, fields, statuses).
5. **HR:** positions, talents, candidates (including import, add-from-pool, rounds).
6. **Share links** (management and the public `SharePage`).
7. **PM:** tasks, milestones, risks, members, budget, updates.
8. **Billing:** schedules, invoices, billing profile.
9. **Marketing:** leads, templates, columns, stages, then broadcasts.
10. Remove the mock seed, the persisted business data and the demo switch.

For each step: add the api functions, switch the page's reads/writes, keep the optimistic update where it exists
(update the cache first, roll back on error), delete the matching store slice.

## 3. Store action -> endpoint

| Store action | Endpoint |
| --- | --- |
| `addProject`, `updateProject`, `deleteProject` | `POST /projects`, `PATCH /projects/:id` (archive = `status`), `DELETE /projects/:id` |
| `duplicateProject` | no endpoint: create the project with the same body, then copy children client-side (or ask for a server endpoint) |
| `setStages`, `setPmStages`, `updateInfo`, `setPmFeature(s)`, `setPmFields` | `PATCH /projects/:id` with `stages`, `pmStages`, `info`, `pmFeatures`, `pmFields` |
| `removeStage`, `removePmStage` | `DELETE /projects/:id/stages/:stageId?moveTo=`, `.../pm-stages/:stageId?moveTo=` |
| `statuses`, `setStatuses`, `remapStatus` | `GET/PUT /settings/project-statuses`, `POST /settings/project-statuses/remap` |
| `addPosition`, `updatePosition`, `deletePosition` | `POST /projects/:id/positions`, `PATCH/DELETE /positions/:id` |
| `upsertQuestion`, `deleteQuestion` | `PUT /positions/:id/questions` (send the whole list) |
| `addCandidate`, `updateCandidate`, `deleteCandidate`, `archiveCandidate` | `POST /projects/:id/candidates`, `PATCH/DELETE /candidates/:id`, `POST /candidates/:id/archive` |
| `moveCandidate` | `POST /candidates/:id/move` |
| `updateRound`, `setRoundResult`, `rescheduleRound` | `PATCH /candidates/:id/rounds/:key`, `PUT .../result`, `POST .../reschedule` |
| `addTalentsToProject` | `POST /projects/:id/candidates/from-talents` |
| `importCandidates`, `importTalents` | `POST /talents/import` (then `from-talents` for candidates), chunks of 5,000 |
| `addTalent`, `updateTalent`, `deleteTalent` | `POST /talents`, `PATCH/DELETE /talents/:id` |
| `pmAdd/pmUpdate/pmDelete` (`tasks`, `milestones`, `risks`, `members`, `budget`, `updates`) | `POST /projects/:id/<tasks|milestones|risks|members|budget-items|status-updates>`, `PATCH/DELETE /<name>/:id` |
| `addInvoice`, `updateInvoice`, `deleteInvoice` | `POST /invoices`, `PATCH /invoices/:id` + `POST /invoices/:id/status`, `DELETE /invoices/:id` |
| `createInvoiceFromSchedule`, `draftDueInvoices` | `POST /schedules/:id/occurrences/:date/invoice`, `POST /invoices/draft-due` |
| `setBillingProfile` | `PUT /billing-profile` |
| `addSchedule`, `updateSchedule`, `deleteSchedule`, `importSchedules` | `POST /schedules`, `PATCH/DELETE /schedules/:id` (import = several POSTs) |
| `setScheduleEvent` | `PUT/DELETE /schedules/:id/occurrences/:date` |
| `addLead`, `updateLead`, `deleteLead`, `importLeads` | `POST /leads`, `PATCH/DELETE /leads/:id`, `POST /leads/import` |
| `setMktStages`, `removeMktStage` | `PUT /settings/mkt-stages` (moving leads off a removed stage: PATCH them first) |
| `setMktFields` | `POST/PATCH/DELETE /lead-columns` |
| `setMktColumns` (visible columns) | stays in the browser (user preference) |
| `upsertTemplate`, `deleteTemplate` | `POST/PATCH/DELETE /email-templates` |
| `addBroadcast`, `updateBroadcast`, `deleteBroadcast` | `POST /broadcasts`, `PATCH /broadcasts/:id`, `DELETE` |
| broadcast send loop, `setBroadcastRecipient`, pause/resume, daily cap, window | server worker: `POST /broadcasts/:id/start`, `/pause`, `/resume`, `/cancel`, `/retry-failed`; progress from `GET /broadcasts/:id` and `/recipients` (poll every few seconds) |
| `logEmail` (one-off mail) | `POST /leads/:id/emails`; history `GET /leads/:id/emails` |
| `msConfig`, `MicrosoftCard`, `lib/microsoft.ts`, `useMicrosoft` | removed: the server sends mail through its `MailProvider`; the SPA never holds mail credentials |
| `addShare`, `updateShare`, `deleteShare` | `POST /projects/:id/share-links`, `PATCH/DELETE /share-links/:id` |
| `bumpShare` | removed: the server counts views |
| `updateRole`, `togglePermission`, `addRole` | `PATCH /roles/:id`, `POST /roles` |
| `addUser`, `updateUser`, `deleteUser` | admin screen: `POST /auth/register` happens on the register page; approve with `POST /users/:id/approve`, role with `PUT /users/:id/role`, `POST /users/:id/disable|enable`, `DELETE /users/:id` |
| `setUser`, `currentUserId` | removed: the signed-in user is `GET /auth/me` |
| `reset` | demo only; delete |

Things the server now does that the client used to do, so remove the client copy: invoice numbering
(`nextInvoiceNumber`), invoice and schedule event syncing, round pass/fail movement, reschedule history, talent
de-duplication on import, mirroring name/email/phone between a talent and its candidates, salary hiding (the server
returns `null`), share link counting, broadcast scheduling and caps.

Still client side: schedule agenda (`buildAgenda`, uses `GET /schedules` + occurrences), invoice PDF (`invoicePdf.ts`),
CSV parsing and export, ICS export, column preferences, drafts.

## 4. What must be deleted from the client

- `src/lib/auth.ts` password hashing (`hashSecret`, PBKDF2, `randomHex`, `safeEqual`), `DEMO_PASSWORD`, `SHOW_RESET_CODE`,
  lockout and reset counters, and the seeded demo credentials in `src/auth.ts` (`creds`, `resets`, `fails`, `seeded`).
  Keep only the password rules for form hints (`PASSWORD_RULES`, `passwordOk`) and `validEmail`.
- The persisted auth blob (`hireflow-auth-v1`) and any password hash or reset code in localStorage. On first run of the
  new build, remove those keys (`localStorage.removeItem(...)`).
- `ShareLink.password` stored in plain text: the field disappears from the type. The form sends a password only when
  creating or changing it; the UI shows "password set" from `hasPassword`. `SharePage` asks the visitor for the password
  and posts it to `/public/share/:token`; it must not compare anything locally.
- The mock data modules (`src/data/mock.ts`) from the production bundle (keep behind the demo switch while it exists),
  and the persisted business data in `hiring-pipeline-v8` once the last area is migrated. Offer a one-time import:
  a developer script that reads an exported JSON and posts it through the import endpoints.
- Microsoft client-side sending (`lib/microsoft.ts`, `useMicrosoft`, `MicrosoftCard`, `MsConfig`) and the in-browser
  broadcast sender (`lib/broadcast.ts` loop).
- Any use of `salaryMin/salaryMax` for permission checks on the client: treat `null` as "not allowed to see".
- IndexedDB test PDFs (`lib/files.ts`) are the one thing the API does not store yet; keep as is until file storage is chosen.

## 5. Practical details

- **Env**: `VITE_API_URL=https://api.example.com` (no trailing slash). In dev, either set it to
  `http://localhost:3000` and add `http://localhost:5173` to `CORS_ORIGINS`, or proxy `/api` in `vite.config.ts`.
- **Loading states**: lists are paginated (`pageSize` 50 by default, 200 max, candidates 500). Kanban boards that need
  every card: request `pageSize=500` per project and page if `meta.total` is larger.
- **Optimistic updates** must tolerate `409` and `400`; refetch on error.
- **Roles by id**: the frontend used ids like `r-admin`; the API has UUID ids and a stable `roleKey`
  (`admin`, `hr`, `pm`, `hm`, `mkt`, `viewer`). Use `roleKey` where code compared to `'r-admin'`.
- **Testing**: keep the vitest suite on pure helpers; add contract tests that call a local API started with
  `docker compose up` for the critical flows (login, add candidate, send invoice).
- **Rollout**: ship behind `VITE_API_URL` in a preview deployment first, create the admin with the seed, invite users
  through the register flow, then switch production and remove demo mode.

## 6. Added after the first backend: data the API does not model yet

The web app now has these features. They live in the browser store only; the server schema (`server/src/db/schema.ts`) does not have them, so each needs a migration + endpoint before the SPA can switch over:

| Feature | Client shape (src/types.ts) | Server work |
| --- | --- | --- |
| Project phase is `planning | ongoing | completed` | `ProjectInfo.phase` (old values are migrated by `migratePhase`, store v9) | Change the column/enum; map old rows the same way |
| Currencies (IDR, USD, JPY) | `Invoice.currency`, `Schedule.currency` (missing = IDR) | Add `currency` char(3); keep money as integers in the smallest unit (USD cents) |
| Our bank accounts + invoice template | `BillingProfile.banks[]`, `logo`, `defaultTaxPct`, `defaultTermDays`, `footer`, `signer*`; `Invoice.bankId` | New `bank_accounts` table; store the logo as a file, not a data URL |
| Vendor bank details | `Schedule.payTo` | Columns on `schedules` |
| Payments (partial, late, PPh withheld) | `Invoice.payments[]` (`amount`, `withheld`, `date`, `note`), `ScheduleEvent.paidAmount/withheld/paidNote` | New `invoice_payments` table; invoice status derived from payments |
| Project files / invoice and bill documents | `Project.files`, `Invoice.attachments`, `Schedule.attachments`, `ScheduleEvent.attachments` (`FileRef`: name + SharePoint link) | New `file_refs` table (owner type + id). Only links are stored |
| Project meetings | `ProjectMeeting` (`projectMeetings` in the store) | New `project_meetings` table, attendees as text[] or a join table |
| Email attachments | `Broadcast.attachments` (`AttachmentMeta`), `SentEmail.attachments` (names). Bytes are in the browser's IndexedDB | Server needs object storage (e.g. Supabase Storage) and the broadcast worker must attach files when sending |
| Sent history table | `SentEmail[]`, capped at `EMAIL_LOG_CAP` (6,000) | `sent_emails` already exists: add `attachments`, remove the cap, filter by date server-side |

SharePoint upload and Outlook event creation run in the browser with the user's own Microsoft token (delegated). When the API takes over, keep them in the browser (no server-held Microsoft credentials), and only send the resulting link / event id to the API.
