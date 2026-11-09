# Setting up HireFlow on Supabase

HireFlow's API (`server/`) uses Supabase **only as a managed PostgreSQL database**. Login, roles and permissions are done by the API itself, so we do **not** use Supabase Auth or the auto-generated REST API. The SQL here makes sure of that: the public "anon" key can read nothing.

```
Browser (Vercel)  →  HireFlow API (Fastify, runs on Render/Fly/Railway/VPS)  →  Supabase Postgres
                      auth, RBAC, broadcast worker                                (tables in 00_schema.sql)
```

> Supabase cannot run the API or the broadcast worker for you (they are long-running Node processes). Host `server/` as a container or Node service next to it. Keep the region close to your Supabase project.

## 1. Create the schema

Pick **one** of the two ways (do not do both: the CLI keeps its own record of what ran).

**Option A (recommended): with the CLI.** Keeps `drizzle` migration history in sync for future changes. Do step 2 and 3 first, then:

```bash
cd server
DATABASE_URL="<postgres user, direct or session pooler string>" npm run db:migrate
```

**Option B: SQL editor, no CLI.** Supabase dashboard → **SQL Editor → New query**, paste all of [`00_schema.sql`](00_schema.sql) and **Run**. (Later changes then also have to be pasted by hand.)

Either way, finish with the lockdown script:

1. New query → paste [`01_api_role_and_lockdown.sql`](01_api_role_and_lockdown.sql). **Replace `CHANGE_ME_LONG_RANDOM_PASSWORD`** (generate one with `openssl rand -base64 32`) and **Run**. It turns on Row Level Security everywhere and creates the `hireflow_api` role the server will use.
2. Verify: `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;` — every row must say `true`. Dashboard → **Advisors → Security** should show no "RLS disabled" warnings.

The schema creates 31 tables plus enum types (migrations 0000 and 0001). The lockdown script enables RLS on every table in `public`, so tables added later by new migrations are covered if you re-run it after migrating.

## 2. Connection strings

Dashboard → **Connect**. You need two:

| Used for | Which string | Example user |
| --- | --- | --- |
| The running API (`DATABASE_URL`) | **Session pooler** (port 5432) or Direct if your host has IPv6. Transaction pooler (6543) also works for the API. | `hireflow_api.<project-ref>` |
| Running migrations (`npm run db:migrate`) | **Direct** or **Session pooler**, as the `postgres` user (it owns the tables) | `postgres.<project-ref>` |

Use the password you set in step 1.3 for `hireflow_api` (the pooler user name is `hireflow_api.<project-ref>`, with the project ref appended).

## 3. Configure the API

```bash
cd server
cp .env.example .env
```

Set at least:

```ini
NODE_ENV=production
DATABASE_URL=postgresql://hireflow_api.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
DB_SSL=true                                  # Supabase requires TLS
JWT_ACCESS_SECRET=<openssl rand -base64 48>
UNSUBSCRIBE_SECRET=<openssl rand -base64 48>
COOKIE_SECURE=true
CORS_ORIGINS=https://your-app.vercel.app     # exact origin(s) of the web app
APP_URL=https://your-app.vercel.app
PUBLIC_API_URL=https://your-api.example.com
BOOTSTRAP_ADMIN_EMAIL=you@company.com
BOOTSTRAP_ADMIN_PASSWORD=<a strong one-time password; change it after first login>
MAIL_PROVIDER=smtp                           # or graph (see server/README.md); console is dev only
```

Then create the roles and the first admin (the tables already exist from step 1):

```bash
npm install
npm run db:seed
npm run dev        # or: npm run build && npm start
```

Open `http://localhost:3000/docs` for the API docs and `/readyz` to confirm the database connection works.

## 4. Later schema changes

1. Change `server/src/db/schema.ts`, run `npm run db:generate` (creates a new SQL file in `server/drizzle/`).
2. Apply it with the **postgres** connection: `DATABASE_URL=<postgres direct/session url> npm run db:migrate`.
3. Run `bash supabase/build-schema.sh` if you also want a fresh combined `00_schema.sql`, and **re-run `01_api_role_and_lockdown.sql`** so new tables get RLS and grants.

## 5. Hosting notes

- **Backups:** Supabase Pro has daily backups and point-in-time recovery; on the free plan export regularly (`pg_dump`) because free projects pause after inactivity.
- **Do not** put the `service_role` key or the database password in the web app. The SPA only needs the API URL.
- Candidate, salary and finance data is personal data: pick the Supabase region deliberately and review your data-retention policy.
- For the 4,300-person broadcast, use the server worker (`WORKER_ENABLED=true`, `BROADCAST_PER_DAY` caps) rather than sending from the browser.
