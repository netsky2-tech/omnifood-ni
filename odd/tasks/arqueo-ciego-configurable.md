# Feature: Arqueo Ciego Configurable y Presets por Tipo de Negocio

- **Módulo:** `apps/pos_app` (Control de Caja, Turnos y Políticas de Supervisión)
- **Estado:** Implementado, Verificado y Probado E2E
- **Fecha:** 2026-11-03

## Specs

### S1: Extensión de `SupervisionPolicy` con Arqueo Ciego y Control de Corte X
En `apps/pos_app/lib/domain/models/config/supervision_policy.dart`:
- `blindCountEnabled` (bool, default: true en todos los modos; protege saldos esperados por defecto en Foodpark, Restaurante e Híbrido, permitiendo al Manager habilitarlo explícitamente si así lo desea).
- `supervisorRequiredForPartialXReport` (bool: false en `foodparkQsr` para agilidad en lectura, true en `restaurant` y `hybrid`).
- Extensión `SupervisionPolicyRules`: método `bool canViewExpectedCash(String? role)`.

### S2: Presets por Tipo de Negocio (`TenantOperationMode`)
En `SupervisionPolicy.forOperationMode(TenantOperationMode mode)`:
- `foodparkQsr`: `blindCountEnabled: true` (saldos protegidos por defecto), `supervisorRequiredForPartialXReport: false` (Corte X libre), `selfAuthorizationAllowedCloseBox: true` (cierre ágil).
- `restaurant`: `blindCountEnabled: true`, `supervisorRequiredForPartialXReport: true` (Corte X requiere PIN), `selfAuthorizationAllowedCloseBox: true`.
- `hybrid`: `blindCountEnabled: true`, `supervisorRequiredForPartialXReport: true`, `selfAuthorizationAllowedCloseBox: true`.

### S3: Ocultamiento de Saldos Teóricos en `CashShiftView`
- Cajero con arqueo ciego activo ve `C$ ••••••` y `$ ••••` con subtítulo `Oculto por política de control`.
- Manager/Owner ve los montos calculados reales.
- Si el manager desactiva `blindCountEnabled`, el cajero ve los montos reales.

### S4: Restricción Supervisada de `Lectura Parcial (Corte X)`
- En `foodparkQsr`: Corte X es libre (no pide PIN de supervisor).
- En `restaurant`/`hybrid`: Corte X solicita PIN mediante `SupervisorOverrideModal`.

### S5: Pruebas E2E Reales sobre Base de Datos Local SQLite (Floor)
- `apps/pos_app/test/ui/features/cash/cash_shift_blind_count_e2e_real_test.dart`
- Inicia SQLite en memoria con Floor real.
- Abre turno, registra movimiento de efectivo real en base de datos.
- En modo `foodparkQsr`:
  - Cajero ve `C$ ••••••` (saldo esperado protegido por defecto).
  - Presiona `Lectura Parcial (Corte X)`: se abre libremente sin pedir PIN.
  - Manager cambia política en SQLite a `blindCountEnabled: false`: el cajero pasa a ver los saldos reales.
- En modo `restaurant`:
  - Cajero ve `C$ ••••••`.
  - Presiona `Lectura Parcial (Corte X)`: se exige PIN de supervisor (`SupervisorOverrideModal`), se autoriza con PIN 9999 y se audita forensemente con hash inmutable.
- Cierre de turno (Corte Z) en SQLite real:
  - Cajero cierra turno con conteo físico ciego exacto.
  - Base de datos persiste sesión cerrada sin discrepancia.

## Tasks
- [x] T1: Modelos de dominio y presets por tipo de negocio en `SupervisionPolicy`
- [x] T2: Generación de código Freezed y pruebas unitarias de `SupervisionPolicy`
- [x] T3: Ocultamiento de saldos en `CashShiftView` según política y rol
- [x] T4: Control de supervisor en `Lectura Parcial (Corte X)`
- [x] T6: Ajustar preset `foodparkQsr` a `blindCountEnabled: true` y actualizar tests unitarios
- [x] T7: Escribir y ejecutar prueba E2E real completa en SQLite (`cash_shift_blind_count_e2e_real_test.dart`)

## Log
- L1: 2026-11-03 — Auditoría inicial.
- L2: 2026-11-03 — Implementación de arqueo ciego configurable.
- L3: 2026-11-03 — Ajuste de negocio: en Foodpark/QSR el Corte X es libre y cierre ágil, pero los saldos esperados están protegidos por defecto (`blindCountEnabled: true`). Requeridas pruebas E2E reales con SQLite.
- L4: 2026-11-03 — Suite E2E real completada y pasando 12/12 tests (unitarios, UI widgets y E2E real con Floor/SQLite).
