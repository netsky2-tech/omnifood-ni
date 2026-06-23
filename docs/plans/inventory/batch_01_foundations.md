# Batch 1: Cimientos y Datos Maestros (Foundations) — Remediación

Establecer las bases estructurales del inventario. Sin insumos, productos de venta y catálogos administrables sólidos, el costeo falla. **Este batch remedia la base existente** (entidad `Insumo` ya creada) y completa lo que falta para **Topology B** (despliegue inmediato del primer cliente: tablet única + impresora térmica) manteniendo **Topology A** *forward-compatible*, más precisión decimal.

## Estado actual
- `InsumoEntity` existe en Flutter (Freezed) y NestJS con RLS.
- Catálogo de insumos y UI ABM funcionales; sincronización de catálogo parcial.
- Existen presets/listas de catálogo en UI que deben migrarse a datos administrables por tenant.

## Brechas a remediar
- [ ] Verificar/forzar precisión `NUMERIC(14,4)` en todos los campos de costeo y existencia (NFR decimal).
- [ ] **Topology B (PRD §1) — despliegue inmediato del primer cliente**: tablet única + impresora térmica, offline-first, sin servidor edge centralizador. Es el objetivo de este batch (D3).
- [ ] **Topology A (PRD §1) — migración futura, forward-compatible**: el esquema y los contratos diseñados ahora **no deben bloquear** la incorporación posterior del servidor local centralizador (All-In-One/Mini-PC) que ejecuta BOM en caliente y centraliza existencias para KDS/tablets. No se implementa A en este batch; solo se garantiza que no la excluya.
- [ ] Gobierno de UOM completo: conversión compra→inventario con factor documentado (ej. `1 lb = 0.453592 kg`); el stock siempre se guarda en `unidadInventario` base.
- [ ] **Catálogos administrables, no hardcoded**: UOM, categorías, tipos, presentaciones, categorías de producto de venta, UOM de venta y tipo de producto (`PREPARADO`, `REVENTA`, etc.) deben gestionarse desde el sistema por tenant.
- [ ] Endpoint NestJS para poblar insumos, productos de venta y catálogos base desde el Admin con sincronización hacia la tablet (offline-first: descarga + caché local).

## Alcance técnico

### Base de datos (Local — Floor/SQLite)
- `InsumoEntity` con campos mandatorios: `id`, `codigo` (unique), `nombre`, `unidadInventario` ('KG','LTS','UND','OZ'), `existenciaActual`, `costoPromedioNio`, `stockMinimo`, `stockMaximo` — todos a 4 decimales.
- Tabla `insumos` (PostgreSQL) con RLS por `tenant_id`; migración TypeORM.

### Catálogos administrables (Inventory + FOH Product Catalog)
- Ningún catálogo de negocio tenant-configurable debe vivir como enum/lista hardcoded en UI o servicios.
- Catálogos mínimos administrables: UOM, conversiones UOM, categorías de insumo, tipos de insumo, presentaciones, categorías de producto de venta, UOM de venta y tipos de producto de venta (`PREPARADO`, `REVENTA`, etc.).
- Los estados/protocolos invariantes pueden seguir como enums técnicos solo cuando no sean configurables por tenant.
- La tablet debe poder operar offline con caché local de catálogos sincronizados.

### Conversión de unidades (UOM Governance)
- Mapeo de conversión compra→inventario. Regla: el stock SIEMPRE se guarda en la `unidadInventario` base.

### Topología: B ahora, A después (D3)
- **Topology B (inmediato)**: tablet única + impresora térmica; el descuento de inventario y la explosión BOM ocurren en la propia tablet (offline-first). Sin edge local.
- **Topology A (futura, forward-compatible)**: contrato del servidor local edge que recibe el evento de cobro FOH → ejecuta BOM → descuenta inventario local en caliente; KDS/tablets consultan existencias remanentes centralizadas; las transacciones terminadas se encolan para consolidación asíncrona hacia la nube (detalle del contrato de sync: Batch 3c). **No se entrega A en este batch**; solo se valida que el modelo de datos y los contratos no la bloqueen.

## DoD (Criterios de aceptación)
- [~] `Insumo` en Flutter y NestJS con precisión 4 decimales verificada (test unitario con valor 0.0001). → Backend `Insumo` ya es `NUMERIC(14,4)`. Regla UOM redondeada a 4dp probada con 0.0001 (`UomConversionCalculator`). Precisión del *entity* Flutter (`double`) diferida al slice de schema de insumo.
- [x] DAO Floor con persistencia básica.
- [x] Pantalla "Catálogo de Insumos" funcional usando catálogos administrables, no presets hardcoded.
- [x] Catálogos de UOM, categorías, tipos, presentaciones y productos de venta administrables desde el sistema, con API/backend, persistencia local y pruebas.
- [x] Documento/decisión de topología: Topology B como despliegue inmediato (tablet + impresora térmica) y Topology A como migración futura forward-compatible (rol del edge local y contrato de descuento en caliente, sin implementarlo ahora). → Registrado en `inventory_roadmap.md` (D3).
- [x] Conversión UOM probada (saco 50lb → kg).

## Progreso de implementación (slice 1 — Foundations administrable catalogs + UOM rule)

Implementado (TDD, backend + POS, tests verdes):
- **Backend (NestJS)**: módulo `catalog` con `CatalogValue` (RLS/tenant, unique `(tenant_id, catalog_type, code)`, soft-delete), `CatalogService` (CRUD + `seedDefaults` idempotente), `CatalogController` registrado en `AppModule` (`GET/POST/PATCH/DELETE /catalogs/:type`, `POST /catalogs/seed-defaults`). `UomConversionCalculator` con la regla única `purchaseQuantity * factorToInventoryBase = inventoryBaseQuantity` (4dp) en `InventoryModule`.
- **POS (Flutter)**: `catalog_values` (Floor) + `CatalogValueDao` + migración 20→21 con seed de defaults; `CatalogValue`/`CatalogType` (Freezed); `InventoryRepository` expone catálogos (offline mirror); `InsumoViewModel` carga y expone UOM/categorías/tipos; `insumo_view.dart` ya **sin** `commonConsumptionUoms`/`commonProductUoms`/`productCategoryPresets` (dropdowns desde catálogo); tipo de producto (PREPARADO/REVENTA) desde catálogo.
- Catálogos cubiertos: UOM (compartido inventario+venta), categorías de insumo, tipos de insumo, categorías de producto de venta, tipos de producto de venta. Presentaciones = `UomConversion` (ya existente).

### Diferido al siguiente slice (patrón ya establecido, réplica mecánica)
- [ ] **Sync/download de catálogos** Admin→tablet: la tablet opera offline hoy (seed por migración); falta el wiring en `SyncService` para refrescar el caché local desde `/catalogs`. Contrato determinista de sync → Batch 3c.
- [ ] **Schema de producto**: reemplazar `isPrepared` (bool) por `product_type_code` FK a `SALES_PRODUCT_TYPE`, y `category` (texto libre) por `category_code` FK a `SALES_PRODUCT_CATEGORY`. Hoy el selector usa el catálogo y mapea al flag bool / nombre para no migrar el schema en este slice.
- [ ] **Schema de insumo**: agregar `category_code`/`type_code` FK + selectores en el formulario de insumo (el catálogo ya existe y es administrable; el `Insumo` actual no tiene campos de categoría/tipo).
- [ ] **Precisión 4dp en entity Flutter** (`double`→decimal escalar) para insumo/costos.
- [ ] Integrar `UomConversionCalculator` en `inventory.service` (backend) y en el flujo de compras del POS (hoy la regla está documentada y probada; el `conversionFactor` legacy se reemplaza en el slice de compras/Batch 3b).
- [ ] **Audit/event hook para mutaciones de catálogo**: diferido. Batch 1 deja CRUD tenant-safe y RLS operativo; el wiring de auditoría se implementará cuando se conecte el patrón central de eventos/audit trail para master data, sin inventar un mecanismo paralelo.

### Hallazgo de auditoría #2 (InventoryController no registrado)
`InventoryController` (`inventory.controller.ts`) NO está registrado en `InventoryModule` y su `@Post('purchase')` duplica a `InventoryMovementController` (mismo `@Controller('inventory')`). Registrarlo causaría conflicto de rutas. Se deja como código muerto fuera del alcance; la API administrable de catálogos faltante se entrega vía el nuevo `CatalogModule`/`CatalogController`. Recomendación: eliminar `inventory.controller.ts` muerto en un chore aparte.

## PRD cubierto
§1 Topology B (inmediata) + Topology A (futura, forward-compatible) · §3 Modelo de datos (insumos) · NFR Decimal
