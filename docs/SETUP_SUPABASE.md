# Install the HireFlow backend on Supabase — click by click

What you get: Supabase = the PostgreSQL database. The HireFlow API (`server/`) = login, roles, broadcast worker. Supabase cannot run the API for you, so the API runs on a small Node host (Render is used below; Fly, Railway or a VPS work the same).

```
Browser (Vercel)  →  API (Render)  →  Supabase Postgres
```

Status today: the API and the database are ready. **The web app is not connected to the API yet** (it still saves to the browser). See `docs/FRONTEND_MIGRATION.md`. Installing this does not change how the live app behaves.

Time needed: about 30 minutes. You need: a Supabase account, a GitHub account that can see this repo, and a terminal.

---

## Part A — Supabase project

1. Go to https://supabase.com/dashboard and sign in.
2. **New project**. Pick your organization, then:
   - **Name:** `hireflow`
   - **Database password:** click **Generate a password**, copy it, save it in your password manager. This is the `postgres` password.
   - **Region:** the one closest to your users and to the place that runs the API (Singapore for Indonesia). Candidate and salary data is personal data, so choose on purpose.
   - **Create new project.** Wait 1–2 minutes.
3. Note the **project ref**: the part of the URL after `/project/` (for example `abcdefghijklmno`).

## Part B — Create the tables

Pick **one** option. Do not mix them.

**Option 1 — SQL editor (easiest, no terminal)**
1. Left menu → **SQL Editor** → **New query**.
2. Open `supabase/00_schema.sql` in this repo, copy everything, paste, click **Run**. It must say "Success". (36 tables.)

**Option 2 — command line (keeps migration history; better for later changes)**
1. Supabase dashboard → top bar **Connect** → tab **Session pooler** → copy the string and put your `postgres` password in it. The user looks like `postgres.<project-ref>`.
2. In a terminal:
   ```bash
   cd server
   npm install
   DB_SSL=true DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres" npm run db:migrate
   ```

## Part C — Lock the database down and create the API user

1. SQL Editor → **New query**.
2. Open `supabase/01_api_role_and_lockdown.sql`, copy it, paste.
3. Replace `CHANGE_ME_LONG_RANDOM_PASSWORD` with a new random password. Generate one: `openssl rand -base64 32`. Save it; this is the `hireflow_api` password (different from the `postgres` one).
4. **Run.**
5. Check: run `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;` Every row must be `true`. Then **Advisors → Security** (left menu) should show no "RLS disabled".

Why: this makes the public Supabase key unable to read anything. Only the API user can.

## Part D — Connection string for the API

Dashboard → **Connect** → **Session pooler** (port 5432). Change the user to `hireflow_api.<project-ref>` and the password to the one from Part C:

```
postgresql://hireflow_api.<project-ref>:<hireflow_api password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

## Part E — Try the API on your own computer first

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```ini
NODE_ENV=development
DATABASE_URL=<string from Part D>
DB_SSL=true
JWT_ACCESS_SECRET=<run: openssl rand -base64 48>
UNSUBSCRIBE_SECRET=<run: openssl rand -base64 48>
CORS_ORIGINS=http://localhost:5173
APP_URL=http://localhost:5173
PUBLIC_API_URL=http://localhost:3000
BOOTSTRAP_ADMIN_EMAIL=<your email>
BOOTSTRAP_ADMIN_PASSWORD=<strong one-time password>
MAIL_PROVIDER=console
WORKER_ENABLED=false
```

Then:

```bash
npm run db:seed     # creates roles + your admin
npm run dev
```

Open http://localhost:3000/readyz (must say ok → the database works) and http://localhost:3000/docs (API documentation).

If you see a certificate error: Supabase dashboard → **Project Settings → Database → SSL Configuration → Download certificate**, then run `NODE_EXTRA_CA_CERTS=/path/to/prod-ca-2021.crt npm run dev`.

## Part F — Put the API online (Render example)

1. https://render.com → **New +** → **Web Service** → connect GitHub → pick `sandmanz26/basictools`.
2. Settings: **Root Directory** `server`, **Runtime** `Docker` (the Dockerfile is in `server/`), region next to Supabase, instance **Starter** or higher (the broadcast worker must stay awake; free instances sleep).
3. **Environment** → add these (not in git):

   | Key | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | string from Part D |
   | `DB_SSL` | `true` |
   | `JWT_ACCESS_SECRET` | random, 32+ chars |
   | `UNSUBSCRIBE_SECRET` | random, 32+ chars |
   | `COOKIE_SECURE` | `true` |
   | `TRUST_PROXY` | `true` |
   | `CORS_ORIGINS` | `https://ainstooling.vercel.app` |
   | `APP_URL` | `https://ainstooling.vercel.app` |
   | `PUBLIC_API_URL` | the Render URL, e.g. `https://hireflow-api.onrender.com` |
   | `MAIL_PROVIDER` | `smtp` (or `graph`, see `server/README.md`) + the `SMTP_*` keys |
   | `BROADCAST_FOOTER_ADDRESS` | your company postal address |
   | `DOCS_ENABLED` | `false` |

4. **Create Web Service.** When it is live open `<render-url>/readyz`.
5. Create the first admin once: Render service → **Shell** → `npm run db:seed:prod` (set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` for that run, then remove the password variable and change it after the first login).

Cookies: the refresh cookie needs the web app and the API on the same site. Use a custom domain with an `api.` subdomain (for example `app.yourcompany.com` + `api.yourcompany.com`), or a Vercel rewrite of `/api/*` to the API. `*.vercel.app` and `*.onrender.com` are different sites, so login would not stay signed in.

## Part G — After the first install

- **Schema change:** edit `server/src/db/schema.ts` → `npm run db:generate` → apply with the `postgres` string (`npm run db:migrate`) → `bash supabase/build-schema.sh` → re-run `01_api_role_and_lockdown.sql`.
- **Backups:** Supabase Pro has daily backups and point-in-time recovery. On the free plan the project pauses after a week of inactivity, so use Pro for real data.
- **Never** put the `service_role` key, `anon` key or any database password in the web app or in git.

## What is still missing (honest list)

1. The web app does not talk to the API yet (plan in `docs/FRONTEND_MIGRATION.md`, section 2 order).
2. Migration `0002` (currencies, our bank accounts, invoice payments, file links, project meetings, attachments, new project phases) only adds **tables and columns**. The API **endpoints** for them are not written yet.
3. Email attachments need object storage (Supabase Storage bucket) and worker support. Not built.
4. Outlook calendar, SharePoint upload and the test lab keep running in the browser with the user's own Microsoft token.
5. Broadcast sending from the server needs a mail path: SMTP, or Graph with an app-only permission and admin consent. Decide before switching broadcasts to the server.
6. I could not run `npm run db:migrate` against a real Supabase project from here. The migration was checked by generating it and by the existing test suite, not by applying it to your project.
