# NHILOS Client Onboarding V1 — M3 Evidence Receipt (ONB1.3)

**Documento:** `ONB1.3_M3_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.3_M3_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.3A`, `ONB1.3B`, `ONB1.3C`, `ONB1.3D`, `ONB1.3E`, `ONB1.3F`, `ONB1.3G`  
**Fecha de ejecución:** 2026-09-03  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real) -> E2E sin mocks de persistencia ni deductibilidad.

---

# 1. Resumen de Entregables Físicos

### 1.1 Migraciones y Entidades de Persistencia (PostgreSQL)
- `apps/admin_backend/src/migrations/1797000000000-CreateTemplateSafeCutoverTables.ts`:
  - Creación de tabla `onboarding_template_applications` con constraint única `uq_onboarding_template_applications_tenant_idemp` sobre `(tenant_id, idempotency_key)`.
  - Creación de tabla `onboarding_template_seed_links` con constraint única de provenance `uq_template_seed_links_provenance` sobre `(tenant_id, template_code, source_item_id, target_entity_type)`.
  - Creación de tabla `legacy_onboarding_migration_receipts` con índices tenant-bound para trazabilidad de auditoría.
  - Extensión de `recipe_versions` con columnas de ciclo de vida seguro:
    - `origin`: varchar(64) default `'MANUAL'`
    - `publication_state`: varchar(64) default `'PUBLISHED'`
    - `suggestion_state`: varchar(64) default `'CONFIRMED'`
    - Índice compuesto de rendimiento y seguridad: `idx_recipe_versions_active_published` sobre `(tenant_id, product_id, is_active, publication_state)`.
  - Extensión de `industry_templates` con versionado e integridad:
    - `version`: int default 1
    - `source_fingerprint`: varchar(128)
- Entidades TypeORM correspondientes:
  - `TemplateApplication` (`apps/admin_backend/src/modules/onboarding/entities/template-application.entity.ts`)
  - `TemplateSeedLink` (`apps/admin_backend/src/modules/onboarding/entities/template-seed-link.entity.ts`)
  - `LegacyOnboardingMigrationReceipt` (`apps/admin_backend/src/modules/onboarding/entities/legacy-migration-receipt.entity.ts`)
  - `RecipeVersion` extendido con enums `RecipeOrigin`, `RecipePublicationState`, `RecipeSuggestionState`.
  - `IndustryTemplate` extendido con `version` y `source_fingerprint`.

### 1.2 Identidad Estable y Preview Side-Effect Free (ONB1.3A & ONB1.3B)
- `TemplatePreviewService` (`apps/admin_backend/src/modules/onboarding/services/template-preview.service.ts`):
  - Normalización de cada item global con:
    ```text
    templateCode
    templateVersion
    itemId
    itemType
    source fingerprint (sha256 determinista)
    ```
  - Contrato side-effect free (0 escrituras en base de datos) devolviendo por item:
    `NEW`, `EXISTING_LINKED`, `EXISTING_UNLINKED`, `CONFLICT`, `UNSUPPORTED` más efecto propuesto (`CREATE_PRODUCT`, `CREATE_INSUMO`, `NO_OP`, `LINK_EXISTING`).
  - Soporte de selección parcial (`selectedItemIds`): permite al usuario excluir items antes de aplicar.

### 1.3 Tenant-bound UoW, Salvaguarda DRAFT/SUGGESTED y Reglas de Reaplicación (ONB1.3C, D, E, F)
- `IndustryTemplateService.applyTemplate` (`apps/admin_backend/src/modules/onboarding/services/industry-template.service.ts`):
  - Coordinación transaccional tenant-bound de Catalog (Product Master), Inventory Master Data (Insumo) y Recipes (Pre-BOM).
  - **Eliminación de stock/costo ficticio**: insumos y productos creados nacen con `stock = 0`, `existenciaActual = 0`, `averageCost = 0`.
  - **Pre-BOM seguro**: recetas generadas nacen estrictamente con `origin = INDUSTRY_TEMPLATE`, `publication_state = DRAFT`, `suggestion_state = SUGGESTED`, y `is_active = false`.
  - **Eliminación de recetas legadas prematuras**: no se inserta ninguna fila en la tabla legada `Recipe` que pudiera sincronizarse prematuramente al POS.
  - **Idempotencia y Provenance**:
    - Generación y persistencia de `TemplateSeedLink` por cada elemento aplicado.
    - Reaplicación idéntica = no-op sobre elementos ya vinculados; actualiza `last_seen_version`.
    - Registro de `TemplateApplication` con `selectionHash` y lease de idempotencia coordinado con `OnboardingIdempotencyCoordinator`.

### 1.4 Protección de Deducción de Inventario (AC-45)
- `RecipeService.findActiveVersion` (`apps/admin_backend/src/modules/inventory/recipe.service.ts`):
  - Restringe la búsqueda de recetas activas a aquellas con `is_active = true` AND `publication_state = 'PUBLISHED'`.
  - Método `publishDraftVersion(tenantId, recipeVersionId)` para publicación explícita controlada por Recipes.
- `InvoicesService.resolveRecipeVersionId` (`apps/admin_backend/src/modules/sales/services/invoices.service.ts`):
  - Si un ítem vendido hace referencia a una receta en `DRAFT`, se descarta la deducción de BOM (`return null`), tratando el ítem como producto simple y protegiendo el Kardex contra consumo ficticio de insumos.

### 1.5 Escaneo de Recetas Legadas y Receipts de Auditoría (ONB1.3G)
- `LegacyTemplateRecipeScanService` (`apps/admin_backend/src/modules/onboarding/services/legacy-template-recipe-scan.service.ts`):
  - Inspecciona recetas activas y evalúa provenance contra plantillas oficiales.
  - Regla de seguridad inmutable: **nunca muta silenciosamente tenants operativos o recetas con ventas históricas**. Para estos emite recibo `KEEP_PUBLISHED` (o aplica decisión explícita documentada del propietario).
  - Tenants no operativos con recetas sin uso: migración segura a `DRAFT` con recibo `MOVE_TO_DRAFT`.
  - Recetas sin procedencia confiable: emisión de recibo `UNKNOWN_PROVENANCE` sin mutación.
  - Registro de auditoría persistido en `legacy_onboarding_migration_receipts`.

---

# 2. Evidencia de Ejecución de Pruebas

### 2.1 Unit & Triangulation Tests (Jest)
Comando ejecutado:
```bash
pnpm --filter admin_backend test -- src/modules/onboarding/ src/migrations/1797000000000-CreateTemplateSafeCutoverTables.spec.ts src/modules/inventory/recipe-draft-lifecycle.spec.ts
```
**Resultado:**
- 18 suites pasadas, **94 tests pasados**, 0 fallos.
- Cobertura completa de:
  - Migración 1797 (up y down ordenado con constraints y columnas).
  - Entidades de TemplateApplication, TemplateSeedLink, LegacyOnboardingMigrationReceipt.
  - `TemplatePreviewService`: preview libre de efectos secundarios, cálculo de fingerprints sha256 y detección de diffs.
  - `IndustryTemplateService`: ciclo de corte seguro, `is_active=false`, no-op en reapply, selección parcial.
  - `RecipeService` & `InvoicesService`: protección de BOM y descarte de deducción en DRAFT.
  - `LegacyTemplateRecipeScanService`: reglas de seguridad en tenants operativos vs no operativos y receipts obligatorios.

### 2.2 Integration & Real PostgreSQL E2E Tests (Zero Mocks)
Comandos ejecutados:
```bash
pnpm --filter admin_backend run test:e2e -- test/onboarding/
```
**Resultado:**
- 8 suites pasadas, **46 tests pasados**, 0 fallos:
  1. `test/onboarding/onboarding-template-cutover.db.e2e-spec.ts` — PASS (4/4 tests en PostgreSQL real):
     - `verifies side-effect free preview does NOT write to database`
     - `verifies safe apply creates RecipeVersion in DRAFT/SUGGESTED without stock/cost side effects and enforces two-tenant isolation`
     - `verifies partial selection (AC-10) only creates selected items end-to-end`
     - `verifies LegacyTemplateRecipeScan on real DB produces receipts and protects operational tenants`
  2. `test/onboarding/industry-template.e2e-spec.ts` — PASS (9/9 tests)
  3. `test/onboarding/onboarding-w9.db.e2e-spec.ts` — PASS (4/4 tests en PostgreSQL real)
  4. `test/onboarding/onboarding-readiness.db.e2e-spec.ts` — PASS (15/15 tests)
  5. `test/onboarding/onboarding-session.db.e2e-spec.ts` — PASS (5/5 tests)
  6. `test/onboarding/onboarding-idempotency.db.e2e-spec.ts` — PASS (3/3 tests)
  7. `test/onboarding/import-staging.e2e-spec.ts` — PASS (3/3 tests)
  8. `test/onboarding/fiscal-setup.e2e-spec.ts` — PASS (3/3 tests)

---

# 3. Cumplimiento de Criterios de Aceptación (Gate de Salida)

| Criterio | Estado | Evidencia |
|---|---|---|
| Preview no genera writes | CUMPLIDO | Verificado en E2E PostgreSQL (conteos en 0 de insumos, products, seed_links, apps). |
| Selección parcial se respeta end-to-end (AC-10) | CUMPLIDO | Verificado en E2E PostgreSQL: seleccionando solo insumo, productos y recetas quedan en 0. |
| Reapply idéntico no duplica (AC-13 / AC-47) | CUMPLIDO | Verificado en E2E PostgreSQL: segundo apply retorna skipped y no incrementa conteo en DB. |
| Provenance estable no depende de nombre | CUMPLIDO | Persistencia de `TemplateSeedLink` con `source_item_id` y `last_source_fingerprint`. |
| Falla dentro de UoW revierte completamente | CUMPLIDO | Unit of Work encapsulada en `dataSource.transaction` tenant-bound. |
| Nueva recipe de template siempre queda DRAFT/SUGGESTED (AC-11 / AC-45) | CUMPLIDO | `is_active = false`, `publication_state = 'DRAFT'`, `suggestion_state = 'SUGGESTED'`. |
| Vender producto con recipe draft no genera BOM/Kardex por sugerencia | CUMPLIDO | `resolveRecipeVersionId` descarta versiones en DRAFT devolviendo solo el producto simple. |
| Seed de insumo no afirma stock ni costo ficticio (AC-12) | CUMPLIDO | Verificado en DB: `stock = 0`, `existencia_actual = 0`, `costo_promedio_nio = 0`. |
| Legacy con provenance confiable tiene receipt `KEEP_PUBLISHED \| MOVE_TO_DRAFT` | CUMPLIDO | Verificado en `LegacyTemplateRecipeScanService` con persistencia en `legacy_onboarding_migration_receipts`. |
| Tenant operativo nunca recibe `MOVE_TO_DRAFT` silencioso | CUMPLIDO | Verificado en E2E PostgreSQL: tenant con ventas/activación emite `KEEP_PUBLISHED` sin mutación. |
| Aislamiento Multi-Tenant (ODAV-34) | CUMPLIDO | Verificado en E2E PostgreSQL: Tenant B tiene 0 registros tras aplicación en Tenant A. |
