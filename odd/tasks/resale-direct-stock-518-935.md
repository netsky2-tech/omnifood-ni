# Feature: Resale Direct Stock Deduction & Product Type Coexistence (#518 + #935, DEC-8)

- Branch: `feat/resale-direct-stock-518-935`
- Normative scope (`docs/inventario_marco_normativo.md`): touches `R-01` (lower of cost or market via CPP/writedown), `R-04` (perishable batch/FEFO tracking), `R-05`/`R-06` (signed per-page physical count lists & DGI registers); complies by backing every `DIRECT_STOCK` resale product with a system-managed `Insumo` (`catalog_kind = 'PRODUCT_RESALE'`, hidden from kitchen raw-material lists) linked via `ProductInventoryMappingVersion`.
- Approved architecture: **Path A (DEC-8 UX + Single Managed Ledger)** — zero dual-catalog friction, zero engine duplication, 100% `SALE_TIME_V1` & SOHO `NOT_TRACKED` backward compatibility.

## Specs

- **S1 — Production Safety & SOHO Invariance:** Existing `SIMPLE` products with `inventory_policy = 'NOT_TRACKED'` (default) continue selling with `SaleLineDisposition.noImpact` (`APPLIED_NO_INVENTORY_IMPACT`), zero stock deduction, and zero checkout blocking.
- **S2 — Backend Schema, RLS & System-Managed Resale Backing (`#518`, `#935`, DEC-8):**
  - `products.inventory_policy` (`NOT_TRACKED` | `DIRECT_STOCK`, default `NOT_TRACKED`), backfilled to `DIRECT_STOCK` for any `SIMPLE` product with an existing active `ProductInventoryMappingVersion`.
  - `insumos.catalog_kind` (`RAW_MATERIAL` | `PRODUCT_RESALE`, default `RAW_MATERIAL`) and `insumos.managed_product_id` (nullable UUID, partial unique index per `(tenant_id, managed_product_id)`).
  - Enabling `DIRECT_STOCK` on a `SIMPLE` product atomically provisions/reactivates its managed `PRODUCT_RESALE` `Insumo` and active `ProductInventoryMappingVersion`; renaming/updating `uom`/`is_perishable`/`is_active` syncs the backing `Insumo`; switching to `NOT_TRACKED` supersedes the active mapping without deleting ledger history. `DIRECT_STOCK` is rejected for `COMPOUND`/`PREPARED`/`VARIANT_PARENT`.
- **S3 — Clean Kitchen Insumos, Purchases & Stock Mirroring:**
  - `GET /insumos` defaults to `RAW_MATERIAL` only (clean kitchen view), with optional `?catalogKind=RAW_MATERIAL|PRODUCT_RESALE|ALL` (or `?includeResale=true`) for purchases, counts, valuation, shrinkage, and sync.
  - Purchases, sales, voids (`SALE_CANCEL`), credit note restocks (`CREDIT_NOTE_RESTOCK`), physical counts (`AJUSTE_CONTEO`), shrinkage (`SHRINKAGE`), and valuation writedowns (`VALUATION_WRITEDOWN`) on a managed `PRODUCT_RESALE` insumo mirror `stock` and `average_cost` back onto `products` in the same transaction.
  - `InboundSyncService` emits `inventoryPolicy` on `InboundSyncProductDto` and includes `PRODUCT_RESALE` insumos in POS sync payloads.
- **S4 — Full Product-Type Coexistence (Offline POS + Backend Sync):**
  - All product types coexist in the same cart, invoice, void, and sync batch without failure:
    1. `SIMPLE` + `NOT_TRACKED` (`NO_IMPACT`)
    2. `SIMPLE` + `DIRECT_STOCK` (1:1 deduction + symmetric `SALE_CANCEL` / `CREDIT_NOTE_RESTOCK` reversal)
    3. `SIMPLE` + explicit legacy `ProductInventoryMappingVersion` (`PUT /products/:id/inventory-mapping`)
    4. `COMPOUND` / `PREPARED` + direct recipe + modifiers (`ADD`/`SWAP`/`REMOVE`/`SCALE`)
    5. `COMPOUND` / `PREPARED` + nested `SUB_RECIPE` (multi-level BOM + yield + technical shrink)
    6. `COMPOUND` / `PREPARED` without published recipe (`PENDING_RECIPE`, never blocks checkout)
- **S5 — POS Honesty & Dead-Path Cleanup (`#518` D1, D2, R3, R4, R5):**
  - Sync `inventoryPolicy` into POS `ProductEntity`/`Product`.
  - Fix misleading copy in `insumo_view.dart` / `insumo_view_model.dart`, surface clear tracking status on POS product/inventory UI, and remove dead `directStockInsumoId` usage without breaking legacy DB/JSON deserialization.
- **S6 — Owner Dashboard UI & Onboarding Template (`#935` Phase 3, `#518` D3/R6):**
  - `product-page.tsx`: toggle *"Controlar existencias en este producto"* for `SIMPLE` products (`DIRECT_STOCK` vs `NOT_TRACKED`), no insumo picker.
  - `purchases-form.tsx` / `purchases-tab.tsx`: choose *"Materia Prima (Insumo)"* vs *"Producto de Reventa"* (by commercial product name).
  - `insumos-tab.tsx`: displays kitchen raw materials (`RAW_MATERIAL`) only.
  - `docs/client-onboarding/plantilla_productos.csv` + `SOHO_REQUISITOS_PUESTA_EN_MARCHA.md`: add `controla_stock` column and DEC-8 guidance.
- **S7 — Real Android Hardware E2E (Samsung Galaxy S23):**
  - Execute `apps/pos_app/integration_test/resale_coexistence_s23_hardware_e2e_test.dart` on real Samsung Galaxy S23 (`R5CWB2LQJDJ`, no mocks) covering a mixed cart with all product types + offline `SALE_TIME_V1` deduction + symmetric `SALE_CANCEL` restoration.

## Tasks

- [ ] `T1` (S1, S2) [worker] Backend migration (`inventory_policy`, `catalog_kind`, `managed_product_id`), schema build registration & real-PG migration `.db.spec.ts` — commit: pending
- [ ] `T2` (S1, S2, S3, S4) [worker] Backend `ProductService` resale provisioning, `InsumoService` filtering, stock/CPP mirror to `products`, `InboundSyncService`, unit + real-PG coexistence `.db.spec.ts` — commit: pending
- [ ] `T3` (S1, S4, S5) [worker] POS `inventoryPolicy` sync, D1/D2 honesty & cleanup, and offline coexistence unit/integration tests — commit: pending
- [ ] `T4` (S6) [worker] Owner Dashboard toggle + Purchases resale selector + clean Insumos tab + onboarding CSV/docs + Vitest/build — commit: pending
- [ ] `T5` (S7) [inline + S23 hardware] Real Samsung Galaxy S23 hardware E2E test (`resale_coexistence_s23_hardware_e2e_test.dart`) — commit: pending
- [ ] `T6` (S1–S7) [verify] Independent `gentle-ai-verify` (Risk: item 1 + item 3), full local checks, PR closing `#518` & `#935` — commit: pending

## Log

- **L1 (User request verbatim):** `- #518 + #935 (deducción directa de stock para productos de reventa sin insumo intermedio) Esto toca core, es delicado, asi hagamos todas las pruebas habidas y por haber incluyendo en dispositivo. También investigacion por que aqui hablamos de manejar diferentes tipos de productos, recetas, sin recetas, sub recetas, re ventas y deben poder convivir todas sin fallos.`
- **L2 (Architectural decision):** User approved **Camino A (Recomendado)**: Toggle `Controlar existencias en este producto` (`DIRECT_STOCK` vs `NOT_TRACKED`) on `Product` + system-managed backing `Insumo` (`catalog_kind = 'PRODUCT_RESALE'`, hidden from kitchen raw-material lists) + automatic `ProductInventoryMappingVersion` + `products.stock`/`average_cost` mirror. Preserves single ledger (`SALE_TIME_V1`, Kardex, CPP, FEFO batches, `R-01`–`R-07` compliance) and 100% SOHO `NOT_TRACKED` invariance.
