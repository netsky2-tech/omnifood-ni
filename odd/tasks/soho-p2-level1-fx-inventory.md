# SOHO — Nivel 1: FX Range Validation, Provisioning Defaults, BOH Inventory (R-10/R-13)

- **Rama:** `fix/soho-p2-level1-fx-inventory`
- **Worktree:** `/home/octavio_morales/omnifood-ni-l1`
- **Base:** `main` @ `4092e22a`
- **Issues cubiertos:** #75 (Validación de rango en FX y defaults de provisioning) y #73 (Inventario BOH, R-10 panel sync, R-13 alerta inventario no aplicado).

---

## 1. Alcance y Decisiones de Diseño

### Issue #75: Validación de rango en FX y eliminación de defaults peligrosos
1. **Rango de Tipo de Cambio en Nicaragua (Cota [10.0, 100.0]):**
   - **Backend:** `FiscalSetupDto` actualiza `@Min(0)` por `@Min(10.0, { message: 'commercialFxSpread must be at least 10' })` y `@Max(100.0, { message: 'commercialFxSpread must not exceed 100' })`.
   - **Servicio Backend:** `FiscalSetupService` valida `dto.commercialFxSpread < 10 || dto.commercialFxSpread > 100`.
   - **Dashboard Web:** `types.ts` actualiza Zod schema a `.min(10, 'El tipo de cambio comercial debe ser al menos 10').max(100, 'El tipo de cambio comercial no puede exceder 100')`.
   - **POS:** `business_profile_view.dart` valida `val < 10 || val > 100`.
   - **Eliminación del fallback `0.5` en lecturas de backend:** En `fiscal-setup.service.ts` y `fiscal-config-version.service.ts`, si `commercialFxSpread` no está configurado, no devolver `0.5`. Devolver `null` o valor no asignado forzando configuración o fallback explícito de onboarding (`36.5`). Actualizar fixtures que dependían de `0.5` o valores < 10.
   - **Scripts de provisioning (`provision.ts`, `provision-dev.ts`):** Eliminar swallow de errores (`process.exit(1)` en catch), evitar credenciales triviales por defecto e inicializar o exigir parámetros mínimos sin valores corruptos.

### Issue #73: Inventario BOH y flujo con R-10 y R-13
1. **#73a: Badge engañoso "SIN STOCK" en productos BOH:**
   - En `insumo_view.dart`: No marcar en rojo "SIN STOCK" si el producto tiene `inventoryPolicy == InventoryPolicy.notTracked` o es `SIMPLE` sin insumo/receta asociado. Mostrar "DISPONIBLE" / "ACTIVO" en tono neutral/primary.
2. **#73b (R-10): Desacople de causa en Sync Freshness:**
   - `SyncFreshnessDto` y `freshness-derivation.ts`: Exponer explícitamente si el retraso en confirmación se debe a `hasInventoryPending` o `inventoryStalled` vs retraso de conectividad (`networkDelayed`), para que el badge del dashboard no mienta diciendo que la sincronización falló por red.
3. **#73c (R-13): Detección y alerta de ventas con inventario no aplicado:**
   - **POS:** Montar `InventoryEnrichmentWarningBanner` en `SaleView` (debajo del app bar / encabezado) para que el operador y supervisor vean de forma no bloqueante cuántas ventas están acumuladas en `APPLIED_INVENTORY_PENDING`.
   - **Web:** Exponer el estado/contador de ventas en `APPLIED_INVENTORY_PENDING` en el dashboard o centro de operaciones de inventario con aviso informativo claro.

---

## 2. Registro de Tareas

- [ ] **T1** Aislamiento: Setup de branch y worktree para Nivel 1
- [ ] **T2** #75: Validación de rango FX [10.0, 100.0] y eliminación de defaults peligrosos (Backend, Web, POS)
- [ ] **T3** #73a: Corrección de badge 'SIN STOCK' en BOH del POS para productos no rastreados
- [ ] **T4** #73b (R-10): Desacople de causa de inventario vs red en frescura de sync
- [ ] **T5** #73c (R-13): Montaje de alerta `InventoryEnrichmentWarningBanner` en SaleView y visibilidad en backoffice
- [ ] **T6** Verificación integral (suites de pruebas con gentle-ai-verify), PR y entrega
