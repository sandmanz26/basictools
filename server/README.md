# HireFlow server

REST API behind the HireFlow SPA (HR hiring pipeline, PM projects and billing, marketing leads and email broadcast).
Node 22, TypeScript (strict, ESM), Fastify 5, Zod, Drizzle ORM, PostgreSQL 16.

The frontend in `../src` still runs on mock data in localStorage. This folder is the production backend; see
[`../docs/FRONTEND_MIGRATION.md`](../docs/FRONTEND_MIGRATION.md) for the plan to connect them,
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the design and [`../docs/API.md`](../docs/API.md) for the API guide.

## What is in it

- Auth: register (pending until an admin approves), login with Argon2id, short lived access JWT plus a rotating
  refresh token in an httpOnly cookie, reuse detection, lockout, forgot/reset password, change password.
- RBAC with the same permission ids and default roles as the frontend. Every route is guarded server side;
  salary fields are removed unless the caller has `salary.view`.
- HR: projects, positions and test questions, talent pool (with bulk import and de-duplication), candidates
  (stages, interview rounds, reschedule history), share links (password stored as an Argon2 hash).
- PM: tasks, milestones, risks, team, budget, status updates; invoices with lines, totals, draft/sent/paid sync,
  recurring billing schedules that prepare their own draft invoices.
- Marketing: leads, custom columns, templates, and a durable broadcast queue for thousands of recipients
  (throttling, send window, retry with backoff, pause/resume/cancel, suppression list, one-click unsubscribe).
- OpenAPI docs at `/docs`, health at `/healthz` and `/readyz`, audit log, request ids.

## Quick start with Docker

```bash
cd server
cp .env.example .env
# edit .env: JWT_ACCESS_SECRET, UNSUBSCRIBE_SECRET (openssl rand -base64 48), BOOTSTRAP_ADMIN_PASSWORD
docker compose up --build
```

The API listens on http://localhost:3000. On boot it applies the SQL migrations and runs the idempotent seed
(default roles and, if `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set, the first admin).
Open http://localhost:3000/docs for the interactive API.

Point the SPA at it with `VITE_API_URL=http://localhost:3000` once the frontend migration is done.

## Quick start without Docker

You need Node 22+ and a PostgreSQL 16 database.

```bash
cd server
npm install
cp .env.example .env            # set DATABASE_URL, the two secrets, BOOTSTRAP_ADMIN_PASSWORD
npm run db:migrate              # apply drizzle/*.sql
npm run db:seed                 # roles + bootstrap admin
npm run dev                     # http://localhost:3000, restarts on change
```

Emails (password reset, test sends) are printed to the terminal with the default `MAIL_PROVIDER=console`.

## Using Supabase as the database

Supabase is used only as managed PostgreSQL; the API does its own login and permissions. Setup steps (schema, the
locked-down `hireflow_api` role, connection strings) are in [`../supabase/README.md`](../supabase/README.md). In short:

- `DATABASE_URL` = the Supabase pooler string for role `hireflow_api`, `DB_SSL=true`.
- The code uses no named prepared statements and no session state, so it works behind the transaction pooler (port 6543).
  The worker's advisory lock is transaction scoped.
- If Node rejects the pooler certificate, set `NODE_EXTRA_CA_CERTS` to the Supabase CA file; `DB_SSL_REJECT_UNAUTHORIZED=false`
  exists but should not be used in production.
- After changing `src/db/schema.ts`: `npm run db:generate`, then `bash ../supabase/build-schema.sh` to refresh `00_schema.sql`.
- Supabase cannot host the API or the broadcast worker: run `server/` on a container or Node host.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Run with tsx and reload on change; reads `.env` |
| `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| `npm run start:worker` | Run only the broadcast sender (use with `WORKER_ENABLED=false` on the API) |
| `npm test` | Vitest. Uses an embedded Postgres (PGlite): no database needed |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (typescript-eslint, no `any`) |
| `npm run db:generate` | Create a new SQL migration from changes in `src/db/schema.ts` |
| `npm run db:migrate` / `db:seed` | Apply migrations / run the seed (dev, via tsx) |
| `npm run db:migrate:prod` / `db:seed:prod` | Same, from the compiled `dist/` (what the Docker image has) |

## Environment variables

All variables are validated with Zod at start-up; the process exits with a list of every problem if something is
wrong. Production mode additionally refuses `COOKIE_SECURE=false`, an empty `CORS_ORIGINS`, the console mail provider
and the example secrets. [`.env.example`](.env.example) documents every variable. The important ones:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL`, `DB_POOL_MAX`, `DB_SSL` | PostgreSQL connection |
| `JWT_ACCESS_SECRET` | Signs access tokens (32+ chars) |
| `UNSUBSCRIBE_SECRET` | Signs unsubscribe links (32+ chars). Changing it invalidates old links |
| `CORS_ORIGINS` | Comma separated browser origins allowed to call the API |
| `COOKIE_SECURE` | Must be `true` behind https |
| `APP_URL`, `PUBLIC_API_URL` | Used in reset emails and unsubscribe links |
| `MAIL_PROVIDER` | `console`, `smtp` or `graph` (stub), with the matching `SMTP_*` / `GRAPH_*` |
| `BROADCAST_PER_MINUTE`, `BROADCAST_PER_DAY`, `BROADCAST_WINDOW_*`, `BROADCAST_TZ` | Sending caps and window |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | First admin (created once, never overwritten) |

## Folder structure

```
server/
  drizzle/                 committed SQL migrations (generated by drizzle-kit)
  src/
    server.ts              entry: config, db, migrations, seed, worker, graceful shutdown
    worker.ts              entry for a stand-alone broadcast sender
    app.ts                 builds the Fastify app (security, docs, routes)
    config.ts              Zod validated environment
    context.ts             AppContext (config, db, mail, hasher) + Fastify typings
    db/                    schema.ts, client.ts, migrate.ts, seed.ts, *-cli.ts
    domain/                permission ids and default roles, default stages, jsonb shapes
    lib/                   small pure helpers: errors, crypto, password, jwt, audit, salary, pagination, schemas
    plugins/               security (helmet, cors, rate limit), errors, docs, authz (authenticate, requirePermission)
    mail/                  MailProvider interface + console, smtp (nodemailer), graph (stub)
    jobs/                  broadcast-worker.ts (queue loop) and throttle.ts (pure caps/backoff maths)
    modules/<area>/        routes.ts (HTTP + validation), service.ts / logic.ts (rules), schemas.ts (Zod)
      auth users projects positions talents candidates invoices schedules share crud broadcasts
  tests/                   Vitest suites (PGlite) incl. one that drives the real node-postgres path
```

Rules of thumb: routes validate input and pick the permission, services/logic hold the rules, `lib` stays pure,
nothing outside `db/` builds raw SQL strings from user input.

## How to add a module

1. Add the table(s) to `src/db/schema.ts`, then `npm run db:generate` and commit the new file in `drizzle/`.
2. If it is a plain project-scoped or global record, you are nearly done: add one `registerCrud(app, { ... })` call in
   `src/modules/crud/routes.ts` with the Zod schemas, the permissions (`read` / `write`, any-of), optional `filters`,
   `search` and a `validate` hook.
3. Otherwise create `src/modules/<name>/{schemas,routes}.ts` (add a `service.ts` when there is logic worth testing),
   export a `FastifyPluginAsyncZod`, and register it in `src/app.ts`.
4. Guard every route with `guard(...)` (all permissions) or `guardAny(...)` (at least one). Never skip it.
5. Use `patchOf(schema)` for PATCH bodies (Zod's `.partial()` keeps `.default()` values and would overwrite data).
6. Strip secrets by construction: response schemas only list fields that may leave the server. Call `stripSalary`
   for salary data. Write an `audit(...)` entry for sensitive mutations.
7. Add tests in `tests/`. `createEnv()` gives you an app on a fresh embedded Postgres, `userWithRole('hr')` a signed-in user.

## Operational notes

- Migrations run on boot. With several API replicas, run `npm run db:migrate:prod` as a release step instead.
- One API process can also run the sender (`WORKER_ENABLED=true`). Multiple senders are safe: the queue uses
  row locks and an advisory lock so caps hold across them.
- Backups: see `../docs/ARCHITECTURE.md`.
