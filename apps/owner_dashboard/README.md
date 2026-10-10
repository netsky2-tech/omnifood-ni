# React + TypeScript + Vite

## Test suites

Suite-layout rule (issue #830): `.live.test.ts` is the only runner-significant
suffix in `src/__tests__` — a `*.live.test.ts` file needs the real backend on
`127.0.0.1:3300` and runs **only** via `npm run test:integration`.

| Suite kind | Files | Command | Needs a server? |
| --- | --- | --- | --- |
| Unit | `src/__tests__/*` except the live suites | `npm test` | No |
| Contract (mocked fetch, e.g. `w1-api.contract.test.ts`, `w5-api.contract.test.ts`) | `src/__tests__/*.contract.test.ts` and friends | `npm test` | No |
| Live (needs the real backend on `127.0.0.1:3300`: `w1.live.test.ts`, `w4-fiscal.live.test.ts`, `modifiers.live.test.ts`) | `src/__tests__/*.live.test.ts` | `npm run test:integration` | Yes — NestJS shadow stack on :3300 |
| Playwright static (browser, mocked API) | `e2e/*.spec.ts`, `*.live.spec.ts` ignored by `testIgnore` | `npm run test:e2e` | No |
| Playwright live (browser + real backend) | `e2e/*.live.spec.ts` | `npm run test:e2e:live` (screenshots: `npm run test:e2e:capture`) | Yes — :3300 + dev server on :5174 |

### Manual capture (`e2e/manual-screenshots.live.spec.ts`, issue #839)

The operation-manual screenshots are captured with:

```bash
npm run test:e2e:capture
```

This path runs against the REAL `soho` tenant — **not** the
`soho-test-fixture` tenant used by the automated live suites: the walkthrough
data it navigates by (`CAFÉ CALIENTE`, `Americano 12oz`, exactly 3 active
modifier groups) only exists in `soho`. Environment variables:

| Variable | Role |
| --- | --- |
| `NHILOS_MANUAL_CAPTURE` | Opt-in gate, must be `1` (own gate, not `NHILOS_LIVE_E2E`) |
| `MANUAL_E2E_BASE_URL` | Optional web origin; default `http://soho.localhost:5174` |
| `MANUAL_E2E_EMAIL` | Optional login email; default `admin@soho.com` |
| `MANUAL_E2E_PASS` | **Required** — the tenant credential, read from the environment only; unset/blank fails before the first navigation |

**No network suite runs in `npm test`**: the default unit run excludes every
`*.live.test.ts` file (see `vitest.config.ts`), and the guard
`src/__tests__/suite-layout.test.ts` fails if a live suite is added without
joining the live runner.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
