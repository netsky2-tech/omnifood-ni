# Feature: Autorización de Anulaciones de Factura con PIN de Supervisor

- **Módulo:** `apps/pos_app` (Ventas, Historial de Facturas, Políticas de Supervisión y Auditoría Forense)
- **Estado:** Implementado, Verificado y Probado E2E
- **Fecha:** 2026-11-03

## Specs

### S1: Extensión de `SupervisionPolicy` con `supervisorRequiredForVoid`
En `apps/pos_app/lib/domain/models/config/supervision_policy.dart`:
- Campo `@Default(false) bool supervisorRequiredForVoid`.
- Presets por tipo de negocio en `SupervisionPolicy.forOperationMode`:
  - `foodparkQsr`: `supervisorRequiredForVoid: false` (anulación ágil para no detener la fila de mostrador; configurable por el Owner/Manager si desea control estricto).
  - `restaurant`: `supervisorRequiredForVoid: true` (control riguroso en mesa/comedor; requiere PIN de supervisor).
  - `hybrid`: `supervisorRequiredForVoid: true` (soporte de comedor; requiere PIN de supervisor).
- Regla `requiresSupervisorForVoid(String? role)`: exige supervisor si la bandera está activa y el rol del usuario actual no es autorizador (los roles autorizadores como Manager u Owner anulan directamente sin pedir PIN adicional).

### S2: Trazabilidad Forense en Auditoría de Anulaciones
- `AuditRepository.prepareLog` ampliado para aceptar `metodoAutorizacion` y `usuarioAutorizadorId`.
- `SalesRepository.voidInvoice` y `SaleViewModel.voidInvoice` aceptan `supervisorId` y `authMethod`.
- Al anular, se persiste en la tabla inmutable `audit_logs` la acción `SALE_VOIDED` con el `usuarioAutorizadorId` y `metodoAutorizacion: 'PIN'`.

### S3: Integración de `SupervisorOverrideModal` en `_showVoidDialog`
En `apps/pos_app/lib/ui/features/sales/sales_history_view.dart`:
- Al presionar anular factura, si la política exige supervisión para el usuario actual:
  - Se abre `SupervisorOverrideModal` solicitando el PIN del supervisor.
  - Si se rechaza o cancela, la anulación se detiene de forma segura con un SnackBar descriptivo.
  - Si se autoriza con éxito, se envía la anulación con la atribución del supervisor.
- Si la política no exige supervisión (ej. QSR por defecto, o el usuario es Manager/Owner), la anulación se realiza directamente.

### S4: Pruebas Unitarias, de UI y E2E Real con SQLite Floor
- Pruebas unitarias de dominio para `SupervisionPolicy` en `supervision_policy_test.dart` (presets QSR, Restaurant, Hybrid y parseo seguro).
- Pruebas unitarias de repositorio en `sales_repository_void_test.dart` verificando la captura forense de `metodoAutorizacion` y `usuarioAutorizadorId`.
- Pruebas de widgets de UI para `SalesHistoryView` en `sales_history_void_supervision_ui_test.dart` con y sin requisito de PIN.
- Prueba E2E real con Floor/SQLite en `sales_void_supervisor_e2e_real_test.dart` demostrando la anulación libre en QSR, la anulación supervisada con PIN en Restaurante y la verificación del log forense con hash encadenado inmutable en la tabla `audit_logs`.

## Tasks
- [x] T1: Extender `SupervisionPolicy` con `supervisorRequiredForVoid`, presets y helper `requiresSupervisorForVoid`.
- [x] T2: Actualizar `prepareLog`, `SalesRepository` y `SaleViewModel` para admitir atribución de supervisor en anulación.
- [x] T3: Integrar `SupervisorOverrideModal` en `SalesHistoryView._showVoidDialog`.
- [x] T4: Pruebas unitarias de `SupervisionPolicy` y pruebas de UI en `SalesHistoryView`.
- [x] T5: Prueba E2E real en SQLite con Floor verificando la persistencia forense inmutable.

## Log
- L1: 2026-11-03 — Inicialización de la especificación tras resolver Arqueo Ciego.
- L2: 2026-11-03 — Implementación de campos en SupervisionPolicy, serialización en TenantConfigService y propagación a repositorios/ViewModel.
- L3: 2026-11-03 — Integración de SupervisorOverrideModal en SalesHistoryView._showVoidDialog.
- L4: 2026-11-03 — Suite completa ejecutada (23/23 tests pasando en verde) cubriendo dominio, repositorio, widgets UI y ciclo E2E real con Floor/SQLite.
