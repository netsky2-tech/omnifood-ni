# Plan de Aceptación y Definition of Done (DoD)
## Configurable Tenant Fulfillment Topology (OmniFood NI)

**Basado en:**
- `docs/PRDs/prd_modulo_ventas.md` (Topología A: Restaurante Multidispositivo vs Topología B: Ultra-Ligero SOHO)
- `docs/PRDs/Product_Requirement_Document.md` (Pilares: Offline-First, Cumplimiento DGI DT-09-2007, Multi-Tenant RLS)
- Decisión de Arquitectura Engram `#8388` (*Adopt configurable tenant fulfillment topology*)
- Especificaciones OpenSpec: `openspec/changes/configurable-fulfillment-topology/`

---

## 🎯 Objetivo del Plan de Aceptación

Garantizar formalmente que toda la implementación de **Configurable Fulfillment Topology** cumple con los estándares operativos, fiscales, de hardware y de concurrencia antes de abrir los Pull Requests encadenados e integrar con la rama `main`.

---

## 🛡️ Checklist de Definition of Done (DoD) por Gate / PR

### Gate 1: Contratos de Dominio, Políticas de Inventario y Enrutamiento (PR #1)
- [x] **Separación de Topologías de Hardware (PRD Ventas §1)**:
  - **Topología B (SOHO / Food Park)**: Opera en canal `PRINT_ONLY`, suprimiendo la acumulación de órdenes en KDS.
  - **Topología A (Restaurante / KDS)**: Soporta `KDS_ONLY` y `KDS_AND_PRINT` coordinados.
- [x] **Políticas de Inventario Desacopladas de Enrutamiento**:
  - `RECIPE_BOM`: Consume insumos según la fórmula de receta en cocina.
  - `DIRECT_STOCK`: Descuenta unidades directamente del producto terminado sin exigir receta.
  - `NOT_TRACKED`: Servicios o ítems sin control de stock físico.
- [x] **Fallback Seguro de Enrutamiento**:
  - Productos sin estación configurada o perfiles faltantes caen a `DIRECT_HANDOFF` y estación `general-dispatch` con alerta no bloqueante. La venta offline **NUNCA** se detiene.
- [x] **Inmutabilidad Fiscal DGI**:
  - Las entidades de factura no poseen operación de borrado (`DELETE`), únicamente anulación (`is_canceled`).
- *Evidencia de Validación*: `apps/pos_app/test/domain/models/fulfillment_contracts_test.dart` (5 tests, 100% PASS).

---

### Gate 2: Persistencia POS Local, Kardex y Venta Atómica (PR #2)
- [x] **Persistencia Floor (SQLite) Offline-First**:
  - Tablas locales `tenant_fulfillment_records`, `print_jobs`, `inventory_sync_outbox` y `topology_snapshots` con índices y llaves foráneas.
  - Triggers SQLite que impiden `UPDATE` y `DELETE` sobre snapshots y auditoría de activación.
- [x] **Transacción de Venta Atómica**:
  - En un solo bloque transaccional SQLite (`@transaction` con parámetros posicionales) se persisten: Factura + Ítems + Movimientos de Kardex + Registro de Fulfillment + Trabajos de Impresión + Evento Outbox.
  - Si cualquier paso falla, se revierte el 100% de la operación; si tiene éxito, se avanza la numeración DGI de forma correlativa.
- [x] **Idempotencia Local**:
  - El reintento de guardado con el mismo `invoiceId` o `context` es detectado sin duplicar descuentos de stock ni registros contables.
- [x] **Compatibilidad con Tenants Legacy**:
  - Ventas con `fulfillmentContext: null` completan facturación y Kardex normalmente sin generar registros espurios.
- *Evidencia de Validación*: `apps/pos_app/test/data/repositories/sales/sales_repository_fulfillment_checkout_test.dart` y `sales_repository_impl_test.dart` (100% PASS).

---

### Gate 3: Aprovisionamiento en Backend, Concurrencia y Sync Determinista (PR #3)
- [x] **Revisiones Inmutables de Topología**:
  - Entidad `tenant_topology_revisions` y trigger PostgreSQL que prohíbe modificaciones a revisiones históricas.
  - Concurrencia controlada con *advisory locks* de PostgreSQL: si dos administradores intentan actualizar desde la misma versión base, el segundo recibe HTTP 409 Conflict.
- [x] **Aislamiento Multi-Tenant con Row-Level Security (RLS)**:
  - Políticas de RLS en PostgreSQL 16 aplicadas a nivel de esquema (`app.tenant_id`). Prohibido cualquier acceso o filtración de catálogos o transacciones entre tenants.
- [x] **Sincronización Outbox Determinista e Idempotente (`POST /v1/sync/batch`)**:
  - Procesamiento en orden secuencial por dispositivo (`sourceSequence`).
  - Detección de duplicados ante reconexión: retorna `status: 'DUPLICATE'`, `code: 'DUPLICATE_REPLAY'` sin aplicar efectos dobles en base central.
- *Evidencia de Validación*: `apps/admin_backend/test/fulfillment/fulfillment-topology.e2e-spec.ts` y `sync-outbox-replay.e2e-spec.ts` (100% PASS contra PostgreSQL 16 real, zero mocks).

---

### Gate 4: Hardware, Impresión Durable y KDS (PR #4)
- [x] **Secuencia Estricta de Impresión (Recibo antes de Comanda)**:
  - Secuencia 0: Recibo fiscal del cliente.
  - Secuencia 1: Comanda de cocina / despacho consolidado.
  - Si la secuencia 0 falla, la secuencia 1 **se bloquea automáticamente** para evitar órdenes huérfanas sin factura.
- [x] **Manejo de Incertidumbre de Hardware (`UNCERTAIN`)**:
  - Caídas de red o timeouts durante el envío colocan el trabajo en `UNCERTAIN`.
  - **Prohibido el reintento a ciegas** para evitar duplicar tiquetes impresos físicamente.
  - Exige resolución manual del operador (`confirmPrinted`, `retryAsCopy` o `leaveUnresolved`).
- [x] **Reimpresión Autorizada con Auditoría**:
  - Exige rol administrativo (`MANAGER` o `ADMIN`) y motivo en texto obligatorio.
  - Genera una copia explícita (`idempotencyKey` con sufijo `:copy:`) y registra un evento en el `AuditLog`.
  - **Invariante Crítica**: La reimpresión jamás genera una nueva factura fiscal DGI ni altera el Kardex.
- [x] **Política de Retención Central (90 Días)**:
  - Purga automática de detalles operativos de fulfillment y receipts locales > 90 días.
  - **Exclusión Sagrada**: Las facturas fiscales DGI y los movimientos de inventario Kardex **JAMÁS se purgan**.
- *Evidencia de Validación*: `apps/pos_app/test/domain/services/fulfillment/durable_print_service_test.dart` y `apps/admin_backend/test/fulfillment/fulfillment-retention.e2e-spec.ts` (100% PASS).

---

### Gate 5: Rollout Seguro, Backfill y Telemetría en Producción (PR #5)
- [x] **Escáner de Discrepancias de Catálogo (`GET /fulfillment/rollout/discrepancies`)**:
  - Detecta recetas sin componentes (`MISSING_RECIPE_BOM`).
  - Detecta contaminación cruzada entre comercios (`CROSS_TENANT_INSUMO_LEAK`).
  - Detecta productos legacy no enrutados para asignarles fallback seguro.
- [x] **Feature Gate de Rollback de Emergencia**:
  - `POST /fulfillment/rollout/rollback-toggle` permite deshabilitar el enforcement de cocina ante fallos de hardware en el local sin botar la operación de cobro.
  - El rollback **mantiene intactos al 100%** todos los registros históricos de auditoría, facturas, Kardex y comandas pasadas.
- [x] **Telemetría Operativa (`GET /fulfillment/rollout/dashboard`)**:
  - Métricas agregadas en tiempo real por canal (`PRINT_ONLY`, `KDS_ONLY`, `KDS_AND_PRINT`), estado de revisión y alertas.
- [x] **Prueba Piloto E2E Integrada**:
  - Simulación completa de venta offline, impresión térmica con fallo simulado, reconexión, sincronización outbox por lotes y verificación en dashboard central.
- *Evidencia de Validación*:
  - Backend: `apps/admin_backend/test/fulfillment/fulfillment-rollout-pilot.e2e-spec.ts` (100% PASS).
  - POS: `apps/pos_app/test/data/repositories/sales/sales_repository_fulfillment_pilot_rollout_test.dart` (100% PASS).
  - Runbook: `docs/fulfillment-rollout-runbook.md`.

---

## 📊 Matriz de Criterios de Aceptación (Sign-Off Matrix)

| Criterio | Estándar Exigido | Estado Actual | Verificado En |
|---|---|:---:|---|
| **Resiliencia Offline** | Cobro y comanda operan 0% internet | ✅ CUMPLIDO | SQLite Floor in-memory / FFI tests |
| **Normativa DGI** | Facturas inmutables, sólo anuladas | ✅ CUMPLIDO | Tests de venta y anulación |
| **Multi-Tenancy** | RLS en PostgreSQL 16 sin filtraciones | ✅ CUMPLIDO | E2E suites con Tenant A y Tenant B |
| **Tipado Estricto** | Cero uso de `any` (Regla #5) | ✅ CUMPLIDO | ESLint passed con 0 errores |
| **Pruebas de Backend** | PostgreSQL 16 nativo (Zero Mocks) | ✅ CUMPLIDO | 18 tests E2E y 6 tests DB pasando |
| **Pruebas de POS** | Flutter test + Floor DAOs | ✅ CUMPLIDO | 32 tests de fulfillment pasando |
| **Runbook y Operación** | Procedimiento de rollout y contingencia | ✅ CUMPLIDO | `docs/fulfillment-rollout-runbook.md` |

---

## 🚀 Veredicto de Aceptación

**ESTADO: APROBADO PARA LANZAMIENTO DE PRs ENCADENADOS**
Todos los criterios de aceptación y requerimientos de la Definition of Done están cumplidos y verificados con pruebas automatizadas verdes tanto en backend como en frontend.
