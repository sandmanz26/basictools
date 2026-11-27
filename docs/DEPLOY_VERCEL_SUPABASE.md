# Deploy: Vercel (web + API in one project) + Supabase (database + scheduler)

```
Browser ──► Vercel project "basictools"
             ├─ web (Vite)                     https://<domain>/
             └─ API (Fastify as a Function)    https://<domain>/api/*    ← same domain, so the login cookie works
                    │
Supabase ◄──────────┘ Postgres (tables)  +  pg_cron → calls /api/v1/cron/broadcast every minute
```

How it works in the repo:
- `api/index.js` → re-exports `server/dist/vercel.js` (the Fastify app as a Vercel Function). `vercel.json` rewrites `/api/*` to it, builds `server/` first, and allows 60 s per call.
- No migrations/seed at start and no background worker in the Function. Migrations and the first admin are run once from a computer.
- `server/src/modules/cron/routes.ts` runs the same broadcast worker tick on request, protected by `CRON_SECRET`.
- Health checks: `/api/healthz` (process) and `/api/readyz` (database).

Status: the Function and cron endpoint are tested locally (tests + a real HTTP smoke test without a database). **Not yet tested on Vercel or against a real Supabase project.** The web app does not call the API yet (see `FRONTEND_MIGRATION.md`).

## 1. Supabase
1. Run `supabase/00_schema.sql` (SQL Editor), then `supabase/01_api_role_and_lockdown.sql` with a new password for `hireflow_api`. (Details: `docs/SETUP_SUPABASE.md` parts A–C.)
2. Dashboard → **Connect** → **Transaction pooler** (port 6543). Build the app string: user `hireflow_api.<project-ref>`, that password.
3. Also keep the **Session pooler** string for the `postgres` user (port 5432). Only you use it, from your computer, to migrate and seed.

## 2. Vercel → Project → Settings → Environment Variables (Production)
| Key | Value |
| --- | --- |
| `DATABASE_URL` | transaction pooler string for `hireflow_api` |
| `DB_SSL` | `true` |
| `NODE_ENV` | `production` |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `UNSUBSCRIBE_SECRET` | another `openssl rand -base64 48` |
| `CRON_SECRET` | another `openssl rand -base64 48` |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` |
| `CORS_ORIGINS` | `https://<your domain>` |
| `APP_URL` | `https://<your domain>` |
| `PUBLIC_API_URL` | `https://<your domain>` |
| `WORKER_ENABLED` | `false` |
| `MAIL_PROVIDER` | `smtp` (+ `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`) |
| `BROADCAST_FOOTER_ADDRESS` | company postal address |
| `DOCS_ENABLED` | `false` |

Production mode refuses to start with `MAIL_PROVIDER=console`.

## 3. Nothing runs on your computer
- **Tables:** paste `supabase/00_schema.sql` in the Supabase SQL editor (that is the migration). Later schema changes: paste the new `server/drizzle/*.sql` the same way.
- **Random secrets** (`JWT_ACCESS_SECRET`, `UNSUBSCRIBE_SECRET`, `CRON_SECRET`): in the SQL editor run `select encode(gen_random_bytes(48), 'base64');` once per secret, or use any password generator (32+ characters).
- **Roles and first admin:** after the deploy (step 4), run `supabase/03_first_admin.sql` in the SQL editor. It calls `/api/v1/setup/seed` on Vercel, which creates the default roles and the admin from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`. Then remove `BOOTSTRAP_ADMIN_PASSWORD` from Vercel.

Also add `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD` to the Vercel variables in step 2.

## 4. Deploy and check
Push to `main` → Vercel builds. Then open `https://<domain>/api/readyz` → `{"status":"ready"}`.

## 5. Create the first admin, then start the scheduler
Run `supabase/03_first_admin.sql` first. Then:
Edit `supabase/02_cron_broadcast.sql` (YOUR_DOMAIN, YOUR_CRON_SECRET) and run it in the SQL editor. Check later with `select status_code, content from net._http_response order by created desc limit 5;` (expect 200 and JSON with `ticks`).

## Limits (honest)
- Vercel free (Hobby) is meant for personal, non-commercial use; business use needs Pro. Check Vercel's terms and the 60 s limit for your plan; if the deploy rejects `maxDuration: 60`, lower it in `vercel.json`.
- Supabase free pauses a project after about a week idle (pg_cron stops with it) and has no automatic backups.
- One cron call sends at most the per-minute cap (default 30), one after another.
- `argon2` (native module) on Vercel is untested; if login fails to start there, swap the hasher in `server/src/lib/password.ts`.
