# OmniCore Backoffice: Evidence-Gated Execution Roadmap

**Status:** Proposed execution roadmap; implementation has not started.  
**Purpose:** Deliver a tenant-safe, full-operations-management backoffice (OmniCommerce) that covers strategic configuration, reporting, analytics, and supervised write operations—without weakening the offline POS, PostgreSQL isolation, or DGI controls. The roadmap defines the complete journey to general availability (GA), while fully detailing only the next three evidence-producing batches.  
**Authority:** Product and domain intent comes from `docs/PRDs/Product_Requirement_Document.md`, `docs/PRDs/Product_Requirement_Document_v2.md`, `docs/PRDs/prd_modulo_ventas.md`, `docs/PRDs/prd_gestion_inventario.md`, `openspec/specs/identity/spec.md`, `openspec/specs/inventory-core/spec.md`, `openspec/specs/sales-core/tasks.md`, `docs/DESIGN.md` (POS only), `docs/DESIGN_BACKOFFICE.md` (backoffice design system), `docs/plans/master_execution_roadmap.md`, and industry benchmarks (Toast, Square, Lightspeed, Clover, Shopify, Eats365). Current code is authoritative for existing behavior and routes.

---

## 1. Scope and non-goals

### Scope

- A React + Vite SPA (OmniCommerce), deployed once on Cloudflare Pages, with a branded `{tenant-slug}.<brand-domain>` experience.
- The existing Railway-hosted NestJS `admin_backend` as the centralized, multi-tenant API.
- **Read-only** views: sales, inventory, and fiscal reporting backed by eventually consistent cloud data.
- **Write operations** (strategic configuration): catalog management, products, promotions, recipes/BOM, users/permissions, fiscal setup, and customer loyalty—executed by OWNER/MANAGER roles from the web backoffice.
- Tenant isolation through the verified JWT `tenant_id` claim, explicit query filtering, transaction-bound PostgreSQL RLS, and cross-checked host/slug context.
- Evidence gates for KPI semantics, timezone, synchronization freshness, browser authentication, deployment routing, observability, write-operation audit trails, and a two-tenant pilot.

### Non-goals

- Replacing, embedding, or making the Flutter POS depend on the dashboard.
- Moving the source of operational truth from local SQLite to the cloud.
- Creating invoice, cancellation, renumbering, or fiscal-correction write workflows in the dashboard. Invoices are immutable; only `is_canceled` annotations are permitted.
- Presenting net profit, P&L, or expense-based profitability; expense data does not exist.
- Assuming Cloudflare Pages wildcard custom-domain behavior before an infrastructure proof.
- Exhaustively decomposing work after the next three batches; later batches are intentionally recalibrated from evidence.

---

## 2. Tech Stack & Frontend Architecture

| Layer | Technology | Rationale |
| --- | --- | --- |
| **Framework** | React 19 + Vite 6 | SPA autenticada; SSR innecesario. Deploy estático en Cloudflare Pages. Vite es instantáneo vs alternativas. |
| **Language** | TypeScript estricto | Misma herramienta que el backend NestJS. Permite sharing de tipos DTOs entre backend y frontend. PROHIBIDO `any` (misma regla que GEMINI.md). |
| **Styling** | Tailwind CSS 4 + shadcn/ui | shadcn/ui es copy-paste (no librería en node_modules). Control total sobre componentes para implementar el design system NHILOS POS. Built on Radix UI (accesibilidad completa). |
| **State (server)** | TanStack Query v5 | Cache de API, refetch automático, optimistic updates. Cubre los ~45 endpoints existentes del backend. |
| **State (client)** | Zustand | Mínimo, sin boilerplate. Solo para UI state (sidebar, modals, tenant context activo). |
| **Forms** | React Hook Form + Zod | Validación type-safe. Los schemas Zod espejan los DTOs `class-validator` del backend NestJS. |
| **Routing** | React Router v7 | SPA con rutas protegidas por rol. Lazy loading por módulo. |
| **Testing** | Vitest + React Testing Library | Vitest es nativo de Vite (misma config). RTL para tests de componentes. |
| **Linting** | ESLint + Prettier | Consistencia de código, alineado con el backend. |
| **Monorepo** | pnpm workspaces | Ya configurado en la raíz del proyecto. `apps/owner_dashboard/` como workspace. |
| **Deploy** | Cloudflare Pages | Build estático, TLS wildcard, deploy automático desde git. |
| **Package manager** | pnpm 11.x | Ya establecido en el monorepo (`packageManager` en root `package.json`). |

### Directory structure

```text
apps/owner_dashboard/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── components.json              ← shadcn/ui config
├── src/
│   ├── app/                     ← Router, providers, layout shell
│   │   ├── router.tsx           ← React Router config con rutas por rol
│   │   ├── providers.tsx        ← TanStack Query, tenant context, auth
│   │   └── layout/              ← Sidebar, header, content area
│   ├── components/ui/           ← shadcn/ui components (copy-paste, customizados)
│   ├── features/                ← Módulos por dominio (uno por sección del sidebar)
│   │   ├── auth/                ← Login, logout, token refresh
│   │   ├── dashboard/           ← KPIs ejecutivos, charts
│   │   ├── sales/               ← Reportería de ventas
│   │   ├── inventory/           ← Inventario, kardex, alertas
│   │   ├── fiscal/              ← Resumen fiscal, secuencia, exports
│   │   ├── catalog/             ← Gestión de catálogos y productos (W5)
│   │   ├── promotions/          ← Gestión de promociones (W6)
│   │   ├── recipes/             ← Gestión de recetas/BOM (W7)
│   │   ├── users/               ← Gestión de usuarios y permisos (W8)
│   │   ├── settings/            ← Config fiscal, onboarding (W9)
│   │   └── customers/           ← Clientes y lealtad (W10)
│   ├── lib/
│   │   ├── api.ts               ← Fetch wrapper + JWT interceptor + refresh
│   │   ├── auth.ts              ← Token storage, logout, session management
│   │   ├── tenant.ts            ← Slug resolution, tenant context
│   │   └── utils.ts             ← cn() helper, formatters, date utils
│   ├── hooks/                   ← TanStack Query hooks personalizados por módulo
│   │   ├── use-auth.ts
│   │   ├── use-tenants.ts
│   │   ├── use-promotions.ts
│   │   └── ...
│   └── types/                   ← TypeScript types compartidos (importados del backend)
├── index.html
└── public/
```

### Key architectural decisions

1. **Token sharing**: Los tipos TypeScript de los DTOs NestJS se importan directamente en el frontend. Un solo source of truth para el contrato API.
2. **JWT en memoria**: Access tokens se almacenan en memoria (no localStorage/cookies). Refresh tokens en httpOnly cookie si es posible, o en memoria con refresh automático antes de expirar.
3. **Tenant context**: Resuelto desde el slug del host (`{tenant-slug}.omnifood.ni`). El contexto sepropaga via TanStack Query key prefix y Zustand store.
4. **Lazy loading**: Cada módulo (`features/`) se carga con `React.lazy()`. El bundle inicial es mínimo; los módulos se cargan bajo demanda.
5. **Design system separado**: `docs/DESIGN.md` es exclusivamente para el POS Flutter. El backoffice usa `docs/DESIGN_BACKOFFICE.md` con los tokens de NHILOS POS.

---

## 3. Backoffice vs POS Terminal: Industry-Aligned Responsibility Matrix

The following matrix defines which operations belong in the web backoffice, which belong in the POS terminal, and who performs each. This is aligned with enterprise POS patterns observed in Toast, Square, Lightspeed, Clover, Shopify, and Eats365.

| Función | Backoffice (Web) | POS Terminal | ¿Quién? |
| --- | --- | --- | --- |
| **Crear/editar productos** | ✅ CRUD completo | ❌ No | Owner / Manager |
| **Crear/editar menús y categorías** | ✅ CRUD completo | ❌ No | Owner / Manager |
| **Definir recetas / BOM** | ✅ Asociar ingredientes, cantidades | ❌ No | Owner / Manager |
| **Crear promociones** | ✅ Crear, programar horarios/días | ❌ No | Owner / Manager |
| **Activar/desactivar promociones** | ✅ Gestión completa | ⚡ Toggle rápido (opcional) | Manager |
| **Configurar impuestos y reglas fiscales** | ✅ Configurar tasas, exenciones | ❌ No | Owner |
| **Configuración DGI (resoluciones, series)** | ✅ Configurar, vigilar límites | ❌ No | Owner |
| **Gestionar usuarios y roles** | ✅ CRUD completo, permisos granulares | ❌ No | Owner |
| **Gestionar catálogos maestros** | ✅ Seed, CRUD, desactivar | ❌ No | Owner / Manager |
| **Importar datos masivos (Excel)** | ✅ Upload, commit, errores | ❌ No | Owner / Manager |
| **Configurar impresoras y hardware** | ✅ Perfiles, grupos de impresión | ❌ No | Owner / Manager |
| **Definir floor plan / mesas** | ✅ Crear, editar | ❌ No | Owner / Manager |
| **Gestionar clientes y lealtad** | ✅ CRUD, puntos, historial | ⚡ Registro rápido en venta | Manager / Cashier |
| **Onboarding inicial del tenant** | ✅ Templates, importación, fiscal setup | ❌ No | Owner |
| **Reportería ejecutiva (KPIs, dashboards)** | ✅ Completa | ⚡ Resumen del turno | Owner / Manager |
| **Reportería fiscal (libro ventas, Z)** | ✅ Exportar, auditar | ❌ No | Owner / Manager |
| **Análisis de tendencias y analytics** | ✅ Tendencias, benchmarks | ❌ No | Owner |
| **Marcar producto como "Agotado" (86)** | ✅ Gestión desde catálogo | ⚡ Toggle rápido | Manager / Cashier |
| **Anular Facturas / Devoluciones (Voids)** | ✅ Reporte / Auditoría | ✅ Sí (Con PIN de supervisor) | Manager |
| **Gastos de Caja Chica (Pay-outs)** | ✅ Auditoría / historial | ✅ Sí ( registrar gasto) | Cashier / Manager |
| **Ingresos a Caja (Pay-ins)** | ✅ Auditoría / historial | ✅ Sí ( registrar ingreso) | Cashier / Manager |
| **Aplicar Cortesías / Descuentos manuales** | ✅ Configurar topes y políticas | ✅ Sí (Con PIN si excede umbral) | Manager |
| **Forzar Sincronización (Sync Manual)** | ❌ No aplica | ⚡ Botón rápido | Cashier |
| **Abrir turno / caja** | ❌ No | ✅ Sí | Cashier |
| **Tomar pedidos** | ❌ No | ✅ Sí | Cashier / Waiter |
| **Procesar pagos** | ❌ No | ✅ Sí | Cashier |
| **Cerrar turno / caja (Z report)** | ❌ No | ✅ Sí | Cashier / Manager |
| **Imprimir facturas DGI** | ❌ No | ✅ Sí | Cashier |
| **Enviar comandas a KDS** | ❌ No | ✅ Sí | Waiter |
| **Ajustes rápidos de inventario (merma)** | ⚡ Conteo completo | ⚡ Ajuste rápido | Manager / Cashier |

### Principios de separación

1. **El POS es táctico** — vender, cobrar, imprimir, enviar comandas. Velocidad y simplicidad.
2. **El backoffice es estratégico** — configurar, gestionar, analizar. Pantalla completa, teclado, mouse.
3. **El POS descarga del backoffice** — productos, recetas, promociones activas, catálogos, usuarios, config fiscal.
4. **El POS NO crea configuración** — solo consume y ejecuta operaciones de venta.
5. **Las escrituras del backoffice son supervisadas** — solo OWNER/MANAGER, con auditoría completa.

---

## 4. Decisions already made and assumptions requiring validation

### Decisions already made

| Decision | Consequence | Owner |
| --- | --- | --- |
| Flutter POS remains offline-first; local SQLite is operational source of truth. | POS sales continue when cloud, dashboard, or internet is unavailable. Dashboard data is an eventually consistent mirror. | Product / Architecture |
| NestJS `admin_backend` remains the central API on Railway. | Backoffice capabilities extend existing modules and routes rather than creating a second backend. | Backend / Infrastructure |
| The owner client is a React + Vite SPA deployed once on Cloudflare Pages. | Tenant branding and routing must not require one build per tenant. | Product / Infrastructure |
| The verified JWT `tenant_id` claim is authorization authority. | A host, forwarded host, slug, header, query value, or client tenant UUID can provide context only; the server must resolve and compare it to the JWT claim. | Security |
| Isolation is defense in depth. | Explicit tenant predicates remain even after transaction-local RLS is proven. | Security / Backend |
| Invoice behavior remains immutable; only `is_canceled` annotations are permitted. | No delete, renumber, or correction workflow is introduced in the dashboard. DGI compliance is preserved. | Product / DGI Compliance |
| **The backoffice is a full operations management platform, not a read-only dashboard.** | The SPA exposes strategic configuration (catalog, products, promotions, recipes, users, fiscal) alongside reporting. Industry pattern (Toast, Lightspeed, Clover, Shopify). | Product / Architecture |
| **All existing backend endpoints are reused; no new endpoints are needed for the current scope.** | The backend was designed as a multi-tenant API with JWT auth, RBAC guards, and RLS. POS and web are both HTTP clients of the same API. Migration effort is 100% frontend. | Backend / Architecture |
| **POS is tactical (sell, pay, print); backoffice is strategic (configure, manage, analyze).** | Configuration writes (products, recipes, promotions, users) happen exclusively from the web. The POS consumes but does not create configuration. | Product / Architecture |
| **Write operations are OWNER/MANAGER-only with audit trails.** | Cashiers and waiters cannot execute strategic writes from any client. Every write is logged with actor, timestamp, and before/after state. | Security / DGI |
| Review budget is fewer than 400 authored changed lines per PR. | Tests and evidence stay with each behavior; oversized work is split before review. | Engineering |

### Assumptions requiring validation

| Assumption or decision needed | Validation gate | Decision owner | Blocking effect |
| --- | --- | --- | --- |
| KPI names, formulas, inclusions, cancellation treatment, and reporting timezone are approved. | D0 decision record with examples and fixture totals. Finance must review `netTaxableSales`, gross margin, and shrinkage-inclusive COGS terminology. | Product / Finance | Blocks executive KPI exposure, not tenant-isolation foundations. |
| Owner and manager access policy is sufficient for each report, export, and write operation. | Endpoint-by-role matrix approved against current guards. Write-operation ACL documented. | Product / Security | Blocks route exposure and write UI in the SPA. |
| Browser token storage, refresh rotation, logout/revocation, CSRF posture, CORS, and CSP are production-safe. | Threat model and browser-session contract. | Security | Blocks W1. |
| A reliable per-tenant "last complete sync" can be computed. | F1 contract defines source streams, completeness, lag states, and unknown/degraded behavior. | Backend / Operations | Blocks KPI publication in W2–W4. |
| Cloudflare Pages can route the approved wildcard custom domain and preserve the intended tenant context. | Infrastructure spike with DNS, TLS, preview/production routing, and request-header evidence. | Infrastructure | Blocks production branded routing. A Cloudflare Worker proxy/router is the documented fallback. |
| Railway deployment, database role behavior, and production-like RLS settings match test assumptions. | Deployment manifest/runbook and staging probe. | Infrastructure / Backend | Blocks operational proof and pilot. |
| Write-operation idempotency and conflict resolution are validated under concurrent web + POS scenarios. | E2E test with simultaneous web write and POS sync for the same tenant. | Backend / Security | Blocks W5 (catalog/products) GA. |

---

## 5. Current-state evidence and gap matrix

All referenced paths below exist in the repository. Findings describe the current source, not planned behavior.

| Capability | Current evidence | Gap or consequence |
| --- | --- | --- |
| **Offline and DGI foundation** | PRDs require offline operation, invoice immutability, cancellation-only correction, and sequential numbering. | Backoffice must disclose cloud staleness for read views and preserve DGI invariants for all write paths. |
| **Multi-tenant intent** | `openspec/specs/identity/spec.md`, `openspec/specs/sales-core/tasks.md`, and `docs/DESIGN.md` require tenant-scoped access/RLS. | Intent is not sufficient evidence that every dashboard query executes inside a tenant-bound transaction. |
| **Existing sales report APIs** | `reports.controller.ts` exposes `GET /sales/reports/dashboard`, `/hourly-sales`, `/top-products`, `/cashier-performance`, `/fiscal/monthly-summary`, `/fiscal/voided-invoices`, `/fiscal/sequence-audit`, `/export/sales-book`, `/export/z-reports`. Guards allow OWNER/MANAGER. | Reuse these routes. Isolation, semantics, timezone, freshness, and browser suitability must be proven before exposure. |
| **Existing inventory report APIs** | `inventory-reports.controller.ts` exposes `GET /inventory/reports/valuation`, `/cogs`, `/kardex`, `/alerts`. | Reuse after the same isolation and freshness gates. |
| **Existing write APIs (reusable for backoffice)** | `promotions.controller.ts` exposes full CRUD (`GET/POST/PATCH/DELETE /promotions`); `catalog.controller.ts` exposes `GET/POST/PATCH/DELETE /catalogs/:type` and `POST /catalogs/seed-defaults`; `users.controller.ts` exposes `GET/POST/PUT/DELETE /identity/users` and permissions matrix; `fiscal-setup.controller.ts` exposes `GET/POST /onboarding/fiscal-setup`; `customers.controller.ts` exposes full CRUD plus points adjustment; `import-staging.controller.ts` exposes upload/commit/errors; `industry-template.controller.ts` exposes template listing and application. All guarded by `AuthGuard` + `RolesGuard` with OWNER/MANAGER restrictions. | These endpoints already exist and are production-ready. The backoffice SPA consumes them directly. No new backend endpoints are needed. The gap is the React frontend that calls them. |
| **POS-specific endpoints (not for backoffice)** | `POST /v1/sync/batch`, `GET /v1/sync/inbound/deltas`, `GET /v1/sync/inbound/catalog`, `POST /sales/sync`, `POST /inventory/purchase`, `POST /inventory/regularization/sync`, `POST /sales/shifts/:id/movements`, `POST /sales/shifts/:id/close`. | These remain POS-exclusive. The backoffice does not consume sync, shift, or purchase endpoints. |
| **Explicit tenant filtering** | `sales-reports.service.ts` and `inventory-reports.service.ts` include tenant predicates. | Preserve them. They are one control, not a substitute for RLS. |
| **Request tenant handling** | `rls.interceptor.ts` verifies JWT `tenant_id` but delegates transaction binding to services. | No request-wide guarantee that report queries bind `app.tenant_id` to the same transaction. Blocker before data exposure. |
| **Transaction-binding precedents** | `catalog.service.ts` and `invoices.service.ts` use transaction-local `set_config('app.tenant_id', ..., true)`. | Reuse through a narrow shared primitive. |
| **Real PostgreSQL test precedent** | `invoices.service.db.spec.ts` and migration DB specs exercise PostgreSQL and `app.tenant_id`. | Extend to dashboard routes and write operations. |
| **KPI/timezone behavior** | `sales-reports.service.ts` treats `subtotal` as `netTaxableSales`, constructs date bounds in UTC. `inventory-reports.service.ts` includes shrinkage in `totalCogsNio`. | Product/Finance must approve terminology and reporting timezone. |
| **Authentication** | `auth.controller.ts` returns access and refresh tokens. `auth.guard.ts` verifies JWT. | JWT verification is a base; browser session hardening (CSRF/CORS/CSP/cookie strategy) is pending. |
| **Tenant identity and branding** | `tenant.entity.ts` contains id, name, RUC, active status, timestamps only. | No slug or branding contract exists. |
| **Web owner app** | `apps/` contains only `admin_backend/` and `pos_app/`. | The React + Vite SPA does not exist. |
| **Sync freshness** | Report DTOs expose generation timestamps; staff sync has a narrow snapshot timestamp. | No contract proves last complete tenant sync across required streams. |
| **Deployment proof** | No `wrangler` or Railway deployment config found. | Cloudflare/Railway are approved baselines, not repo-proven. |
| **Operational proof** | Existing tests support backend features; no dashboard telemetry, SLO, runbook, or pilot evidence exists. | GA requires O1 and P1 evidence. |

---

## 6. Dependency DAG, critical path, and parallel-safe branches

```text
D0 KPI semantics + timezone + access policy + write-ACL matrix
  └─> S1 tenant-bound DB transaction primitive (OD-01)
       └─> S2 real PostgreSQL RLS proof on sales dashboard (OD-02)
            └─> T1 tenant slug + server-verified host/login context (OD-03)
                 ├─> F1 sync-freshness contract
                 │    └─> W1 SPA + browser-auth shell
                 │         ├─> W2 executive sales snapshot (read-only)
                 │         │    ├─> W3 inventory insight (read-only)
                 │         │    └─> W4 fiscal/audit views (read-only)
                 │         ├─> W5 catalog & product management (write)
                 │         │    └─> W6 promotions management (write)
                 │         ├─> W7 recipes/BOM management (write)
                 │         ├─> W8 users & permissions management (write)
                 │         ├─> W9 fiscal setup & onboarding (write)
                 │         └─> W10 customers & loyalty management (write)
                 │              └─> O1 hardening + telemetry
                 │                   └─> P1 two-tenant pilot
                 │                        └─> GA
                 └─> I1 Cloudflare wildcard spike ────────────────┘
                          └─fallback: Cloudflare Worker router/proxy
```

**Critical path:** D0 → S1 → S2 → T1 → F1 → W1 → W2 → W5/W6/W7/W8/W9/W10 → O1 → P1 → GA. Authorization and isolation precede data exposure; freshness precedes KPI publication; write operations require proven isolation; operational evidence precedes GA.

**Parallel-safe branches:**

- I1 may run after the tenant-slug contract is stable and in parallel with F1/W1. It must not define authorization policy.
- Brand asset preparation and non-sensitive visual tokens may proceed in parallel with F1, but persistence/API shape waits for T1.
- W3 inventory and W4 fiscal views may proceed in parallel after W2 proves the common shell.
- **W5, W6, W7, W8, W9, W10 (write-operation batches) may proceed in parallel after W1 proves the auth shell and S2 proves RLS isolation.** They must not share concurrent writers on the same entity without an integration boundary. Catalog/products (W5) should land before promotions (W6) and recipes (W7) because they reference product IDs.
- D0 Finance semantics and Security access-policy reviews may run in parallel, but both produce one readiness record before KPI exposure.

---

## 7. Milestone roadmap: readiness through GA

| Milestone | Outcome | Dependencies | Exit gate and linked evidence expectation |
| --- | --- | --- | --- |
| **D0 — Decision readiness** | Approved KPI dictionary, reporting timezone, access matrix (including write-operation ACL), DGI read-only boundary for invoices, and named owners. | Authority documents, current DTO/service behavior, industry matrix. | Product/Finance/Security decision record; fixture examples reconcile formulas; write-operation role matrix approved. |
| **S1 — Tenant transaction foundation** | One reusable transaction primitive binds the verified tenant to `app.tenant_id` without removing explicit filters. | D0 access-policy direction. | OD-01 tests prove bind-before-query, commit/rollback/release, and no tenant leakage. |
| **S2 — Sales isolation proof** | The existing sales dashboard route is protected by explicit filtering plus real PostgreSQL RLS in the same transaction. | S1. | OD-02 two-tenant DB evidence proves T1 cannot read T2 and missing/mismatched context fails closed. |
| **T1 — Tenant context** | Stable tenant slugs provide branding/login context and are always resolved and cross-checked server-side; existing POS login remains valid. | S2. | OD-03 compatibility and mismatch tests; no client tenant UUID/slug becomes authorization authority. |
| **F1 — Freshness contract** | Every dashboard response discloses last complete sync, incomplete streams, and stale/unknown state. | T1; Operations stream inventory. | Contract tests plus seeded stream scenarios; Product approves stale-state copy. |
| **W1 — Web foundation** | React + Vite SPA authenticates safely, resolves tenant context, renders branding, and handles expired/revoked sessions. | T1, F1, Security browser-session decision. | Browser threat-model checklist, auth integration tests, CSP/CORS evidence, accessibility baseline. |
| **W2 — Executive sales pilot** | Owners can view an approved sales snapshot with timezone and freshness disclosure. | W1, Finance-approved sales semantics. | API contract tests, UI tests, fixture reconciliation, tenant-isolation receipt. |
| **W3 — Inventory insight** | Owners can inspect valuation, COGS/gross-margin terminology, Kardex, and alerts. | W2, Finance COGS approval, F1 inventory completeness. | Reconciled inventory fixtures, stale-state behavior, role checks. |
| **W4 — Fiscal/audit views** | Owners can inspect monthly fiscal summary, voids, sequence audit, and exports. | W2, DGI review, F1 sales completeness. | DGI checklist, immutable/cancellation-only regression evidence. |
| **W5 — Catalog & product management** | Owners/managers can create, edit, and deactivate catalogs, categories, products (SIMPLE, COMPOUND, VARIANT_PARENT), and pricing from the web. POS syncs changes on next connection. | W1, S2 proven, D0 write-ACL approved. | CRUD integration tests for each entity, role-gate tests (CASHIER cannot write), audit-log verification, POS sync-down contract test. |
| **W6 — Promotions management** | Owners/managers can create, schedule (day-of-week, time windows, date ranges), activate/deactivate, and delete promotions from the web. | W5 (promotions reference product/category IDs). | CRUD + schedule tests, conflict detection (overlapping promos), POS sync-down contract, role-gate tests. |
| **W7 — Recipes/BOM management** | Owners/managers can associate ingredients (insumos or products) to COMPOUND products, define quantities, and publish recipe versions from the web. | W5 (recipes reference product IDs). | CRUD tests, version publish workflow, CPP recalculation trigger verification, role-gate tests. |
| **W8 — Users & permissions management** | Owners can create/edit/deactivate users, assign roles (OWNER/MANAGER/CASHIER/WAITER), and configure granular custom permissions from the web. | W1, T1. | CRUD tests, permission-matrix enforcement tests, PIN-hash verification, role-gate (only OWNER can manage users). |
| **W9 — Fiscal setup & onboarding** | Owners/managers can configure DGI resolutions, tax rules, fiscal series, and apply industry templates from the web. | W1, D0 DGI boundary approved. | Fiscal-setup CRUD tests, template application tests, DGI invariant regression tests. |
| **W10 — Customers & loyalty management** | Owners/managers can manage customer profiles, view loyalty points history, and manually adjust points from the web. | W1. | CRUD tests, points-adjustment audit test, role-gate tests. |
| **I1 — Branded routing proof** | Approved wildcard domain works end to end, or the Worker fallback is selected. | T1 contract. | DNS/TLS/request-routing receipt; forged forwarded-host test; rollback instructions. |
| **O1 — Hardening and operations** | Dashboard has actionable telemetry, privacy-safe logs, runbooks, alert thresholds, rate limits, and recovery drills. | W2–W10 and I1. | Staging soak, synthetic tenant checks, auth/5xx/freshness dashboards, incident drill. |
| **P1 — Two-tenant pilot** | Two representative tenants complete sales, inventory, fiscal, and configuration journeys with demonstrated isolation. | O1. | Pilot sign-off, cross-tenant negative tests, support log, KPI reconciliation. |
| **GA — Controlled availability** | Backoffice is supportable, tenant-safe, DGI-safe, and operationally proven. | P1 with no open critical findings. | Product/Security/Finance/Infrastructure/Operations approvals and complete evidence index. |

---

## 8. Detailed contracts for the next three batches

### Batch OD-01: Tenant-bound database transaction primitive

- **Goal:** Provide one narrow backend primitive that starts a transaction, binds the verified tenant with parameterized transaction-local `app.tenant_id`, supplies the transaction manager to the operation, and always commits/rolls back/releases correctly.
- **Traceability:** `openspec/specs/identity/spec.md` tenant filtering/RLS; `openspec/specs/sales-core/tasks.md` backend RLS intent; `docs/DESIGN.md` multi-tenant boundary; precedents in `apps/admin_backend/src/modules/catalog/catalog.service.ts`, `apps/admin_backend/src/modules/sales/services/invoices.service.ts`, and `apps/admin_backend/src/core/database/rls.interceptor.ts`.
- **Prerequisites and dependencies:** Backend and Security approve the primitive contract: tenant input comes only from the verified JWT request context; transaction-local parameterized binding is mandatory; explicit tenant predicates remain. Existing PostgreSQL test capability is available.
- **In scope:** A shared infrastructure-level transaction helper/provider; normalized non-empty tenant validation; `set_config('app.tenant_id', $1, true)` before operation execution; unit tests for success, bind failure, operation failure, rollback, and release; concise usage documentation in the same code surface.
- **Out of scope:** Global interceptor-managed transactions; refactoring all services; changing RLS policies; report-route behavior; tenant slugs; browser auth; frontend code.
- **Touched domains/contracts/data/operations:** Backend database infrastructure and dependency injection only. No domain model, schema, route, persisted data, POS, or DGI behavior changes.
- **Acceptance criteria:** The operation cannot run before a valid tenant is bound; the helper exposes only the transaction-scoped manager/query runner; binding uses a SQL parameter; success commits once; any bind/operation error rolls back when applicable; every path releases; no global/session-level tenant value survives; explicit-filter guidance is retained.
- **Tests and linked evidence:** Focused unit command and exact result recorded in the PR; a PostgreSQL-backed test or existing DB harness probe records `current_setting('app.tenant_id', true)` inside the transaction and empty/unavailable state on a fresh connection afterward; implementation receipt links diff, test output, and runtime-harness result. Mocks alone do not satisfy the exit gate.
- **Rollback/recovery:** Revert the helper/provider and its tests as one work unit. No migration or data rollback is required. Existing service-specific tenant-binding helpers continue to operate until deliberately migrated.
- **Observability:** Emit a structured, privacy-safe failure event for bind/transaction failures with request correlation and operation name, never raw JWTs, tenant UUIDs, credentials, or SQL parameters. Define a counter for bind failures; success logging is sampled or omitted to avoid noise.
- **Estimate:** 220–340 authored changed lines; medium risk because transaction lifecycle errors can silently weaken RLS. Hard cap: fewer than 400 additions plus deletions.
- **Commit/PR boundary:** One `feat(backend)` work-unit commit/PR containing the primitive, DI wiring, tests, and evidence note. It is independently mergeable and does not modify report services.
- **Entry gate:** Planned evidence and resolved blockers: approved Security/Backend contract, identified DB test command, and confirmation that no client-provided tenant value reaches the primitive.
- **Exit gate:** Implemented and Verified evidence links are mandatory in the PR. Operationally Proven remains pending until OD-02 exercises the primitive through a real route and O1 monitors it in staging.

### Batch OD-02: Real PostgreSQL RLS isolation proof on the existing sales dashboard route

- **Goal:** Execute `GET /sales/reports/dashboard` reads through OD-01's tenant-bound transaction and prove on real PostgreSQL that a valid T1 JWT cannot observe T2 invoices, items, or payments.
- **Traceability:** `apps/admin_backend/src/modules/sales/controllers/reports.controller.ts` existing route; `apps/admin_backend/src/modules/sales/services/sales-reports.service.ts` explicit predicates and relations; `openspec/specs/identity/spec.md`; `openspec/specs/sales-core/tasks.md`; DGI constraints in `docs/PRDs/Product_Requirement_Document_v2.md` and `openspec/specs/sales-core/spec.md`.
- **Prerequisites and dependencies:** OD-01 verified; applicable invoice/item/payment RLS policies and non-bypass application DB role are identified; real PostgreSQL integration harness is available; Security confirms fail-closed expectations. If policy coverage is missing, stop and split a migration-safety batch before this route is exposed.
- **In scope:** Route/service wiring that obtains repositories from the transaction manager; preservation of `tenant_id: tenantId` predicates; the smallest required RLS-policy correction only if it fits safely below budget and has reversible migration evidence; a real PostgreSQL integration/E2E test with T1/T2 fixtures, valid owner JWTs, relational rows, missing context, and mismatched context.
- **Out of scope:** Other sales reports; inventory reports; KPI renaming or timezone correction; UI; slug routing; broad repository refactors; invoice writes or fiscal mutation.
- **Touched domains/contracts/data/operations:** Existing read-only sales dashboard application flow, invoice/item/payment persistence adapters, RLS test fixtures, and CI DB-test path. Response shape remains backward compatible.
- **Acceptance criteria:** T1 receives only T1 totals and relations; T2 receives only T2 data; absent tenant context fails closed; attempted context mismatch cannot override the JWT claim; the tested DB role does not bypass RLS; explicit filters remain visible in the query path; no invoice row is inserted, updated, canceled, renumbered, or deleted.
- **Tests and linked evidence:** Record focused unit and real PostgreSQL commands with exact results; include a fixture ledger showing expected T1/T2 totals; capture policy/role inspection, negative cross-tenant assertions, and route response assertions. Link the OD-01 receipt. Test teardown must prove fixture isolation and cleanup.
- **Rollback/recovery:** Revert route/service wiring to the prior explicitly filtered implementation if production errors occur; disable dashboard exposure rather than bypassing RLS. If a migration is included, use its tested down path only after confirming no dependent policy; no fiscal data rollback is permitted or needed.
- **Observability:** Count authorization denials, missing tenant bindings, and RLS-related query failures by route and environment with privacy-safe tenant pseudonyms. Alert on any successful canary query containing a foreign-tenant sentinel. Do not log invoice payloads.
- **Estimate:** 280–390 authored changed lines; high isolation risk but bounded to one existing route. Fewer than 400 changed lines is mandatory; a missing-policy migration that breaks the budget becomes a preceding PR, not an exception.
- **Commit/PR boundary:** One `fix(security)` work-unit PR for the existing dashboard route, transaction-scoped repositories, real PostgreSQL proof, and evidence. No KPI or UI changes.
- **Entry gate:** Planned evidence and resolved blockers: OD-01 Verified receipt, identified application DB role/policies, two-tenant fixture design, and Security approval of negative cases.
- **Exit gate:** Implemented and Verified links include real PostgreSQL and route-level evidence. Operationally Proven requires a staging canary under O1; until then the route must not be treated as dashboard-ready production exposure.

### Batch OD-03: Server-verified tenant slug context with POS-compatible login

- **Goal:** Introduce a stable tenant slug and optional login/request context that the server resolves and cross-checks, while preserving the existing POS `POST /identity/login` request and JWT-authoritative protected access.
- **Traceability:** `apps/admin_backend/src/modules/tenant/entities/tenant.entity.ts`; `apps/admin_backend/src/modules/identity/controllers/auth.controller.ts`; `apps/admin_backend/src/modules/identity/dto/identity.dto.ts`; `apps/admin_backend/src/modules/identity/services/auth.service.ts`; `apps/admin_backend/src/modules/identity/guards/auth.guard.ts`; `openspec/specs/identity/spec.md` existing login contract.
- **Prerequisites and dependencies:** OD-02 verified; Product owns canonical slug assignment/collision rules; Security approves trusted-proxy/forwarded-host allowlist and generic mismatch errors; Backend confirms migration compatibility for existing tenants. Infrastructure provides expected public API and branded-host topology but wildcard support is not assumed.
- **In scope:** Unique normalized tenant slug with reversible migration/backfill strategy; server resolver from slug to active tenant; optional validated `tenantSlug` login field (or equivalent context header contract) that resolves server-side and must match the authenticated user's tenant; protected-request comparison of optional slug/verified host context against the verified JWT claim; legacy login without slug remains unchanged; unit/integration tests for normalization, duplicates, inactive tenants, forged host/header, mismatch, and legacy POS payload.
- **Out of scope:** Trusting slug/host as authorization; accepting a client tenant UUID; full branding schema/assets; Cloudflare configuration; Worker implementation; SPA; changing POS offline login; changing token claims; broad session-hardening work.
- **Touched domains/contracts/data/operations:** Tenant persistence and migration, identity login DTO/service, optional request-context contract, compatibility tests, and deployment trust-boundary documentation. No sales, inventory, or invoice data mutation.
- **Acceptance criteria:** Slugs are normalized, unique, and server-resolved; unknown/inactive/mismatched context returns a generic failure without tenant enumeration; protected authorization still derives solely from verified JWT `tenant_id`; forwarded host is trusted only from an allowlisted proxy path; direct client slug/header values are treated as untrusted context and compared server-side; the current email/pass POS login succeeds without the new field; existing tokens remain valid according to current policy.
- **Tests and linked evidence:** Migration up/down and collision tests; login integration tests for legacy POS, matching slug, wrong slug, unknown slug, and inactive tenant; protected-route tests for matching/mismatched context and forged forwarding headers; focused commands and exact results recorded. Link the OD-02 isolation receipt and a contract example showing that no tenant UUID is accepted from the client.
- **Rollback/recovery:** Make context optional during rollout. On errors, stop emitting/validating branded context while retaining legacy login; revert application wiring before migration rollback. Preserve assigned slug data unless the tested down migration is explicitly approved. Disable branded routing rather than weakening JWT checks.
- **Observability:** Privacy-safe counters for slug resolution outcomes, context/JWT mismatch, inactive tenant, legacy login, and trusted-host parsing; rate-limit public resolution/login paths; alert on mismatch spikes. Never log passwords, tokens, full host headers with secrets, or raw tenant identifiers.
- **Estimate:** 300–390 authored changed lines; high compatibility/security risk. Fewer than 400 changed lines is mandatory; branding fields or infrastructure configuration move to later batches.
- **Commit/PR boundary:** One ordered `feat(identity)` work-unit PR containing slug persistence, optional context verification, backward-compatibility tests, migration safety, and evidence. It depends on OD-02 and introduces no web client.
- **Entry gate:** Planned evidence and resolved blockers: Product slug rules, Security trust-boundary approval, backfill/collision plan, and a captured current POS login contract test.
- **Exit gate:** Implemented and Verified links include migration, integration, security-negative, and legacy-compatibility evidence. Operationally Proven waits for the I1 routing spike and staging telemetry in O1.

---

## 9. Milestone-level deferred backlog

These are candidate outcomes, not exhaustive task lists. IDs and boundaries are recalibrated after OD-03.

| Suggested batch ID | Milestone-level outcome | Primary gate/owner |
| --- | --- | --- |
| OD-04 | D0 KPI dictionary, reporting-timezone contract, and write-operation ACL matrix encoded in API examples, fixtures, and guard documentation. | Product / Finance / Security |
| OD-05 | F1 tenant sync-freshness endpoint/metadata distinguishes complete, stale, partial, and unknown streams. | Backend / Operations |
| OD-06 | Browser session hardening establishes token/refresh/logout, CSRF, CORS, CSP, and revocation posture for web backoffice. | Security |
| OD-07 | W1 React + Vite shell provides tenant context, branding seam, auth states, navigation, accessibility, and freshness banner. | Frontend / Security |
| OD-08 | W2 executive sales snapshot uses existing dashboard/hourly/top-products/cashier routes with approved semantics. | Product / Finance |
| OD-09 | I1 Cloudflare wildcard routing spike proves Pages behavior or selects the Worker fallback. | Infrastructure |
| OD-10 | W3 inventory insight uses existing valuation/COGS/Kardex/alerts routes with approved COGS language. | Finance / Backend |
| OD-11 | W4 fiscal views use existing summary/void/sequence/export routes and preserve read-only DGI boundaries. | DGI Compliance / Backend |
| OD-12 | W5 catalog & product management: CRUD UI for catalogs, categories, products (all types), pricing, and variants. Reuses `GET/POST/PATCH/DELETE /catalogs/:type` and existing product endpoints. POS sync-down contract validated. | Product / Backend |
| OD-13 | W6 promotions management: CRUD UI with schedule builder (day-of-week, time windows, date ranges), activate/deactivate. Reuses `GET/POST/PATCH/DELETE /promotions`. Overlap detection and POS sync-down validated. | Product / Backend |
| OD-14 | W7 recipes/BOM management: UI to associate ingredients to COMPOUND products, define quantities, publish versions. Reuses `RecipeService` endpoints. CPP recalculation trigger verified. | Product / Backend |
| OD-15 | W8 users & permissions management: UI for user CRUD, role assignment, and granular permission matrix. Reuses `GET/POST/PUT/DELETE /identity/users` and permission endpoints. Only OWNER access. | Security / Product |
| OD-16 | W9 fiscal setup & onboarding: UI for DGI resolution configuration, tax rules, industry template application, and bulk import. Reuses fiscal-setup, template, and import-staging endpoints. | DGI Compliance / Backend |
| OD-17 | W10 customers & loyalty management: UI for customer profiles, points history, and manual adjustment. Reuses `GET/POST/PATCH/DELETE /customers` and points endpoints. | Product / Backend |
| OD-18 | O1 telemetry, rate limits, privacy-safe logging, synthetic checks, runbooks, and recovery drill are operational. | Operations / Security |
| OD-19 | Executive sales pilot reconciles KPIs and usability with one controlled tenant. | Product / Finance / Operations |
| OD-20 | P1 two-tenant pilot proves isolation, freshness, supportability, write-operation audit trails, and branded routing. | Security / Operations / Infrastructure |
| OD-21 | GA gate closes pilot findings and publishes support/rollback ownership. | All decision owners |

---

## 10. Risks, mitigations, and rollback/recovery strategy

| Risk | Severity / owner | Mitigation | Rollback or recovery trigger |
| --- | --- | --- | --- |
| Cross-tenant disclosure through unbound repositories or RLS bypass roles | Critical / Security + Backend | OD-01 primitive, OD-02 real PostgreSQL proof, explicit predicates, role inspection, staging canary. | Disable affected route/client release immediately; never bypass RLS to restore availability. |
| Host or slug becomes an authorization input | Critical / Security | Resolve server-side and compare with JWT; trust forwarded headers only from allowlisted proxy topology; reject mismatch generically. | Disable branded context while preserving JWT-only legacy access. |
| Dashboard presents incomplete cloud data as current | High / Operations + Product | F1 completeness contract and prominent last-complete-sync/stale/unknown disclosure on every KPI surface. | Hide affected KPIs or mark unavailable; do not block POS or fabricate values. |
| KPI labels overstate financial meaning | High / Finance | Approve formulas and examples; prohibit net profit/P&L; use gross margin/COGS only after approval. | Remove or relabel the metric without altering source fiscal records. |
| UTC bucketing misstates local business day | High / Product + Finance | Tenant reporting-timezone contract and boundary fixtures, including midnight and daylight-policy cases. | Fall back to explicit UTC labeling or disable affected period comparison until corrected. |
| Browser tokens are exposed or refresh flow is abused | High / Security | Threat model, hardened session contract, CSP/CORS/CSRF controls, rotation/revocation tests, no token logging. | Revoke/rotate sessions, disable dashboard login, keep POS authentication path available. |
| Cloudflare wildcard routing differs from assumptions | High / Infrastructure | I1 proof before launch; Worker router/proxy fallback with explicit original-host trust contract. | Revert DNS/routing to a non-wildcard safe host or Worker fallback. |
| DGI invariant regression from dashboard writes | Critical / DGI Compliance + Backend | Dashboard never creates/modifies/deletes invoices. Regression tests assert no mutation and preserve sequence evidence. Write operations limited to catalog/products/promotions/users—never fiscal documents. | Disable fiscal UI/export entry point; never repair by deleting or renumbering invoices. |
| Write-operation creates inconsistent state under concurrent POS sync | High / Backend + Security | Write operations use idempotent patterns; POS sync uses delta-based conflict resolution; E2E test for concurrent web write + POS sync per entity. | Revert the write operation; POS remains source of truth for sales/inventory mutations. |
| Manager executes write outside authorization boundary | High / Security | `AuthoritativeCurrentUserGuard` validates JWT against DB state on every write; `RolesGuard` enforces OWNER/MANAGER-only; audit log records actor, timestamp, and before/after. | Disable affected write endpoint; review audit log for scope of impact. |
| Batch exceeds review capacity | Medium / Engineering | Count authored additions plus deletions; split by autonomous outcome before 400 lines. | Stop review and re-slice; no `size:exception` without maintainer approval. |

**Recovery principle:** The safest degraded mode is backoffice unavailability or an explicit "data unavailable/stale" state. The POS continues to sell and persist locally when the backoffice, Railway API, Cloudflare path, or internet is down. Recovery never mutates historical invoices or substitutes host/slug trust for JWT authorization. Write-operation failures in the backoffice never affect POS operation.

---

## 11. Review budget and ordered PR forecast

| Order | PR | Expected authored changed lines | Review focus | Dependency |
| --- | --- | ---: | --- | --- |
| 1 | OD-01 tenant-bound transaction primitive | 220–340 | Transaction lifecycle, parameterized binding, DB probe | D0 access-policy direction |
| 2 | OD-02 sales dashboard RLS proof | 280–390 | Real DB role/policies, relational isolation, fail-closed route | OD-01 |
| 3 | OD-03 tenant slug context | 300–390 | Migration safety, context/JWT comparison, legacy POS login | OD-02 |
| 4+ | Deferred batches after recalibration | Re-estimated per batch | One autonomous outcome and its evidence | OD-03 checkpoint |

- Budget is **fewer than 400 authored additions plus deletions per PR**; generated/vendor output does not excuse reviewer burden and remains visible in complete diff identity.
- Each PR carries implementation, focused tests, runtime/DB evidence, observability, rollback boundary, and any contract documentation for that work unit.
- Commits follow the same outcome boundary; do not split models, services, and tests into non-working commits.
- **Chained PR triggers:** a forecast or actual diff reaches 400 changed lines, one atomic outcome requires ordered review, or a policy/migration prerequisite cannot safely fit in the current PR. Split into independently valid stacked PRs when possible. If integration cannot land independently, use a feature-branch chain with a draft/no-merge tracker. A `size:exception` requires explicit maintainer acceptance and a focused review plan.

---

## 12. Traceability and evidence lifecycle

| State | Required evidence | Who can advance it |
| --- | --- | --- |
| **Planned** | Authority links, outcome, dependencies, owner decisions, acceptance criteria, test/harness plan, line forecast, rollback boundary. | Batch owner with required decision-owner approvals. |
| **Implemented** | PR/commit link, actual diff boundary, migration/config snapshot, updated contract docs, and observability hooks. | Implementer; author assertion alone is not verification. |
| **Verified** | Exact focused test results, real PostgreSQL/browser/runtime receipts as applicable, negative security cases, KPI fixture reconciliation, and reviewer/CI links. | Reviewer/CI plus Security/Finance/DGI owner where relevant. |
| **Operationally Proven** | Staging/pilot telemetry, synthetic checks, routing/TLS proof, freshness behavior under lag, incident/rollback rehearsal, and named sign-off. | Operations with the relevant domain owner. |

Every batch maintains an evidence index linking backward to its authority and forward to dependent batches. Evidence is append-only in meaning: later failures add a superseding result rather than rewriting a failed receipt as successful. "Implemented" never implies "Verified," and "Verified" never implies production readiness.

---

## 13. Recalibration checkpoints

### After OD-03

- Re-check the DAG using actual OD-01/02/03 line counts, DB-role findings, migration behavior, and security-negative tests.
- Resolve whether I1 can use Pages directly or needs the Worker fallback; do not let infrastructure routing redefine authorization.
- Detail only the next two or three batches, expected to cover D0/F1/browser-session readiness before SPA work.
- Stop if RLS proof, POS login compatibility, or slug mismatch handling is incomplete.

### After the executive sales pilot (W2)

- Compare approved KPI fixtures with pilot totals and investigate timezone/sync lag before expanding scope.
- Review owner comprehension of last-complete-sync and stale/partial states.
- Re-estimate W3/W4, write-operation batches (W5–W10), browser observability, and API performance from measured evidence.
- Stop expansion if users interpret gross sales/COGS as net profit or cannot identify stale data.

### After the two-tenant pilot (P1)

- Repeat adversarial cross-tenant checks, wildcard/Worker routing checks, token revocation, and recovery drill.
- Review freshness distribution, route errors, report latency, support incidents, write-operation audit trails, and DGI audit usability separately for both tenants.
- Advance to GA only with no critical isolation/DGI/write-safety findings and explicit Product, Finance, Security, Backend, Infrastructure, and Operations sign-off.

---

## 14. One next action

Create and approve the D0 decision record for access policy (including write-operation ACL matrix), KPI terminology/formulas, and tenant reporting timezone, then open OD-01 with its PostgreSQL evidence command fixed in the PR contract.
