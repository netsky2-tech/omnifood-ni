# NHILOS Client Onboarding V1 — M0 Evidence Baseline

**Documento:** `ONB1.0_M0_BASELINE.md`  
**Ubicación:** `docs/onboarding/evidence/ONB1.0_M0_BASELINE.md`  
**Gate:** **ONB1.0B — M0 Evidence Baseline**  
**Fecha de captura:** 2026-09-03  
**Commit SHA:** `86f1e1def66f024b48c6336eee1f60c206de87b9`  
**Branch:** `feat/backoffice-spa`  
**Autoridad de arquitectura:** `onboarding_architecture_spec.md` v1.0 (`APPROVED / ENGINEERING AUTHORITATIVE`)  
**Autoridad de roadmap:** `onboarding_execution_roadmap.md` v1.1  

---

# 1. Resumen de Entorno y Versiones

- **Node.js:** v24.19.0
- **npm:** 11.17.0
- **PostgreSQL:** 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
- **Database Name:** `omnifood` (Host: 127.0.0.1, Port: 5432)
- **SQLite Founder POS Baseline:** `NOT_APPLICABLE` (El entorno actual es el repositorio central cloud/backoffice; el terminal fundador se provisionará y verificará en los slices ONB1.6 y ONB1.8).

---

# 2. Conteo Físico de Filas (Data State pre-ONB1.1)

Consulta ejecutada en PostgreSQL real:
```sql
SELECT 
  (SELECT count(*) FROM staging_importacion_productos) AS staging_rows,
  (SELECT count(*) FROM industry_templates) AS templates_count,
  (SELECT count(*) FROM template_products) AS template_products_count,
  (SELECT count(*) FROM template_insumos) AS template_insumos_count,
  (SELECT count(*) FROM template_recipe_items) AS template_recipe_items_count,
  (SELECT count(*) FROM sys_parametros_config) AS sys_params_count,
  (SELECT count(*) FROM products) AS products_count,
  (SELECT count(*) FROM recipes) AS recipes_count,
  (SELECT count(*) FROM tenants) AS tenants_count;
```

**Resultado:**
- `staging_importacion_productos`: 0 filas (sin lotes pendientes ni corruptos).
- `industry_templates`: 3 (CAFETERIA, COMIDA_RAPIDA, RETAIL_BASICO).
- `template_products`: 12.
- `template_insumos`: 17.
- `template_recipe_items`: 20.
- `sys_parametros_config`: 0 filas.
- `products`: 22.
- `recipes`: 20.
- `tenants`: 69.

---

# 3. Esquema Físico de Tablas W9 / Onboarding Existentes

### 3.1 `staging_importacion_productos`
- `id` (uuid, PK)
- `tenant_id` (varchar, not null)
- `token_sesion_importacion` (uuid, not null)
- `raw_nombre`, `raw_sku`, `raw_precio_venta`, `raw_costo_insumo`, `raw_categoria`, `raw_porcentaje_iva`, `raw_uom`, `raw_stock_inicial`
- `parsed_nombre`, `parsed_sku`, `parsed_precio_venta`, `parsed_costo_insumo`, `parsed_categoria`, `parsed_porcentaje_iva`, `parsed_uom`, `parsed_stock_inicial`
- `estado_fila` (varchar, not null, default 'PENDIENTE')
- `mensaje_error_detalle` (text)
- `created_at`, `updated_at`
- **Índices:** PK en `id`, btree en `(tenant_id, token_sesion_importacion)`.

### 3.2 `sys_parametros_config`
- `id` (bigint, PK)
- `tenant_id` (varchar, not null)
- `param_key` (varchar, not null)
- `param_value` (jsonb, not null)
- `version` (int, not null, default 1)
- `effective_from`, `effective_to`, `is_active`, `created_by`, `created_at`
- **Índices:** PK en `id`, unique en `(tenant_id, param_key, version)`, idx en `(tenant_id, param_key, is_active, effective_from DESC)`.
- **Seguridad:** Forced RLS policy `sys_parametros_config_tenant_isolation`.
- **Trigger:** `trg_sys_parametros_config_immutable` bloquea UPDATE y DELETE directos (append-only).

### 3.3 `industry_templates`, `template_products`, `template_insumos`, `template_recipe_items`
- Catálogo estático de templates precargado y activo.

---

# 4. Resultados de Suites de Regresión W9

### 4.1 Backend Unit Tests
Comando: `npm --prefix apps/admin_backend test -- --testPathPattern="onboarding"`
- **Test Suites:** 7 passed, 7 total
- **Tests:** 44 passed, 44 total
- **Suites:**
  - `src/modules/onboarding/services/import-staging.service.spec.ts`
  - `src/modules/onboarding/services/industry-template.service.spec.ts`
  - `src/modules/onboarding/services/fiscal-setup.service.spec.ts`
  - `src/modules/onboarding/controllers/fiscal-setup.controller.spec.ts`
  - `src/modules/onboarding/controllers/industry-template.controller.spec.ts`
  - `src/modules/onboarding/controllers/import-staging.controller.spec.ts`
  - `src/modules/onboarding/onboarding.module.spec.ts`

### 4.2 Backend E2E Tests (PostgreSQL Real)
Comando: `npm --prefix apps/admin_backend run test:e2e -- --testPathPattern="onboarding"`
- **Test Suites:** 4 passed, 4 total
- **Tests:** 32 passed, 32 total
- **Suites:**
  - `test/onboarding/import-staging.e2e-spec.ts`
  - `test/onboarding/fiscal-setup.e2e-spec.ts`
  - `test/onboarding/industry-template.e2e-spec.ts`
  - `test/onboarding/onboarding-w9.db.e2e-spec.ts`

### 4.3 Frontend Owner Dashboard Tests (Vitest)
Comando: `npm --prefix apps/owner_dashboard test -- --run`
- **Test Files:** 25 passed, 25 total
- **Tests:** 476 passed, 4 skipped, 480 total

---

# 5. Hallazgos de Discovery de Datos Legacy

1. **Staging activo:** 0 filas en `staging_importacion_productos`. No hay sesiones colgadas que migrar.
2. **Provenance de templates:** Las 20 recetas y 22 productos actuales corresponden a datos de seed y pruebas; no existían tablas de enlace `template_seed_links` ni `template_applications`.
3. **No se alteró ningún dato existente** durante esta captura de baseline.

---

# 6. Salida del Gate ONB1.0B

- [x] Baseline de PostgreSQL capturado y verificado.
- [x] SQLite founder baseline marcado `NOT_APPLICABLE` con justificación formal.
- [x] Suites de regresión W9 100% verdes en Backend y Owner Dashboard.
- [x] Schema físico documentado.
- [x] **Cierre formal:** Gate ONB1.0 superado; desbloqueado el inicio de **ONB1.1 (PR-ONB-02)**.
