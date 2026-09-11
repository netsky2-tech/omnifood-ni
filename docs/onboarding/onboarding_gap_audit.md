# NHILOS Client Onboarding V1 — Gap Audit

**Documento:** `onboarding_gap_audit.md`  
**Ubicación recomendada en repo:** `docs/onboarding/onboarding_gap_audit.md`  
**Estado:** `L0 CLOSED — evidencia confirmada en repo`  
**Objetivo de decisión:** establecer el baseline real de onboarding/provisioning existente y decidir, por capacidad, qué **KEEP / EXTEND / REFACTOR / ADD / REMOVE_FROM_SELF_SERVICE** antes de refactorizar el PRD de Onboarding.

> **Regla de evidencia:** este documento diferencia estrictamente entre (a) capacidad documentada como implementada, (b) comportamiento informado durante la revisión actual, (c) intención de producto del PRD existente y (d) detalle confirmado tras inspección exhaustiva de código, migraciones, entidades, endpoints y suites de tests reales en `apps/admin_backend`, `apps/owner_dashboard` y `apps/pos_app`.

---

# 1. Objetivo

Auditar el onboarding real entregado alrededor de **Batch 11 — Automatización de Onboarding**, el flujo de **Provisioning**, los artefactos de `docs/client-onboarding/` (originados en commit `17c4e1a` de `main`) y la superficie de **Owner Dashboard W9**, antes de reescribir el PRD.

El audit responde de manera ejecutable:

1. ¿Qué capacidades de onboarding ya existen y están probadas?
2. ¿Qué piezas actuales son infraestructura reutilizable, pero no constituyen todavía una experiencia de onboarding completa?
3. ¿Qué partes del PRD vigente describen capacidades que el código no implementa?
4. ¿Qué partes del PRD vigente deberían cambiar aunque técnicamente pudieran implementarse, porque generan fricción innecesaria al cliente?
5. ¿Qué responsabilidad pertenece a **Provisioning**, cuál a **Client Onboarding** y cuál a **Activation / Go-Live**?
6. ¿Qué información es realmente obligatoria para alcanzar `SALE_READY`?
7. ¿Qué configuración de BOH puede diferirse sin impedir la primera venta?
8. ¿Qué datos de una Industry Template pueden activarse automáticamente y cuáles deben quedar como `DRAFT / SUGGESTED` hasta confirmación del cliente?
9. ¿Qué importaciones deben ser self-service en V1 y cuáles deben quedar como assisted/internal tooling?
10. ¿Existe soporte real para pausar, reanudar e idempotentemente reintentar un onboarding incompleto?

## 1.1 Principio rector

**Onboarding no significa modelar el 100% del negocio antes de vender.**

La unidad de éxito de V1 debe ser:

```text
Time to First Successful Sale
```

El nuevo PRD deberá separar como mínimo los siguientes estados de readiness:

```text
PROVISIONED
    ↓
SALE_READY
    ↓
INVENTORY_READY
    ↓
COSTING_READY
    ↓
OPERATIONS_READY
```

Una configuración incompleta de recetas, subrecetas o stock inicial **no debe bloquear `SALE_READY`** salvo que exista una dependencia fiscal, de integridad o de operación explícitamente demostrada.

---

# 2. Baseline evaluado

## 2.1 Fuentes documentales autoritativas para el audit

1. `docs/PRDs/prd_onboarding.md`
   - Declara objetivo de onboarding `< 15 min`.
   - Define importación masiva con staging y preview.
   - Define mapper dinámico de columnas.
   - Define Industry Templates con insumos y Pre-BOMs.
   - Define Fiscal Setup Wizard.
   - Incluye topologías de onboarding cloud/mobile/offline.

2. `docs/plans/master_execution_roadmap.md`
   - Declara **Batch 11 COMPLETADO**.
   - Alcance declarado: Industry Templates, Bulk Import, Pre-BOMs, Fiscal Wizard y Chunked Staging.
   - Evidencia declarada: `industry-template.e2e-spec.ts`, `fiscal-setup.e2e-spec.ts`, `import-staging.e2e-spec.ts` + unit tests.

3. `docs/plans/owner_dashboard_execution_roadmap.md`
   - Define W9 / OD-16 como superficie web para fiscal setup + onboarding.
   - Documenta endpoints existentes para fiscal setup, industry templates e import staging.
   - El Backoffice es la superficie estratégica; el POS no debe convertirse en panel de configuración general.

4. `docs/PROVISIONING.md`
   - Documenta un script de consola que crea `Tenant + OWNER` de forma transaccional.
   - Provisioning técnico precede al onboarding operacional.

5. `docs/client-onboarding/GUIA_RECETAS_CLIENTE.md` (commit `17c4e1a` en `main`)
   - Documenta la guía operacional para dueños de cafeterías sobre insumos, productos, recetas y subrecetas.

6. `docs/client-onboarding/plantilla_productos.csv` (commit `17c4e1a` en `main`)
7. `docs/client-onboarding/plantilla_insumos.csv` (commit `17c4e1a` en `main`)
8. `docs/client-onboarding/plantilla_recetas_productos.csv` (commit `17c4e1a` en `main`)
9. `docs/client-onboarding/plantilla_subrecetas.csv` (commit `17c4e1a` en `main`)
10. `docs/client-onboarding/plantilla_recetas_subrecetas.csv` (commit `17c4e1a` en `main`)

## 2.2 Evidencia confirmada tras inspección de código

La inspección directa del repositorio arrojó:

- `plantilla_productos.csv` usa headers `snake_case` (`nombre,precio_venta,unidad_venta,es_preparado,categoria,sku,tiene_variantes`).
- El backend DTO (`apps/admin_backend/src/modules/onboarding/dto/import-staging.dto.ts`) define `ImportRowDto` con propiedades mixtas (`nombre`, `sku`, `precioVenta`, `costoInsumo`, `categoria`, `porcentajeIva`, `uom`, `stockInicial`).
- `bulk-import-wizard.tsx` normaliza mediante un mapa de aliases hardcodeado en `parseCsv()`, pero carece de un mapeador interactivo en UI.
- El motor de importación actual está **estrictamente limitado a productos** mediante `staging_importacion_productos -> products`.
- **No existen importadores ni tablas de staging** para insumos, recetas de productos, subrecetas ni recetas de subrecetas.
- Industry Templates (`IndustryTemplateService`) inyectan `Insumo`, `Product`, `UomConversion`, `RecipeVersion` (activa v1) y `RecipeDetail`, pero **no** inyectan subrecetas ni stock inicial.
- Los artefactos de `docs/client-onboarding/` residen en la rama `main` (commit `17c4e1a`), no en el branch de trabajo `feat/backoffice-spa`.

---

# 3. Boundary funcional confirmado por el audit

El audit ratifica la separación estricta de tres responsabilidades:

```text
PROVISIONING
  Tenant
  OWNER
  identidad inicial
  tenant context / aislamiento
  infraestructura base
       ↓
CLIENT ONBOARDING (Setup Center)
  negocio (perfil comercial)
  fiscal (régimen DGI, IVA, spread cambiario)
  staff (opcional en V1; OWNER basta para operar)
  catálogo vendible (importación o template)
  inventario opcional (insumos, UOMs)
  recetas opcionales (Pre-BOMs como sugerencia)
  hardware/impresora (perfil de terminal)
       ↓
ACTIVATION / GO-LIVE
  readiness checks contractuales
  venta de prueba
  impresión de ticket
  offline resilience check
  sync verification
  marcado de tenant como ACTIVATED
```

### Invariante ratificada

`Provisioning != Client Onboarding != Activation`.

El backend contiene endpoints operativos aislados, pero no existe orquestación de onboarding de punta a punta ni entidad de activación.

---

# 4. Disposición permitida

| Disposición | Significado |
|---|---|
| **KEEP** | Existe, es coherente con el target y debe conservarse. |
| **EXTEND** | Existe y sirve de base, pero requiere capacidad adicional. |
| **REFACTOR** | Existe, pero su contrato/ownership/semántica actual es incorrecto para el onboarding objetivo. |
| **ADD** | No existe y es necesario para el target. |
| **REMOVE_FROM_SELF_SERVICE** | Puede existir o mantenerse como tooling, pero no debe formar parte del flujo normal del cliente. |
| **DEFER** | No es requisito para Onboarding V1 y no debe contaminar el scope. |

---

# 5. Auditoría de Provisioning

## 5.1 Tenant + OWNER provisioning

### Evidencia Confirmada

```text
FILE: apps/admin_backend/src/scripts/provision.ts & apps/admin_backend/src/scripts/provision-dev.ts
SYMBOL: provision()
TEST: apps/admin_backend/test/infrastructure/device-provisioning-cas.e2e-spec.ts (fixture/context level)
BEHAVIOR: Ejecuta dentro de una transacción TypeORM (`dataSource.transaction`). Crea fila en tabla `tenants` (id UUID, name, ruc, is_active=true) y crea fila en tabla `users` con role='OWNER', email, password_hash (bcrypt salt 10) y `security_profiles` con pin_hash (bcrypt salt 10, is_pin_enabled=true).
DISPOSITION: KEEP / EXTEND
```

### Hallazgos de Inspección

- **Path exacto:** `apps/admin_backend/src/scripts/provision.ts` (interactivo CLI) y `apps/admin_backend/src/scripts/provision-dev.ts` (automático headless con env vars).
- **Transacción:** Utiliza `dataSource.transaction(async (manager) => { ... })`.
- **Password & PIN:** Hasheados con `bcrypt.hash(..., 10)`.
- **Estado inicial:** `tenant.is_active = true`. No existe columna `slug`, `status` ni `is_activated` en `tenants`.
- **Branch / Defaults:** No crea sucursales (`branches`) ni seed de catálogo (`catalog_values`).
- **Comportamiento ante reintento:** Si el nombre del tenant o el email ya existen, lanza excepción de clave única de PostgreSQL (`UQ_...`) y la transacción se revierte por completo (no es un upsert idempotente).
- **Audit trail:** No escribe en `audit_logs` ni emite eventos de auditoría forense.
- **Superficie:** Solo existe vía CLI; no hay endpoint REST para provisioning administrativo.

---

# 6. Auditoría de Fiscal Setup

## 6.1 Fiscal Setup API / service

### Evidencia Confirmada

```text
FILE: apps/admin_backend/src/modules/onboarding/controllers/fiscal-setup.controller.ts
      apps/admin_backend/src/modules/onboarding/services/fiscal-setup.service.ts
      apps/admin_backend/src/modules/onboarding/dto/fiscal-setup.dto.ts
SYMBOL: FiscalSetupController, FiscalSetupService.getFiscalSetup(), FiscalSetupService.configureFiscalSetup()
TEST: apps/admin_backend/src/modules/onboarding/controllers/fiscal-setup.controller.spec.ts (7 tests PASS)
      apps/admin_backend/src/modules/onboarding/services/fiscal-setup.service.spec.ts (11 tests PASS)
      apps/admin_backend/test/onboarding/fiscal-setup.e2e-spec.ts (7 tests PASS)
      apps/admin_backend/test/onboarding/onboarding-w9.db.e2e-spec.ts (cross-tenant isolated DB PASS)
BEHAVIOR: Expone GET y POST `/onboarding/fiscal-setup`. Persiste businessName y ruc en tabla `tenants`; versiona `FISCAL_REGIME`, `TAX_RATE_IVA`, `PRICES_INCLUDE_TAX` y `COMMERCIAL_FX_SPREAD` en tabla `system_parameters_config`. Emite evento EventEmitter2 `ONBOARDING_FISCAL_SETUP_COMPLETED`.
DISPOSITION: KEEP / EXTEND
```

### Hallazgos de Inspección

- **Endpoints:** `GET /onboarding/fiscal-setup`, `POST /onboarding/fiscal-setup`.
- **Autorización:** Protegido por `AuthGuard`, `RolesGuard`, roles permitidos `@Roles(UserRole.OWNER, UserRole.MANAGER)`, y `TenantInterceptor` (`RLS`).
- **Regímenes soportados:** `CUOTA_FIJA` (tasa IVA 0.0) y `REGIMEN_GENERAL` (tasa IVA 0.15).
- **Campos descartados silenciosamente:** `FiscalSetupDto` acepta `phone` y `address` como campos opcionales, pero `FiscalSetupService` **no los persiste en ninguna tabla** (la tabla `tenants` carece de esas columnas).
- **Series / Resoluciones DGI:** **No soportadas** en este módulo. No existen campos para rangos de factura, número de resolución DGI, prefijo de serie ni vencimiento de talonario.
- **Moneda base:** Asume Córdobas (NIO) de forma implícita. Parametriza `COMMERCIAL_FX_SPREAD` (número >= 0, default 0.50).
- **Llegada al POS:** `system_parameters_config` **NO se sincroniza al POS**. En `apps/pos_app` no existe ninguna tabla, DAO o mapper para parámetros del sistema. El POS calcula impuestos de forma local o desacoplada.
- **¿Es un Wizard o sólo un Formulario?** En frontend (`apps/owner_dashboard/src/features/settings/fiscal-setup-form.tsx`) es un **formulario reactivo de pestaña única**, no un wizard multi-paso.

---

# 7. Auditoría de Industry Templates

## 7.1 Catálogo de templates

### Evidencia Confirmada

```text
FILE: apps/admin_backend/src/modules/onboarding/controllers/industry-template.controller.ts
      apps/admin_backend/src/modules/onboarding/services/industry-template.service.ts
      apps/admin_backend/src/migrations/1787000000000-CreateIndustryTemplatesAndDefaults.ts
SYMBOL: IndustryTemplateController, IndustryTemplateService.listTemplates(), applyTemplate()
TEST: apps/admin_backend/src/modules/onboarding/controllers/industry-template.controller.spec.ts (6 tests PASS)
      apps/admin_backend/src/modules/onboarding/services/industry-template.service.spec.ts (7 tests PASS)
      apps/admin_backend/test/onboarding/industry-template.e2e-spec.ts (7 tests PASS)
      apps/admin_backend/test/onboarding/onboarding-w9.db.e2e-spec.ts (isolated DB PASS)
BEHAVIOR: Expone GET `/onboarding/templates`, GET `/onboarding/templates/:code` y POST `/onboarding/templates/:code/apply`. Siembra templates en Postgres vía migración: `CAFETERIA`, `BAR_RESTAURANTE`, `RETAIL_MINIMARKET`.
DISPOSITION: REFACTOR (respecto al lifecycle del Pre-BOM)
```

## 7.2 Entidades que realmente inyecta un template

Matriz contrastada directamente contra el método `applyTemplate()` de `IndustryTemplateService`:

| Entidad | Se inyecta hoy | Path / symbol | Test | Notas |
|---|:---:|---|---|---|
| Categorías | **NO** | `industry-template.service.ts:192` | `industry-template.service.spec.ts` | No crea filas en `catalog_values`. El producto queda sin categoría explícita. |
| Productos | **SÍ** | `manager.create(Product, ...)` | `industry-template.service.spec.ts:89` | Inyecta productos con `sellPrice = suggested_price`, `stock = 0`, `averageCost = 0`, `is_active = true`. |
| Insumos | **SÍ** | `manager.create(Insumo, ...)` | `industry-template.service.spec.ts:89` | Inyecta insumos con `stock = 0`, `existenciaActual = 0`, `averageCost = 0`, `is_active = true`. |
| Unidades de medida | **PARCIAL** | `manager.create(UomConversion, ...)` | `industry-template.service.spec.ts:133` | Crea `UomConversion` sólo si `purchase_uom !== consumption_uom`. No siembra catálogo de UOMs. |
| Recetas / BOM | **SÍ** | `manager.create(RecipeVersion, ...)` | `industry-template.service.spec.ts:102` | **Inyecta RecipeVersion con `is_active: true`** y filas en `recipe_details` y tabla legacy `recipes`. |
| Pre-BOM draft | **NO** | `industry-template.service.ts:212` | N/A | No existe estado DRAFT; se publican activas v1 inmediatamente. |
| Subrecetas | **NO** | N/A | N/A | El servicio y la migración no modelan ni inyectan preparaciones intermedias. |
| Stock inicial | **NO** | `industry-template.service.ts:130` | N/A | Setea hardcoded `stock: 0` y `existenciaActual: 0`. |
| Costos | **NO** | `industry-template.service.ts:131` | N/A | Setea hardcoded `averageCost: 0`. |
| Impuestos | **NO** | N/A | N/A | No asocia perfiles impositivos por producto. |
| Promociones | **NO** | N/A | N/A | Cero promociones sembradas. |

## 7.3 Semántica de Pre-BOM (Hallazgo Crítico P0)

- **Estado actual en código:** En `industry-template.service.ts` línea 215, el código ejecuta:
  ```typescript
  const recipeVersion = manager.create(RecipeVersion, {
    tenant_id: trimmedTenant,
    product_id: currentProduct.id,
    version_number: 1,
    is_active: true, // <-- PUBLICADA DIRECTAMENTE COMO ACTIVA
    fecha_inicio_vigencia: new Date(),
    product_name: currentProduct.name,
    yield_quantity: 1,
    technical_shrink_pct: 0,
  });
  ```
- **Impacto operacional:** La receta queda operativa inmediatamente. Cuando el POS descarga el catálogo y procesa una venta, el `MovementEngine` intentará deducir insumos (ej. 18g de café). Como el insumo se inyectó con `stock: 0`, se generará **stock negativo** o un fallo de checkout si la política del insumo es `RESTRICT`.
- **Impacto de costeo:** Dado que `averageCost` se inicializó en 0, el sistema registra consumos a costo cero, distorsionando el margen real y el COGS (Costo de Mercancía Vendida) desde el día 1.
- **Selección parcial:** El parámetro `ApplyTemplateDto` es completamente ignorado en el backend (`void _options;` en línea 97). No es posible seleccionar qué productos o recetas incorporar.
- **Disposición:** **REFACTOR**. Las recetas de plantilla deben sembrarse en estado `SUGGESTED / DRAFT` y requerir activación confirmada por el usuario antes de vincularse al motor de deducción de inventario.

---

# 8. Auditoría de Bulk Import

## 8.1 Superficie web actual

### Evidencia Confirmada

```text
FILE: apps/owner_dashboard/src/features/settings/bulk-import-wizard.tsx
SYMBOL: BulkImportWizard
TEST: apps/owner_dashboard/src/__tests__/w9-settings.test.tsx (tests de render, textarea, parse y commit)
      apps/owner_dashboard/src/__tests__/w9-e2e-settings.test.tsx (flujo completo W9)
DISPOSITION: REFACTOR / EXTEND
```

- **Ruta:** Pestaña "Carga Masiva (Staging)" en `/settings`.
- **Formato aceptado:** Texto plano delimitado por comas (CSV) pegado dentro de un `<textarea>`.
- **Archivos XLSX / XLS:** **No soportados en UI**. No hay componente file-picker ni integración con parser binario Excel en frontend, a pesar de que `exceljs` figura en dependencias del backend.
- **Drag & Drop:** **No existe**.
- **Tamaño máximo y Chunking:** Divide el arreglo parseado en bloques de máximo 100 filas (`MAX_IMPORT_CHUNK_SIZE = 100`) y ejecuta llamadas HTTP POST secuenciales a `/onboarding/import/upload`.
- **Visualización de errores:** Muestra tarjeta con contadores (Total, Válidas, Errores) y una tabla con los primeros 100 errores y su motivo de rechazo.
- **Exportación de reporte de errores:** **Inexistente en UI**. El backend ofrece `GET /onboarding/import/errors/:sessionToken`, pero la pantalla no dispone de ningún botón o enlace para descargarlo como CSV/Excel.
- **Descarga de plantilla oficial:** **Inexistente en UI**. No hay botón para descargar `plantilla_productos.csv`.

## 8.2 Header normalization

Matriz contrastada contra la función `parseCsv()` en `bulk-import-wizard.tsx`:

| Header de docs (`plantilla_productos.csv`) | DTO normalizado (`ImportRowDto`) | Soportado en UI | Evidencia en código |
|---|---|:---:|---|
| `nombre` | `nombre` | **SÍ** | `rowObj["nombre"] \|\| rowObj["name"] \|\| rowObj["producto"]` |
| `precio_venta` | `precioVenta` | **SÍ** | `rowObj["precio_venta"] \|\| rowObj["precioventa"] \|\| rowObj["precio"]` |
| `unidad_venta` | `uom` | **SÍ** | `rowObj["unidad_venta"] \|\| rowObj["unidadventa"] \|\| rowObj["uom"]` |
| `es_preparado` | N/A | **IGNORADO** | Leído pero descartado; no existe en `ImportRowDto` ni en tabla `staging`. |
| `categoria` | `categoria` | **SÍ** | `rowObj["categoria"] \|\| rowObj["category"] \|\| rowObj["rubro"]` |
| `sku` | `sku` | **SÍ** | `rowObj["sku"] \|\| rowObj["codigo"] \|\| rowObj["codigo_barras"]` |
| `tiene_variantes` | N/A | **IGNORADO** | Descartado en frontend; no soportado por backend. |
| *(adicional en UI)* `costo_promedio` / `costo_insumo` | `costoInsumo` | **SÍ** | `rowObj["costo_insumo"] \|\| rowObj["costo_promedio"]` |
| *(adicional en UI)* `stock_inicial` | `stockInicial` | **SÍ** | `rowObj["stock_inicial"] \|\| rowObj["stockinicial"]` |
| *(adicional en UI)* `porcentaje_iva` | `porcentajeIva` | **SÍ** | `rowObj["porcentaje_iva"] \|\| rowObj["iva"]` |

## 8.3 Dynamic column mapping

- **Estado real:** **PARTIAL (Hardcoded Aliases)**.
- El PRD vigente prometía un mapeador dinámico visual e interactivo donde el usuario pudiera arrastrar o enlazar columnas arbitrarias (ej. exportaciones de Loyverse o Clover).
- La realidad del código es un diccionario estático de sinónimos en `parseCsv()`. Si una columna no coincide con esa lista fija, el dato se pierde o cae en valores por defecto.

## 8.4 Staging

- **Tabla física:** `staging_importacion_productos` (`ImportStaging` entity).
- **Aislamiento e Índices:** Posee columna `tenant_id` y `token_sesion_importacion` (UUID) con índice compuesto `idx_staging_importacion_tenant_token`.
- **Estados de fila:** `PENDIENTE`, `VALIDO`, `ERROR`, `COMMITTED`.
- **Invariante P0 confirmada:** Las filas con error permanecen en `staging_importacion_productos` con `estado_fila = 'ERROR'` y `mensaje_error_detalle`; jamás se insertan en la tabla viva `products`.
- **Commit parcial:** Soportado mediante `mode: 'VALID_ONLY'` (comitea solo válidos) y `mode: 'ALL_OR_NOTHING'` (rechaza si existe al menos un error).
- **Resolución de duplicados (por nombre de producto):**
  - `REPLACE`: Actualiza `sellPrice`, `averageCost`, `uom` y actualiza la columna `stock` del producto existente.
  - `SKIP`: Ignora la fila y la marca como `COMMITTED`.
  - `FAIL`: Lanza `BadRequestException` y cancela la transacción.
- **Omisión crítica en Commit:** El backend guarda `parsed_sku`, `parsed_categoria` y `parsed_porcentaje_iva` en staging, pero en `commitImport()` **no los copia a `products`** (`Product` ni siquiera tiene columna `sku` o `tax_rate` en la tabla de base de datos). Además, el stock inicial se inyecta directamente al campo `stock` sin generar asientos en el Kardex.

## 8.5 Entidades soportadas por import

| Entidad | Upload | Staging | Validation | Commit | Self-service UI | Veredicto |
|---|:---:|:---:|:---:|:---:|:---:|---|
| Productos | **SÍ** | **SÍ** | **SÍ** | **SÍ** | **SÍ** (textarea) | **EXISTS (con gaps)** |
| Categorías | **NO** | Captura texto | No aislada | **NO** | Parcial | **MISSING** |
| Insumos | **NO** | **NO** | **NO** | **NO** | **NO** | **MISSING** |
| Recetas producto | **NO** | **NO** | **NO** | **NO** | **NO** | **MISSING** |
| Subrecetas | **NO** | **NO** | **NO** | **NO** | **NO** | **MISSING** |
| Fórmulas subreceta | **NO** | **NO** | **NO** | **NO** | **NO** | **MISSING** |
| Stock inicial | Parcial | En staging | Sintáctica | Sobreescribe col | Parcial | **REFACTOR** (falta Kardex) |

---

# 9. Auditoría de las cinco plantillas de `docs/client-onboarding/`

## 9.1 Propósito real de cada archivo

Los archivos existen en la rama `main` (commit `17c4e1a342a854c31e9bbf71277803d6e76db274`):

| Archivo | Entidad conceptual | Importable hoy en código | Debe ser self-service V1 | Veredicto de Audit |
|---|---|:---:|:---:|---|
| `plantilla_productos.csv` | Productos terminados | **SÍ** (vía normalizador de aliases) | **SÍ** | **KEEP / EXTEND** |
| `plantilla_insumos.csv` | Materias primas | **NO** (sin tabla, API ni UI) | **NO** | **REMOVE_FROM_SELF_SERVICE** |
| `plantilla_recetas_productos.csv` | BOM de productos | **NO** (sin tabla, API ni UI) | **NO** | **REMOVE_FROM_SELF_SERVICE** |
| `plantilla_subrecetas.csv` | Preparaciones intermedias | **NO** (sin tabla, API ni UI) | **NO** | **REMOVE_FROM_SELF_SERVICE** |
| `plantilla_recetas_subrecetas.csv` | Fórmulas de subrecetas | **NO** (sin tabla, API ni UI) | **NO** | **REMOVE_FROM_SELF_SERVICE** |

## 9.2 Criterio de producto para V1

Exigir a un cliente que prepare y cargue 5 archivos CSV con dependencias relacionales complejas garantiza una tasa de abandono masiva en el onboarding. La carga de insumos, subrecetas y recetas complejas debe mantenerse como **herramienta asistida de migración / soporte técnico interno**, mientras que el onboarding autoservicio debe focalizarse exclusivamente en productos vendibles para habilitar `SALE_READY`.

## 9.3 Consistencia referencial (Riesgo Crítico P0)

- Las plantillas `plantilla_recetas_productos.csv` y `plantilla_recetas_subrecetas.csv` se vinculan mediante cadenas de texto libre (`producto_nombre`, `subreceta_nombre`, `insumo_o_subreceta`).
- **Discrepancia detectada en los propios archivos modelo:**
  - En `plantilla_insumos.csv` el ítem figura como: `"Café Grano Arábica 1kg"`
  - En `plantilla_recetas_productos.csv` se referencia como: `"Café Grano Arábica"`
  - Un importador relacional fallaría por falta de coincidencia exacta de strings o crearía un insumo fantasma duplicado.

---

# 10. Auditoría de Product/Catalog readiness (`SALE_READY`)

## 10.1 Cadena de consumo en POS (`apps/pos_app`)

```text
ProductEntity (SQLite 'products')
  -> ProductDao.getAllActive()
  -> SaleViewModel._cart.add()
  -> MultiCurrencyCheckoutDialog
  -> SaleViewModel.processSale()
  -> SalesRepository.saveSale()
  -> ProcessSaleInventoryUseCase.execute()
  -> MovementEngine.getSaleMovements()
```

## 10.2 Matriz de requerimientos reales para venta

| Campo / Dato | Obligatorio para `SALE_READY` | Puede diferirse | Evidencia en código |
|---|:---:|:---:|---|
| Nombre producto | **SÍ** | **NO** | Requerido por `ProductEntity.name` y `InvoiceItem.productName`. |
| Precio venta | **SÍ** | **NO** | Requerido por `ProductEntity.sellPrice > 0` para facturar. |
| ID / Identificador | **SÍ** | **NO** | Requerido como clave primaria en SQLite. |
| Categoría | **NO** | **SÍ** | `ProductEntity.category` es nullable (`String?`). |
| SKU | **NO** | **SÍ** | `ProductEntity.sku` es nullable (`String?`). |
| Código de barras | **NO** | **SÍ** | `ProductEntity.barcode` es nullable (`String?`). |
| IVA / Tax profile | **NO** | **SÍ** | El POS usa tasa predeterminada (15%) o exención global; no exige perfil por ítem. |
| Unidad venta | **NO** | **SÍ** | En backend y POS toma default `'UN'`. |
| Stock inicial | **NO** | **SÍ** | El motor de ventas no bloquea checkout por stock cero. |
| Insumos | **NO** | **SÍ** | Un producto sin insumos se vende sin restricciones. |
| BOM / Receta | **NO** | **SÍ** | Si no tiene receta, `getSaleMovements` devuelve lista vacía `[]`. |
| CPP / Costo Promedio | **NO** | **SÍ** | Puede quedar en 0; no impide emitir la factura fiscal. |
| Proveedor | **NO** | **SÍ** | Campo puramente administrativo de BOH. |
| Imagen | **NO** | **SÍ** | La UI renderiza tarjetas con iniciales o iconos por defecto. |

---

# 11. Auditoría de Inventory / Recipe readiness

## 11.1 ¿Puede venderse un producto COMPOUND sin BOM?

- **Evidencia en POS:** Inspeccionado `apps/pos_app/lib/domain/services/inventory/movement_engine_impl.dart` (líneas 640 a 660).
- Cuando se realiza una venta, `_generateMovements` ejecuta `_gatherInsumoQuantities`. Si el producto no tiene receta registrada o sus cantidades de insumo son vacías, la función ejecuta:
  ```dart
  if (insumoQuantities.isEmpty) return [];
  ```
- **Comportamiento:** La venta se completa con éxito, se emite el ticket y la factura se persiste en SQLite. El inventario simplemente **no genera movimientos de deducción**.
- **Gap:** No existe ninguna advertencia en la interfaz del cajero que indique que el producto vendido no está descontando insumos.

## 11.2 Configuración progresiva (Unknown vs Zero)

- Actualmente, si un producto carece de receta y costo, el sistema registra costo unitario `0.00`.
- En reportes de ventas y margen bruto, ese producto genera una rentabilidad aparente del 100%, lo cual constituye un defecto de diseño contable.
- **Recomendación para PRD V2:** Modelar la ausencia de costeo como `COST_PENDING / UNKNOWN`, no como `0.00` económico.

---

# 12. Auditoría de usuarios / staff inicial

- **Provisioning:** Crea únicamente el `Tenant` y el usuario inicial con rol `OWNER` (`apps/admin_backend/src/scripts/provision.ts`).
- **Operación en Piloto:** El `OWNER` tiene credenciales completas (email/password y PIN) y puede operar directamente el terminal POS (abrir turnos, registrar ventas, imprimir cortes X/Z).
- **Sincronización de credenciales:** Al iniciar sesión por primera vez online en el POS (`apps/pos_app/lib/data/repositories/auth_repository_impl.dart:120`), se ejecuta `syncStaff()`, almacenando el perfil y hash del PIN en el SQLite local. A partir de ese instante, el login offline por PIN queda 100% operativo.
- **Creación de personal adicional:** Configurar cajeros o meseros adicionales no es un requisito técnico bloqueante para la primera venta; puede diferirse para la etapa post-activación.

---

# 13. Auditoría de terminal/hardware readiness (Sunmi V2s)

Basado en `docs/operations/sunmi_v2s_hardware_verification_checklist.md` y la arquitectura de `apps/pos_app`:

| Validación de Hardware | Clasificación | Motivo |
|---|:---:|---|
| Registro y enlace de Terminal ID | **BLOCKING** | Sin Terminal ID las transacciones DGI no tienen emisor fiscal legal. |
| Impresora Seiko 58mm accesible | **BLOCKING** | En contingencia o entrega de factura DT 09-2007 es mandatario imprimir. |
| Test print ejecutado exitosamente | **BLOCKING** | Garantiza corte térmico, densidad y ancho de 32 columnas. |
| Persistencia local SQLite operativa | **BLOCKING** | Principio Offline-First fundamental. |
| Venta de prueba en modo avión | **BLOCKING** | Valida numeración consecutiva local sin red. |
| Sincronización post-reconexión | **WARNING** | Verifica vaciado de outbox sin duplicados en cloud. |
| Puerto de Gaveta RJ11 | **INFORMATIONAL** | Opcional según la estación de cobro (mostrador vs móvil). |
| Lector de código de barras / cámara | **INFORMATIONAL** | No bloquea venta rápida manual por catálogo táctil. |

---

# 14. Auditoría de onboarding state / resumability

- **Búsqueda exhaustiva:** Se buscó en todo el código backend y frontend referencias a entidades como `OnboardingSession`, `SetupProgress`, `TenantSetupStatus` o `OnboardingState`.
- **Resultado:** **CERO coincidencias**.
- **Estado actual:** El estado del onboarding vive únicamente en variables locales de React (`useState`) en componentes de `apps/owner_dashboard/src/features/settings/`.
- **Comportamiento ante refresco de pantalla:** Si el usuario recarga la página o cierra el navegador, se pierde el avance del formulario o wizard.
- **Disposición:** **ADD**. Es mandatorio crear un modelo persistente de sesión/progreso de setup en backend para soportar flujos pausables y reanudables.

---

# 15. Auditoría de Activation / First Sale

- **Búsqueda en código:** No existe ningún servicio, endpoint o guard de `ActivationGate` o `TenantActivationService`.
- **Estado del Tenant:** `Tenant.is_active` se marca en `true` desde el script de provisión inicial. No existe un estado formal de `ACTIVATED` posterior a la validación de readiness.
- **Disposición:** **ADD**. Definir un contrato de activación formal basado en checks automáticos verificables.

---

# 16. Auditoría del PRD vigente contra implementación real

| PRD vigente promete | Código real | Estado | Acción para PRD V2 |
|---|---|:---:|---|
| Setup `<15 min` | Sin métrica en backend ni frontend | **UNPROVEN** | Convertir en KPI medible instrumentalmente. |
| Carga masiva Excel / CSV | Solo CSV pegado en textarea | **PARTIAL** | Mantener CSV self-service; soportar archivo subido. |
| Mapper dinámico visual | Aliases hardcodeados en código JS | **PARTIAL** | Clasificar como aliases; descartar drag-and-drop interactivo en V1. |
| Staging con preview y errores | Existe en BD y tabla en UI | **EXISTS** | **KEEP / EXTEND** (optimizar diagnóstico). |
| Commit parcial de válidos | Implementado (`mode: VALID_ONLY`) | **EXISTS** | **KEEP**. |
| Descarga de filas erróneas | Endpoint existe; UI no lo expone | **PARTIAL** | Exponer botón de descarga en UI. |
| Plantillas de Industria | Cafetería, Bar, Minimarket en DB | **EXISTS** | **KEEP**. |
| Insumos base en templates | Sembrados con stock 0 y costo 0 | **EXISTS** | **KEEP**. |
| Pre-BOM estructural | Publica recetas activas v1 | **CONTRADICTED** | **REFACTOR** hacia estado `DRAFT / SUGGESTED`. |
| Asistente fiscal guiado | Formulario en settings (no wizard) | **EXISTS** | **EXTEND** (convertir en paso del Setup Center). |
| Importación Google Drive / Dropbox | Inexistente en todo el repo | **MISSING** | **REMOVE_FROM_PRD** (fricción innecesaria). |
| Configuración por QR móvil | Inexistente en todo el repo | **MISSING** | **REMOVE_FROM_PRD** (scope creep). |
| Fallback offline de plantillas en POS | POS no tiene templates embebidas | **MISSING** | **REMOVE_FROM_PRD** (Backoffice es la superficie). |
| Onboarding móvil nativo en POS | POS solo opera catálogo ya listo | **MISSING** | **REMOVE_FROM_PRD** (Backoffice prioritario). |
| Procesamiento por chunks | Chunks de 100 filas obligatorio | **EXISTS** | **KEEP** (garantía ODAV-32). |
| Idempotencia por session token | Implementada en backend staging | **EXISTS** | **KEEP** (garantía ODAV-33). |
| “Limpiar BD de Producción” | Inexistente en código | **CONTRADICTED** | **ELIMINAR DEL PRD** (peligro multi-tenant P0). |
| “Generar Triggers Kardex” al activar | Kardex es append-only en código | **CONTRADICTED** | **ELIMINAR DEL PRD** (concepto obsoleto). |

---

# 17. Auditoría de topologías y canales alternos

| Capability | Existe hoy | Necesaria para V1 | Evidencia | Disposición |
|---|:---:|:---:|---|---|
| Backoffice onboarding (Web) | **SÍ** | **SÍ** | `apps/owner_dashboard/src/features/settings` | **KEEP / EXTEND** |
| POS/tablet onboarding completo | **NO** | **NO** | En POS solo existe login y venta | **REMOVE_FROM_PRD** |
| Importación vía Google Drive | **NO** | **NO** | 0 coincidencias en repo | **REMOVE_FROM_PRD** |
| Importación vía Dropbox | **NO** | **NO** | 0 coincidencias en repo | **REMOVE_FROM_PRD** |
| QR handoff a web móvil | **NO** | **NO** | 0 coincidencias en repo | **REMOVE_FROM_PRD** |
| Fallback de plantillas local en POS | **NO** | **NO** | Templates están en Postgres cloud | **REMOVE_FROM_PRD** |

---

# 18. Seguridad, aislamiento e idempotencia

- **JWT y RLS:** Todos los controladores de onboarding (`FiscalSetupController`, `IndustryTemplateController`, `ImportStagingController`) utilizan `@UseGuards(AuthGuard, RolesGuard)` e interceptan el `tenant_id` mediante `@UseInterceptors(TenantInterceptor)` y `@GetTenantId()`.
- **Pruebas cross-tenant en BD real (`onboarding-w9.db.e2e-spec.ts`):**
  - **Fiscal Setup:** Modificaciones de Tenant A no afectan parámetros de Tenant B.
  - **Industry Templates:** Aplicar plantilla a Tenant A no altera el catálogo ni inventario de Tenant B.
  - **Bulk Import:** Subida y comiteo de lote en Tenant A no genera filas en staging ni productos en Tenant B.
- **Idempotencia:**
  - `applyTemplate`: Reaplicar la misma plantilla busca insumos y productos existentes y los omite; no duplica datos.
  - `commitImport`: Al procesar, marca las filas de staging como `COMMITTED`. Un reintento con el mismo `sessionToken` no vuelve a insertar productos.

---

# 19. Audit Trail

| Acción | Registro de Auditoría actual | Actor | Before/After Snapshot | Riesgo |
|---|:---:|---|---|---|
| Apply industry template | **NO** | No registrado | No existe | Medio (cambio de catálogo no trazable). |
| Fiscal setup change | **PARCIAL** | Emite evento EventEmitter2 | No guarda snapshot en `audit_logs` | Medio. |
| Bulk import upload | **NO** | No registrado | No existe | Bajo. |
| Bulk import commit | **NO** | No registrado | No existe | Alto (inyección masiva sin log forense). |
| Creación de Tenant / OWNER | **NO** | CLI anónimo | No existe | Medio. |
| Activación de tenant | N/A | No existe activación | N/A | N/A. |

---

# 20. UX / Owner Dashboard W9

### Inventario de Componentes Actuales

- `apps/owner_dashboard/src/features/settings/settings-page.tsx`: Contenedor principal con pestañas (Fiscal, Plantillas, Importación).
- `apps/owner_dashboard/src/features/settings/fiscal-setup-form.tsx`: Formulario de configuración DGI (régimen, nombre comercial, RUC, IVA, spread).
- `apps/owner_dashboard/src/features/settings/industry-templates-list.tsx`: Grid de tarjetas con templates disponibles y diálogo modal de confirmación.
- `apps/owner_dashboard/src/features/settings/bulk-import-wizard.tsx`: Wizard de importación en 4 fases (`input`, `uploading`, `staging`, `committed`).
- `apps/owner_dashboard/src/features/settings/use-settings.ts`: Hooks de TanStack React Query para llamadas REST.
- `apps/owner_dashboard/src/features/settings/settings-api.ts`: Cliente HTTP tipado con Axios/fetch.
- `apps/owner_dashboard/src/features/settings/types.ts`: Esquemas Zod y tipos TypeScript.
- `apps/owner_dashboard/src/features/settings/odav32-dataset.ts`: Generador fixture de 1,500 productos de prueba.

---

# 21. Matriz principal `EXISTS / EXTEND / ADD`

| Capability | Evidencia real en repositorio | Estado actual | Disposición | Prioridad | Motivo |
|---|---|:---:|:---:|:---:|---|
| Tenant provisioning | `apps/admin_backend/src/scripts/provision.ts` | **EXISTS** | **KEEP** | P0 | Funciona vía CLI; transaccional y seguro. |
| OWNER provisioning | `apps/admin_backend/src/scripts/provision.ts` | **EXISTS** | **KEEP** | P0 | Crea usuario con password y PIN hasheados. |
| Fiscal setup backend | `fiscal-setup.service.ts` | **EXISTS** | **KEEP** | P0 | Versiona parámetros fiscales en Postgres. |
| Fiscal setup UI | `fiscal-setup-form.tsx` | **EXISTS** | **EXTEND** | P0 | Funcional; requiere integrarse al flujo guiado. |
| Industry template catalog | `industry-template.service.ts` + migración | **EXISTS** | **KEEP** | P0 | Catálogo sembrado en Postgres (`CAFETERIA`, etc.). |
| Template preview | `industry-template.controller.ts:47` | **PARTIAL** | **EXTEND** | P1 | Existe endpoint GET; falta UI con listado detallado. |
| Template partial selection | Backend ignora opciones (`void _options;`) | **MISSING** | **ADD** | P1 | El cliente debe poder elegir qué ítems importar. |
| Pre-BOM draft lifecycle | Publica `is_active: true` inmediatamente | **CONTRADICTED** | **REFACTOR** | P0 | Debe crearse como `DRAFT / SUGGESTED` sin afectar stock. |
| Product bulk import | `import-staging.service.ts` | **EXISTS** | **KEEP / EXTEND** | P0 | Procesa lotes y persiste en `products`. |
| Dynamic column mapper | `parseCsv()` con diccionario estático | **PARTIAL** | **KEEP** | P1 | Aliases estáticos bastan para V1; evitar overengineering. |
| Staging | `staging_importacion_productos` | **EXISTS** | **KEEP** | P0 | Aislamiento estricto de filas con error. |
| Partial valid commit | `mode: 'VALID_ONLY'` en `commitImport()` | **EXISTS** | **KEEP** | P1 | Permite comitear válidos e ignorar erróneos. |
| Error export | Endpoint `GET .../errors/:token` existe | **PARTIAL** | **EXTEND** | P2 | Falta enlace/botón de descarga en la UI. |
| Import idempotency | Validación por `sessionToken` y `COMMITTED` | **EXISTS** | **KEEP** | P0 | Cumple garantías de no duplicación. |
| Input aliases snake/camel | Soportado en `parseCsv()` | **EXISTS** | **KEEP** | P1 | Normaliza headers de plantillas comunes. |
| Ingredient CSV importer | No existe tabla, servicio ni UI | **MISSING** | **REMOVE_FROM_SELF_SERVICE** | P2 | Diferir para soporte asistido interno. |
| Recipe CSV importer | No existe tabla, servicio ni UI | **MISSING** | **REMOVE_FROM_SELF_SERVICE** | P2 | Diferir para soporte asistido interno. |
| Subrecipe CSV importer | No existe tabla, servicio ni UI | **MISSING** | **REMOVE_FROM_SELF_SERVICE** | P2 | Diferir para soporte asistido interno. |
| Persistent onboarding session | No existe entidad ni endpoints | **MISSING** | **ADD** | P0 | Requerido para reanudar onboarding tras refresco. |
| Save/exit/resume | No soportado; estado vive en React state | **MISSING** | **ADD** | P0 | Indispensable para evitar recomenzar. |
| Readiness levels | No formalizados en código | **MISSING** | **ADD** | P0 | Separar `SALE_READY` de `OPERATIONS_READY`. |
| Activation gate | No existe servicio ni verificación | **MISSING** | **ADD** | P0 | Contrato mandatorio antes del Go-Live. |
| First-sale test | Tests aislados; no en flujo onboarding | **MISSING** | **ADD** | P0 | Prueba integral de emisión de ticket post-setup. |
| Test print | Implementado en POS settings | **EXISTS** | **EXTEND** | P0 | Integrar como paso formal en el Activation Gate. |
| Offline sale verification | Soportado en core POS; no en wizard | **EXISTS** | **EXTEND** | P0 | Validar como check de certificación. |
| Sync-after-reconnect verif. | Soportado en core POS; no en wizard | **EXISTS** | **EXTEND** | P0 | Validar como check de certificación. |
| Audit trail onboarding | Solo Fiscal emite evento desacoplado | **PARTIAL** | **EXTEND** | P0 | Registrar eventos formales en `audit_logs`. |
| Cross-tenant negative tests | `onboarding-w9.db.e2e-spec.ts` | **EXISTS** | **KEEP** | P0 | Cobertura real en DB aislada pasando 100%. |

---

# 22. Disposición definitiva de los cinco CSV

| Archivo | Disposición V1 | Fundamento Técnico |
|---|:---:|---|
| `plantilla_productos.csv` | **KEEP / EXTEND** (Self-Service) | Es el único formato soportado por `staging_importacion_productos`. Permite alcanzar `SALE_READY` de inmediato. |
| `plantilla_insumos.csv` | **REMOVE_FROM_SELF_SERVICE** | No tiene endpoints ni tablas en código. Requiere modelado de mermas y costos que abruman al cliente inicial. Mantener como herramienta de migración asistida. |
| `plantilla_recetas_productos.csv` | **REMOVE_FROM_SELF_SERVICE** | Requiere integridad referencial exacta contra insumos. Mantener para soporte interno post-V1. |
| `plantilla_subrecetas.csv` | **REMOVE_FROM_SELF_SERVICE** | BOH avanzado innecesario para la primera venta. |
| `plantilla_recetas_subrecetas.csv` | **REMOVE_FROM_SELF_SERVICE** | BOH recursivo complejo que bloquea la activación rápida. |

---

# 23. Validación de Hipótesis de Target

- **H1 (Sale Ready antes de BOH completo):** **CONFIRMADA**. El POS puede renderizar catálogo y cobrar ventas exitosamente sin recetas ni insumos.
- **H2 (Template as suggestion):** **CONFIRMADA LA NECESIDAD DE REFACTOR**. El código actual publica recetas activas que degradan el inventario a costo cero; deben pasar a `SUGGESTED`.
- **H3 (Product import como única vía self-service):** **CONFIRMADA**. Es la única capacidad con infraestructura funcional de staging y commit.
- **H4 (Persistent Setup Center):** **CONFIRMADA**. La ausencia de persistencia en frontend provoca pérdida de avance ante recargas.
- **H5 (Activation is a contract):** **CONFIRMADA**. Se requiere un gate formal para certificar la operación antes de abrir caja.

---

# 24. Respuestas a las 30 Preguntas P0 del Audit

1. **Paths de Industry Templates:**
   - Service: `apps/admin_backend/src/modules/onboarding/services/industry-template.service.ts`
   - Controller: `apps/admin_backend/src/modules/onboarding/controllers/industry-template.controller.ts`
   - Entities: `apps/admin_backend/src/modules/onboarding/entities/industry-template.entity.ts`, `template-insumo.entity.ts`, `template-product.entity.ts`, `template-recipe-item.entity.ts`
   - Tests: `apps/admin_backend/src/modules/onboarding/services/industry-template.service.spec.ts`, `apps/admin_backend/test/onboarding/industry-template.e2e-spec.ts`.
2. **Entidades inyectadas por Template:** `Product`, `Insumo`, `UomConversion`, `RecipeVersion` (v1 activa), `RecipeDetail` y `Recipe` (legacy). No inyecta categorías, subrecetas ni stock.
3. **Semántica de Pre-BOMs:** Quedan **ACTIVAS (`is_active: true`)**. Afectan deducción de inventario inmediatamente.
4. **Idempotencia de re-aplicar template:** **SÍ**. Omite insumos, productos y recetas coincidentes por nombre sin duplicar.
5. **Preview de template:** **Inexistente en UI**. El endpoint backend devuelve los ítems, pero el frontend solo muestra contadores.
6. **Selección parcial en template:** **NO**. El backend descarta los parámetros (`void _options;`) y aplica todo o nada.
7. **Paths de Bulk Import:**
   - Backend: `apps/admin_backend/src/modules/onboarding/controllers/import-staging.controller.ts` y `services/import-staging.service.ts`
   - Frontend: `apps/owner_dashboard/src/features/settings/bulk-import-wizard.tsx`
8. **Formatos de importación reales:** **Solo CSV** pegado en textarea. XLSX/XLS no está implementado en UI ni procesado en backend.
9. **Mapper dinámico:** **No interactivo**. Diccionario estático de sinónimos en `parseCsv()`.
10. **Aliases soportados:** `nombre` (name, producto, descripcion), `precio_venta` (precioventa, precio, price), `sku` (codigo, codigo_barras), `costo_insumo` (costo_promedio), `categoria` (rubro), `uom` (unidad_venta), `stock_inicial`.
11. **Entidades importables:** **Solo productos**. Insumos y recetas carecen de soporte.
12. **Staging tenant y token:** **SÍ**, `tenant_id` y `token_sesion_importacion` (UUID) con índice en `staging_importacion_productos`.
13. **Commit parcial:** **SÍ**, vía `mode: 'VALID_ONLY'`.
14. **Exportación de errores:** Backend expone endpoint; **frontend carece de botón de descarga**.
15. **Idempotencia de reintento de import:** En staging crea nuevas filas; en commit es idempotente porque marca filas como `COMMITTED`.
16. **Manejo de duplicados:** Modos `REPLACE`, `SKIP` y `FAIL` basados en coincidencia de nombre (case-insensitive).
17. **OnboardingSession persistente:** **NO existe**.
18. **Save/Resume:** **NO existe**. Se reinicia al recargar el navegador.
19. **Estado activated del Tenant:** **NO existe**. Solo existe `Tenant.is_active = true`.
20. **Activation/Readiness Service:** **NO existe**.
21. **Test de primera venta post-onboarding:** **NO existe** en suites de onboarding.
22. **Test offline -> reconnect -> sync en onboarding:** **NO existe** como parte del onboarding.
23. **Sync de Fiscal Setup al POS:** **NO**. `SystemParametersConfig` no se envía al POS.
24. **Venta de producto sin BOM:** **SÍ, se vende con éxito**. `MovementEngine` devuelve `[]` movimientos; COGS queda en 0.
25. **Campos mínimos para vender:** `id`, `name`, `sell_price > 0`, `is_active = true`.
26. **Audit trail generado:** Solo Fiscal Setup emite un evento desacoplado. Templates, Import y Provisioning no auditan.
27. **Negative tests cross-tenant:** **SÍ**, ejecutados y verificados en `onboarding-w9.db.e2e-spec.ts`.
28. **Coincidencia de los 5 CSV con contratos reales:** **NO coinciden**. Insumos y recetas no tienen importador; productos requiere normalización de headers y descarta campos como `es_preparado`.
29. **Descarga de plantilla oficial en Backoffice:** **NO existe**.
30. **Estado real de W9:** Implementadas las 3 vistas en pestañas aisladas; roadmap todo lo relativo a wizard guiado, checklist y readiness.

---

# 25. Evidencia mínima por hallazgo P0

### Hallazgo 1: Pre-BOMs se activan de forma destructiva
```text
Capability: Industry Templates Pre-BOM Lifecycle
Status: CONTRADICTED
Disposition: REFACTOR
Evidence:
- file: apps/admin_backend/src/modules/onboarding/services/industry-template.service.ts
- symbol / route: IndustryTemplateService.applyTemplate() (líneas 212-230)
- migration/entity: RecipeVersion (is_active: true)
- test: apps/admin_backend/src/modules/onboarding/services/industry-template.service.spec.ts:102
Observed behavior: Crea RecipeVersion directamente con `is_active: true` y versión 1 vinculada al producto.
Gap vs target: Insumos creados con stock=0 causan mermas negativas o bloquean ventas si la política es RESTRICT. El costo inicial es 0.00.
PRD consequence: Debe desacoplarse la inyección de la activación; las recetas de plantilla deben ser `SUGGESTED`.
```

### Hallazgo 2: Bulk Import limitado a productos y sin soporte binario Excel
```text
Capability: Bulk Catalog Import
Status: PARTIAL
Disposition: KEEP / EXTEND
Evidence:
- file: apps/owner_dashboard/src/features/settings/bulk-import-wizard.tsx
- symbol / route: BulkImportWizard, parseCsv()
- migration/entity: staging_importacion_productos
- test: apps/owner_dashboard/src/__tests__/w9-settings.test.tsx
Observed behavior: Solo procesa texto CSV pegado en textarea. Backend solo tiene tabla staging de productos.
Gap vs target: El PRD promete soporte Excel (.xlsx), drag & drop y mapeador interactivo de columnas.
PRD consequence: Reducir alcance de V1 a CSV con soporte de carga de archivo; diferir XLSX y mapeador interactivo.
```

### Hallazgo 3: Inexistencia de importadores para insumos y recetas
```text
Capability: BOH Multi-Entity CSV Import
Status: MISSING
Disposition: REMOVE_FROM_SELF_SERVICE
Evidence:
- file: apps/admin_backend/src/modules/onboarding/
- symbol / route: Búsqueda de InsumoStaging / RecipeStaging -> 0 resultados
- test: N/A
Observed behavior: No hay endpoints, DTOs, entidades ni interfaces para importar insumos, recetas ni subrecetas.
Gap vs target: Los 4 CSV de BOH distribuidos al cliente no pueden ser procesados por la aplicación.
PRD consequence: Remover los 4 CSV del flujo autoservicio; dejarlos como herramientas asistidas de soporte.
```

### Hallazgo 4: Falta de persistencia de sesión de onboarding
```text
Capability: Persistent Onboarding State & Resumability
Status: MISSING
Disposition: ADD
Evidence:
- file: apps/owner_dashboard/src/features/settings/settings-page.tsx
- symbol / route: SettingsPage (useState local)
- test: apps/owner_dashboard/src/__tests__/w9-settings.test.tsx
Observed behavior: La recarga del navegador borra el progreso de configuración.
Gap vs target: Se requiere un Setup Center persistente capaz de pausar y reanudar.
PRD consequence: Incorporar modelo `OnboardingSession` y endpoint de estado en backend.
```

### Hallazgo 5: Desconexión fiscal entre Backend y POS
```text
Capability: Fiscal Parameters Synchronization
Status: CONTRADICTED
Disposition: EXTEND
Evidence:
- file: apps/admin_backend/src/modules/onboarding/services/fiscal-setup.service.ts
- symbol / route: FiscalSetupService (persiste en system_parameters_config)
- file POS: apps/pos_app/lib/ (búsqueda de SystemParametersConfig -> 0 coincidencias)
Observed behavior: La configuración fiscal de la nube no se sincroniza con SQLite en la terminal POS.
Gap vs target: El POS no recibe el régimen fiscal configurado en el Backoffice.
PRD consequence: Crear tabla y worker de sync en POS para parámetros del sistema o incluirlo en el payload de sincronización de catálogo.
```

---

# 26. Required Test Inventory

Inventario de suites ejecutadas durante la auditoría con resultado real:

| Test file | Layer | Qué demuestra | Qué NO demuestra | Estado |
|---|---|---|---|:---:|
| `src/modules/onboarding/services/import-staging.service.spec.ts` | Backend Unit | Validación, parsing de monedas, chunking de 100 filas, staging y commit. | No prueba HTTP ni persistencia Postgres real. | **PASS (5.7s)** |
| `src/modules/onboarding/services/industry-template.service.spec.ts` | Backend Unit | Inyección de insumos, productos, UOMs y recetas. | No prueba aislamiento multi-tenant en base de datos. | **PASS (5.8s)** |
| `src/modules/onboarding/services/fiscal-setup.service.spec.ts` | Backend Unit | Versionado de parámetros fiscales y emisión de eventos. | No prueba sincronización hacia el POS. | **PASS (5.9s)** |
| `src/modules/onboarding/controllers/*.spec.ts` (3 suites) | Controller Unit | Enrutamiento, validación DTO y decorators `@Roles`. | No prueba integración de base de datos. | **PASS (6.0s)** |
| `test/onboarding/fiscal-setup.e2e-spec.ts` | Integration / Supertest | Endpoints GET y POST con mock de repositorio y JWT. | Usa base de datos mockeada en memoria. | **PASS (4.4s)** |
| `test/onboarding/industry-template.e2e-spec.ts` | Integration / Supertest | Endpoints de plantillas con mock de repositorios. | Usa base de datos mockeada en memoria. | **PASS (4.4s)** |
| `test/onboarding/import-staging.e2e-spec.ts` | Integration / Supertest | Upload, commit y diagnóstico de errores vía HTTP. | Usa base de datos mockeada en memoria. | **PASS (4.4s)** |
| `test/onboarding/onboarding-w9.db.e2e-spec.ts` | Real Postgres E2E | Aislamiento estricto RLS de Tenant A vs Tenant B en schema real. | No prueba componentes de React en frontend. | **PASS (Isolated DB)** |
| `apps/owner_dashboard/src/__tests__/w9-settings.test.tsx` | Frontend Component | Renderizado de pestañas, formularios, textarea y banners de seguridad. | No prueba llamadas de red reales (usa mocks de fetch). | **PASS (38 tests)** |
| `apps/owner_dashboard/src/__tests__/w9-settings-api.test.ts` | Frontend API | Cliente de API tipado y manejo de errores. | No prueba render de DOM. | **PASS** |
| `apps/owner_dashboard/src/__tests__/w9-e2e-settings.test.tsx` | Frontend Integration | Flujo secuencial completo de configuración W9 en UI. | No prueba hardware físico Sunmi. | **PASS** |

---

# 27. Riesgos Reportados Explícitamente

1. **R1 — Falsa completitud por Batch 11:** Batch 11 proveyó los cimientos de staging y plantillas, pero no construyó el flujo guiado de onboarding ni la persistencia de sesión.
2. **R2 — Pre-BOMs automáticos:** Publicar recetas activas v1 sin confirmación de stock/costos distorsiona el inventario del cliente desde el día 1.
3. **R3 — Cinco CSV interdependientes:** Intentar forzar la importación manual de insumos y subrecetas en V1 conduce a frustración y abandono.
4. **R4 — Desconexión fiscal POS:** Si los parámetros fiscales no viajan al POS, el cajero puede emitir facturas con tasas no concordantes con lo configurado en el Backoffice.
5. **R5 — Limpieza de base de datos en PRD:** El PRD vigente sugiere "Limpiar BD de Producción", lo cual es una aberración técnica inadmisible en una arquitectura multi-tenant compartida.

---

# 28. Non-goals del Audit

Este documento cumple con la regla estricta:
- **CERO líneas de código de producción modificadas.**
- No se crearon tablas ni migraciones.
- No se alteraron controladores ni servicios.
- Solo se recolectó y documentó la evidencia para redactar `prd_onboarding_v2.md`.

---

# 29. Entregable Final Obligatorio (Executive Summary)

### Resumen Ejecutivo de los 15 Hallazgos Clave

1. **Separación de responsabilidades requerida:** Provisioning (técnico) es independiente de Client Onboarding (negocio) y de Activation (contractual).
2. **Infraestructura de Bulk Import existente pero acotada:** Funciona para productos vía CSV en chunks de 100 filas con aislamiento en staging.
3. **Ausencia de importadores BOH:** Insumos, recetas y subrecetas carecen de importación autoservicio.
4. **Pre-BOMs se activan prematuramente:** `IndustryTemplateService` publica `RecipeVersion` como activa con costos en cero, arriesgando inventario negativo.
5. **Normalizador de columnas básico:** Existe lista fija de aliases en frontend; no existe mapeador dinámico visual.
6. **Entrada de datos en UI vía Textarea:** El frontend solo admite texto pegado; no soporta archivos XLSX ni drag-and-drop.
7. **Plantillas CSV en rama separada:** Las plantillas de onboarding residen en `main` (commit `17c4e1a`), no en el branch del Backoffice.
8. **Inconsistencias en plantillas de recetas:** Los nombres de insumos entre archivos difieren ligeramente, impidiendo joins relacionales seguros.
9. **Mínimo para `SALE_READY`:** El POS solo requiere `id`, `name`, `sell_price > 0` y `is_active: true`. Stock, insumos y recetas son diferibles.
10. **Ventas sin receta permitidas:** El POS vende productos sin receta retornando cero deducciones de inventario y costo cero.
11. **Falta de sincronización fiscal al POS:** Los parámetros fiscales configurados en la nube no se descargan a la base local del POS.
12. **Inexistencia de OnboardingSession:** El estado del onboarding no persiste en backend; se pierde al refrescar el navegador.
13. **Inexistencia de Activation Gate:** No existe proceso de validación previa al inicio de operaciones.
14. **Aislamiento multi-tenant sólido:** Las pruebas cross-tenant en Postgres aislado demuestran cero colisión de datos entre comercios.
15. **Conceptos obsoletos en PRD antiguo:** Purgar del PRD referencias a "Limpiar BD", "Triggers Kardex" y "Sincronización por Dropbox/Drive".

---

# 30. Gate de Salida L0

- [x] Batch 11 fue contrastado contra código y tests reales.
- [x] Provisioning fue separado conceptualmente de Client Onboarding.
- [x] Fiscal Setup tiene inventario real de API/service/entity/tests.
- [x] Industry Templates tienen inventario exacto de entidades que crean.
- [x] Se determinó que Pre-BOM se crea activo en v1 (requiere refactor a SUGGESTED).
- [x] Bulk Import tiene inventario exacto de formatos, parser, mapper, staging y commit.
- [x] Se determinó que solo la entidad `Product` es importable hoy.
- [x] Los cinco CSV fueron contrastados contra DTOs/importers reales.
- [x] Se determinó el mínimo técnico para `SALE_READY`.
- [x] Se determinó qué BOH puede diferirse sin bloquear ventas.
- [x] Se comprobó que NO existe estado persistente/resumable de onboarding.
- [x] Se comprobó que NO existe activation/readiness contract.
- [x] Retry/idempotencia fue comprobado en template e import.
- [x] Tenant isolation fue comprobado en todos los writes P0 con tests en DB real.
- [x] Audit Trail de configuración fue inventariado.
- [x] W9 UI real fue contrastado contra el roadmap.
- [x] Todos los hallazgos P0 incluyen archivo + símbolo/route + test o evidencia de ausencia.
- [x] No se realizó ninguna implementación de código durante la auditoría.

---

# 31. Salida esperada hacia el siguiente documento

El siguiente artefacto será:

```text
docs/PRDs/prd_onboarding_v2.md
```

El PRD V2 tomará este audit como baseline irrefutable y estructurará el flujo:

```text
PROVISIONING (CLI/Admin)
      ↓
SETUP CENTER (Owner Dashboard)
      ↓
SALE_READY (Catálogo + Fiscal mínimo)
      ↓
ACTIVATION GATE (Validación Sunmi V2s + Ticket de prueba)
      ↓
ENRIQUECIMIENTO BOH POST-ACTIVACIÓN (Insumos, Recetas, Kardex)
```

con `Time to First Successful Sale` como la métrica central de éxito del onboarding.
