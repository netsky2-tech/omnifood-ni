# Soho — Identidad real en la conciliación de vouchers (F-3 + F-2)

**Origen:** validación en dispositivo S23 (`odd/tasks/soho-s23-device-validation.md`), destapado al arreglar F-1.
**Rama:** `fix/voucher-reconciliation-sync-route` (ya trae el commit `1c887771` de F-1).
**Decisión del usuario:** arreglar F-3 y F-2 **juntos en un solo rebuild** del APK.

---

## El problema, en orden

1. **F-1 (ya corregido):** `POST /api/sales/payment-reconciliations/sync` no existía en el backend — controller y service nunca registrados en `SalesModule`. Commit `1c887771` + guard de escaneo de fuente. Runtime: 404 → 401.
2. **F-3 (esta feature):** con la ruta viva, el backend rechaza el lote con `400 reconciliations.0.reconciledByUserId should not be empty`.
   - Origen de filas nuevas: `close_shift_dialog.dart:155` pasa `vm.currentUserId`, el campo crudo del constructor, que vale `''` porque `main.dart:687` alambre `authRepository` y confía en `_actingUserId()` (`cash_shift_view_model.dart:110`), que resuelve `AuthRepository.getCurrentUser()` **al momento de la acción**. Ese resolver se usa para abrir/cerrar turno (líneas 226, 281) pero **no** para conciliar.
   - **Las filas ya encoladas no se arreglan solas:** `_syncPaymentReconciliations()` (`sync_service.dart:1521`) lee `getPendingReconciliations()` y reconstruye el payload desde la fila, y las filas fallidas quedan `pending` reintentando. La tablet real de SOHO tiene conciliaciones encoladas desde el 06/10 con `reconciled_by_user_id=''` **escrito en la fila**. Sin backfill, eso es un 400 eterno que además tira el lote completo (class-validator valida el body entero).
3. **F-2 (esta feature):** el override por voucher extraviado pide "ID/código de supervisor", acepta cualquier string, y lo guarda **como** `reconciledByUserId` (`card_voucher_reconciliation_view_model.dart:161`). O sea: la atribución del acto queda en manos de un texto inventado, y no hay forma de distinguir "quién lo hizo" de "quién lo autorizó".
   - Postura de producto acordada: **no endurecer a bloqueo**. Un gate duro impediría cerrar la caja sin el supervisor presente, y eso cambia el costo del error de "ruido en el reporte" a "el operador no puede trabajar". La forma correcta es registrar las dos identidades por separado y **alertar al owner en la web**, igual que hoy ve los vouchers sin conciliar.

## Invariantes que hay que respetar

- `reconciledByUserId` = **el usuario operador real**, siempre, en ambos caminos (conciliar y override). Nunca un texto libre.
- Ningún acto con estampa de identidad se escribe con id vacío: si no hay usuario resuelto, la operación se **rehúsa** en el dispositivo (es lo que el backend ya exige).
- El identificador de supervisor que el operador tipea se guarda **tal cual** en un campo propio, y jamás se mezcla con el voucher ni con el user id.
- Offline-first: el backfill de la cola no puede requerir red; se hace con la identidad local resuelta.
- DGI: nada de esto toca numeración secuencia ni cancelaciones; la conciliación es metadata de pago.

---

## Tareas

## Revisión nativa del slice F-3

Rango `1c887771..fcf9f873` (los dos commits juntos, 7 archivos / 730 líneas, tier medium, lens `review-reliability`) → **APPROVED**, corrección no abierta, presupuesto 200 líneas sin usar.

Hallazgos informativos y su disposición (verificada, no asumida):
- **R3-001** (`sync_service.dart:1580-1602`): alegaba que el backfill persistido no se ejercitaba y que la aserción del test era vacua. **FALSO POSITIVO, probado**: al sacar `await paymentDao.updatePayment(repaired);` caen **2 tests**; restaurado, 10/10 verde. El fake DAO sí recibe la escritura.
- **R3-002** (`close_shift_dialog.dart:157`): **válido y aceptado como comportamiento conocido**. La identidad se resuelve una vez al abrir el diálogo; si la sesión cambia con el diálogo abierto, el VM hijo conserva la capturada. Correcto para la vida de esta pantalla; anotado por si algún día el diálogo sobrevive a un logout.
- **R3-003** (test:494): consecuencia de R3-001, cae con ella.

### Bloqueo operativo: el recibo aprobado no se puede quemar (derivado del trabajo concurrente)

`acknowledge-approved` queda `blocked` con `cause: untracked inventory changed` e `inventory_complete: false`, y reintentar no lo resuelve. Mecánica: START congeló el inventario untracked en 9 rutas; la sesión paralela de auditoría de branding creó 3 más (2 `*:Zone.Identifier` de descarga Windows + `odd/tasks/nhilos-branding-reality-audit.md`). El preflight del quemado compara contra la prueba congelada, así que el digest actual (`a7f122…`) nunca casa con el congelado (`4ade35e9…`). Inspect releyó y **re-ofreció el mismo acknowledge** (mismo token y revisión), pero el quemado sigue fallando.

**Cómo se destraba:** cuando los 3 archivos nuevos dejen de ser untracked (commiteados por esa sesión o borrados), el inventario vuelve al conjunto congelado y el acknowledge quema. Nada de esto se arregla con RESET/RECOVER y no se intentó.

**Candidato a feedback upstream:** en un worktree con churn de untracked, un recibo `approved` queda inquemable por archivos **no incluidos** en el candidato (`untracked-scope=exclude`), y el fallo dice `retry_safe: true` cuando reintentar no puede tener éxito. El inventario congelado no debería depender de paths que quedaron excluídos de revisión.

### T1 · POS: identidad real al conciliar + backfill de la cola envenenada
- Exponer en `CashShiftViewModel` un resolver público del acting user (reuso de `_actingUserId()`) y usarlo en `openVoucherReconciliationDialog` en lugar del campo crudo.
- En `CardVoucherReconciliationViewModel`: si el id resuelto llega vacío, **rehusar** la operación con mensaje claro (no escribir `''`).
- En `_syncPaymentReconciliations()`: antes de armar el lote, resolver la identidad del dispositivo y **backfillear** las filas `pending` con `reconciledByUserId` vacío, escribiéndolas de vuelta en Floor; las que no se puedan backfillear se dejan fuera del lote (para que no envenenen a las buenas) y quedan reportadas.
**Hecho en dos commits, cada uno con su RED observado:**
- `c5e5fa9b` — identidad al conciliar: `CashShiftViewModel.resolveActingUserId()` (exposición del resolver por-acción que ya usaban abrir/cerrar turno), el diálogo lo usa, y el VM de conciliación **rehúsa** escribir sin operador. RED reproducía el bug textual: `Expected: 'cajero-42' / Actual: ''`. 8/8, analyze limpio.
- `fcf9f873` — backfill de la cola: `_syncPaymentReconciliations()` particiona (id válido pasa intacto; id vacío se rellena con el operador resuelto y se **persiste** por `updatePayment`; si no hay operador resuelto la fila **se difiere** y no envenena el lote). El literal `unknown-terminal-operator` queda sólo para `null` sin fuente de identidad. RED en dos aserciones (incluida la anti-envenenamiento), 10/10 en el archivo y **518/518** en `test/data/services/`, analyze limpio.

## Diseño de F-2 (decidido con mapa de superficies verificado)

**Semántica final, en los dos caminos:**
- `reconciledByUserId` = **el usuario operador real**, siempre. Nunca un texto libre.
- `overrideSupervisorRef` (nueva columna nullable) = **el credencial de supervisor tal como lo tipeó el operador**, sin validar. `null` en la conciliación normal. No es una clave foránea a `users`: es evidencia declarada, y por eso mismo importa mostrarla.

**Restricción de orden (no negociable).** El pipe global del backend es `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` (`src/main.ts:48-53`): si el POS manda la clave nueva antes de que el DTO la declare, el lote **entero** da 400 (y con `ArrayMaxSize(500)` mueren juntas). Por lo tanto **el contrato del backend landea y se despliega antes que el POS**. Para la OTA de producción esto es un gate explícito: `migration:run` + deploy del backend primero, recién después el APK que manda la clave.

**Escritura verificada:** hay **un solo** camino que persiste columnas de reconciliación (`payment-reconciliation-sync-ingestion.service.ts:209-220`). El sale-sync no las toca; `sync-invoice.dto.ts:218` declare el campo pero nadie lo mapea al escrito, y `sales-export.service.ts:861` sólo lee `reconciliationStatus`. La incertidumbre marcada por el explorador queda cerrada.

**Guard de superficie:** `RECONCILIATION_KEYS` (`...ingestion.service.spec.ts:70-76`) fija exactamente 5 claves escritas. Pasar a 6 debe romper ese spec y actualizarse a conciencia — es el lugar donde el cambio queda documentado, no un error a esconder.

**Tests que hoy pinean la conducta vieja** (hay que cambiarlos con justificación explícita, no de paso): `card_voucher_reconciliation_view_model_test.dart:170` (`'sup-01'`), `card_voucher_reconciliation_dialog_test.dart:167-174` (`'supervisor-mariana'`), `payment_dao_voucher_test.dart:154,167`, `...ingestion.service.db.spec.ts:385,413`.

**Overrides son invisibles hoy para el owner:** el read model del attention band filtra **sólo** `reconciliation_status = 'PENDIENTE'` (`card-reconciliation-summary.service.ts:82-92`); `MANUAL_OVERRIDE` y `CONCILIADO` quedan afuera. Y `reconciledByUserId` no se traduce a nombre en ninguna parte (cero joins, cero apariciones en `owner_dashboard/src`), así que hoy el string basura no se está mostrando: no se muestra nada.

### Slices de revisión (uno por unidad de trabajo, en este orden)

| Slice | Qué | Superficies |
| --- | --- | --- |
| T2 | Contrato backend: migración + entidad + DTO + ingestion + specs | 6 archivos en `admin_backend` |
| T3 | POS: columna Floor 65→66 + código generado + VM + diálogo + payload + reparación de cola | 7 archivos en `pos_app` |
| T4 | Dashboard: el owner ve los overrides con quién/supervisor/motivo | read model + 3 componentes + specs |
| T5 | Rebuild APK 9021 + reinstalar + prueba de drenaje en S23 | — |

### T2 · Esquema: campo propio para el supervisor del override
- Columna nullable `override_supervisor_ref` en `payments` (Floor, POS) y en `invoice_payments` (Postgres, migración additive).
- El override escribe ahí el texto tipeado, tal cual; `reconciledByUserId` pasa a ser el operador.
- DTO de sync + ingestion del backend propagan el campo.
- **Checks:** db-spec del backend que afirme que el override persiste operador y supervisor por separado; migración `migration:run` limpia.
- **Commit evidencia:** —

### T3 · Dashboard: que el owner vea el override
- Donde hoy se listan vouchers sin conciliar, mostrar los `MANUAL_OVERRIDE` con quién, supervisor declarado, motivo y fecha.
- **Checks:** test de la vista/tabla afectada.
- **Commit evidencia:** —

### T4 · Rebuild, reinstalar y cerrar el E2E en S23
- `1.1.0+9021` local, `install -r`, y verificar que **las dos filas envenenadas de 15:22/15:25 drenan** (400 → 200) y dan vuelta en la DB a `CONCILIADO` / `MANUAL_OVERRIDE` con `reconciled_by_user_id` real.
- **Commit evidencia:** —

### T5 · Cierre
- Reporte y corte de release OTA.
- F-4 (`InventoryController` huérfano) → JUBILADO (eliminados `inventory.controller.ts` + su spec). La ruta `POST /inventory/purchase` ya está cubierta por `InventoryMovementController` con guards de seguridad.

---

## Restricciones

- No correr la suite completa junto con el build (tope de memoria del host); `*.db.spec.ts` requieren DB y se corre sólo el archivo afectado.
- `apps/pos_app/pubspec.yaml` lleva el bump local por diseño: se bumplea a 9021 en T4, no se commitea.
- No pasar formateadores whole-file en este repo (ver la nota de incidente en `soho-s23-device-validation.md`).
- Los commits de trabajo van en `fix/voucher-reconciliation-sync-route`; push, merge y release siguen siendo decisión explícita del usuario.
