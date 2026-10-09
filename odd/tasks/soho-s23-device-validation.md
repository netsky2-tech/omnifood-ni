# Soho S23 — Validación en dispositivo de Nivel 2 (#76 #74 #79 #78)

**Origen:** Nivel 2 mergeado y pusheado a `main` (`a1b409ef`, push `958122cf..b4b5ad27`).
**Objetivo:** probar en hardware real que los 4 fixes de la auditoría se comportan como
prometieron, antes de cortar el release que SOHO recibe por OTA.
**Decisión del usuario:** bump de versión **local** para validar ahora; al terminar se corta
release real desde `main` actualizado para que SOHO reciba el OTA.

---

## Contexto verificado del entorno

| Hecho | Evidencia |
|---|---|
| Device conectado | `SM-S918B` (R5CWB2LQJDJ), Android 16 / API 36, arm64 |
| Paquete instalado | `com.nhilos.pos_app` `versionCode=9019` `versionName=1.1.0`, update 2026-10-08 10:27 |
| Por qué 9019 ≠ 7019 | bump local sin commitear del APK de Nivel 1 (convención del repo: `pubspec.yaml` se buumpea a mano y no se commitea solo) |
| Firma compatible | device y release local comparten cert `CN=NHilos Upload` sha256 `d44db6eb…` → se puede `install -r` sin perder datos |
| APK del repo es viejo | los 4 fixes son 12:13–14:12; el último release APK se construyó 10:22 → **no contiene Nivel 2** |
| Backend local | corriendo `node dist/main` pid 44454 en :3000, `dist` construido 09:58 → **stale, no tiene el write-once de #78** |
| DB local | `omnifood` en 127.0.0.1:5432, 720 tenants, `onboarding_activation_attempts` con `pos_build` (`1.0.1+2012`, `1.0.0`, vacío) — es espejo con datos reales, no producción |
| URL del backend en POS | resuelta en runtime: `local_configs.api_base_url` → define `API_URL` → default dev `http://127.0.0.1:3000/api` (sólo debug). Release sin fuente = `unconfigured`. `usesCleartextTraffic=true`, así que HTTP local funciona |

**Qué necesita cada fix:**
- #76 preview de régimen fiscal → **100 % offline**, no toca backend.
- #74 refresco de vouchers → **100 % offline** (Floor local).
- #79 copia ANULADO condicionada + tri-estado → **100 % offline**.
- #78 `pos_build` en el handshake → **necesita backend** y un intento de activación nuevo.

---

## Tareas

### T1 · Preparar el artefacto de prueba
1. Bump local de `apps/pos_app/pubspec.yaml` a `1.1.0+9020` (sin commitear, por convención).
2. Build release arm64 con `scripts/build_pos_apk.sh` (keystore `nhilos-upload.jks` presente).
3. `adb install -r` (mismo firmante, sube 9019 → 9020, datos intactos).

**Checks:** `versionCode=9020` visible en `dumpsys package` post-install.
**Commit evidencia:** — (ninguno: el bump es local por diseño)

### T2 · Backend local al día
1. `npm run build` en `apps/admin_backend` (el `dist` actual es de 09:58, anterior al merge).
2. Reiniciar el servicio en :3000.
3. `adb reverse tcp:3000 tcp:3000` para que el teléfono vea el backend del host en `localhost`.

**Checks:** `curl` a un endpoint del backend por el túnel; migraciones aplicadas (`migrations` table).
**Commit evidencia:** — (proceso de desarrollo, sin cambios de código)

### T3 · Validar #76 — régimen fiscal fresco en preview ✅ CERRADA
Ruta: Perfil del Negocio → cambiar régimen → Ajustes → Hardware → Preview del ticket + Prueba de impresión, **sin reiniciar la app**.
**Esperado:** el preview muestra el régimen nuevo inmediatamente.

**Evidencia observada (S23TEST, build 1.1.0+9020, sin reiniciar la app):**
- 15:15 config `CUOTA_FIJA` → preview abre con chip `Cuota Fija` preseleccionado, `REGIMEN: CUOTA FIJA`, título `COMPROBANTE DE VENTA`, No. 001-001-01-00000042.
- 15:17 config `REGIMEN_GENERAL` → preview abre con chip `Régimen Gral.` preseleccionado, `REGIMEN: GENERAL`, título `FACTURA DE VENTA`.
- Las dos direcciones observadas; el default del código es `regimenGeneral`, así que el caso Cuota Fija sólo se obtiene leyendo la config persistida.
- Nota de método: el diálogo de preview tiene su propio toggle manual `Cuota Fija / Régimen Gral.`. Lo que prueba #76 es el estado **inicial** del chip al abrir, no ese toggle.

### T4 · Validar #74 — refresco de vouchers sin cerrar el diálogo ✅ CERRADA
Ruta: 2+ pagos con tarjeta pendientes → Corte Z → Conciliar → conciliar uno por uno.
**Esperado:** el badge y el rótulo `Vouchers (n)` bajan en vivo; al conciliar todos, deja pasar al conteo cego sin salir del flujo.

**Resultado observado (S23TEST, 1.1.0+9020):** el refresco en vivo funciona por los dos caminos (conciliar con código y override por voucher extraviado), y el Corte Z deja pasar sin reentrar. **PERO** la prueba destapó un defecto más arriba, ver F-1.

**Receta que lo reproduce:** venta con datáfono dejando el código de autorización vacío → `voucherCode='PENDIENTE'`, `reconciliation_status='PENDIENTE'` (`multi_currency_checkout_dialog.dart:241-245`) → conciliar/override en el diálogo de cierre.

---

## F-1 · Hallazgo nuevo (bloqueante para el diseño propuesto): la conciliación de vouchers no llega a la nube

**Síntoma observado en vivo, 15:30:** el POS postea `POST /api/sales/payment-reconciliations/sync` y el backend responde **404 `Cannot POST`**, en retry loop (15:30:10 / 15:30:20 / 15:30:40). En la DB local los dos pagos de tarjeta de 15:22 y 15:25 siguen `PENDIENTE` con `reconciled_by=NULL` para siempre.

**Causa raíz (verificada):** `PaymentReconciliationSyncController` existe, con `@Controller('sales/payment-reconciliations')` + `@Post('sync')` + `SyncTransportGuard`, y su servicio `PaymentReconciliationSyncIngestionService` también existe con spec unitario y db-spec. **Ninguno de los dos está en `SalesModule`** (`controllers:` lista 7, `providers:` no lo incluye). Nest sólo mapea rutas de controllers registrados → la ruta no existe en runtime.

**Por qué pasó:** ambos lados (POS que postea + backend que debería recibir) se agregaron en el MISMO commit `6c157e5b` (2026-10-06, *"feat(sync): card voucher reconciliation outbox and cloud sync pipeline (#788)"*). El spec del controller lo instancia **directamente**, no a través del módulo, así que prueba el handler pero no el cableado. `git log -S PaymentReconciliationSyncController -- sales.module.ts` está vacío: nunca estuvo registrado.

**Misma clase raíz que #77** ("el runner existe y no se registró"). No es un caso suelto: es el patrón *componente escrito + testeado en unit + nunca conectado*, que sobrevive a cualquier suite que instancie clases a mano.

**Fix mínimo (2 líneas + 1 guard):**
1. Registrar `PaymentReconciliationSyncController` en `controllers:` y `PaymentReconciliationSyncIngestionService` en `providers:` de `SalesModule`. Los deps ya están: `DataSource` es global y `Payment` ya figura en `TypeOrmModule.forFeature([...])`.
2. **Guard de la clase raíz:** un test de manifiesto de rutas que afirme que todo `@Controller` del grafo está servido (arrancar la app de testing y pedir el route table, o un test que recorra los `.controller.ts` y verifique que la clase aparece en el `controllers:` de algún módulo). Sin esto, el próximo feature con la misma forma vuelve a pasar.

**Relación con la propuesta del usuario (alerta de override al owner):** la alerta que se pidió — que el owner vea los overrides como ve los vouchers sin conciliar — **no se puede construir encima de esta ruta muerta**. Primero F-1, después la alerta. Y con F-1 arreglado, el override ya trae qué mostrar: `reconciliation_status='MANUAL_OVERRIDE'` + `reconciled_by_user_id` + `reconciled_at`.

**F-2 · El gate de supervisor del override es decoratorio** (ver arriba; se conserva la numeración del informe). El diálogo pide ID/código de supervisor y acepta cualquier string: se guardó un override con un valor inventado. El usuario decide **no** endurecerlo con validación dura porque bloquearía el cierre de caja del operador cuando el supervisor no está presente — y tiene razón: convertir un control blando en un bloqueo duro cambia el costo del error de "ruido en el reporte" a "no puedo cerrar". La forma coherente es: dejar que el operador cierre, **registrar quién y con qué credencial** lo hizo, y que el owner lo vea en la web. Eso exige (a) F-1, (b) persistir el id de supervisor en un campo propio en vez de mezclarlo con el voucher, y (c) distinguirlo en el dashboard.

### F-1 · ESTADO: corregido y revisado

Commit `1c887771` en `fix/voucher-reconciliation-sync-route`: controller + ingestion service registrados en `SalesModule`, más el guard de escaneo de fuente (`scanSourceControllerClasses` + `findUnregisteredSourceControllers`) que exige que todo `@Controller` del fuente esté **servido y declarado**. Revisión nativa `review-ee12cf07d88733df` (tier medium, 124 líneas, 3 archivos, lens review-reliability) → **approved**, 3 hallazgos informativos sobre las heurísticas del scanner (match por nombre, regex `export class`, decorator textual), autoridad quemada.

**Verificación propia (no la palabra del worker):** prueba de mutación — al desregistar el controller, el guard vuelve a fallar y nombra `PaymentReconciliationSyncController`. Registry spec 16/16, `src/modules/sales/controllers` 88/88, `tsc --noEmit` limpio. En runtime: `POST /api/sales/payment-reconciliations/sync` pasó de **404** a **401** (ruta servida y protegida).

**Hallazgo colateral del guard:** `InventoryController` (`modules/inventory/inventory.controller.ts`, `@Controller('inventory')`, `POST /inventory/purchase`) está en la misma situación: existe, no está registrado en ningún módulo, no está declarado. Queda **pinneado como el único orphan esperado** para que no desaparezca y para que cualquier orphan nuevo rompa el test. Decisión de founder pendiente: registrarlo o jubilar el archivo. → **F-4**

---

## F-3 · Hallazgo nuevo (destapado por F-1): la conciliación se rechaza con 400 porque el user id va vacío

**Observado en vivo 15:55:22 y 15:55:32**, con la ruta ya servida y la cola vieja del device reintentando:

```
POST /api/sales/payment-reconciliations/sync -> 400
{"message":["reconciliations.0.reconciledByUserId should not be empty"]}
```

**Causa raíz (verificada):** `close_shift_dialog.dart:155` construye el VM de conciliación con `currentUserId: vm.currentUserId` — el **campo crudo del constructor**, que vale `''` porque `main.dart:687` nunca lo pasa: alambre `authRepository` y confía en `_actingUserId()` (línea 110), que resuelve al usuario desde `AuthRepository.getCurrentUser()` **al momento de la acción**. `_actingUserId()` se usa para abrir y cerrar turno (líneas 226 y 281) pero **no** para conciliar. Resultado: toda conciliación estampa `reconciledByUserId=''` y el backend la rechaza con `@IsNotEmpty()` (`src/modules/sales/dto/payment-reconciliation-sync.dto.ts:54-56`).

**Alcance:** la validación es sobre el body completo, así que **un renglón malo envenena el lote entero** — mientras exista una conciliación con user id vacío, ninguna conciliación del turno sincroniza, incluidas las buenas.

**Es preexistente, no lo introdujo #74:** la línea `currentUserId: vm.currentUserId` ya estaba; #74 sólo agregó el callback `onVoucherResolved`. Lo que pasaba es que **el 404 de F-1 tapaba este 400**: nunca llegaban a validarse.

**Fix propuesto (POS, mínimo y correcto):** exponer en `CashShiftViewModel` un resolver público del acting user (reutilizando `_actingUserId()`) y pasarlo al `CardVoucherReconciliationViewModel` en lugar del campo crudo. Si no hay usuario autenticado, la operación debe **rehusarse** en vez de escribir un id vacío — que es exactamente la contract que el backend ya está exigiendo.

**Consecuencia para el corte de release:** F-1 solo no alcanza. Con F-1 el feature pasa de "404 eterno" a "400 eterno": la conciliación sigue sin llegar a la nube. Y requiere **rebuild + reinstall del APK**, no sólo backend.

## F-4 · `InventoryController` huérfano (preexistente, descubierto por el guard de F-1)

**Resuelto: JUBILADO (eliminados `inventory.controller.ts` + spec).** El archivo era código muerto (no importado en ningún módulo). La misma ruta `POST /inventory/purchase` ya está cubierta por `InventoryMovementController` (registrado en `inventory.module.ts`, con `AuthGuard` + `RolesGuard`). No hay riesgo funcional.

## F-2 · El gate de supervisor del override es decoratorio

### T5 · Validar #79 — copia ANULADO con gate y resultado honesto
Ruta A: auto-print **apagado** → anular factura → el mensaje NO debe decir "no se pudo imprimir".
Ruta B: auto-print **prendido** sin impresora → anular → debe decir anulación OK + motivo del fallo de impresión.
**Invariante:** la anulación fiscal queda hecha en ambos casos.

### T6 · Validar #78 — `pos_build` real en el handshake
Ruta: terminal nuevo apuntando al backend local → linking code → activación → primera venta controlada → claim.
**Esperado:** `onboarding_activation_attempts.pos_build = 1.1.0+9020` (no NULL, no `1.0.0+1`), y write-once (un segundo claim no lo pisa).

### T7 · Cierre
Reporte de los 4 resultados, evidencia (screenshots + queries), y decisión separada de corte de release para OTA de SOHO.

---

## Restricciones

- El device **no** es la tablet de SOHO: es el teléfono de prueba. Nada de esto toca al cliente.
- No se pushea ni se corta release dentro de esta feature; es decisión explícita aparte.
- `pubspec.yaml` bump local: no commitear solo, no revertir hasta el corte de release.
- Suite completa de tests no se corre en paralelo con el build (tope de memoria del host WSL2).
- El usuario maneja la UI; el agente guía, captura screenshots y lee logcat.
