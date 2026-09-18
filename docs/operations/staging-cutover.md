# SOHO Staging Cutover Runbook

Operator runbook for deploying the SOHO staging environment: the owner
dashboard on Cloudflare Pages and the API on Railway with a dedicated
PostgreSQL database. Every command and variable name here is grounded in the
repository contracts (`apps/admin_backend/railway.json`,
`apps/admin_backend/docs/staging-environment.md`,
`apps/owner_dashboard/docs/staging-environment.md`). Values that depend on
the operator environment are marked `<PLACEHOLDER>`. Claims that cannot be
verified from the repository are labeled **[assumption]** or **[unverified]**
and must be confirmed during execution.

## 1. Scope and topology

| Component | Where | Hostname |
| --- | --- | --- |
| Owner dashboard (static SPA) | Cloudflare Pages | `https://soho.nhilospos.com` |
| Admin API (`apps/admin_backend`) | Railway | `https://api-staging.nhilospos.com` |
| PostgreSQL (staging only) | Railway (dedicated database, same project as the API) | internal to Railway; no public hostname required |

**Out of scope:** production deployment, POS hardware provisioning and
verification, DGI cutover, load testing, and any data migration from
production. Staging serves the SOHO pilot only.

## 2. Prerequisites

- Accounts: Railway (API + PostgreSQL), Cloudflare (Pages + DNS for
  `nhilospos.com`, owned by the user).
- DNS access to the `nhilospos.com` zone (Cloudflare or current DNS provider).
- Tool versions: Node.js matching the repo (`packageManager: pnpm@11.22.0`
  is declared for the dashboard; pin `NODE_VERSION` on Pages to the
  repo-supported Node major). No local CLI tooling is required by this
  runbook; all provider steps happen in the provider consoles.
- **Staging isolation rule:** staging never shares data or services with
  production. The staging PostgreSQL database is dedicated; no production
  credentials, dumps, or hostnames may be reused in staging configuration,
  and staging secrets are generated fresh.

## 3. Railway API service

Create in the Railway console: one new project, then within it the API
service and a PostgreSQL database instance. Exact console menu labels vary by
provider release — **[assumption]** the current Railway console supports
"New Project" → deploy from the connected GitHub repo, and "New Database" →
PostgreSQL inside the same project.

Service settings (must match `apps/admin_backend/railway.json`):

| Setting | Value |
| --- | --- |
| Service root directory | `apps/admin_backend` |
| Build | `Dockerfile` (builder `DOCKERFILE`); the managed builders are bypassed deliberately |
| Runtime image | `node:22-slim` |
| Install | `npm ci --include=dev` from the lockfile |
| Build command | `npm run build` inside the image |
| Start command | `npm run start:staging` |
| Health check path | `/api/v1/health` (timeout 300 s) |
| Restart policy | `ON_FAILURE`, max 10 retries |

Connect the public domain `api-staging.nhilospos.com` to the service (Railway
issues a certificate; the exact domain target for DNS is in section 7).

### Environment variables — runtime set (serving process)

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` (exactly; CORS and DB resolution fail closed otherwise) |
| `PORT` | injected by Railway; do not override |
| `DB_HOST` | `<staging DB host from the Railway database variables>` |
| `DB_PORT` | `<staging DB port>` (integer 1–65535) |
| `DB_USERNAME` | `<runtime role name>` (section 4; non-owner, `NOBYPASSRLS`) |
| `DB_PASSWORD` | `<runtime role password — secret>` |
| `DB_DATABASE` | `<staging database name>` (set `DB_NAME` to the same value) |
| `JWT_SECRET` | `<fresh ≥32-byte random staging-only secret>` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | `<non-empty staging values>` |
| `JWT_ALGORITHM` | `HS256` |
| `JWT_ACCESS_TTL_SECONDS` | `3600` |
| `JWT_REFRESH_TTL_SECONDS` | `604800` |
| `JWT_CLOCK_TOLERANCE_SECONDS` | `5` |
| `TOTP_SEED_ENCRYPTION_KEY` | `<fresh staging-only key>` |
| `CORS_ALLOWED_ORIGINS` | `https://soho.nhilospos.com` (exact origin, no trailing slash) |

### Environment variables — migration-credential set

| Variable | Value |
| --- | --- |
| `DB_MIGRATION_USERNAME` | `<migration-owner role name>` (section 4; owns schema objects) |
| `DB_MIGRATION_PASSWORD` | `<migration-owner password — secret>` |

Both roles share `DB_HOST`, `DB_PORT`, `DB_DATABASE`. In production mode the
migration runner never falls back to the runtime credentials and the serving
API never falls back to local defaults: a missing or blank required variable
aborts startup with a nonzero exit before any connection is attempted. Error
messages name variables only, never values.

## 4. PostgreSQL role provisioning SQL

Run once against the staging database as an administrator (e.g. the Railway
Postgres `postgres` superuser, via the provider's query interface). This SQL
is standard PostgreSQL; provider query-tool availability is
**[assumption]**.

**Precondition:** before running any statement below, confirm you are
connected to the staging database (check `DB_HOST`/`DB_DATABASE` or the
provider console's database selector). These statements mutate roles and
default privileges: if the target is not the staging database, **abort and
reconnect** — do not run any statement.

```sql
-- Replace placeholders; choose names that make the roles' purpose obvious.
CREATE ROLE <migration_owner_role> LOGIN PASSWORD '<migration-owner password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

CREATE ROLE <runtime_role> LOGIN PASSWORD '<runtime password>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

-- The migration owner creates and owns schema objects (tables, sequences,
-- types, RLS policies). Grant it schema usage and create rights.
GRANT USAGE, CREATE ON SCHEMA public TO <migration_owner_role>;

-- The runtime role needs usage plus DML and sequence privileges on existing
-- objects (adjust if the API uses a non-default schema).
GRANT USAGE ON SCHEMA public TO <runtime_role>;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO <runtime_role>;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <runtime_role>;

-- Default privileges: tables/sequences created later by the migration owner
-- (i.e. by migrations) are automatically usable by the runtime role.
ALTER DEFAULT PRIVILEGES FOR ROLE <migration_owner_role> IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO <runtime_role>;
ALTER DEFAULT PRIVILEGES FOR ROLE <migration_owner_role> IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO <runtime_role>;

-- The TypeORM migrations ledger (`migrations`) is owned by the migration
-- owner and records applied migrations; the runtime role must never write
-- it (a tampered ledger breaks migration integrity checks).
-- ORDERING HAZARD: this statement only covers a database that ALREADY has
-- the ledger (re-provisioning). On a fresh database it fails with
-- `relation "migrations" does not exist` (skip it on first provisioning);
-- it cannot revoke privileges on a table that migrations have not created
-- yet, and the ALTER DEFAULT PRIVILEGES statements above will grant the
-- runtime role DML on the ledger the moment the first migration creates it.
-- The effective control is the mandatory post-migration revocation and
-- verification in section 5.2.
REVOKE INSERT, UPDATE, DELETE ON migrations FROM <runtime_role>;

-- Hardening: only the migration owner may create objects in `public`.
-- (PostgreSQL 15+ already revokes CREATE ON SCHEMA public from PUBLIC, so
-- this is a no-op there; it is a required fix on older servers and is kept
-- explicit for both.)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Extensions are infrastructure, not schema: creating one needs superuser, so
-- the migration role must never be asked to. Install it here, during
-- provisioning, and the migration's guarded CREATE EXTENSION becomes a no-op.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Do not skip the extension step. Without it the deploy fails during migration
with `permission denied to create extension "uuid-ossp"`, because
`omnifood_migration` is deliberately not a superuser. That failure is the
role separation working as designed, not a configuration bug.

**Invariant:** the runtime role must never be the table owner. Owners bypass
RLS unless `FORCE` is set, and every table here is forced — but ownership by
the runtime role would still let it alter the schema and is prohibited by the
role-separation contract in `apps/admin_backend/docs/staging-environment.md`.
Tables are created by migrations running as the migration owner.

## 5. Migration execution

### 5.1 Tenant and user provisioning (before the smoke tests)

Section 9 requires a successful login and section 8.5 requires two tenant
IDs, so provision at least two staging tenants (each with its owner user)
before verification. Both scripts boot the Nest application context, so the
database is resolved from the section 3 environment variables — they must be
run from `apps/admin_backend` with the **staging** database variables
exported. They differ in how they take input: `npm run provision` is
**interactive** (it prompts for every value), while
`npm run seed:onboarding-founder-pilot` is **non-interactive** (it reads its
credentials from the environment; nothing is prompted). Both must target the
staging database; stop immediately if the connection target does not resolve
to staging.

```bash
npm run provision                     # INTERACTIVE — prompts for: tenant name,
                                      # RUC (optional), owner name, owner email,
                                      # initial password, initial PIN
npm run seed:onboarding-founder-pilot # NON-INTERACTIVE — seeds the founder-pilot
                                      # onboarding fixture; reads
                                      # ONBOARDING_FOUNDER_OWNER_PASSWORD and
                                      # ONBOARDING_FOUNDER_OWNER_PIN from the
                                      # environment and, when either is unset,
                                      # falls back to a freshly generated random
                                      # value. Export both explicitly (fresh
                                      # staging-only values) so the owner
                                      # credentials are known to the operator.
```

`<operator input: two staging tenant names plus owner emails/passwords/PINs —
fresh staging-only values, never reused from production>`. After provisioning,
confirm with a read-only query against the staging database that both tenant
IDs you will use in section 8.5 exist and are non-empty.

### 5.2 Running migrations

- **The migration set builds the schema from nothing.** A bootstrap group at
  `1759000000001`–`1759000000005` creates the identity, inventory, sales and
  loyalty base tables plus the `uuid-ossp` extension. Those tables previously
  had no creating migration at all, and existed only because older
  environments were provisioned with `synchronize` or a hand-run SQL file. If
  a new environment fails with `relation "..." does not exist` during
  migration, this bootstrap did not run.
- **Prove it before deploying.** From `apps/admin_backend`:

  ```bash
  bash scripts/verify-schema-build.sh
  ```

  It builds the whole schema on a scratch database, checks every table and
  column the entities declare, and then repeats the run with a partial ledger
  to prove re-application is safe. Set `SCHEMA_CHECK_DB` to a name ending in
  `_schema_build_test` or `_scratch`; the script refuses anything else so it
  cannot be pointed at a real database. It also runs in CI.
- `npm run start:staging` (the Railway start command) runs
  `npm run migration:run:prod` — the TypeORM CLI against compiled
  `dist/data-source.js` using the migration-owner credentials — **before**
  starting `node dist/main`. A migration failure exits nonzero, which fails
  the deploy and keeps the previous healthy deployment serving.
- To run migrations separately (e.g. before switching traffic), execute the
  same script in the service environment with the same variables:
  `npm run migration:run:prod`. The exact mechanism for a one-off run inside
  Railway (shell/one-off command) is provider-dependent and **[unverified]**;
  whatever path is used must carry the full variable set above.
- **Rule:** migrations must never target an unintended database. Always
  verify `DB_HOST`/`DB_DATABASE` resolve to the staging database before
  running any migration command. This project's history includes an incident
  where a migration runner hit the wrong local database; the production
  contract now fails closed (role-aware credential resolution aborts startup
  on missing variables and never defaults), but operator discipline is still
  required.
- **Post-migration ledger revocation (mandatory after the first migration
  execution):** the section 4 `ALTER DEFAULT PRIVILEGES` grants give the
  runtime role DML on every table the migration owner creates — including
  the TypeORM ledger `migrations` — and the early
  `REVOKE ... ON migrations` cannot cover a fresh database, because the
  table does not exist until the first migration run creates it. After the
  first successful `npm run migration:run:prod` (whether via the deploy's
  start command or a separate run), execute once as the administrator:

  ```sql
  REVOKE INSERT, UPDATE, DELETE ON migrations FROM <runtime_role>;
  ```

  Then verify the revocation took effect — filter to the write privileges
  (the `SELECT` grant from `ALTER DEFAULT PRIVILEGES` legitimately remains;
  a `SELECT` row is not a finding, the ledger stays readable) and expect
  **zero rows**:

  ```sql
  SELECT grantee, privilege_type
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND table_name = 'migrations'
    AND grantee = '<runtime_role>'
    AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE');
  ```

## 6. Cloudflare Pages dashboard

Create a Pages project connected to the same GitHub repository. Settings:

| Setting | Value |
| --- | --- |
| Production branch | the staging branch (`chore/staging-deployment` or its merge target — operator choice, **[unverified]**) |
| Root directory (advanced) | `apps/owner_dashboard` |
| Build command | `pnpm install --frozen-lockfile && pnpm --filter owner_dashboard build` |
| Build output directory | `dist` (relative to the root directory) |
| `VITE_API_URL` | `https://api-staging.nhilospos.com` (origin only — no path, no `/api` suffix; `src/lib/api-base-url.ts` validates and fails fast) |
| `NODE_VERSION` | pin to the repo-supported Node major if the Pages default drifts |

`VITE_*` values are baked at build time; changing them requires a redeploy.

Deployed static files (already in `apps/owner_dashboard/public/`, copied
byte-identically to `dist`):

- `_redirects` — `/* /index.html 200`: SPA fallback so `/login` and deep
  links survive a page reload.
- `_headers` — security headers for every response, including a CSP whose
  `connect-src` allows `'self'` and `https://api-staging.nhilospos.com`.

**Preview-branch caution:** every preview deployment bakes the same
project-level `VITE_API_URL`, so **every preview host talks to the staging
API**. Do not treat preview hosts as trusted origins, and disable automatic
previews for branches not meant to deploy.

## 7. DNS

Create in the `nhilospos.com` zone:

| Record | Type | Target | Proxy |
| --- | --- | --- | --- |
| `api-staging` | `CNAME` | `<Railway-provided domain target for the API service>` | Per operator choice (see below) |
| `soho` | `CNAME` | `<Pages-assigned target, e.g. <project>.pages.dev>` | Proxied (Cloudflare default for Pages) |

- The Railway-provided CNAME target is shown by Railway when the custom
  domain is attached to the service; copy it exactly. **[unverified]** value.
- API proxying: Cloudflare proxy (orange cloud) in front of the API is
  optional. If proxied, verify the health check and browser calls work
  through Cloudflare; if DNS-only (grey cloud), the Railway certificate
  terminates TLS directly. Either way the API must be reachable at
  `https://api-staging.nhilospos.com` before the dashboard checks run.
  **[unverified]** which mode was chosen.
- The dashboard origin in DNS must match `CORS_ALLOWED_ORIGINS` exactly:
  `https://soho.nhilospos.com`. A redirect chain or a different origin
  (trailing slash, `www`, another subdomain) will be rejected by the CORS
  allowlist, which fails closed in production mode.

## 8. RLS and tenant-isolation verification

Run every check below against the staging database and record the output as
evidence in `odd/tasks/staging-deployment.md`. All items are **pending
evidence until executed**.

8.1 **Role attributes** — both roles deny the dangerous attributes:

```sql
SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolinherit,
       rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolname IN ('<migration_owner_role>', '<runtime_role>');
```

Expect: `rolsuper = f`, `rolcreatedb = f`, `rolcreaterole = f`,
`rolinherit = f`, `rolbypassrls = f` for both; `rolcanlogin = t`.

Also confirm the runtime role is not a member of any owning or BYPASSRLS
role (membership would silently widen its privileges):

```sql
SELECT r.rolname AS member, g.rolname AS granted_role
FROM pg_auth_members m
JOIN pg_roles r ON r.oid = m.member
JOIN pg_roles g ON g.oid = m.roleid
WHERE r.rolname = '<runtime_role>';
```

Expect: **zero rows**. Any row naming the migration owner, the `postgres`
administrator, or a role with `rolsuper`/`rolbypassrls = t` is a failure —
remove the grant before proceeding.

8.2 **Table ownership** — no table in the five-table set is owned by the
runtime role:

```sql
SELECT c.relname, r.rolname AS owner
FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
WHERE c.relname IN ('onboarding_activation_attempts',
  'onboarding_activation_check_results', 'onboarding_activation_follow_ups',
  'onboarding_telemetry_events', 'fiscal_config_revisions');
```

Expect: owner is `<migration_owner_role>` for all five.

8.3 **RLS flags** — every table is both enabled and forced:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('onboarding_activation_attempts',
  'onboarding_activation_check_results', 'onboarding_activation_follow_ups',
  'onboarding_telemetry_events', 'fiscal_config_revisions');
```

Expect: `t` / `t` on all five rows (migration
`1809000000001-EnforceOnboardingFiscalTenantRls` applied).

8.4 **Policies** — exactly four permissive policies per table, one per
command:

```sql
SELECT tablename, policyname, cmd, permissive, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
 AND tablename IN ('onboarding_activation_attempts',
  'onboarding_activation_check_results', 'onboarding_activation_follow_ups',
  'onboarding_telemetry_events', 'fiscal_config_revisions')
ORDER BY tablename, cmd;
```

Expect: 20 rows; per table, `select`/`insert`/`update`/`delete` policies
named `<table>_tenant_<command>`, all `permissive = PERMISSIVE`.

The `qual` and `with_check` columns are mandatory evidence, not optional
output: the behavioral probes in 8.5–8.8 exercise only
`onboarding_telemetry_events`, so this inspection is the only check that the
tenant predicate (`tenant_id = current_setting('app.tenant_id', true)` — a
USING predicate on every command, plus a WITH CHECK on `insert` and
`update`) is actually present on **all five tables**. A missing or altered
expression in any row is a failure even if every probe below is green.

8.5 **Two-tenant probe** — first establish the baseline as the administrator
superuser (a superuser bypasses RLS, so this is the only trusted way to see
all rows; the migration owner is `NOBYPASSRLS` and subject to `FORCE`, and
the runtime role cannot see cross-tenant rows by design — both would give a
false baseline):

```sql
SELECT tenant_id, count(*) FROM onboarding_telemetry_events
GROUP BY tenant_id ORDER BY tenant_id;
```

Expect exactly two rows: `(<tenant-A-id>, <count-A>)` and
`(<tenant-B-id>, <count-B>)`, **both counts > 0** (populated in section 5.1).
Record the counts. A missing row or a zero count means the seed data is not
there — fix that first, otherwise the probe below would pass against an
empty table.

Then, as the runtime role, list distinct tenant IDs per probe — `count(*)`
alone cannot show *whose* rows are visible, only how many:

```sql
SET ROLE <runtime_role>;
BEGIN;
SELECT set_config('app.tenant_id', '<tenant-A-id>', true);
SELECT tenant_id, count(*) FROM onboarding_telemetry_events
GROUP BY tenant_id;
-- Expect exactly one row: (<tenant-A-id>, <count-A>) — the recorded
-- baseline count. No tenant-B row may appear.
SELECT set_config('app.tenant_id', '<tenant-B-id>', true);
SELECT tenant_id, count(*) FROM onboarding_telemetry_events
GROUP BY tenant_id;
-- Expect exactly one row: (<tenant-B-id>, <count-B>) — the recorded
-- baseline count. No tenant-A row may appear.
ROLLBACK;
RESET ROLE;
```

Failure means isolation is broken: any row whose `tenant_id` is not the
currently set tenant, any second row, or any count differing from the
baseline.

**Scope note:** this read probe exercises only `onboarding_telemetry_events`.
A green result here is not proof for the other four tables — their isolation
rests on the 8.4 policy-expression inspection, which must show the tenant
predicate on every policy of all five tables.

8.6 **Unbound-session probe** — same `BEGIN`/`ROLLBACK` setup as 8.5, but
never set `app.tenant_id`: every count must return **0** (the missing setting
resolves to NULL under `current_setting(..., true)` and the text predicate
denies access).

8.7 **Empty-string tenant probe** — an empty string never equals a real
tenant id, so the count must be 0. The setting is transaction-local (third
argument `true`), so it **must** be made inside the same explicit
transaction as the read; a bare autocommit `set_config` is discarded before
the next statement and would make this check a no-op that passes even if
isolation is broken:

```sql
SET ROLE <runtime_role>;
BEGIN;
SELECT set_config('app.tenant_id', '', true);
SELECT tenant_id, count(*) FROM onboarding_telemetry_events
GROUP BY tenant_id;
-- Expect zero rows returned.
ROLLBACK;
RESET ROLE;
```

8.8 **Write-path probe** — every probe above exercises `SELECT` only, so a
broken `INSERT`, `UPDATE`, or `DELETE` policy would pass all of them while
still failing the customer-access gate. Close the write path as the runtime
role, bound to tenant A. Each expected-rejection statement runs inside its
own savepoint so one failure does not abort the rest of the transaction, and
the closing `ROLLBACK` undoes everything, so **no probe data persists even if
a check unexpectedly succeeds**:

```sql
SET ROLE <runtime_role>;
BEGIN;
SELECT set_config('app.tenant_id', '<tenant-A-id>', true);

-- (a) INSERT carrying a foreign tenant_id must be rejected:
SAVEPOINT insert_probe;
INSERT INTO onboarding_telemetry_events (tenant_id, event_name, occurred_at)
VALUES ('<tenant-B-id>', 'ONBOARDING_STARTED', now());
ROLLBACK TO insert_probe;
-- Expect: ERROR: new row violates row-level security policy for table
-- "onboarding_telemetry_events" (SQLSTATE 42501). Any success
-- (e.g. `INSERT 0 1`) is a gate failure.

-- (b) UPDATE moving a tenant-A row to a foreign tenant_id must be rejected:
SAVEPOINT update_probe;
UPDATE onboarding_telemetry_events
SET tenant_id = '<tenant-B-id>'
WHERE tenant_id = '<tenant-A-id>';
ROLLBACK TO update_probe;
-- Expect: the same row-level security policy violation (SQLSTATE 42501);
-- the update policy's WITH CHECK rejects moving a row out of the tenant.
-- Any success (`UPDATE <n>` with n > 0) is a gate failure.

-- (c) DELETE must not be able to affect a foreign tenant's rows:
DELETE FROM onboarding_telemetry_events WHERE tenant_id = '<tenant-B-id>';
-- Expect: `DELETE 0` — no error; the delete policy's USING predicate makes
-- tenant-B rows invisible, so nothing matches. Any count > 0 is a gate
-- failure.

ROLLBACK;
RESET ROLE;
```

Distinguish the expected RLS rejection from a plain privilege error: the
message must say **violates row-level security policy** (SQLSTATE 42501).
`ERROR: permission denied for table ...` — also SQLSTATE 42501 — means the
section 4 DML grants are missing, not that RLS is enforcing isolation; fix
the grants before judging this probe. Afterwards, re-run the 8.5 baseline
query as the administrator and confirm both recorded counts are unchanged.

**Scope note:** every statement in (a)–(c) targets
`onboarding_telemetry_events` only. The INSERT/UPDATE/DELETE gates on the
other four tables are covered by the 8.4 expression inspection, not by this
probe — do not read a green write-path probe as proof for all five tables.

8.9 **Pooled-connection check** — drive one authenticated read through the
deployed API for each tenant and compare the output to the 8.5 baseline, so
the check can actually fail instead of resting on a visual impression.
Because TypeORM pools connections, this proves the transaction-local
`set_config('app.tenant_id', ..., true)` binding resets correctly across
pooled connections.

Log in once per tenant with fresh credentials from section 5.1 (never reuse
a token across tenants):

```bash
curl -s -X POST https://api-staging.nhilospos.com/api/identity/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "<tenant-A owner email>", "pass": "<tenant-A owner password>"}'
# Response body includes "access_token" — copy it. Repeat for tenant B with
# the tenant-B owner credentials.
```

Then, once per tenant with that tenant's own token:

```bash
curl -s https://api-staging.nhilospos.com/api/onboarding/telemetry/events \
  -H "Authorization: Bearer <access_token from that tenant's login>" \
  | jq '{tenants: ([.[].tenantId] | unique), count: length}'
```

`GET /api/onboarding/telemetry/events` returns a JSON array whose items
carry `tenantId` (`onboarding-telemetry.service.ts` → `getEventsByTenant`).
Expected, for each tenant's call:

- tenant A: `{"tenants": ["<tenant-A-id>"], "count": <count-A>}` — exactly
  one tenant ID and the recorded 8.5 baseline count;
- tenant B: `{"tenants": ["<tenant-B-id>"], "count": <count-B>}` — likewise.

Failure: any response listing a second tenant ID, any tenant ID that is not
the logged-in tenant's, or a count differing from the recorded baseline. A
count of 0 means the seed data or the endpoint is broken — fix before
granting access.

**Verified against the deployed API.** Sixteen reads were alternated between
two tenants over eight rounds so the same pooled connection served both. Every
read returned exactly one tenant ID and it was always the caller's own; no read
listed a second tenant; and both counts stayed constant across all sixteen
reads, which is what rules out a second tenant inheriting the first one's
context. A single interleaved read would not have been enough: the point is
repetition across a reused connection, not one successful call.

## 9. Smoke test checklist

- [ ] `GET https://api-staging.nhilospos.com/api/v1/health` returns a healthy response. Note: this endpoint returns a **static payload** (`{ status, timestamp }`) and **does not touch the database** — a green health check proves the process is up, not that the database or RLS are ready. Database and isolation readiness is proven only by the section 8 probes and the authenticated read below.
- [ ] Login succeeds from `https://soho.nhilospos.com` (no CORS errors in the browser console).
- [ ] An authenticated read (any tenant-scoped list) returns expected data.
- [ ] Browser deep links: load `/login` and other client routes directly and reload them; the `_redirects` SPA fallback resolves them to the app.

## 10. Offline-first POS note

The POS app keeps local SQLite as the **source of truth** and must keep
selling with the WAN down; the cloud is an eventually consistent mirror.
Staging is **not** an availability dependency for the POS: a staging or
cloud outage must never block in-store operation. This cutover does not
change any POS or fiscal behavior.

## 11. Rollback

- **Application revision:** roll the Railway service back to the previous
  healthy deployment from the Railway console (deploy history). The health
  check plus `ON_FAILURE` restart policy keep a bad deploy from replacing a
  healthy one automatically.
- **Migration down path:** the reviewed down migration
  (`EnforceOnboardingFiscalTenantRls`) drops exactly the four policies per
  table and removes `FORCE` while leaving RLS **enabled**. Consequence:
  with RLS enabled and no policies, the runtime role sees **zero rows** —
  the down path is fail-closed (data becomes inaccessible to the API), never
  exposed. Running it requires the TypeORM revert against
  `dist/data-source.js` with migration-owner credentials; no production
  revert script is defined in `package.json`, so the exact command is
  **[unverified]** and must be validated before rehearsal.
- **Cloudflare Pages:** roll back to a previous deployment from the Pages
  project's deployment history. `VITE_API_URL` is baked per build, so a
  rollback restores the API origin that build was compiled with.

## 12. Customer access gate

Grant SOHO access only when **every** item is green:

- [ ] Railway service deployed and healthy (`/api/v1/health`). Note: the health endpoint is a static payload and does not touch the database, so this item alone is **not** evidence of database or RLS readiness — the next item is the only isolation evidence.
- [ ] All 8.x RLS/tenant-isolation checks executed and passed, evidence recorded.
- [ ] Section 9 smoke tests all pass from `https://soho.nhilospos.com`.
- [ ] Runtime role confirmed non-owner, `NOBYPASSRLS`, never used for migrations.
- [ ] Staging secrets generated fresh; no production credentials anywhere in staging.
- [ ] Rollback rehearsed or explicitly accepted as rehearsable.

**Known open items / unproven claims:** live RLS row filtering, index usage
under the text predicate, and the two-tenant probe are unproven without
staging PostgreSQL (Task 6 carried them here); the pooled-connection probe
(8.9) is now verified; no backup/restore rehearsal has been performed.

## 13. Known limitations

- **No production readiness:** this is a staging pilot; no production
  deployment, migration, or cutover is covered.
- **No hardware proof:** POS hardware verification (printers, scanners,
  Sunmi devices) is out of scope.
- **No load evidence:** no load testing or capacity measurement was run.
- **Backup/R2 automation deferred:** no automated staging backups or R2
  object-storage lifecycle is configured in this task.
- **Open follow-ups:** `TenantContextRequiredError` is a plain `Error`, so a
  blank tenant on a future controller path would surface as HTTP 500 rather
  than 400; no `.db.spec.ts` covers the RLS migration; `tenant_id` columns
  have no non-empty CHECK constraint; the sale observer has no production
  caller yet.
