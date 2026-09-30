# SOHO — E2E local: vínculo desde cero + UOM/pagos + día integral

**Feature key**: `soho-local-e2e-relink`
**Origen**: continuation de la sesión SOHO go-live (plan: `odd/plans/soho-integration-test-plan.md`).
**Rama / worktree**: `main @ a8786b4b` en `/home/octavio_morales/omnifood-ni-session`.

## Decisiones del usuario (2026-09-30)

| Tema | Decisión |
|---|---|
| Backend para probar | Mi `main` en `:3000`. El usuario bajó su server local y liberó el puerto. |
| Base de datos | Reusar Postgres local `omnifood` (NO DB dedicada). Tenant SOHO local = `e05bf002-b1d3-45f2-a46a-3592e1cc1431`, slug `soho` (distinct del tenant SOHO de Railway `b94b8536…`). |
| Red tablet → VM | **adb reverse** (único camino vivo; ver evidencia abajo). |
| Estado de la tablet | Wipe total con `pm clear` y vínculo desde cero (el usuario no había vuelto a vincular). |

## Evidencia de topología (por qué adb reverse y no una IP)

```
VM eth0 172.31.12.126/20, default gw 172.31.0.1 (NAT, sin metadata cloud accesible)
tablet  192.168.0.3 wlan0 /24, Android 13, arm64-v8a, adb tcp 35435

tablet -> 172.31.12.126:3000   ping 100% loss, nc timeout   (sin ruta al rango VPC)
tablet -> 100.107.229.5        ping 100% loss               (la tablet no está en el tailnet)
tablet -> 190.143.242.158:3000 nc timeout                   (security group no deja entrar;
                                                             el propio host tampoco: curl 000)
tablet -> 8.8.8.8              0% loss                      (internet OK)
adb reverse tcp:3000           nc 127.0.0.1:3000 rc=0, HTTP responde  => ÚNICO canal
```

La salida VM→tablet existe (ping a `192.168.0.3` vía `172.31.0.1`), pero el tráfico **entrante**
hacia la VPC no tiene ruta. Por eso el APK previo (`API_URL=http://172.31.12.126:3000/api`)
nunca pudo sincronizar: no era un bug de código, era topología.

## Brecha de versión detectada (motivo por el que no usé el backend del usuario)

`git merge-base --is-ancestor <fix> 65b4ac5e` sobre el checkout que corría en `:3000`
(`/home/octavio_morales/omnifood-ni`, rama `feat/soho-business-profile-web`):

| Commit | ¿En el backend que corría? |
|---|---|
| `414a414e` bootstrap credential post-activation | IN |
| `9aa1672c` device sync token en sales/shifts/sync | IN |
| `a8819a9e` printerPort en activation runners | IN |
| `45d00930` cash shift sync RLS | IN |
| `4ee74097` freshness: excluir devices huérfanos | **MISSING** |
| `7362f77f` asDouble/asInt (POS-only) | MISSING (no aplica al backend) |

Mismo set de migraciones entre `65b4ac5e` y `main` (`git diff --name-only` sobre
`src/migrations` = vacío), así que correr un backend distinto contra `omnifood` es seguro.

## Hipótesis de AUTH_BLOCKED (mapeo read-only, sin confirmar en runtime)

Explore `muogqspq-1-pggv`: la ruta **sí existe** en `main`
(`activation.controller.ts:237 POST onboarding/activation/device-sync-credential`, prefix `api`
en `main.ts:25`, módulo registrado en `onboarding.module.ts:150` → `app.module.ts:215`).
Probe real contra el backend anterior: `401`, no `404` → descarte de routing skew.

El 404 que ve el POS es un `NotFoundException` **de dominio**, una de dos:

1. `activation.service.ts:1671` — `No finalized activation attempt found for device '<id>'`
   (busca `tenant_id + trusted_terminal_id = deviceId + status ∈ {PASS, PASS_WITH_WARNING}`).
   Candidato: drift de identity `deviceId` (POS) vs `trusted_terminal_id` (intento `pos-local-<uuid>`).
2. `activation.service.ts:1409` — tenant sin `slug` (descartado: `slug='soho'` presente).

**Discriminador en runtime**: la línea `[Bootstrap] FAIL … data=` de
`dio_activation_sync_port.dart:383` en logcat. JSON con `statusCode:404` = dominio;
`Cannot POST …` HTML = deployment skew.

## Estado de datos local (tenant soho, antes del wipe)

- `onboarding_activation_attempts`: 2 PASS, 2 FAIL (`VERIFICATION_SALE_EVIDENCE_MISSING`),
  `trusted_terminal_id` = `pos-local-596c56a1…` (PASS 25/09) y `pos-local-9befc3a7…` (PASS 24/09).
- `device_sync_credentials`: 1 REVOKED (`terminal wiped, re-linking (test #556)`), 1 ACTIVE (25/09).
- `device_linking_codes`: 1 fila.
- Usuarios SOHO: `sofia@omnifood.ni` (OWNER), `admin@soho.com` (OWNER), MANAGER/CASHIER/WAITER.

## Tareas

| # | Id | Task | Estado | Commit |
|---|---|---|---|---|
| 1 | T1 | Backend `main` en `:3000` local (`.env` copiado, health probe) | pending | — |
| 2 | T2 | Canal `adb reverse :3000` + `pm clear` + APK con `API_URL=http://127.0.0.1:3000/api` + install | pending | — |
| 3 | T3 | Vínculo desde cero: linking code → tablet → login → 3 fases → `ACTIVATED` | **done** | evidencia: attempt `7514f8df` `PASS` 13:25:40, código `67GZWH` reclamado 13:23:31 |
| 4 | T4 | Cerrar AUTH_BLOCKED: credential bootstrap `ACTIVE`, logcat sin 404, sync push/pull OK | **done** (con hallazgo) | `grep -c AUTH_BLOCKED` = 0; credential `f54fa280` `ACTIVE` 13:25:40.932. Hubo un 404 **esperado** a las 13:24:29 (bootstrap disparado por login antes de `finalize`) → ver H-1 |
| 5 | T5 | Freshness: badge "Datos completos" — ghost revocado, rollup limpio (lastCompleteAt hoy 19:25), STALE = idle normal — pendiente de prueba en vivo (S3/S4) | pending | ver H-2 fix, T5 desbloqueado |
| 6 | T6 | S3 UOM (crítico): venta COMPOUND → kardex descuenta gramos (18 g café, no 1 unidad) | pending | — |
| 7 | T7 | S4 pagos: venta con tarjeta → `payment_method` llega al cloud | pending | — |
| 8 | T8 | Fases 5-11 del plan integral (día simulado completo SOHO) | pending | — |
| 9 | H-3 fixed: Setup Center ya no re-ofrece activación para terminal activa (8 archivos, 55 tests, typecheck limpio) | **done** (commiteado, pendiente push PR) | pending — push a feature branch y abrir PR para review |

## Verificado / no verificado

- **Verificado**: topología (tabla arriba), brecha de versión, existencia de rutas de backend,
  estado de datos del tenant, `run-as` funcional sobre el SQLite de la app (debug build).
- **Sin verificar**: cuerpo real del 404 en la tablet, `deviceId` runtime del POS tras el wipe,
  que el badge de freshness pase a verde, descuento UOM en kardex, `payment_method` en sync cloud.

## H-3 — Fixed (commit pending)

Setup Center re-offer activation for already-activated terminals, creating duplicate attempts and ghost credentials.

**What was done**: Added `lastAttemptStatus` to `LinkingCodeResponseDto`/`LinkingCodeResponse` (8 files, 326 insertions, cross-app). `selectClaimableLinkingCodes` now drops codes whose device already has `PASS`, keeping `FAIL`/`PASS_WITH_WARNING`/`CREATED`/`IN_PROGRESS`/`null` as retry paths.

**Tests**: 22 backend + 33 dashboard = 55 passing. Typecheck clean.

**Files**: `linking-code-response.dto.ts`, `device-linking.service.ts`, `device-linking.service.spec.ts`, `types.ts`, `setup-center-view.tsx`, `w2-onboarding.test.tsx`, `setup-center-view.test.tsx`, `onboarding-activation-attempt-surface.test.tsx`.

## Hallazgos nuevos (esta sesión)

### H-1 — El bootstrap de credencial se dispara antes de `finalize` (MEDIUM, ruido + ventana de fallo)

```
13:23:35  attempt 7514f8df creado (IN_PROGRESS)
13:24:29  [Bootstrap] FAIL status=404  POST /api/onboarding/activation/device-sync-credential
          data={message: No finalized activation attempt found for device
                'pos-local-f0a201f4…' in tenant 'e05bf002…', statusCode: 404}
13:25:40.77  attempt PASS (finalize)
13:25:40.93  credential f54fa280 ACTIVE
```

- El 404 es **de dominio**, no de routing: confirma la hipótesis de `muogqspq-1-pggv`
  (`activation.service.ts:1671`). La ruta existe y el backend responde.
- Disparador: `auth_repository_impl.dart:207-220` hace `bootstrap(user:)` en `loginOnline`.
  Al loguearse con el intento aún `IN_PROGRESS`, la variante device-scoped exige un intento
  ya finalizado → 404 garantizado. El bootstrap post-activación (`main.dart:353-361`) lo recuperó.
- Net: **auto-recuperable, no bloquea**, pero deja una ventana donde la tablet muestra error.
  Superficie de arreglo posible: cablear `resolveAttemptId` en `main.dart:203-210` para usar las
  rutas attempt-scoped que ya existen (`dio_activation_sync_port.dart:308`/`:448`).

### H-2 — Terminal re-vinculada deja su credencial anterior `ACTIVE` y fija el freshness (HIGH, go-live)

| device | attempt | credential | último receipt |
|---|---|---|---|
| `pos-local-9befc3a7…` (24 sept) | PASS | REVOKED (a mano, test #556) | 24 sept |
| `pos-local-596c56a1…` (25 sept) | PASS | **ACTIVE** | **25 sept 18:52Z** |
| `pos-local-f0a201f4…` (hoy) | PASS | ACTIVE | hoy 19:25Z |

`GET /api/operations/sync/freshness` con `4ee74097` corriendo:

```json
{"state":"STALE","lastCompleteAt":"2026-09-25T18:52:19.994Z",
 "perTerminal":[{"terminalId":"pos-local-596c56a1…","state":"STALE"},
                {"terminalId":"pos-local-f0a201f4…","state":"STALE"}]}
```

- `4ee74097` excluye devices **sin** credencial: sacó los 13 huérfanos de receipts
  (`orphan_receipt_only = 13`) → el fix es correcto pero **incompleto**.
- El device de septiembre conserva credencial `ACTIVE`, así que sigue participando, y
  `deriveLastCompleteAt` (`freshness-derivation.ts:203-214`) toma el **mínimo** entre
  participantes → el tenant queda STALE permanente con watermark al 25 sept.
- Causa raíz: `revokeCredential`/`retireCredential` solo existen en
  `device-sync-credential.service.ts:381,430`. **No hay controller ni UI que los llame**
  (`grep revoke|retire` en `*.controller.ts` = 0 resultados). La única fila REVOKED se hizo por SQL.
- `cancelAttempt` (`activation.service.ts:834-880`) **no** resuelve esto: rechaza status ≠
  `CREATED`/`IN_PROGRESS` (`:857-864`) y no referencia credenciales. Canciones el attempt,
  no la jubilación del device. Son tres ciclos de vida distintos (code / attempt / credential).
- Auto-revocar al vincular otra terminal **no** es opción: `startActivation` acepta `ACTIVATED`
  como estado válido a propósito (`activation.service.ts:284`, "a new terminal may be
  activated") porque Food Park = N terminales legítimas por tenant.

### H-3 — Setup Center ofrece re-activar una terminal ya activada (MEDIUM, es como nacen los ghosts)

- `setup-center-view.tsx:709` gatea la sección solo con `!isAwaitingDeviceChecks`, nunca con
  `isActivated` (`:144`), que sí se usa en `:496`/`:552`. Al pasar a `PASS` el intento deja de
  "await checks" y la tarjeta reaparece con el botón vivo `Iniciar Activación para esta terminal` (`:741`).
- `selectClaimableLinkingCodes` (`:117-135`) filtra `status === CLAIMED`; el row de `67GZWH`
  queda `CLAIMED` para siempre, así que la tarjeta muestra `pos-local-f0a201f4…` indefinidamente.
  Su propio comentario promete excluir IDs de sesiones previas y no lo hace.
- Peligro: pulsar ese botón crea un segundo attempt → segunda credencial → segundo ghost →
  agrava H-2.
- **No es arreglable solo en UI**: `getActiveAttempt` (`activation.service.ts:904-916`) devuelve
  solo `CREATED`/`IN_PROGRESS`; tras `PASS` no hay attempt activo y el cliente ignora qué device
  está activado. `LinkingCodeResponse` (`types.ts:263-272`) trae `deviceId` sin estado.
  Arreglo correcto = enriquecer `LinkingCodeResponseDto`/`listLinkingCodes` con el estado de
  activación por device + consumir eso en el selector.

## Riesgos y límites

- `adb reverse` muere si cae el ADB por WiFi: re-ejecutar `adb reverse tcp:3000 tcp:3000`
  tras cada `adb connect`. Cualquier "sync falla" hay que imputarlo a esto antes que al código.
- `pm clear` destruye cajas/ventas locales no sincronizadas en la tablet (decisión explícita del
  usuario; el dispositivo se usa para pruebas de vínculo desde cero).
- La DB compartida `omnifood` tiene 698 tenants de pilots: los queries siempre llevan filtro
  `tenant_id` para no contaminar lecturas.

---

## Cierre del vínculo E2E (2026-09-30, tarde/noche)

Vínculo completo desde cero validado en la tablet física (Android 13, `com.nhilos.pos_app`):
linking code → activación en terminal → login → 3 fases de onboarding → pantalla de ventas.
La BD local (`Floor`) quedó operativa y el rollup de freshness dejó de estar envenenado por
ghosts tras revocar la credencial huérfana (H-2).

### H-4 — Sync no se dispara tras la activación (LOW, UX)

`SyncService` solo sincroniza por `Timer.periodic` de 5 min (`sync_service.dart:272`) y en
recuperación de red (`:263`). Al completar el onboarding y pulsar **Ir al POS**
(`activation_terminal_view.dart:152`, `pushReplacementNamed('/home')`) no había ningún trigger,
así que la terminal quedaba hasta 5 minutos con badge rojo y el operador tenía que usar
"Forzar sincronización". `ActivationReconnectSyncRunner` **no** cubre esto: sincroniza evidencia
del attempt (outbox de activación), no el delta de catálogo/authority.

Fix: `context.read<SyncService>().triggerManualSync()` antes de navegar (`SyncService` se
provee globalmente en `main.dart:574`). Commit `d2dad39c`.

### Keystore: circuit breaker crónico en dispositivos sin hardware-backed key

El timeout de 3 s marcaba `DEGRADED` el breaker en cada boot sin keystore de hardware, y una
vez abierto **todas** las lecturas de credenciales fallaban de inmediato → sync nunca arrancaba
(>22 K líneas de `keystore2` overdue en logcat). Fix: timeout a 30 s en los tres stores de
`flutter_secure_storage` + `AndroidOptions(encryptedSharedPreferences: true)`. Commit `470c3a31`.
Dispositivos con StrongBox resuelven en <100 ms, así que el techo alto no cuesta nada; un
keystore realmente colgado sigue cortando rápido por el breaker.

### Remanente: 8 recetas inertes (`INERT_SIMPLE_PRODUCT`)

Dos capas distintas, y la causa raíz de que siguieran inertes **no** era solo el tipo de producto.

1. **Tipo de producto.** 8 productos tenían `recipe_versions` `PUBLISHED` pero estaban
   registrados `SIMPLE`. El inerte se decide en el dispositivo: `adaptAuthorityDelta` lee el tipo
   desde el **catálogo local** (`sync_service.dart:3188-3216`), y los productos se persisten en
   el paso 1 del pull, así que al recibir `COMPOUND` la misma página de recetas se hidrata.
2. **El delta nunca reenviaba nada.** `fetchProductDeltas` filtra por
   `product.updated_at > sinceDate` y `fetchRecipeVersionDeltas` por
   `created_at > since OR published_at > since OR fecha_inicio_vigencia > since`. Los `UPDATE`
   crudos en psql **no** tocan `updated_at` (TypeORM solo lo auto-actualiza vía ORM), así que el
   cambio de tipo habría quedado invisible para siempre. Las `recipe_versions` del seed tenían
   `published_at` **NULL** y fechas de agosto. Se corrigió `updated_at` y se pobló
   `published_at = now()`; la simulación de la consulta del backend con el watermark real
   (`2026-09-30T20:21:09.915Z`) devuelve ahora 8 productos y 8 versiones.
3. **El badge no se autolimpia (defecto de UX, en arreglo).** `getInertRecipeVerdictReport`
   cuenta con `countVerdicts()`, que suma **todas** las filas históricas. La tabla es
   append-only por diseño (#613 decision 3: triggers `BEFORE UPDATE/DELETE` sin machinery de
   retención), así que acusa para siempre aunque la receta ya descuente. Arreglo en curso: el
   read model reporta solo veredictos aún sin resolver (producto ausente o todavía `SIMPLE`),
   sin tocar la tabla ni la telemetría `local_configs`.

Nota de datos: la tabla `recipes` tiene filas duplicadas (`productId`+`ingredientId`, 7 en
Hamburguesa, 3 en Capuchino/Latte). Es el modelo legacy plano y **no** interviene en el delta de
`recipeVersions` (usa `recipe_versions` + `recipe_details`); no se toca aquí.
