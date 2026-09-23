# Products decimal contract and error-boundary reset

**Trigger:** staging pilot report — after applying the CAFETERIA onboarding template, the owner
dashboard Products page renders `Error al cargar esta sección / e.sellPrice.toFixed is not a
function`, and the error overlay survives navigation until a full page reload.

**Branch:** `fix/products-decimal-contract-and-error-reset`
**Base:** `main` @ `52620b59`
**Status:** in progress

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

- **Status:** pending
- **Goal:** Every `ProductService` response (list, listPaginated, findOne, create, update) carries
  `stock`, `averageCost` and `sellPrice` as JSON numbers.
- **In scope:** a pure, unit-testable serializer plus its wiring; DB/e2e assertions that pin the
  numeric type; internal entity semantics and `change_log` payloads unchanged.
- **Acceptance:** a RED unit test fails before the serializer exists; strict DB assertions
  (`expect(res.body.sellPrice).toBe(45)`, not `Number(...)`) pass.
- **Rollback:** revert the task commit; no migration, no persisted shape change.
- **Commits:** pending
- **Evidence:** pending

### Task 2 — Dashboard: numeric normalization at the API boundary and hardened call sites

- **Status:** pending
- **Goal:** `Product` values are true numbers at runtime, and no dashboard screen calls a numeric
  method on an unvalidated API value.
- **In scope:** `toFiniteNumber` helper, `normalizeProduct` in `product-api.ts` for all five
  endpoints, and the three fragile `.toFixed` call sites.
- **Acceptance:** a RED rendering test that feeds string `sellPrice`/`stock` renders the row and
  never shows the error-boundary text; it fails before the fix.
- **Rollback:** revert the task commit; the backend contract still delivers numbers.
- **Commits:** pending
- **Evidence:** pending

### Task 3 — Dashboard: ErrorBoundary resets on navigation

- **Status:** pending
- **Goal:** Once the user navigates away from the failed route, the fallback is gone without a page
  reload; containment for the section itself is unchanged.
- **In scope:** optional `resetKey` prop with `componentDidUpdate` reset, wiring in `app-layout.tsx`,
  focused tests.
- **Acceptance:** a RED test proves the fallback survives a `resetKey` change today; after the fix it
  resets on change and does not reset while the key is stable.
- **Rollback:** revert the task commit; the pre-fix behaviour (reload required) returns.
- **Commits:** pending
- **Evidence:** pending

### Task 4 — Focused verification and close

- **Status:** pending
- **Goal:** Both apps' focused suites plus typecheck/lint pass; failed or skipped checks reported.
- **In scope:** `pnpm vitest run` (dashboard, focused files first), `npm test` + `npm run test:db`
  (backend, focused files), `tsc -b --noEmit`.
- **Acceptance:** evidence recorded here and in the Engram mirror.
- **Commits:** pending
- **Evidence:** pending
