# Staging Environment Contract (Railway)

Non-secret environment contract for running `apps/admin_backend` on Railway
staging. Values live in the Railway service variables — never in this
repository. `.env` files are never committed and never copied.

## Service layout

- Service root directory: `apps/admin_backend`
- Build: `Dockerfile` in the service root (builder `DOCKERFILE`, see
  `railway.json`). The managed builders are bypassed deliberately: they
  selected Node 18 for this workspace and could not remove a cached
  `node_modules` directory during `npm ci`. The image pins `node:22-slim` and
  installs with `npm ci --include=dev` — the explicit `--include=dev` matters
  because a `NODE_ENV=production` service variable is present at build time
  and would otherwise omit the toolchain that `npm run build` needs.
- Start: `npm run start:staging` — runs migrations against the compiled
  `dist/data-source.js` via the TypeORM CLI, then `node dist/main`.
- Bind: `0.0.0.0:${PORT}` (Railway injects `PORT`)
- Health check: `GET /api/v1/health` (path configured in `railway.json`)
- Public API origin (staging): `https://api-staging.nhilospos.com`

## Required variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | Must be exactly `production` on Railway staging (the JWT config accepts only `development`\|`test`\|`production`, and CORS fails closed on `production`). |
| `PORT` | Listen port | Injected by Railway; the app binds `0.0.0.0:$PORT`. |
| `DB_HOST` | PostgreSQL host | Railway staging database host (e.g. a `postgres.railway.internal` host or proxy host). |
| `DB_PORT` | PostgreSQL port | Usually `5432` (Railway may expose a different proxy port). In production it must be an integer between 1 and 65535. |
| `DB_USERNAME` | PostgreSQL runtime role | Serving (non-owner) role used by the API process. Must be provisioned `NOSUPERUSER`, `NOBYPASSRLS` so tenant RLS cannot be bypassed; it does not own schema objects. Never reuse it for migrations. |
| `DB_PASSWORD` | PostgreSQL password | Staging secret for the runtime role. Required by the serving process in every environment. |
| `DB_DATABASE` | Database name | Staging database. (`DB_NAME` is also read by some scripts; set both to the same value.) |
| `DB_MIGRATION_USERNAME` | PostgreSQL migration-owner role | Required in production (`NODE_ENV=production`). Owns schema objects (tables, types, RLS policies) and is used only by the migration runner before serving. Never the runtime role. |
| `DB_MIGRATION_PASSWORD` | PostgreSQL migration-owner password | Staging secret for the migration-owner role. Required in production. |
| `JWT_SECRET` | Token signing secret | Required at boot; minimum 32 bytes, rejected if trivial/published (see `identity-jwt.config.ts`). Long random staging-only value. |
| `JWT_ISSUER` | JWT issuer claim | Required at boot by the identity JWT config (non-empty). |
| `JWT_AUDIENCE` | JWT audience claim | Required at boot by the identity JWT config (non-empty). |
| `TOTP_SEED_ENCRYPTION_KEY` | TOTP seed encryption | Required for TOTP-backed auth flows. |
| `CORS_ALLOWED_ORIGINS` | Browser CORS allowlist | Comma-separated exact origins. Staging: `https://soho.nhilospos.com`. Required because staging runs with `NODE_ENV=production`. |

## Conditional variables

| Variable | Purpose | Notes |
| --- | --- | --- |
| `JWT_ALGORITHM` | JWT signing algorithm | Required at boot; must be exactly `HS256`. |
| `JWT_ACCESS_TTL_SECONDS` | Access token lifetime | Required at boot; must be exactly `3600`. |
| `JWT_REFRESH_TTL_SECONDS` | Refresh token lifetime | Required at boot; must be exactly `604800`. |
| `JWT_CLOCK_TOLERANCE_SECONDS` | Clock skew tolerance | Required at boot; must be exactly `5`. |
| `DB_NAME` | Database name alias | Some scripts read `DB_NAME`; keep it equal to `DB_DATABASE`. |
| `PROVISION_TENANT_NAME` / `PROVISION_TENANT_RUC` / `PROVISION_OWNER_EMAIL` / `PROVISION_OWNER_NAME` / `PROVISION_OWNER_PIN` / `PROVISION_OWNER_PASS` | One-off tenant provisioning script inputs | Only for the explicit provisioning script (`npm run provision`), not for the serving process. |

## CORS contract

- The API sets an explicit origin allowlist; wildcard and permissive origins
  (`origin: true`, `*`) are rejected by configuration validation.
- `NODE_ENV=production` **fails closed**: startup aborts (exit code 1) when
  `CORS_ALLOWED_ORIGINS` is missing, blank, malformed, or contains a non-https
  origin.
- Entries must be exact origins: `scheme://host[:port]` — no paths, query
  strings, credentials, or wildcards. Trailing slashes are not origins.
- Non-production environments default to the local dashboard dev origins
  (`http://localhost:5173`, `http://127.0.0.1:5173`).
- The allowlist only controls which browser origins may call the API. It is
  **not** an authorization boundary: tenant isolation is enforced server-side
  from the JWT `tenant_id` claim.

## Database role separation

- The database uses two roles with different privileges:
  - **Runtime role** (`DB_USERNAME`/`DB_PASSWORD`): serves API traffic.
    Created as a non-owner with `NOSUPERUSER` and `NOBYPASSRLS`, so it can
    never bypass tenant row-level security or alter the schema.
  - **Migration role** (`DB_MIGRATION_USERNAME`/`DB_MIGRATION_PASSWORD`):
    owns schema objects and runs only during the migration phase of a
    deploy.
- Connection resolution is role-aware and fail-closed in production:
  - The migration runner (`dist/data-source.js`) resolves the
    migration-owner credentials plus shared `DB_HOST`, `DB_PORT`, and
    `DB_DATABASE`. It never falls back to `DB_USERNAME`/`DB_PASSWORD` in
    production.
  - The serving API resolves the runtime credentials plus the same shared
    variables. It never defaults to `postgres`/`omnifood` in production.
- Under `NODE_ENV=production`, if any variable required by the requested
  role is absent or blank, or `DB_PORT` is not an integer between 1 and
  65535, resolution throws before the `DataSource` is constructed and
  before any connection is attempted, aborting startup with a nonzero exit.
- Outside production, both roles keep the historical local defaults
  (`127.0.0.1` / `5432` / `postgres` / `omnifood`), and the migration role
  may fall back to `DB_USERNAME`/`DB_PASSWORD` for local development
  convenience.

## Migration behavior

- `npm run start:staging` executes pending migrations **before** serving
  traffic, using compiled JavaScript only (no `ts-node` in production).
- Under `NODE_ENV=production`, connection options for `dist/data-source.js`
  are resolved **before the `DataSource` is constructed and before any
  connection is attempted** with the role-aware fail-closed contract
  described above.
- Configuration errors name the offending variables only — values are never
  printed to logs.
- The TypeORM CLI exits nonzero on connection or migration failure, which
  fails the Railway deploy and keeps the previous healthy deployment.
- Migrations discovered from `dist/migrations` (spec files are excluded from
  the build).

## Explicitly non-secret

This document intentionally contains no passwords, keys, seeds, connection
strings with credentials, or Railway project identifiers. Every secret above
is referenced by variable name only.
