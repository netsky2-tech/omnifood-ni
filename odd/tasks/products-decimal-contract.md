# Products decimal contract and error-boundary reset

**Trigger:** staging pilot report — after applying the CAFETERIA onboarding template, the owner
dashboard Products page renders `Error al cargar esta sección / e.sellPrice.toFixed is not a
function`, and the error overlay survives navigation until a full page reload.

**Branch:** `fix/products-decimal-contract-and-error-reset`
**Base:** `main` @ `52620b59`
**Status:** W1 done and independently verified (`ad72cc14`). W2 done and independently verified
(`8c975561`). W3 done with one reviewer-found gap closed (uncommitted at the time of writing).

## Outcome

`GET /products` (all branches) answers with real JSON numbers for `stock`, `averageCost` and
`sellPrice`; the owner dashboard stops trusting an unvalidated payload shape for those fields; and a
page-level crash stops hijacking the shell on the next navigation.

## Root cause (measured, not assumed)

1. `products.stock` / `averageCost` / `sellPrice` are Postgres `numeric(12,4)` / `numeric(12,2)`
   (`migrations/1759000000002-CreateBootstrapInventorySalesTables.ts:241-243`). node-postgres parses
   `numeric` to a JS **string**, and the `Product` entity declares them as TS `number` with **no**
   TypeORM `transformer` (`entities/product.entity.ts:53-60`). TypeORM's Postgres driver has no
   `decimal` hydration case, so `find` / `getManyAndCount` hand back strings.
   `ProductService` returns the entity unchanged and the controller serializes it as-is, so the wire
   shape is `{"sellPrice":"50.00","stock":"0.0000"}` while `product-types.ts:20` declares
   `sellPrice: number`.
2. `product-page.tsx:128` calls `p.sellPrice.toFixed(2)` → `TypeError` → `ErrorBoundary`.
   Line 131 (`p.stock.toFixed(2)`) is the same defect; it is reached on every product row.
3. The template is **not** the differentiator. The onboarding template
   (`industry-template.service.ts:339-389`) and the dashboard dialog
   (`product.service.ts:159-190`) both write JS numbers into the same `numeric` columns through
   TypeORM and both read them back as strings. Before the template import the tenant had zero
   products, so the page rendered its empty state and never reached `.toFixed`.
4. The terminal syncs correctly because it never uses `GET /products`: it reads
   `inbound-sync.service.ts:426-428`, which coerces with `Number(p.stock)` / `Number(p.averageCost)`
   / `Number(p.sellPrice)`. That is the precedent this fix mirrors. The POS also reads the field
   through `(map['sellPrice'] as num?)?.toDouble() ?? 0.0`
   (`pos_app/lib/data/services/sync_service.dart:1629`), so it would throw on a string payload —
   independent confirmation that the API contract is meant to be numeric.
5. The sticky overlay is a second, independent defect: `ErrorBoundary` is mounted once in the
   layout route element (`app-layout.tsx:66-68`, route `path: "/"` in `router.tsx:48-50`). React
   Router keeps the layout instance mounted across sibling navigation, so `hasError` stays `true`
   and the fallback keeps replacing `<Outlet/>` on every route change until `Reintentar` or reload.

Blast radius of the wire change: `GET/PATCH/POST /products` is consumed by `apps/owner_dashboard`
only (`fetchProducts`, `fetchPaginatedProducts`, `fetchProduct`, `createProduct`, `updateProduct`);
the POS uses the sync endpoints. Backend e2e assertions already normalize with `Number(...)`.

## Decisions taken with the user

- Fix both ends: backend contract (root cause) **and** the dashboard API boundary (so a future
  shape drift cannot brick a screen again).
- Sweep the remaining `.toFixed` call sites fed by API numerics in the same change:
  `inventory-page.tsx:186`, `reward-profit-aware-dialog.tsx:28`.
- Reset the existing single boundary on navigation via a `resetKey`; no per-route boundary rollout.

## Allowed edit surfaces

- `apps/admin_backend/src/modules/inventory/**`
- `apps/admin_backend/test/inventory/**`
- `apps/owner_dashboard/src/lib/numeric.ts` (new)
- `apps/owner_dashboard/src/features/catalog/**`
- `apps/owner_dashboard/src/features/inventory/inventory-page.tsx`
- `apps/owner_dashboard/src/features/loyalty/reward-profit-aware-dialog.tsx`
- `apps/owner_dashboard/src/app/error-boundary.tsx`
- `apps/owner_dashboard/src/app/layout/app-layout.tsx`
- `apps/owner_dashboard/src/__tests__/**`
- `odd/tasks/products-decimal-contract.md`

## Out of scope

- Column-level TypeORM transformers (would change internal entity semantics and the `change_log`
  `from` values).
- Other entities with `decimal` columns (88 declarations repo-wide) and the other backend endpoints
  that already coerce with `Number(...)` ad hoc.
- Onboarding, fiscal, sync, POS and DGI behaviour.
- Redesigning the Products table; the rendered text stays `C$0.00` as today.

## Tasks

### Task 1 — Backend: numeric products response contract

- **Status:** done
- **Goal:** Every `ProductService` response (list, listPaginated, findOne, create, update) carries
  `stock`, `averageCost`, `sellPrice` and `tax_rate` as JSON numbers.
- **In scope:** a pure, unit-testable serializer plus its wiring; DB/e2e assertions that pin the
  numeric type; internal entity semantics and `change_log` payloads unchanged.
- **Acceptance:** a RED unit test fails before the serializer exists; strict DB assertions
  (`expect(res.body.sellPrice).toBe(45)`, not `Number(...)`) pass.
- **Rollback:** revert the task commit; no migration, no persisted shape change.
- **Commits:** `ad72cc14` (`fix(inventory): return product decimals as JSON numbers`)
- **Evidence:** RED observed as `Cannot find module './product-response'`. GREEN: `npx jest
  src/modules/inventory/product-response.spec.ts src/modules/inventory/product.controller.spec.ts`
  → 2 suites, 25/25. DB suite via the canonical path `npm run test:e2e --
  test/inventory/product-routes.db.e2e-spec.ts` → 1 suite, 15/15 against real PostgreSQL.
  Independent verification reproduced both runs and falsified the assertions in an isolated /tmp
  copy: neutralising only `toFiniteNumber` to raw passthrough turned 4 DB cases red with
  `Expected: 45, Received: "45.00"` (plus 8 unit/HTTP cases red), proving the green run is caused
  by the fix and not by the rewritten tests. `tsc --noEmit` reports zero errors in touched files
  (16 pre-existing errors, all in `test/inventory/batch_6b_baseline_validation.spec.ts`).
- **Known gaps:** the DB suite exercises the plain-list, findOne, create and update branches but
  not the paginated branch the dashboard actually calls; that branch is pinned by the falsified
  HTTP spec only. Serialization is pure controller code, so the DB adds no new evidence there.
  `change_log` `from` preservation is structural (`product.service.ts` byte-identical) rather than
  round-trip executed. `npm run test:db` legitimately skips `.db.e2e-spec.ts` files; `npm run
  test:e2e` legitimately covers them.

### Task 2 — Dashboard: numeric normalization at the API boundary and hardened call sites

- **Status:** done
- **Goal:** `Product` values are true numbers at runtime, and no dashboard screen calls a *throwing*
  numeric method on an unvalidated API decimal value.
- **In scope:** `toFiniteNumber` helper, `normalizeProduct` in `product-api.ts` for all five
  endpoints, and the three fragile `.toFixed` call sites.
- **Acceptance:** a RED rendering test that feeds string `sellPrice`/`stock` renders the row and
  never shows the error-boundary text; it fails before the fix.
- **Rollback:** revert the task commit; the backend contract still delivers numbers.
- **Commits:** `8c975561` (`fix(owner_dashboard): normalize product decimals at the API boundary`)
- **Evidence:** RED captured before any source change: `numeric.test.ts` failed to resolve
  `@/lib/numeric`, `w5-api.integration.test.ts` failed 5 cases with `expected 'string' to be
  'number'`, and `products-decimal-contract.test.tsx` failed by rendering the real ErrorBoundary
  fallback with `p.sellPrice.toFixed is not a function` — the reported production crash reproduced
  in a test. GREEN after the fix:
  `npx vitest run src/__tests__/numeric.test.ts src/__tests__/products-decimal-contract.test.tsx
  src/__tests__/w5-api.integration.test.ts src/__tests__/w5-products.test.tsx` → 4 files, 47/47.
  Independent verification reproduced 47/47 and falsified the set in an isolated /tmp copy:
  neutralising `toFiniteNumber` turns 13 tests red, and restoring the original table call sites
  reproduces the production message verbatim (`Error al cargar esta sección` /
  `p.sellPrice.toFixed is not a function`). `npx tsc -b --noEmit` exit 0; `npm run lint` exit 0.
- **Known gaps:** `null` and `""` coerce to `0` through `Number()`, so the `fallback` argument does
  not apply to them; this mirrors the backend helper deliberately. The verifier's count of red
  `w5-api.integration.test.ts` cases under falsification is 6, not the 5 recorded above; the
  historical RED run is narration, the reproducible facts are 47/47 green and the falsification.

### Task 3 — Dashboard: ErrorBoundary resets on navigation

- **Status:** done
- **Goal:** Once the user navigates away from the failed route, the fallback is gone without a page
  reload; containment for the section itself is unchanged.
- **In scope:** optional `resetKey` prop with `componentDidUpdate` reset, wiring in `app-layout.tsx`,
  focused tests.
- **Acceptance:** a RED test proves the fallback survives navigation today; after the fix it resets
  on navigation and does not reset while the key is stable.
- **Rollback:** revert the task commit; the pre-fix behaviour (reload required) returns.
- **Commits:** pending
- **Evidence:** RED captured first with the real `AppLayout`: navigating from a throwing route to a
  healthy one left the fallback mounted (`Unable to find an element with the text: Sección sana`).
  GREEN after the fix: 3/3. Independent verification reproduced GREEN and falsified the mechanism in
  an isolated /tmp copy: removing the `componentDidUpdate` block turns the primary case red with
  `fallbackMountedAfterNavigate=true, healthyMountedAfterNavigate=false`. The reviewer found that
  only the primary case proves the behaviour; the other two are pass-with-and-without guards.

### Task 4 — Dashboard: navigation identity must survive a query-only change

- **Status:** done
- **Goal:** Close a reviewer-found gap: `location.pathname` does not change on a query-string-only or
  hash-only navigation, so `resetKey` never changed and the fallback stayed stuck.
- **In scope:** the reset key becomes `location.key` (react-router's canonical navigation identity)
  plus a discriminating test for the same-pathname-different-query case.
- **Acceptance:** the new case fails with `resetKey={location.pathname}` and passes with
  `location.key`.
- **Rollback:** revert to `location.pathname`; the primary navigation case still passes.
- **Commits:** pending
- **Evidence:** RED reproduced the reviewer's exact scenario — starting at `/products?crash=1` with
  the fallback mounted and navigating to `/products` left it stuck (`1 failed | 3 passed`). GREEN
  after the change: 4/4. Full dashboard suite `npx vitest run` → 62 files, 814 passed / 4 skipped.
  `npx tsc -b --noEmit` exit 0. `npm run lint` exit 0 with 3 non-fatal warnings, of which only
  `react(no-did-update-set-state)` at `src/app/error-boundary.tsx:54` is introduced by this change
  and is the deliberate, documented pattern for resetting boundary state on prop change.

### Task 5 — Focused verification and close

- **Status:** in progress
- **Goal:** Both apps' suites plus typecheck/lint pass; failed or skipped checks reported.
- **Acceptance:** evidence recorded here and in the Engram mirror.
- **Commits:** pending
- **Evidence:** pending

## Known limitations and follow-ups

1. Normalizing at the API boundary moves malformed-payload failures earlier rather than adding shape
   validation: a `null` body now rejects with `Cannot read properties of null` and a non-array
   `data` with `raws.map is not a function`. React Query turns both into a query error instead of a
   render crash, which is the better failure mode, but the boundary does not validate the envelope.
   A non-object entry (e.g. a bare string in the array) is still silently accepted as a partial
   object. Envelope validation is deliberately out of scope.
2. Several dashboard currency/number formatters are still fed unvalidated API decimals
   (`dashboard-page.tsx:9`, `sales-page.tsx:28`, `fiscal-page.tsx:27`, `inventory-page.tsx:26,34`,
   `lib/utils.ts:8`). All use `Intl.NumberFormat.format()`, which coerces numeric strings silently,
   so they render correctly and cannot throw; only the `toFixed` vector was a crash, and it is fully
   swept. Feeding them normalized values would be consistency, not a bug fix.
3. The DB suite pins the plain-list, findOne, create and update branches; the paginated branch the
   dashboard actually calls is pinned by the falsified HTTP spec only. Serialization is pure
   controller code, so the DB adds no separate evidence there.
4. `npm run test:db` legitimately skips `*.db.e2e-spec.ts` files (`testMatch: **/*.db.spec.ts`,
   `rootDir: ../src`); `npm run test:e2e` legitimately covers them via `testRegex: .e2e-spec.ts$`.
5. `change_log` `from` value preservation is structural (`product.service.ts` byte-identical) rather
   than round-trip executed.
6. Pre-existing, untouched: 16 `tsc` errors in `test/inventory/batch_6b_baseline_validation.spec.ts`
   and two oxlint `react(incompatible-library)` warnings in `PromotionForm.tsx` and
   `fiscal-setup-form.tsx`.
