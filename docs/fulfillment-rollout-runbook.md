# Fulfillment Rollout Runbook & Operational Guide

## 1. Executive Summary & Rollout Strategy

This runbook outlines the operational procedures for rolling out and managing the **Configurable Fulfillment Topology** in OmniFood NI across Food Parks, high-rotation retail, and pilot establishments in Nicaragua.

The rollout follows strict compliance with:
- **Offline-First Resilience**: Local SQLite is the single source of truth; synchronization with the central cloud is idempotent and append-only.
- **DGI Disposición Técnica 09-2007**: Invoices and Kardex inventory movements are completely immutable (never deleted or rewritten during fulfillment rollbacks, purges, or reprints).
- **PostgreSQL 16 Multi-Tenant Row-Level Security (RLS)**: Enforced data isolation per `tenant_id`.

---

## 2. Catalog Backfill & Discrepancy Scanning

Before enabling fulfillment enforcement for an onboarding or migrating tenant, administrators run the backfill discrepancy scanner to detect catalog mismatches and cross-tenant data leaks.

### Endpoint: `GET /fulfillment/rollout/discrepancies`
- **Authentication**: JWT Bearer (`OWNER`, `ADMIN`)
- **Tenant Context**: Automatically isolated via RLS session parameter `app.tenant_id`.

### Discrepancy Types Detected:
1. `MISSING_RECIPE_BOM`:
   - Occurs when a product is marked `is_perishable: true` (or recipe-tracked) but has 0 associated recipe components.
   - **Remediation**: Configure recipe BOM in Admin Inventory before activating preparation routing.
2. `CROSS_TENANT_INSUMO_LEAK`:
   - Occurs when a recipe component references an insumo belonging to a foreign tenant.
   - **Remediation**: Critical security defect; recipe must be re-linked to the tenant's own insumo catalog.
3. `UNROUTED_PRODUCT_FALLBACK`:
   - Legacy or direct-sale products without explicit station routing.
   - **Safe Behavior**: POS automatically falls back to `DIRECT_HANDOFF` and dispatch station `general-dispatch` with a non-blocking alert. Offline sales are never interrupted.

---

## 3. Gated Compatibility & Emergency Rollback Control

If a catastrophic hardware failure occurs in a food park (e.g. kitchen thermal printer motherboard burnout, local WiFi mesh collapse), tenant administrators can toggle fulfillment enforcement off.

### Endpoints:
- `GET /fulfillment/rollout/rollback-status`
- `POST /fulfillment/rollout/rollback-toggle`

### Rollback Invariants:
- **Audit Logging**: Every toggle requires `rollback: boolean`, `reason: string`, and `authorizedBy: string`. The backend logs `[ROLLBACK-ACTIVE]` or `[ROLLBACK-RESTORED]`.
- **Zero Data Loss**: Toggling rollback **NEVER** deletes or modifies historical invoices, Kardex movements, audit logs, or fulfillment records.
- **POS Behavior**: When rolled back, POS operates in legacy mode (`fulfillmentContext: null`), completing sales and fiscal numbering without blocking on kitchen hardware.

---

## 4. Observability & Telemetry Dashboard

### Endpoint: `GET /fulfillment/rollout/dashboard`
Aggregates live fulfillment metrics:
- `tenantId`: Tenant identity.
- `currentRevision`: Active topology revision number.
- `operationMode`: free-form label read from the tenant's latest topology revision
  (`FOOD_PARK`, `RESTAURANT`, `HYBRID`, …). It is **not** validated and **not** a closed
  list: whatever the owner authored in the topology is what appears here. A tenant
  with no topology revision reports the explicit compatibility state
  `LEGACY_COMPATIBILITY`, never an inferred operating mode. See
  [Vocabulary boundary](#vocabulary-boundary-operationmode) below.
- `totalFulfillments`: Total historical fulfillment transactions.
- `channelsBreakdown`:
  - `PRINT_ONLY`: Thermal tickets and customer receipts.
  - `KDS_ONLY`: Kitchen display screens without paper tickets.
  - `KDS_AND_PRINT`: Synchronized KDS delivery and physical ticket printing.
- `enforcementStatus`: `ACTIVE` or `ROLLED_BACK`.

### Vocabulary boundary: `operationMode`

Two different fields in this repository are called `operationMode` and they do **not**
share a vocabulary. Their channels are disjoint — nothing compares, converts, or derives
one from the other — so a value that is valid in one channel is not a promise about the
other.

| | Fulfillment topology (this runbook's field) | Fiscal business profile |
|---|---|---|
| Where it lives | `tenant_topology_revisions.topology` (jsonb) | fiscal config parameters, surfaced via the fiscal setup response |
| Validation | **none** — the DTO checks only that the blob is a non-empty object | strict enum: `FOODPARK_QSR \| RESTAURANT \| HYBRID` |
| `FOOD_PARK` | an ordinary free-form label | **rejected** as an unknown value |
| Absent | `LEGACY_COMPATIBILITY` (explicit compatibility state) | `null` = never asserted by the office |
| Authored by | the owner, explicitly, per topology revision | the owner, from the dashboard, or left unset |

**Never infer one from the other.** A tenant that has no topology revision is in an
explicit compatibility state; guessing its operating mode from the fiscal channel (or the
reverse) reintroduces exactly the inferred defaults that were deliberately rejected during
the configurable-fulfillment-topology work. Device count, operation mode, channel mode and
roles are all owner-authored decisions.

The fiscal contract's own test suite enforces the boundary: it asserts that `FOOD_PARK` is
rejected as an unknown `operationMode` value (`apps/admin_backend/src/modules/onboarding/dto/fiscal-setup.dto.spec.ts`).

---

## 5. Automated Verification & Acceptance Test Evidence

The fulfillment implementation has been proven through a strict cycle:
`TDD -> Triangulación -> Integración -> E2E`

| Test Suite | Scope | Target | Result |
|---|---|---|---|
| `fulfillment-rollout.service.spec.ts` | Unit / Triangulation (8 tests) | `admin_backend` (Jest) | **100% PASS** |
| `fulfillment-rollout.service.db.spec.ts` | Real PostgreSQL 16 Integration (Zero Mocks) | Native Postgres (Isolated Schemas) | **100% PASS** |
| `fulfillment-rollout-pilot.e2e-spec.ts` | End-to-End Pilot Journey (Supertest) | NestJS + PostgreSQL 16 | **100% PASS** |
| `sync-outbox-replay.e2e-spec.ts` | Replay Idempotency & Outbox Sync | NestJS + PostgreSQL 16 | **100% PASS** |
| `fulfillment-retention.e2e-spec.ts` | 90-Day Retention Purge Invariants | NestJS + PostgreSQL 16 | **100% PASS** |
| `sales_repository_fulfillment_pilot_rollout_test.dart` | Pilot Rollout Integration (4 tests) | Flutter POS (SQLite / Floor) | **100% PASS** |
| Complete Flutter Fulfillment Suite (8 files) | Full POS Regression Suite (32 tests) | Flutter POS (SQLite / Floor) | **100% PASS** |
