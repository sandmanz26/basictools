# HireFlow

One workspace for **hiring (HR)**, **project management (PM)** and **outreach (Marketing)**.

- **HR** — hiring pipeline (table + kanban), talent pool shared across projects, positions with rich job descriptions and test questions, interview scheduling with reschedule history, CSV import/export, shareable read-only links.
- **PM** — all-projects monitor, per-project dashboard, work board, timeline, risks, team, budget, status updates, **custom project statuses**, invoices (PDF download, create from project data, recurring schedules that prepare drafts), billing reminders (+ calendar export).
- **Marketing** — lead pipeline with custom fields, email outreach and **broadcast to thousands of leads** (daily caps, send windows, auto-resume, test send) through Microsoft 365.
- **Access** — login/register with admin approval, roles and permissions, pages lock for roles without access.

> **Status:** the web app runs entirely in the browser with demo data (zustand + `localStorage`). A production backend is scaffolded in [`server/`](server/README.md) and the migration plan is in [`docs/FRONTEND_MIGRATION.md`](docs/FRONTEND_MIGRATION.md). Until that migration is done, treat the web app as a **prototype**: see [`docs/SECURITY.md`](docs/SECURITY.md).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |

Demo accounts are listed on the login page (password is shown there in development). **Settings → Demo data** resets everything.

## Tech

React 19, TypeScript (strict), Vite, Tailwind v4, shadcn/ui on Base UI, zustand, react-router, TipTap (rich text), jsPDF (invoice PDFs, loaded on demand), msal-browser (Microsoft Graph).

## Project layout

```
src/
  pages/        route components: hr/, pm/, mkt/, auth/, plus portfolio, projects, settings, public share page
  components/   shared UI (Dropdown, NumberInput, RichEditor, SaveBar, dialogs) and ui/ (shadcn primitives)
  lib/          pure logic: csv, import/export, billing schedules, invoice PDF, access rules, broadcast runner
  store.ts      the single zustand store (all domain data + actions), persisted to localStorage
  auth.ts       client-side session/credential mock (replaced by the server)
  types.ts      the domain model (mirrored by server/src/db schema)
server/         Fastify + PostgreSQL backend scaffold (own package.json)
docs/           architecture, API, migration plan, security review
```

## Conventions worth knowing

- **One select, one number input.** Use `Dropdown` (custom, searchable above 4 options) and `NumberInput` (auto thousands separators). Do not use native `<select>` or `type="number"`.
- **Edit-then-save forms.** Settings-style pages edit a copy via `useDraft` and apply on **Save changes** (`SaveBar`). Table cells and list tools still save as you type, by design.
- **Permissions** are strings in `types.ts` (`Permission`). Which page needs which permission lives in one place, `src/lib/access.ts`; enforce the same rules on the server.
- **Dates** are `yyyy-mm-dd` strings in local time (`localToday()` in `lib/billing.ts`); never use `toISOString().slice(0, 10)` for "today".
- Exports go through `toCsv`, which neutralises spreadsheet formulas.

## Deploying the web app (Vercel)

Import the repo; Vite is detected (`npm run build`, output `dist`). `vercel.json` adds the SPA rewrite and security headers (CSP, HSTS, frame denial). When the API exists, add its origin to `connect-src` in the CSP.

## Roadmap to production

1. Run the backend (`server/README.md`), then migrate the SPA store to the API following `docs/FRONTEND_MIGRATION.md` (auth first, then reads, then writes).
2. Move broadcast sending to the server queue (browser sending stops when the tab closes).
3. Remove client-side credentials and share-link passwords from the browser.
4. Add end-to-end tests for the critical flows (login, import, invoice, broadcast).
