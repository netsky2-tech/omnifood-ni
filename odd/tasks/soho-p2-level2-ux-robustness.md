# Soho P2 — Nivel 2: UX y Robustez Operativa en Punto de Venta

**Branch:** `fix/soho-p2-level2-ux-robustness` (base `main@958122cf`, Nivel 1 ya mergeado)
**Worktree:** `/home/octavio_morales/omnifood-ni-l2`
**Origen:** `odd/tasks/soho-estado-y-pendientes.md` §4, bloque P2 — items #74, #76, #78, #79.
**Routing:** sequential writers (un `gentle-ai-worker` a la vez en este worktree), `gentle-ai-verify` por tarea.

> Nota de numeración: #74/#76/#78/#79 son identificadores del **informe de auditoría interno**, no issues de GitHub. En GitHub esos números son otros trabajos (Batch 4 mermas / sync Batch 3c). No se vinculan issues.

---

## T1 · #76 — El preview de ticket lee config cacheada y niega el régimen fiscal

**Síntoma:** en Ajustes → Hardware, el preview del ticket muestra el régimen fiscal viejo. Si el dueño cambia el régimen en Perfil del Negocio, el preview lo niega y la prueba de impresión sale con la etiqueta incorrecta.

**Causa raíz (verificada):** `HardwareSettingsViewModel.loadConfig()` captura un snapshot de `PrinterConfig` (`config.taxRegime`) vía `PrinterConfigService.getPrinterConfig()`, que lee la clave `tax_regime` de `local_configs`. El commentario D-17 en `hardware_settings_view.dart` (~304) justifica explícitamente **no** re-leer ("the preview must show what the paper will show — the value already loaded in this view's config"). Eso es falso como invariant: `testPrintReceipt()` (~225) imprime desde el mismo snapshot, así que el preview coincide con el papel… pero ninguno coincide con la verdad del negocio. `loadConfig()` sólo corre en el primer build y en el botón manual de refresh; no hay suscripción reactiva al cambio hecho en `BusinessProfileViewModel`.

**Fix:**
1. Re-leer el `taxRegime` desde el **source of truth** (`PrinterConfigService` / `local_configs`) en el momento de construir el preview, y también antes de `testPrintReceipt()`.
2. Conservar D-17 en su forma correcta: **preview y prueba de impresión deben leer el mismo valor fresco en la misma invocación**, no un snapshot de pantalla.
3. Actualizar la nota D-17 para que describa el invariant real (misma fuente, mismo momento), no la justificación del snapshot.

**Superficie:** `apps/pos_app/lib/ui/features/config/hardware/hardware_settings_view.dart`, `hardware_settings_view_model.dart`, `apps/pos_app/lib/domain/services/config/printer_config_service.dart` (+ tests).

**Checks:** `flutter analyze lib/ui/features/config/hardware lib/domain/services/config` → No issues found. `flutter test --concurrency=2 test/ui/features/config/hardware test/domain/services/config` → +55 All tests passed. `flutter test --concurrency=2 test/domain/services/config/printer_config_service_test.dart` → +19 All tests passed. RED observado antes del fix (`The method 'getTaxRegime' isn't defined`).

**Commit evidencia:** `b48cf7a7` fix(pos): read the fiscal regime fresh for ticket preview and test print.

**Implementación real:** `PrinterConfigService.getTaxRegime()` (lectura de una sola clave, `taxRegimeKey` extraído como constante), `HardwareSettingsViewModel.refreshTaxRegime()` (sólo el régimen, nunca reconstruye el config de hardware), convocado por el botón de preview y por `testPrintReceipt()`. La nota D-17 quedó reescrita con el invariant correcto.

**Incidente de superficie (resuelto):** el primer intento de regeneración usó `build_runner build --delete-conflicting-outputs --build-filter=<un mock>`; `--delete-conflicting-outputs` **no** está acotado por `--build-filter` y borró ~90 archivos generados trackeados. El worker los recuperó con un build_runner completo, lo que a su vez dejó 8 archivos fuera de superficie modificados por deriva de regeneración (`app_database.g.dart` y 7 `*_test.mocks.dart` de sales). El padre los revirtió con `git restore`: ningún cambio de #76 los necesita.

---

## T2 · #74 — La conciliación de vouchers no refresca la vista

**Síntoma:** al conciliar vouchers uno por uno, el contador/lista de pendientes del turno no se mueve; sólo se actualiza cuando se cierra el diálogo completo.

**Causa raíz (verificada):** `widgets/close_shift_dialog.dart:138-152` — `openVoucherReconciliationDialog()` crea el `CardVoucherReconciliationViewModel` y encadena `.then((_) => vm.refreshPendingVouchersCount())`. El refresh ocurre **al descartar el diálogo completo**, no por voucher conciliado. `CardVoucherReconciliationViewModel.reconcileVoucher()` marca el pago individual y notifica a sus propios listeners, pero el `CashShiftViewModel` padre queda con `pendingVouchersCount` viejo hasta el cierre. El `CloseShiftDialog` no tiene UI de vouchers; el gate vive en `showCloseShiftFlow` (~79-100).

**Fix:**
1. Notificar al padre de forma **reactiva por voucher**: exponer el `CardVoucherReconciliationViewModel` (o un callback `onVoucherReconciled`) y llamar `refreshPendingVouchersCount()` tras cada conciliación exitosa, manteniendo el diálogo abierto.
2. Dejar el `.then(...)` del cierre como refresco de seguridad (idempotente), no como el único mecanismo.
3. Verificar que el estado del turno (gate de cierre) se reevalúe con el contador fresco.

**Anclas exactas:** `widgets/card_voucher_reconciliation_dialog.dart:357-366` (el botón `btn_reconcile_<id>` hace `await viewModel.reconcileVoucher(...)` y no avisa a nadie), `card_voucher_reconciliation_view_model.dart:40-100` (`reconcileVoucher` relee `_pendingVouchers` del hijo; el padre queda viejo), `cash_shift_view_model.dart:257` (`refreshPendingVouchersCount` lee `paymentDao.countPendingCardPayments()`), `cash_shift_view.dart:316` y `:365` (badge y botón `Vouchers (n)` que se ven mal), `widgets/close_shift_dialog.dart:79-100` (el gate de Corte Z lee `vm.hasPendingVouchers` / `vm.pendingVouchersCount`). **Mismo defecto** en el override de voucher extraviado: `overrideMissingVoucher` y `_showOverrideDialog` (dialog:46+) tampoco notifican al padre; debe quedar cubierto por el mismo mecanismo.

**Superficie:** `apps/pos_app/lib/ui/features/cash/card_voucher_reconciliation_view_model.dart`, `apps/pos_app/lib/ui/features/cash/widgets/card_voucher_reconciliation_dialog.dart`, `apps/pos_app/lib/ui/features/cash/widgets/close_shift_dialog.dart`, `apps/pos_app/lib/ui/features/cash/cash_shift_view_model.dart` (+ tests en `test/ui/features/cash/`).

**Checks:** test que concilia un voucher dentro del diálogo y afirma que el contador del padre baja **sin** cerrar el diálogo; idem para el override. `flutter analyze` acotado + `flutter test --concurrency=2 test/ui/features/cash`.

**Commit evidencia:** —

---

## T3 · #79 — La copia ANULADO se imprime sin condición y su resultado no se muestra

**Síntoma:** al anular una factura, la copia "ANULADO" se manda a la impresora siempre (aunque el auto-print esté apagado o no haya impresora), y el cajero no ve si esa impresión salió o falló.

**Causa raíz (verificada):** `sale_view_model.dart` `voidInvoice()` (~2485-2489) llama `_printInvoiceCopy()` **sin condición**, a diferencia del camino de nota de crédito (`processReturn`, ~2340) que sí gatea en `config.autoPrintInvoice`. `_printInvoiceCopy()` (~2160-2177) retorna `false` y fija `_lastPrintError`, pero la anulación ya quedó commiteada (fila de auditoría escrita) y ese resultado sólo se filtra en `sales_history_view.dart` (~633-643) vía `_lastVoidPrintSucceeded`.

**Fix:**
1. Gatear la impresión de la copia ANULADO con la misma política del resto: respetar `printerConfig.autoPrintInvoice` y la disponibilidad del hardware.
2. Superficialmente **mostrar el resultado**: éxito → confirmación de que la copia salió; fallo → mensaje explícito de "factura anulada, la copia no imprimió" con el motivo, sin dejar la anulación revertida (la anulación fiscal es el hecho; la impresión es derivada).
3. Unificar con el camino de nota de crédito para que ambos lean la misma config en el mismo momento.

**Superficie:** `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart`, `apps/pos_app/lib/ui/features/sales/sales_history_view.dart` (+ tests).

**Checks:** unit test con `autoPrintInvoice=false` que afirme cero llamadas de impresión; test con impresora que falla que afirme el mensaje de anulación-parcial.

**Commit evidencia:** —

---

## T4 · #78 — La activación quedó con `pos_build` vacío

**Síntoma:** el intento de activación queda en `activation_attempts.pos_build = NULL` y el comprobante de la primera venta reporta un build inventado.

**Causa raíz (verificada):** `activation_controlled_sale_runner.dart:653` fija `posBuild: '1.0.0+1'` y `:689` repite `'1.0.0+1'` en el payload `FIRST_SUCCESSFUL_SALE_OBSERVED`, en vez de `readOhacPosBuild()` (`ohac_negotiation_parameters.dart:76`, que usa `PackageInfo.fromPlatform()`). El `sync_service` sí usa la función real (2849, 3105, 3203, 3601); sólo el camino de activación hardcodea. Del lado backend, `FirstSuccessfulSaleClaimDto.posBuild` ya llega (`activation.dto.ts`) pero `claimFirstSuccessfulSale()` **nunca** lo escribe en el attempt, y `startActivation()` lo guarda como `dto.posBuild?.trim() || null` (~370) mientras el dashboard manda sólo `{ candidateTerminalId }` (`setup-center-view.tsx:277`).

**Fix (acotado a dos superficies, sin migración):**
1. **POS:** reemplazar ambos `'1.0.0+1'` por `await readOhacPosBuild()`, con fallback explícito y documentado cuando devuelva `null`.
2. **Backend:** en `claimFirstSuccessfulSale()`, estampar `attempt.posBuild` desde `dto.posBuild` cuando el attempt lo tenga vacío (write-once, nunca pisar un valor ya confirmado).
3. **Follow-up abierto (NO en este slice):** el dashboard puede precargar `posBuild` al iniciar el intento. Requiere persistir el build en `device_linking_codes` en el momento del claim pre-auth (nueva columna +迁移) — se documenta y se decide aparte.

**Superficie:** `apps/pos_app/lib/data/services/activation_controlled_sale_runner.dart`, `apps/admin_backend/src/modules/onboarding/services/activation.service.ts` (+ tests).

**Checks:** test POS que afirme que el payload lleva el build leído; test de servicio backend que afirme write-once del `posBuild` en el attempt.

**Commit evidencia:** —

---

## Orden de ejecución

T1 → T2 → T3 → T4, cada una: worker en este worktree → verify con checks acotados → work-unit commit en `fix/soho-p2-level2-ux-robustness`.

## Restricciones del host

- `flutter test --concurrency=2` (WSL2 12 GiB; default en 16 cores = OOM killer global).
- `npm test` del backend ya trae `maxWorkers: 2` fijado; no quitarlo.
- Nunca correr suites completas mientras un subagente sigue vivo.

## Lecciones de la ejecución

1. **`build_runner --delete-conflicting-outputs` no es acotable.** Correrlo con `--build-filter=<un mock>` igual **borra** los outputs generados trackeados de todo el repo. Para regenerar un solo mock en este proyecto no hace falta el flag: basta `flutter pub run build_runner build` (sin `--delete-conflicting-outputs`). Y en cualquier caso, la regeneración de mocks **debe pedirse con superficie explícita** en el delegation brief, porque `app_database.g.dart` y los `*_test.mocks.dart` de `test/ui/features/sales/` tienen deriva propia acumulada y un regen completo la destapa como ruido en el diff.
2. **Regenerar mocks sobrantes no era necesario.** #76 agrega `getTaxRegime()` a `PrinterConfigService`; el mock de `test/domain/services/config/` no se regeneró e igual compila y pasa (los `Mock` de mockito resuelven por `noSuchMethod`). Lección: pedir la regeneración **acotada al mock que realmente se extienda**, no un buildRunner global.
