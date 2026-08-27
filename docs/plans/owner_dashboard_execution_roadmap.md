# Owner Dashboard: Evidence-Gated Execution Roadmap

**Status:** Proposed execution roadmap; implementation has not started.  
**Purpose:** Deliver a tenant-safe, read-only owner dashboard without weakening the offline POS, PostgreSQL isolation, or DGI controls. The roadmap defines the complete journey to general availability (GA), while fully detailing only the next three evidence-producing batches.  
**Authority:** Product and domain intent comes from `docs/PRDs/Product_Requirement_Document.md`, `docs/PRDs/Product_Requirement_Document_v2.md`, `docs/PRDs/prd_modulo_ventas.md`, `docs/PRDs/prd_gestion_inventario.md`, `openspec/specs/identity/spec.md`, `openspec/specs/inventory-core/spec.md`, `openspec/specs/sales-core/tasks.md`, `docs/DESIGN.md`, and `docs/plans/master_execution_roadmap.md`. Current code is authoritative for existing behavior and routes.

## 1. Scope and non-goals

### Scope

- A React + Vite owner SPA, deployed once on Cloudflare Pages, with a branded `{tenant-slug}.<brand-domain>` experience.
- The existing Railway-hosted NestJS `admin_backend` as the centralized, multi-tenant API.
- Read-only sales, inventory, and fiscal views backed by eventually consistent cloud data.
- Tenant isolation through the verified JWT `tenant_id` claim, explicit query filtering, transaction-bound PostgreSQL RLS, and cross-checked host/slug context.
- Evidence gates for KPI semantics, timezone, synchronization freshness, browser authentication, deployment routing, observability, and a two-tenant pilot.

### Non-goals

- Replacing, embedding, or making the Flutter POS depend on the dashboard.
- Moving the source of operational truth from local SQLite to the cloud.
- Creating invoice, cancellation, inventory mutation, or other write workflows in the dashboard.
- Deleting or rewriting invoices, relaxing sequential-number auditing, or changing DGI behavior.
- Presenting net profit, P&L, or expense-based profitability; expense data does not exist.
- Assuming Cloudflare Pages wildcard custom-domain behavior before an infrastructure proof.
- Exhaustively decomposing work after the next three batches; later batches are intentionally recalibrated from evidence.

## 2. Decisions already made and assumptions requiring validation

### Decisions already made

| Decision | Consequence | Owner |
| --- | --- | --- |
| Flutter POS remains offline-first; local SQLite is operational source of truth. | POS sales continue when cloud, dashboard, or internet is unavailable. Dashboard data is an eventually consistent mirror. | Product / Architecture |
| NestJS `admin_backend` remains the central API on Railway. | Dashboard capabilities extend existing modules and routes rather than creating a second backend. | Backend / Infrastructure |
| The owner client is a React + Vite SPA deployed once on Cloudflare Pages. | Tenant branding and routing must not require one build per tenant. | Product / Infrastructure |
| The verified JWT `tenant_id` claim is authorization authority. | A host, forwarded host, slug, header, query value, or client tenant UUID can provide context only; the server must resolve and compare it to the JWT claim. | Security |
| Isolation is defense in depth. | Explicit tenant predicates remain even after transaction-local RLS is proven. | Security / Backend |
| Dashboard invoice behavior is read-only. | No delete, cancel, renumber, correction, or invoice mutation endpoint is introduced. | Product / DGI Compliance |
| Review budget is fewer than 400 authored changed lines per PR. | Tests and evidence stay with each behavior; oversized work is split before review. | Engineering |

### Assumptions requiring validation

| Assumption or decision needed | Validation gate | Decision owner | Blocking effect |
| --- | --- | --- | --- |
| KPI names, formulas, inclusions, cancellation treatment, and reporting timezone are approved. | D0 decision record with examples and fixture totals. Finance must review `netTaxableSales`, gross margin, and shrinkage-inclusive COGS terminology. | Product / Finance | Blocks executive KPI exposure, not tenant-isolation foundations. |
| Owner and manager access policy is sufficient for each report and export. | Endpoint-by-role matrix approved against current guards. | Product / Security | Blocks route exposure in the SPA. |
| Browser token storage, refresh rotation, logout/revocation, CSRF posture, CORS, and CSP are production-safe. | Threat model and browser-session contract. | Security | Blocks W1. |
| A reliable per-tenant “last complete sync” can be computed. | F1 contract defines source streams, completeness, lag states, and unknown/degraded behavior. | Backend / Operations | Blocks KPI publication in W2–W4. |
| Cloudflare Pages can route the approved wildcard custom domain and preserve the intended tenant context. | Infrastructure spike with DNS, TLS, preview/production routing, and request-header evidence. | Infrastructure | Blocks production branded routing. A Cloudflare Worker proxy/router is the documented fallback. |
| Railway deployment, database role behavior, and production-like RLS settings match test assumptions. | Deployment manifest/runbook and staging probe. | Infrastructure / Backend | Blocks operational proof and pilot. |

## 3. Current-state evidence and gap matrix

All referenced paths below exist in the repository. Findings describe the current source, not planned behavior.

| Capability | Current evidence | Gap or consequence |
| --- | --- | --- |
| Offline and DGI foundation | `docs/PRDs/Product_Requirement_Document.md`, `docs/PRDs/Product_Requirement_Document_v2.md`, `docs/PRDs/prd_modulo_ventas.md`, and `openspec/specs/sales-core/spec.md` require offline operation, invoice immutability, cancellation-only correction, and sequential numbering. | Dashboard must disclose cloud staleness and remain read-only. Its outage cannot interrupt POS operation. |
| Multi-tenant intent | `openspec/specs/identity/spec.md`, `openspec/specs/sales-core/tasks.md`, and `docs/DESIGN.md` require tenant-scoped access/RLS. | Intent is not sufficient evidence that every dashboard query executes inside a tenant-bound transaction. |
| Existing sales APIs | `apps/admin_backend/src/modules/sales/controllers/reports.controller.ts` exposes `GET /sales/reports/dashboard`, `/hourly-sales`, `/top-products`, `/cashier-performance`, `/fiscal/monthly-summary`, `/fiscal/voided-invoices`, `/fiscal/sequence-audit`, `/export/sales-book`, and `/export/z-reports`. Guards allow owner/manager roles. | Reuse these routes; do not invent replacements. Isolation, semantics, timezone, freshness, and browser suitability must be proven before exposure. |
| Existing inventory APIs | `apps/admin_backend/src/modules/inventory/controllers/inventory-reports.controller.ts` exposes `GET /inventory/reports/valuation`, `/cogs`, `/kardex`, and `/alerts`. | Reuse after the same isolation and freshness gates. |
| Explicit tenant filtering | `apps/admin_backend/src/modules/sales/services/sales-reports.service.ts` and `apps/admin_backend/src/modules/inventory/services/inventory-reports.service.ts` include tenant predicates. | Preserve them. They are one control, not a substitute for RLS. |
| Request tenant handling | `apps/admin_backend/src/core/database/rls.interceptor.ts` verifies that the JWT carries `tenant_id`, but only calls `next.handle()`; its comment delegates transaction binding to services. | There is no request-wide guarantee that report queries bind `app.tenant_id` to the same transaction. This is a blocker before dashboard data exposure. |
| Transaction-binding precedents | `apps/admin_backend/src/modules/catalog/catalog.service.ts` and `apps/admin_backend/src/modules/sales/services/invoices.service.ts` use transaction-local `set_config('app.tenant_id', ..., true)` in service-specific helpers. | Reuse the proven idea through a narrow shared primitive; do not claim the capability is globally enforced today. |
| Real PostgreSQL test precedent | `apps/admin_backend/src/modules/sales/services/invoices.service.db.spec.ts` and multiple migration DB specs exercise PostgreSQL and `app.tenant_id`. | Extend this capability to the existing sales dashboard route and its relational reads. Unit mocks alone are insufficient. |
| KPI/timezone behavior | `sales-reports.service.ts` treats `subtotal` as `netTaxableSales`, constructs date bounds in UTC, and buckets hourly sales with `getUTCHours()`. `inventory-reports.service.ts` includes shrinkage in `totalCogsNio`. | Product/Finance must approve terminology and reporting timezone. Do not label these values as profit or P&L. Gross margin/COGS labels wait for approval. |
| Authentication | `apps/admin_backend/src/modules/identity/controllers/auth.controller.ts` returns access and refresh tokens in response bodies; refresh accepts `userId` and `refreshToken`. `auth.guard.ts` verifies bearer JWT issuer, audience, algorithm, and access-token shape. | JWT verification is a useful base, but repository evidence does not yet demonstrate a hardened browser session, cookie strategy, CSRF/CORS/CSP posture, or host-context enforcement. |
| Tenant identity and branding | `apps/admin_backend/src/modules/tenant/entities/tenant.entity.ts` contains id, name, RUC, active status, and timestamps only. | No slug or branding contract exists. Branding fields beyond the slug are deferred until their asset/storage contract is defined. |
| Web owner app | `apps/` currently contains only `admin_backend/` and `pos_app/`. | The React + Vite SPA does not exist. |
| Sync freshness | Existing report DTOs expose generation timestamps, while identity staff sync has a narrow snapshot timestamp. | No dashboard contract proves the last complete tenant sync across required sales/inventory streams. `generatedAt` is not freshness evidence. |
| Deployment proof | No repository `wrangler` or Railway deployment configuration was found. | Cloudflare/Railway are approved baselines, not repository-proven deployments. Wildcard routing remains an infrastructure gate. |
| Operational proof | Existing tests support backend features, but no owner-dashboard telemetry, SLO, runbook, or two-tenant pilot evidence exists. | GA requires O1 and P1 evidence, not only successful CI. |

## 4. Dependency DAG, critical path, and parallel-safe branches

```text
D0 KPI semantics + timezone + access policy
  └─> S1 tenant-bound DB transaction primitive (OD-01)
       └─> S2 real PostgreSQL RLS proof on sales dashboard (OD-02)
            └─> T1 tenant slug + server-verified host/login context (OD-03)
                 ├─> F1 sync-freshness contract
                 │    └─> W1 SPA + browser-auth shell
                 │         └─> W2 executive sales snapshot
                 │              ├─> W3 inventory insight
                 │              └─> W4 fiscal/audit views
                 │                    └─> O1 hardening + telemetry
                 │                         └─> P1 two-tenant pilot
                 │                              └─> GA
                 └─> I1 Cloudflare wildcard spike ────────────────┘
                          └─fallback: Cloudflare Worker router/proxy
```

**Critical path:** D0 → S1 → S2 → T1 → F1 → W1 → W2 → W3/W4 → O1 → P1 → GA. Authorization and isolation precede data exposure; freshness precedes KPI publication; operational evidence precedes GA.

**Parallel-safe branches:**

- I1 may run after the tenant-slug contract is stable and in parallel with F1/W1. It must not define authorization policy.
- Brand asset preparation and non-sensitive visual tokens may proceed in parallel with F1, but persistence/API shape waits for T1.
- W3 inventory and W4 fiscal views may proceed in parallel only after W2 proves the common shell, freshness disclosure, and tenant-safe API pattern. They must not share concurrent writers on auth, tenant context, or KPI contracts.
- D0 Finance semantics and Security access-policy reviews may run in parallel, but both produce one readiness record before KPI exposure.

## 5. Milestone roadmap: readiness through GA

| Milestone | Outcome | Dependencies | Exit gate and linked evidence expectation |
| --- | --- | --- | --- |
| D0 — Decision readiness | Approved KPI dictionary, reporting timezone, access matrix, DGI read-only boundary, and named owners. | Authority documents and current DTO/service behavior. | Product/Finance/Security decision record; fixture examples reconcile formulas and cancellations. Unresolved terms are explicitly blocked, not guessed. |
| S1 — Tenant transaction foundation | One reusable transaction primitive binds the verified tenant to `app.tenant_id` without removing explicit filters. | D0 access-policy direction. | OD-01 tests prove bind-before-query, commit/rollback/release, and no tenant leakage in logs. |
| S2 — Sales isolation proof | The existing sales dashboard route is protected by explicit filtering plus real PostgreSQL RLS in the same transaction. | S1. | OD-02 two-tenant DB evidence proves JWT T1 cannot read T2 and missing/mismatched context fails closed. |
| T1 — Tenant context | Stable tenant slugs provide branding/login context and are always resolved and cross-checked server-side; existing POS login remains valid. | S2. | OD-03 compatibility and mismatch tests; no client tenant UUID/slug becomes authorization authority. |
| F1 — Freshness contract | Every dashboard response can disclose last complete sync, incomplete streams, and stale/unknown state for the requested tenant. | T1; Operations stream inventory. | Contract tests plus seeded stream scenarios; Product approves stale-state copy and thresholds. POS remains unaffected by cloud lag. |
| W1 — Web foundation | React + Vite SPA authenticates safely, resolves tenant context, renders branding, and handles expired/revoked sessions without exposing data. | T1, F1, Security browser-session decision. | Browser threat-model checklist, auth integration tests, CSP/CORS evidence, accessibility baseline, and no sensitive token leakage. |
| W2 — Executive sales pilot | Owners can view an approved sales snapshot with timezone and freshness disclosure using existing report routes. | W1 and Finance-approved sales semantics. | API contract tests, UI tests, fixture reconciliation, tenant-isolation receipt, and pilot telemetry. This is the executive sales pilot recalibration point. |
| W3 — Inventory insight | Owners can inspect valuation, approved COGS/gross-margin terminology, Kardex, and alerts without mutation. | W2, Finance COGS approval, F1 inventory completeness. | Reconciled inventory fixtures, stale-state behavior, role checks, and read-only route inventory. |
| W4 — Fiscal/audit views | Owners can inspect monthly fiscal summary, voids, sequence audit, and exports without changing fiscal records. | W2, DGI review, F1 sales completeness. | DGI checklist, immutable/cancellation-only regression evidence, export authorization tests, and sequence-audit fixtures. |
| I1 — Branded routing proof | Approved wildcard domain works end to end, or the Worker fallback is selected with known headers/trust boundaries. | T1 contract. | DNS/TLS/request-routing receipt in preview and production-like environments; forged forwarded-host test; rollback instructions. |
| O1 — Hardening and operations | Dashboard has actionable telemetry, privacy-safe logs, runbooks, alert thresholds, rate limits, and recovery drills. | W2–W4 and I1. | Staging soak, synthetic tenant checks, auth/5xx/freshness dashboards, incident drill, and rollback receipt. |
| P1 — Two-tenant pilot | Two representative tenants complete sales, inventory, and fiscal journeys with demonstrated isolation and acceptable freshness. | O1. | Pilot sign-off, cross-tenant negative tests, support log, KPI reconciliation, and rollback rehearsal. |
| GA — Controlled availability | Dashboard is supportable, tenant-safe, DGI-safe, and operationally proven. | P1 with no open critical findings. | Product/Security/Finance/Infrastructure/Operations approvals and a complete evidence index. |

## 6. Detailed contracts for the next three batches

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

- **Goal:** Execute `GET /sales/reports/dashboard` reads through OD-01’s tenant-bound transaction and prove on real PostgreSQL that a valid T1 JWT cannot observe T2 invoices, items, or payments.
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
- **In scope:** Unique normalized tenant slug with reversible migration/backfill strategy; server resolver from slug to active tenant; optional validated `tenantSlug` login field (or equivalent context header contract) that resolves server-side and must match the authenticated user’s tenant; protected-request comparison of optional slug/verified host context against the verified JWT claim; legacy login without slug remains unchanged; unit/integration tests for normalization, duplicates, inactive tenants, forged host/header, mismatch, and legacy POS payload.
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

## 7. Milestone-level deferred backlog

These are candidate outcomes, not exhaustive task lists. IDs and boundaries are recalibrated after OD-03.

| Suggested batch ID | Milestone-level outcome | Primary gate/owner |
| --- | --- | --- |
| OD-04 | D0 KPI dictionary and reporting-timezone contract is encoded in API examples and fixtures. | Product / Finance |
| OD-05 | F1 tenant sync-freshness endpoint/metadata distinguishes complete, stale, partial, and unknown streams. | Backend / Operations |
| OD-06 | Browser session hardening establishes token/refresh/logout, CSRF, CORS, CSP, and revocation posture. | Security |
| OD-07 | W1 React + Vite shell provides tenant context, branding seam, auth states, accessibility, and freshness banner. | Frontend / Security |
| OD-08 | W2 executive sales snapshot uses the existing dashboard/hourly/top-products/cashier routes with approved semantics. | Product / Finance |
| OD-09 | I1 Cloudflare wildcard routing spike proves Pages behavior or selects the Worker fallback. | Infrastructure |
| OD-10 | W3 inventory insight uses existing valuation/COGS/Kardex/alerts routes with approved COGS language. | Finance / Backend |
| OD-11 | W4 fiscal views use existing summary/void/sequence/export routes and preserve read-only DGI boundaries. | DGI Compliance / Backend |
| OD-12 | O1 telemetry, rate limits, privacy-safe logging, synthetic checks, runbooks, and recovery drill are operational. | Operations / Security |
| OD-13 | Executive sales pilot reconciles KPIs and usability with one controlled tenant. | Product / Finance / Operations |
| OD-14 | P1 two-tenant pilot proves isolation, freshness, supportability, and branded routing. | Security / Operations / Infrastructure |
| OD-15 | GA gate closes pilot findings and publishes support/rollback ownership. | All decision owners |

## 8. Risks, mitigations, and rollback/recovery strategy

| Risk | Severity / owner | Mitigation | Rollback or recovery trigger |
| --- | --- | --- | --- |
| Cross-tenant disclosure through unbound repositories or RLS bypass roles | Critical / Security + Backend | OD-01 primitive, OD-02 real PostgreSQL proof, explicit predicates, role inspection, staging canary. | Disable affected dashboard route/client release immediately; never bypass RLS to restore availability. |
| Host or slug becomes an authorization input | Critical / Security | Resolve server-side and compare with JWT; trust forwarded headers only from allowlisted proxy topology; reject mismatch generically. | Disable branded context while preserving JWT-only legacy access. |
| Dashboard presents incomplete cloud data as current | High / Operations + Product | F1 completeness contract and prominent last-complete-sync/stale/unknown disclosure on every KPI surface. | Hide affected KPIs or mark unavailable; do not block POS or fabricate values. |
| KPI labels overstate financial meaning | High / Finance | Approve formulas and examples; prohibit net profit/P&L; use gross margin/COGS only after approval; review `netTaxableSales` and shrinkage treatment. | Remove or relabel the metric without altering source fiscal records. |
| UTC bucketing misstates local business day | High / Product + Finance | Tenant reporting-timezone contract and boundary fixtures, including midnight and daylight-policy cases. | Fall back to explicit UTC labeling or disable affected period comparison until corrected. |
| Browser tokens are exposed or refresh flow is abused | High / Security | Threat model, hardened session contract, CSP/CORS/CSRF controls, rotation/revocation tests, no token logging. | Revoke/rotate sessions, disable dashboard login, keep POS authentication path available. |
| Cloudflare wildcard routing differs from assumptions | High / Infrastructure | I1 proof before launch; Worker router/proxy fallback with explicit original-host trust contract. | Revert DNS/routing to a non-wildcard safe host or Worker fallback; API and POS remain independent. |
| DGI invariant regression | Critical / DGI Compliance + Backend | Dashboard only calls GET report/export routes; regression tests assert no mutation/delete and preserve sequence evidence. | Disable fiscal UI/export entry point; never repair by deleting or renumbering invoices. |
| Batch exceeds review capacity | Medium / Engineering | Count authored additions plus deletions; split by autonomous outcome before 400 lines. | Stop review and re-slice; no `size:exception` without maintainer approval. |

**Recovery principle:** The safest degraded mode is dashboard unavailability or an explicit “data unavailable/stale” state. The POS continues to sell and persist locally when the dashboard, Railway API, Cloudflare path, or internet is down. Recovery never mutates historical invoices or substitutes host/slug trust for JWT authorization.

## 9. Review budget and ordered PR forecast

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

## 10. Traceability and evidence lifecycle

| State | Required evidence | Who can advance it |
| --- | --- | --- |
| **Planned** | Authority links, outcome, dependencies, owner decisions, acceptance criteria, test/harness plan, line forecast, rollback boundary. | Batch owner with required decision-owner approvals. |
| **Implemented** | PR/commit link, actual diff boundary, migration/config snapshot, updated contract docs, and observability hooks. | Implementer; author assertion alone is not verification. |
| **Verified** | Exact focused test results, real PostgreSQL/browser/runtime receipts as applicable, negative security cases, KPI fixture reconciliation, and reviewer/CI links. | Reviewer/CI plus Security/Finance/DGI owner where relevant. |
| **Operationally Proven** | Staging/pilot telemetry, synthetic checks, routing/TLS proof, freshness behavior under lag, incident/rollback rehearsal, and named sign-off. | Operations with the relevant domain owner. |

Every batch maintains an evidence index linking backward to its authority and forward to dependent batches. Evidence is append-only in meaning: later failures add a superseding result rather than rewriting a failed receipt as successful. “Implemented” never implies “Verified,” and “Verified” never implies production readiness.

## 11. Recalibration checkpoints

### After OD-03

- Re-check the DAG using actual OD-01/02/03 line counts, DB-role findings, migration behavior, and security-negative tests.
- Resolve whether I1 can use Pages directly or needs the Worker fallback; do not let infrastructure routing redefine authorization.
- Detail only the next two or three batches, expected to cover D0/F1/browser-session readiness before SPA KPI work.
- Stop if RLS proof, POS login compatibility, or slug mismatch handling is incomplete.

### After the executive sales pilot

- Compare approved KPI fixtures with pilot totals and investigate timezone/sync lag before expanding scope.
- Review owner comprehension of last-complete-sync and stale/partial states.
- Re-estimate W3/W4, browser observability, support load, and API performance from measured evidence.
- Stop expansion if users interpret gross sales/COGS as net profit or cannot identify stale data.

### After the two-tenant pilot

- Repeat adversarial cross-tenant checks, wildcard/Worker routing checks, token revocation, and recovery drill.
- Review freshness distribution, route errors, report latency, support incidents, and DGI audit usability separately for both tenants.
- Advance to GA only with no critical isolation/DGI findings and explicit Product, Finance, Security, Backend, Infrastructure, and Operations sign-off.

## 12. One next action

Create and approve the D0 decision record for access policy, KPI terminology/formulas, and tenant reporting timezone, then open OD-01 with its PostgreSQL evidence command fixed in the PR contract.
