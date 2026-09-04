# NHILOS Client Onboarding V1 — M4 Evidence Receipt (ONB1.4)

**Documento:** `ONB1.4_M4_EVIDENCE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.4_M4_EVIDENCE.md`  
**Slices cubiertos:** `ONB1.4A`, `ONB1.4B`, `ONB1.4C`, `ONB1.4D`, `ONB1.4E`, `ONB1.4F`, `ONB1.4G`, `ONB1.4H`, `ONB1.4I`  
**Fecha de ejecución:** 2026-09-03  
**Branch:** `feat/backoffice-spa`  
**Metodología:** TDD estricto -> Triangulación -> Integración (PostgreSQL real) -> E2E sin mocks de persistencia.

---

# 1. Resumen de Entregables Físicos

### 1.1 Backend Guard Primero (ONB1.4A / AC-24, AC-51, AC-52)
- Neutralización total de escritura directa a `Product.stock` y `Product.averageCost` desde el importador de catálogo (`ImportStagingService.commitImport`):
  - Creación de nuevos productos: nacen obligatoriamente con `stock = 0`, `averageCost = 0`. Stock y costo solo pueden establecerse mediante movimientos formales de Kardex en BOH Enrichment.
  - Resolución de duplicados `REPLACE`: se limita estrictamente a campos de Product Master (`sellPrice`, `uom`, `category`). Prohibido terminantemente modificar `existing.stock` o `existing.averageCost`.
- Retiro del alias peligroso `codigo_barras -> sku`:
  - Frontend (`apps/owner_dashboard/src/features/settings/bulk-import-wizard.tsx`): eliminado mapeo de `codigo_barras` y `codigobarras` a `sku`.
  - Backend (`ImportContractVersion` & `CanonicalCsvParserService`): `barcode` y `codigo_barras` se aíslan y marcan como `UNSUPPORTED_FIELD`. Barcode != SKU. Si se suministra código de barras, no se degrada a SKU; `parsed_sku` permanece nulo o proviene exclusivamente de columnas genuinas de SKU (`sku`, `codigo`).

### 1.2 ImportContractVersion Canónica (ONB1.4B / AC-16, AC-17, AC-22)
- Autoridad canónica versionada `v1.0` (`apps/admin_backend/src/modules/onboarding/services/import-contract-version.ts`):
  - Encoding: `UTF-8`.
  - Delimiters: `,` y `;`.
  - Required columns: `nombre`, `precio_venta`.
  - Supported columns: `nombre`, `precio_venta`, `uom`, `sku`, `categoria`, `porcentaje_iva`.
  - Unsupported/BOH enrichment columns con razón explícita: `codigo_barras`, `barcode`, `stock_inicial`, `stock`, `costo_insumo`, `costo_promedio`, `average_cost`, `cpp`.
  - Official Template Generator: genera la plantilla CSV oficial descargable directamente derivada del contrato activo (`nombre,precio_venta,unidad_venta,sku,categoria,porcentaje_iva`).

### 1.3 Parser Raw CSV Server-Side y Fallback Textarea (ONB1.4C / AC-14, AC-15)
- `CanonicalCsvParserService` (`apps/admin_backend/src/modules/onboarding/services/canonical-csv-parser.service.ts`):
  - Cálculo determinista de `sourceHash` (SHA-256).
  - Parser robusto compatible con comillas escapadas (`""`), comas embebidas y delimitadores `,` o `;`.
  - Normalizador de headers y aliases tolerante a mayúsculas/minúsculas y acentos.
  - Sanitizador de números: limpia `C$`, `$`, `NIO`, `%`, y comas de miles.
  - Detección de columnas desconocidas (`unknownHeaders`) y no soportadas (`unsupportedHeaders`).

### 1.4 Ciclo de Vida de Sesión y Staging (ONB1.4D / AC-18)
- Entidad y tabla `ProductImportSession` (`apps/admin_backend/src/modules/onboarding/entities/product-import-session.entity.ts`):
  - Estados: `CREATED`, `UPLOADING`, `VALIDATED`, `READY`, `COMMITTING`, `COMMITTED`, `PARTIALLY_COMMITTED`, `FAILED`, `EXPIRED`.
  - Auditoría de filas: `total_rows`, `valid_rows`, `error_rows`, `committed_rows`, `skipped_rows`.
- Migración `1798000000000-CreateProductImportSafeCutoverTables.ts`:
  - Creación de tabla `product_import_sessions`.
  - Extensión de `staging_importacion_productos` con `row_ordinal`, `matched_by`, `target_product_id`, `fields_to_change`, `conflict_reason`, `unsupported_fields`, `unknown_columns`.
  - Constraint única: `(tenant_id, token_sesion_importacion, row_ordinal)`.
  - Creación de tabla `legacy_import_integrity_reports`.

### 1.5 Duplicate Preview y Detección de Conflictos (ONB1.4E / AC-23)
- `ImportStagingService.getPreview`:
  - Detección previa al commit por `NORMALIZED_NAME`.
  - Exposición de target product (`targetProductId`, `targetProductName`), precios anterior y nuevo (`currentPrice`, `newPrice`), unidades (`currentUom`, `newUom`), y campos a modificar (`fieldsToChange`).
  - Detección de conflictos si las señales no son concordantes.
  - Políticas explícitas: `REPLACE` (actualiza Product Master fields únicamente), `SKIP` (omite sin error), `FAIL` (aborta con 400 Bad Request si hay duplicados).

### 1.6 Semántica de Commit (ONB1.4F / AC-19, AC-20, AC-47)
- `VALID_ONLY`: comitea únicamente las filas válidas; las filas con error o conflicto no resuelto permanecen en staging.
- `ALL_OR_NOTHING`: si existe al menos una fila con error o conflicto, la transacción completa aborta y no se escribe ninguna fila en Product Master.
- Idempotencia: reintentar commit sobre una sesión ya comiteada no crea productos duplicados.

### 1.7 Exportación de Errores y Plantilla Oficial (ONB1.4G / AC-21, AC-22)
- Endpoints REST en `ImportStagingController`:
  - `GET /api/onboarding/import/template`: retorna la metadata del contrato canónico y la plantilla CSV oficial.
  - `POST /api/onboarding/import/upload-csv`: ingesta de archivo CSV o texto pegado.
  - `GET /api/onboarding/import/preview/:sessionToken`: diagnóstico y preview de duplicados antes de comitear.
  - `GET /api/onboarding/import/errors/:sessionToken/csv`: descarga de archivo CSV con diagnóstico de filas fallidas para autocorrección.

### 1.8 Legacy Staging Cutover y Reporte de Integridad (ONB1.4H / AC-24)
- `LegacyImportIntegrityReportService`:
  - `generateIntegrityReport`: escaneo forense de imports legados ya comiteados que pudieron haber escrito stock o costo directo fuera de Kardex. Si se detecta discrepancia contra `inventory_kardex`, marca `REVIEW_REQUIRED` y genera recibo de auditoría.
  - **Regla inmutable**: Onboarding **nunca** muta `Product.stock` o `averageCost` con un UPDATE directo. Cualquier remediación futura se canaliza a través de un comando formal del dominio Inventory (`Adjustment` u `OpeningBalance`).
  - `expireIncompatibleLegacyStaging`: marca como `ERROR` las filas en staging no comiteadas que contengan stock/costo incompatible, forzando su re-subida bajo el contrato canónico V1 y emitiendo recibos `LEGACY_STAGING_EXPIRY`.

### 1.9 Audit Trail Material (ONB1.4I / AC-39)
- Registro forense con recibo `IMPORT_COMMIT` en `legacy_onboarding_migration_receipts` que incluye:
  - `tenantId`
  - `sessionToken`
  - `mode` (`VALID_ONLY` / `ALL_OR_NOTHING`)
  - `duplicatePolicy` (`REPLACE` / `SKIP` / `FAIL`)
  - `productsCreated`, `productsUpdated`, `productsSkipped`, `totalCommitted`
  - `idempotencyKey`

---

# 2. Evidencia de Tests y Verificación en PostgreSQL Real (Zero Mocks)

### 2.1 E2E PostgreSQL Suite
Comando ejecutado:
```bash
cd apps/admin_backend && npx jest --config ./test/jest-e2e.json test/onboarding/onboarding-import-cutover.db.e2e-spec.ts
```
Resultado:
```text
PASS test/onboarding/onboarding-import-cutover.db.e2e-spec.ts
  ONB1.4 Product Import Safe Cutover (Real PostgreSQL E2E / Zero Mocks)
    ✓ exposes canonical template matching parser contract version v1.0 (AC-22) (289 ms)
    ✓ verifies backend guard neutralizes direct stock/cost writes and prevents barcode->sku alias in real PostgreSQL (AC-24, AC-51, AC-52) (162 ms)
    ✓ verifies duplicate preview, conflict detection, and REPLACE protection on existing products (AC-23, AC-52) (142 ms)
    ✓ verifies ALL_OR_NOTHING aborts cleanly with zero DB writes when batch has errors (AC-20) (121 ms)
    ✓ verifies LegacyImportIntegrityReport and legacy staging expiry on real PostgreSQL (ONB1.4H) (127 ms)
    ✓ enforces two-tenant isolation: Tenant B cannot access or commit Tenant A import sessions (AC-38) (127 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        3.153 s
```

### 2.2 Suite Completa de Onboarding (PostgreSQL E2E)
Comando ejecutado:
```bash
cd apps/admin_backend && npx jest --config ./test/jest-e2e.json test/onboarding/
```
Resultado:
```text
PASS test/onboarding/fiscal-setup.e2e-spec.ts (9.138 s)
PASS test/onboarding/industry-template.e2e-spec.ts (9.306 s)
PASS test/onboarding/onboarding-idempotency.db.e2e-spec.ts (9.317 s)
PASS test/onboarding/onboarding-session.db.e2e-spec.ts (9.348 s)
PASS test/onboarding/import-staging.e2e-spec.ts (9.982 s)
PASS test/onboarding/onboarding-readiness.db.e2e-spec.ts (10.428 s)
PASS test/onboarding/onboarding-import-cutover.db.e2e-spec.ts (10.632 s)
PASS test/onboarding/onboarding-template-cutover.db.e2e-spec.ts (10.852 s)
PASS test/onboarding/onboarding-w9.db.e2e-spec.ts (12.117 s)

Test Suites: 9 passed, 9 total
Tests:       52 passed, 52 total
Snapshots:   0 total
Time:        12.929 s
```

### 2.3 Unit & Triangulation Tests
Comando ejecutado:
```bash
cd apps/admin_backend && npx jest src/modules/onboarding/
```
Resultado:
```text
Test Suites: 19 passed, 19 total
Tests:       119 passed, 119 total
Snapshots:   0 total
Time:        12.724 s
```

### 2.4 Owner Dashboard Regression
Comando ejecutado:
```bash
cd apps/owner_dashboard && npm test
```
Resultado:
```text
Test Files  28 passed (28)
Tests  496 passed | 4 skipped (500)
```
