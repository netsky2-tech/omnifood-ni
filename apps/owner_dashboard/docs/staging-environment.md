# Owner Dashboard — Cloudflare Pages Staging Environment Contract

This document is the deployment contract for the owner dashboard staging
environment. It contains no secrets. Scope: the staging deployment of
`apps/owner_dashboard` only.

## Deploy targets

| Concern | Value |
| --- | --- |
| Dashboard hostname (production branch) | `https://soho.nhilospos.com` |
| API origin (`VITE_API_URL`) | `https://api-staging.nhilospos.com` |
| Effective API base used by the app | `https://api-staging.nhilospos.com/api` (appended by `src/lib/api-base-url.ts`, exactly once) |

Backend dependency: the staging API must allow CORS for
`https://soho.nhilospos.com` (backend Task 1).

## Cloudflare Pages build settings

| Setting | Value |
| --- | --- |
| Root directory (Pages "Root directory" advanced setting) | `apps/owner_dashboard` |
| Build command | `pnpm install --frozen-lockfile --ignore-scripts && pnpm --filter owner_dashboard build` |
| Build output directory | `dist` (relative to the root directory, i.e. `apps/owner_dashboard/dist`) |

Notes:

- **The `--ignore-scripts` flag is mandatory, not stylistic.** The repository's
  root `.npmrc` already sets `ignore-scripts=true` to block lifecycle scripts as
  supply-chain protection, but the Cloudflare build does not always pick that
  file up. `react-hook-form@7.87.0` ships a `"prepare": "husky"` script in its
  published manifest — an upstream packaging mistake — so an install that runs
  lifecycle scripts fails with `sh: 1: husky: not found`. Passing the flag on
  the command line makes the build immune to `.npmrc` resolution.
- The repository is a pnpm workspace (`pnpm-workspace.yaml`, lockfile at the
  repository root). When Pages runs the build command inside
  `apps/owner_dashboard`, pnpm resolves the workspace root upward and installs
  from the root lockfile; `--frozen-lockfile` guarantees the build uses
  committed dependency versions.
- If the Pages build runner cannot locate the workspace, keep the root
  directory unchanged and re-run the build from the repository root with
  `pnpm --filter owner_dashboard build` as an alternative (output stays
  `apps/owner_dashboard/dist`).
- Node.js: the workspace declares `packageManager: pnpm@11.22.0`; pin the
  Pages environment variable `NODE_VERSION` to the repo-supported Node major
  if the default drifts.

## Environment variables (build-time)

| Variable | Value | Rules |
| --- | --- | --- |
| `VITE_API_URL` | `https://api-staging.nhilospos.com` | API **origin only**: absolute http(s), no path, no trailing path such as `/api`, no credentials, no query, no fragment. `src/lib/api-base-url.ts` validates this at runtime and fails fast with a message that never echoes the value. |

`VITE_*` variables are baked into the bundle at build time. Changing the
value requires a rebuild/redeploy to take effect; runtime overrides are not
possible by design.

## SPA fallback and headers (deployed files)

- `public/_redirects` — `/* /index.html 200`: required so client-side routes
  (for example `/login`, deep links) resolve to the app on page reload.
- `public/_headers` — conservative security headers for all deployed
  responses. The CSP `connect-src` permits `'self'` and
  `https://api-staging.nhilospos.com`; styles/fonts permit Google Fonts
  because `index.html` loads Inter from `fonts.googleapis.com`.

## Preview branch caution

- Any preview deployment of this Pages project bakes the same project-level
  `VITE_API_URL`, so **every preview host talks to the staging API**. Do not
  point preview deployments at production data, and do not raise preview
  hosts to trusted origins anywhere.
- Restrict the Pages production branch to the staging branch; prefer
  branch-scoped environment variables if a future branch must target a
  different API, and disable automatic previews for branches that are not
  meant to deploy.
- Hostname is context only. Tenant authorization is enforced by the backend
  from the JWT `tenant_id`; nothing in the dashboard or the Pages layer may
  treat the hostname as an authorization signal.

## Local development

- No `VITE_API_URL` is required. The Vite dev server proxies `/api` to
  `http://localhost:3000`, and `getApiBaseUrl()` defaults to the relative
  `/api` base when the variable is absent.
- Local development does not depend on the deployed `_headers`/`_redirects`:
  those files are applied by Cloudflare Pages only.
