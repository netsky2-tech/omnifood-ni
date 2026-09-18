# NHILOS — Founder Pilot Q80 — Alcance de Aceptación y Limitaciones Conocidas

**Documento:** `AP_KNOWN_LIMITATIONS.md`
**Ubicación:** `docs/onboarding/evidence/acceptance/AP_KNOWN_LIMITATIONS.md`
**Estado:** **VIGENTE — alcance de ONB1.10F reducido por decisión del founder (2026-09-17)**
**Versión:** 1.0
**Fecha de creación:** 2026-09-17
**Autoridad:** decisión de reducción de alcance del founder (2026-09-17), registrada en el plan de trabajo del piloto

---

# 0. Alcance de la aceptación física (ONB1.10F)

## 0.1 Lo que ONB1.10F SÍ valida

La aceptación física del piloto del founder valida el **ciclo de vida de activación** en hardware real (Alacrity Q80/iPOS) con backend local congelado:

1. Configuración fiscal `CUOTA_FIJA` de punta a punta (fixture declarado → harness attachado → ticket físico `COMPROBANTE DE VENTA` / `NO RECAUDA IVA`, 80 mm).
2. Venta de verificación **offline** persistida en SQLite (fuente de verdad local) y ticket físico impreso.
3. Finalización del activation attempt y estado `ACTIVATED` monotónico.
4. Drenaje del **outbox de activación** (`onboarding/activation/*`) tras reconexión.
5. VOID/cancelación de la venta de verificación con semántica DGI `is_canceled` (nunca `DELETE`).

## 0.2 Lo que ONB1.10F NO valida

**La validación del transporte de dispositivo `/v1/sync/*` está FUERA del alcance de esta aceptación.** Ninguna evidencia producida por este piloto puede citarse como validación de que el transporte device-only de `/v1/sync/*` funciona en el Q80. El detalle de las limitaciones que motivan esta reducción se registra en las secciones 1–3 de este documento; ninguna se absorbe silenciosamente dentro del piloto.

Consecuencia operativa: la precondición 2 del cutover DSI (cada terminal enrolada corre un build capaz de aprovisionar y usar una credencial de dispositivo) **no está satisfecha** para esta aceptación. Ver addendum en `docs/operations/device-sync-cutover-decision.md`.

## 0.3 Convención de confianza de las afirmaciones

- **[LECTURA ESTÁTICA]** — hallazgo obtenido leyendo el árbol del repositorio en el commit base de este freeze; no hay ejecución que lo confirme en runtime.
- **[REQUIERE CONFIRMACIÓN EN EJECUCIÓN]** — la afirmación debe verificarse con el backend y el dispositivo reales antes de tratarse como hecho observado.

Ninguna evidencia de campo fue inventada en este documento.

---

# 1. Limitación L1 — Brecha de enrolamiento de credencial de dispositivo

| Aspecto | Registro |
|---|---|
| **Afectado** | Ningún camino de **producción** del POS crea o finaliza un `ActivationAttempt`, y la identidad del dispositivo del APK no coincide con la terminal sembrada sin un build-define `DEVICE_ID`. Por lo tanto un APK de piloto recién construido no puede aprovisionar la credencial de sincronización que `/v1/sync/*` exige. |
| **Evidencia** | [LECTURA ESTÁTICA] `apps/pos_app/lib/main.dart:113` — el device id proviene del dart-define `DEVICE_ID`; `apps/pos_app/lib/data/services/terminal_identity_service.dart:19-27,55` — sin define, se genera `pos-local-<uuid>` persistente. `apps/pos_app/lib/main.dart:158-178` — los coordinadores de credencial se construyen sin `resolveAttemptId`, de modo que el aprovisionamiento usa siempre la variante device-scoped. `apps/admin_backend/src/modules/onboarding/services/activation.service.ts:1434-1458` — esa variante exige el último attempt **finalizado** vinculado al mismo device id. `apps/pos_app/lib/data/repositories/auth_repository_impl.dart:140,189-205` — el aprovisionamiento corre solo en `loginOnline`, solo OWNER, solo online, silencioso y best-effort. **No existe camino de producción que cree o finalice el attempt**: el código que sí lo finaliza vive en `apps/pos_app/lib/data/services/activation_reconnect_sync_runner.dart:234` → `apps/pos_app/lib/data/adapters/activation/dio_activation_sync_port.dart:100,113`, pero ese runner **no está cableado** en `main.dart`; sus únicos llamadores son harnesses de test, incluido el único attachado al backend (`apps/pos_app/integration_test/onb1_10_founder_pilot_q80_e2e_test.dart:44,103`), que usa bearer humano y drena el outbox de activación (línea 404). El script de build del piloto no define `DEVICE_ID` (`scripts/build_sunmi_apk.sh:111,117`), mientras el seed y el harness usan `Q802024120001` (`apps/admin_backend/src/scripts/seed-onboarding-founder-pilot.ts:15`). |
| **Por qué está fuera de alcance** | Cerrarla exige decisiones de producto (paso de enrolamiento en POS, build define por terminal) que no corresponden al piloto y que no fueron aprobadas. El piloto no debe fabricar un enrolamiento manual ad hoc dentro de su ejecución. |
| **Precondición afectada** | Precondición 2 del cutover DSI — NOT SATISFIED para este piloto. |
| **Qué se requiere para cerrarla** | Un paso explícito de enrolamiento (crear y finalizar el activation attempt desde el POS o un flujo operativo acordado), un APK construido con `DEVICE_ID=Q802024120001` (o el device id real de cada terminal), y confirmación en runtime de que la credencial se aprovisiona y renueva. Cada punto es [REQUIERE CONFIRMACIÓN EN EJECUCIÓN]. |

Riesgo residual declarado: el bootstrap es best-effort silencioso, así que un fallo de enrolamiento no es visible en la UI del POS. [LECTURA ESTÁTICA; el comportamiento observado en runtime requiere confirmación].

---

# 2. Limitación L2 — Defecto de transporte mixto: Dio device-only contra rutas de inventario con guard humano

| Aspecto | Registro |
|---|---|
| **Afectado** | `SyncService` envía **todas** sus peticiones por el Dio device-only, pero varias rutas de inventario exigen credencial humana. Peor aún: `DeviceSyncAuthInterceptor` adjunta el bearer de dispositivo **solo** a rutas `v1/sync/*`, así que las llamadas a `/inventory/*` salen **sin cabecera `Authorization`** y reciben 401; un fallo de auth marca `AUTH_BLOCKED` y saltea los dominios restantes del pase. |
| **Evidencia** | [LECTURA ESTÁTICA] `apps/pos_app/lib/main.dart:163-169,270-274` — `syncDio` lleva solo `DeviceSyncAuthInterceptor` y es el Dio de `SyncService`; el interceptor restringe el bearer a rutas de sync (`apps/pos_app/lib/data/network/device_sync_auth_interceptor.dart:40-44,54`). Rutas llamadas por ese mismo Dio: `apps/pos_app/lib/data/services/sync_service.dart:505` (`/v1/sync/batch`), `:838` (`/inventory/purchases`), `:907` (`/inventory/recipes/versions`), `:938` (`/inventory/production-orders/close`), `:984` (`/inventory/count-sessions`), `:1049` (`/inventory/alerts/{id}/lifecycle`), `:1068` (`GET /inventory/alerts`), `:1637` (`/inventory/regularization/sync`). En el backend esas rutas están decoradas con guard humano: `apps/admin_backend/src/modules/inventory/inventory-movement.controller.ts:126` (`alerts`), `:174` (`purchases`), `:247` (`production-orders/close`), `:261` (`recipes/versions`) — todos con `AuthGuard` humano (verificación JWT de identidad humana con contrato estricto de claims, `apps/admin_backend/src/modules/identity/guards/auth.guard.ts:66-91`) más guards de roles/autoridad, y el controlador no tiene guard a nivel de clase. Mientras tanto `/v1/sync/*` es device-only sin flag de runtime (`apps/admin_backend/src/modules/sales/controllers/sync-batch.controller.ts:19`, `inbound-sync.controller.ts:21`, guard en `apps/admin_backend/src/modules/identity/guards/sync-transport.guard.ts:48`). |
| **Por qué está fuera de alcance** | Es un defecto de diseño de transporte que cruza dominios (ventas antes que inventario en el pase de sync); resolverlo requiere una decisión de arquitectura (separar Dios, migrar rutas de inventario a transporte de dispositivo, o documentar el transporte humano para inventario) que no forma parte del piloto. |
| **Precondición afectada** | Ninguna precondición del cutover se satisface ni se falsifica por este defecto por sí solo; agrava L1 porque aunque L1 se cerrara, los dominios de inventario seguirían sin autenticar con credencial de dispositivo. |
| **Qué se requiere para cerrarla** | Decisión de transporte por dominio y su implementación; además confirmar en runtime si el defecto se manifiesta también contra un backend desplegado y no solo contra el backend local congelado, y qué dominios quedan efectivamente bloqueados en el pase real. Ambos son [REQUIERE CONFIRMACIÓN EN EJECUCIÓN]. Aclaración estática: un token de dispositivo **no** puede satisfacer `AuthGuard`, porque el config de JWT de dispositivo rechaza una audiencia igual a la humana y el contrato estricto de claims exige `token_type: access` con `email`, `role`, `is_active` y `security_version` (`apps/admin_backend/src/modules/identity/config/device-sync-jwt.config.ts:58-61`, `auth.guard.ts:66-91`). |

---

# 3. Limitación L3 — Brecha de nota de crédito aceptada (DSI) y decisión inventory-first

| Aspecto | Registro |
|---|---|
| **Afectado** | Mientras el transporte device-only esté activo y DSI-6 no exista, una nota de crédito creada por el POS no puede sincronizarse por transporte de dispositivo: `SyncCreditNoteAuthGuard` falla cerrado para lotes device-originados con `CREDIT_NOTE` (`apps/admin_backend/src/modules/sales/guards/sync-credit-note-auth.guard.ts:38`, aplicado en `sync-batch.controller.ts:19`). Un lote con una sola nota de crédito pendiente falla completo con 403; el POS marca `AUTH_BLOCKED`, saltea los dominios restantes del pase y muestra un mensaje engañoso de re-autenticación, mientras la venta local continúa. [LECTURA ESTÁTICA; el efecto observado en runtime requiere confirmación]. |
| **Alcance en el piloto** | El guion del piloto no crea notas de crédito: `createCreditNote` solo es alcanzable por la UI de devoluciones (`apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart:1618`), que las fases A–G no invocan. El VOID (G2) es una escritura local `is_canceled` que re-sincroniza como `SALE`, por lo que el guard nunca lo bloquea y la evidencia de VOID es producible offline-only. [LECTURA ESTÁTICA]. |
| **Por qué está fuera de alcance** | La brecha fue **aceptada** en el registro de decisión del cutover bajo condiciones explícitas (anuncio al tenant, inventario de operaciones afectadas, procedimiento manual, sin debilitar el guard). Cerrarla requiere DSI-6, que a su vez depende del prerrequisito de autorización humana offline. |
| **Precondición afectada** | La decisión aceptada exige inventariar las operaciones afectadas, incluyendo si hay alguna nota de crédito abierta pendiente en una terminal enrolada. **Ese inventario aún no está registrado**, por lo que la condición de la decisión no está cumplida y el piloto se rige por la decisión inventory-first: el rehearsal físico no se ejecuta hasta registrar el inventario del backend y del dispositivo. |
| **Qué se requiere para cerrarla** | Completar el inventario de notas de crédito pendientes (backend y dispositivo), registrar el anuncio de la brecha y el procedimiento manual acordado, y finalmente entregar DSI-6 con su prerrequisito de autorización humana offline. El inventario y el registro del anuncio son [REQUIERE CONFIRMACIÓN EN EJECUCIÓN]. |

---

# 4. Reglas que este documento no toca

- Los placeholders exclusivamente humanos (`«COMPLETAR EN CAMPO»`, `«COMPLETAR EN FREEZE-05»`) conservan su significado y no se completan desde aquí.
- La prohibición del RUC placeholder `J0000000000000` para ejecución fiscal sigue vigente (§9 de `AP_FIXTURE_MANIFEST.md`); este documento no registra RUC crudo.
- La semántica DGI de inmutabilidad (sin borrado de documentos, cancelación solo con `is_canceled`, numeración secuencial) y las reglas offline-first (SQLite como fuente de verdad local) no se modifican.

## Next step

Cerrar el inventario de notas de crédito (L3) y las capturas de campo de FREEZE-04; el cierre de L1/L2 queda como trabajo posterior al piloto, con seguimiento propio.
