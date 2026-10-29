# #940 — Visibilidad y Gestión de Turnos en POS (Paso B)

## Specs

- **S1 (Sincronización del Guard de Apertura):** `SaleViewModel.openSession` debe verificar si el operador ya tiene un turno abierto en el terminal actual (`getActiveSessionForUserAndTerminal`), bloqueando la creación de turnos duplicados con el mensaje `Ya existe un turno de caja activo en esta terminal.` y rehidratando la sesión activa existente.
- **S2 (Consulta de Turnos Abiertos en Terminal):** `CashierSessionDao` debe exponer una consulta para listar todos los turnos abiertos (`is_closed = 0`) del terminal (`getOpenSessionsForTerminal`), ordenados por `opened_at DESC`.
- **S3 (Cierre Administrativo con Motivo):** `CashShiftViewModel` debe permitir a un usuario con rol de supervisión (`owner` o `manager`) auditar y cerrar cualquier turno abierto/huérfano en el terminal (`closeOrphanShift`), requiriendo obligatoriamente un motivo justificado, registrando el evento forense `ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT` con metadata completa (`shift_id`, `terminal_id`, `original_user_id`, `supervisor_id`, `reason`), actualizando los totales y el consecutivo de Corte Z.
- **S4 (Superficie Administrativa NHILOS en POS):** En `CashShiftView`, cuando existan turnos abiertos en el terminal pertenecientes a otros operadores o huérfanos, o cuando el usuario actual sea Dueño/Gerente:
  - Mostrar un banner o acceso administrativo visible indicando la existencia de turnos abiertos en el dispositivo.
  - Proveer un diálogo o vista de gestión que liste cada turno (operador resuelto a nombre, fecha de apertura, saldo esperado) y permita ejecutar el cierre administrativo con motivo.
- **S5 (Paridad y Auditoría Forense):** Clasificar y rotular `ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT` en `label_map.dart` (POS), `labels.ts` (Owner Dashboard) y `audit-risk-classifier.ts` (Backend) con severidad `CRITICAL`.
- **S6 (Verificación Automatizada):** Tests unitarios e instrumentados que verifiquen:
  - Rechazo de doble apertura en `SaleViewModel.openSession`.
  - Listado y cierre administrativo de sesiones huérfanas en `CashShiftViewModel`.
  - Validación del diálogo y motivo obligatorio según estándar NHILOS.

## Tasks

- [x] T1: Sincronizar guard en `SaleViewModel.openSession` y añadir test unitario (S1).
- [x] T2: Agregar `getOpenSessionsForTerminal` en `CashierSessionDao` y test de persistencia (S2).
- [x] T3: Implementar `closeOrphanShift` y carga de turnos del terminal en `CashShiftViewModel` con evento de auditoría (S3).
- [x] T4: Registrar labels y severidad de `ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT` en POS, Dashboard y Backend (S5).
- [x] T5: Crear superficie UI administrativa para turnos abiertos/huérfanos en `CashShiftView` (S4).
- [x] T6: Ejecutar suite de tests y verificar integridad completa (S6).

## Log

- L1: 2026-10-29 - El usuario solicita continuar el Paso B (#940): resolver turnos huérfanos invisibles e incerrables, crear superficie administrativa en POS con motivo, y sincronizar guard entre openShift y openSession.
- L2: 2026-10-29 - T1 completada: Sincronizado el guard en `SaleViewModel.openSession` para comprobar turno activo del operador en el terminal y evitar aperturas duplicadas. Verificado con `sale_view_model_test.dart` (70/70 pasando).
- L3: 2026-10-29 - T2 completada: Añadida consulta `getOpenSessionsForTerminal` y `getAllOpenSessions` en `CashierSessionDao`. Regenerados archivos Floor `.g.dart` vía build_runner. Verificado con `cashier_session_scoped_query_test.dart` (7/7 pasando).
- L4: 2026-10-29 - T3 completada: Implementado `closeOrphanShift` y carga de `openTerminalShifts` en `CashShiftViewModel`. Registro forense de `ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT` con metadata completa. Verificado con `cash_shift_view_model_test.dart` (18/18 pasando).
- L5: 2026-10-29 - T4 completada: Paridad y severidad `CRITICAL` de `ADMINISTRATIVE_CLOSE_ORPHAN_SHIFT` en POS (`label_map.dart`), Owner Dashboard (`labels.ts`) y Backend (`audit-risk-classifier.ts`). Tests pasando en los tres proyectos (42/42 en dashboard, 41/41 en backend, 21/21 en pos label maps).
- L6: 2026-10-29 - T5 y T6 completadas: Construida superficie administrativa `DeviceShiftsDialog` y `AdministrativeCloseShiftDialog` conforme a NHILOS, integrada con advertencia contextual en `CashShiftView`. Suite de 88 tests en `cash/` pasando al 100%.
