# Batch 8: Sincronización Cloud Offline-First Bidireccional & Inbound Master Data Sync

Este plan operacionaliza la **Sincronización Bidireccional Nube $\leftrightarrow$ Terminal**, permitiendo que los terminales POS locales no solo transmitan sus transacciones y ventas (Outbox), sino que descarguen y mantengan actualizados en tiempo real:
1. **Catálogo Maestro y Precios** (Altas, bajas y modificaciones de productos/categorías realizadas en el Admin).
2. **Perfiles de Seguridad y Usuarios** (Revocación de accesos, actualización de roles y parámetros).
3. **Monitoreo de Conectividad y Cola de Outbox** con indicador visual en el POS.

---

## 1. Authority, Traceability & Invariant Decisions

### Authoritative Constraints
1. **D1 (Offline-First Source of Truth - Topología B)**: Local SQLite (Floor) es la fuente de verdad operativa. La ausencia de internet jamás bloquea ventas, inventario ni consultas de catálogo.
2. **D2 (Idempotencia y Secuencia Determinista)**: Toda transmisión outbox e inbound lleva llaves de idempotencia y versiones incrementales (`catalog_version`, `entity_version`), previniendo duplicados o corrupción por latencia.
3. **D3 (Deltas Inbound Livianos)**: El POS nunca descarga la base de datos completa en cada sincronización; solicita únicamente cambios posteriores a su última versión conocida (`?since_version=X`).
4. **D4 (Aislamiento Multi-Tenant)**: Todo endpoint de sincronización en NestJS filtra estrictamente por `tenant_id` mediante Row-Level Security (RLS) y guards de autenticación JWT.

---

## 2. Assumptions, Decisions & Governance Matrix

| ID | Item | Decisión / Política | Responsable |
|---|---|---|---|
| DEC-01 | **Estrategia Inbound** | *Delta-based versioning*. Cada entidad de catálogo posee `version` (entero secuencial o timestamp ISO) y flag `is_active` para soft deletes. | Arquitecto / Backend |
| DEC-02 | **Resolución de Conflictos** | *Server-Authority para Catálogo/Precios*; *Client-Authority (Append-Only) para Ventas/Kardex*. | Finanzas / Producto |
| DEC-03 | **Detección de Red** | Verificación reactiva por ping ligero a `/v1/health` o interceptores Dio para disparar auto-sync al recuperar conectividad. | Mobile Lead |
| DEC-04 | **UI Feedback** | Indicador en la barra superior del POS: Verde (Sincronizado), Ámbar (Sincronizando / Pendientes en cola), Gris/Rojo (Offline con contador de pendientes). | UX / Frontend |

---

## 3. Dependency DAG & Critical Path

```
                    ┌────────────────────────────────────────────────────────┐
                    │ Slice 8.1: Backend Inbound Delta Sync API              │ (NestJS)
                    │ (GET /v1/sync/inbound/catalog & security updates)      │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Slice 8.2: POS Inbound Downloader & Local Hydration    │ (Flutter Floor)
                    │ (Descarga delta, upsert de productos, recetas, precios)│
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Slice 8.3: Monitoreo de Red, Auto-Sync & Reintentos    │ (Sync Service)
                    │ (Reconexión automática, backoff y tolerancia a fallos) │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ Slice 8.4: Indicador UI de Sincronización & E2E Suite  │ (Presentation)
                    │ (Badge en AppBar, sync manual y suite E2E offline/on)  │
                    └────────────────────────────────────────────────────────┘
```

**Ruta Crítica**: Slice 8.1 $\rightarrow$ Slice 8.2 $\rightarrow$ Slice 8.3 $\rightarrow$ Slice 8.4.

---

## 4. Desglose de Vertical Slices

### Slice 8.1: Backend Inbound Delta Sync API (NestJS)
- **Objetivo**: Crear endpoint unificado en el backend para suministrar deltas de catálogo, precios y usuarios desde una versión dada.
- **En scope**:
  * DTOs: `InboundSyncQueryDto` (`sinceVersion`, `terminalId`), `InboundSyncResponseDto`.
  * Controlador: `InboundSyncController` (`GET /v1/sync/inbound/deltas`).
  * Servicio: `InboundSyncService` consultando productos, categorías, recetas modificadas y usuarios actualizados.
  * Pruebas unitarias e integración en NestJS.

### Slice 8.2: Inbound Downloader & Hidratación Local (Flutter POS)
- **Objetivo**: Integrar la descarga de deltas en `SyncService` y actualizar SQLite de forma atómica.
- **En scope**:
  * DAOs: Métodos `upsertProducts`, `upsertCategories`, `upsertUsers` en Floor SQLite.
  * `SyncService._pullCatalogDeltas()`: consume el endpoint del backend, procesa altas/bajas/modificaciones y actualiza la versión local guardada en `local_configs`.
  * Notificación reactiva al `SaleViewModel` e `InventoryViewModel` para refrescar catálogo en pantalla sin reiniciar la app.
  * Pruebas unitarias en Flutter.

### Slice 8.3: Monitoreo de Red, Auto-Sync & Reintentos con Backoff
- **Objetivo**: Automatizar el ciclo de sincronización cuando se recupera la señal WiFi sin intervención manual del cajero.
- **En scope**:
  * `ConnectivityMonitor` / healthcheck ping para detectar transición Offline $\rightarrow$ Online.
  * Manejo de reintentos exponenciales ante timeouts de red.
  * Aislamiento de errores: si el pull de catálogo falla, no detiene el push de facturas fiscales y viceversa.
  * Pruebas unitarias de resiliencia.

### Slice 8.4: Indicador UI de Estado Cloud & Suite E2E Integral
- **Objetivo**: Proporcionar visibilidad al cajero sobre el estado de la nube y validar el ciclo completo.
- **En scope**:
  * Widget `CloudSyncStatusBadge` en el `AppBar` del POS:
    - 🟢 Nube Sincronizada (0 pendientes).
    - 🟡 Sincronizando en progreso o N elementos en cola Outbox.
    - ⚪ / 🔴 Sin conexión (muestra cantidad de facturas/movimientos pendientes de subir).
    - Menú emergente al hacer tap: "Forzar Sincronización Ahora" y detalle de última sincronización exitosa.
  * Suite E2E `bidirectional_cloud_sync_e2e_test.dart`:
    - Venta offline $\rightarrow$ Cola en Outbox $\rightarrow$ Simulación de Red activa $\rightarrow$ Push de venta exitoso $\rightarrow$ Pull de nuevo producto creado en backend $\rightarrow$ Producto visible de inmediato en la grilla de ventas.

---

## 5. Estimación de Líneas y Review Budget

| Slice | Alcance | Líneas Estimadas | Nivel de Riesgo |
| :--- | :--- | :---: | :---: |
| **Slice 8.1** | Backend NestJS Inbound Sync API | ~350 líneas | Bajo |
| **Slice 8.2** | POS Inbound Pull & SQLite Upsert | ~380 líneas | Medio |
| **Slice 8.3** | Network Monitor & Auto-Sync Resilience | ~300 líneas | Bajo |
| **Slice 8.4** | UI Sync Badge & E2E Integration Suite | ~380 líneas | Medio |
