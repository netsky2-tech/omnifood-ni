# SOHO — estado del trabajo y pendientes (traspaso de sesión)

**Para:** una sesión nueva, sin contexto previo.
**Worktree:** `/home/octavio_morales/omnifood-ni-fx` · **Rama:** `fix/soho-commercial-fx-rate`
**Base:** `main` local en `9e83b15d`. La rama está **adelante** con 20+ commits (no pusheada).
**Último commit:** `485973b3` (badge de sync honesto).

⚠ **El worktree principal `/home/octavio_morales/omnifood-ni` está en OTRA rama de OTRA sesión. No cambiarle la rama ni tocar `odd/tasks/soho-dia1-integral-test.md` desde ahí.**

⚠ **`apps/pos_app/pubspec.yaml` está modificado y sin commitear a propósito**: bump local de versión (`1.0.1+2013`), por diseño. No commitearlo solo, y no revertirlo.

---

## 1. Contexto del cliente en una línea

SOHO es un **food park** (tenant `5af6c6c9-47eb-4bed-badd-b30cd1943ad1`, RUC `0011112930059D`, `CUOTA_FIJA`, FX comercial `36.6243`) que **ya recibió su tablet** (terminal `Q802024120001`, APK `1.0.1+2012` apuntando a `https://api.nhilospos.com/api`). El equipo está **en manos del cliente**. Todo lo que se arregle tiene que llegar por **OTA**, no por instalación manual.

Al entregar, el cliente preguntó tres cosas: **extras/modificadores**, **cuentas abiertas** y **poner nombre a la factura**. Las tres están trabajadas.

---

## 2. Lo que ya está entregado

| Trabajo | Commit | Estado |
|---|---|---|
| R-18: el Z muestra el nombre del cajero | `def0d3a4` | Verificado en el S23 |
| Release OTA `4013` | publicado | Verificado en el endpoint de producción |
| R-16 T1: política de huecos de secuencia | `129c8015` | Verificado contra Postgres real |
| R-16 T3: badge de sync honesto | `485973b3` | 15/15 + 122/122 |

**Documentos de trabajo en `odd/tasks/`** (los tres primeros con planes y decisiones):
- `sync-gap-policy.md` — R-16 completo: causa raíz, diseño y tareas T1–T5.
- `cuentas-abiertas-verificacion.md` — matriz de 22 escenarios con evidencia y defectos.
- `factura-con-nombre.md` — plan de la factura con nombre, decisiones fiscales y el bloqueo estructural.
- `extras-modifier-groups.md` — plan de grupos de modificadores (**vigente en otra rama: `feat/extras-modifier-groups`, otra sesión ya está en T1.1**).

**Memoria Engram** (buscable con `mem_search`): `r16-sync-stall-diagnostico`, `cuentas-abiertas-verificacion`, `factura-con-nombre-verificacion`, `extras-extras-modifier-groups`, `r18-device-verified-and-ota-preflight`.

---

## 3. R-16 — lo que falta

R-16 era: *el sync se estanca en silencio y el badge miente*. **Causa raíz encontrada y reparada en su mecanismo.**

**Causa raíz:** el ingest exige una `sourceSequence` **contigua** por `(tenant, device, flow)`. La marca de agua es el último recibo `ACCEPTED` + 1. Si un número se pierde, todo lo posterior queda `STAGED_FUTURE` con `WAITING_FOR_SEQUENCE_<n>` y **salteado para siempre**. En el rig, un único número perdido (el 6) bloqueó cuatro documentos reales.

### T2 · Superficie de salud (pendiente)
- [ ] Exponer en `GET /operations/sync/freshness` el hecho de que **se declaró un hueco**, no sólo que hay filas staged. `freshness-derivation.ts:55` ya describe el caso; el estado derivado hoy es `PARTIAL` vía `terminalHasGap`.
- [ ] Que el estado **no vuelva a `COMPLETE`** como si nada hubiera pasado: un hueco declarado es un evento con pérdida, no una transición.
- [ ] Tests de la derivación con un hueco declarado presente.
- Anclas: `apps/admin_backend/src/modules/sales/sync-health/freshness-derivation.ts`, `sync-health.service.ts`, `sync-health.controller.ts`, `sync-freshness.dto.ts`.

### T4 · Defectos adyacentes de la misma familia (pendiente)
- [ ] `onReauthenticationRequired` termina en un `debugPrint` (`apps/pos_app/lib/main.dart:316-319`). La app **detecta** que hay que reautenticar y no se lo dice a nadie: sin bandera, sin cartel, sin reintento.
- [ ] El interceptor de dispositivo **omite el header `Authorization`** para rutas fuera de su lista blanca (`apps/pos_app/lib/data/network/device_sync_auth_interceptor.dart:29-48`): un pedido sale sin credencial y come 401 en silencio. Trampa latente para cada ruta nueva de sync.
- [ ] Decidir el destino de `getNextBackoffDelay` (`apps/pos_app/lib/data/services/sync_service.dart:333`): existe, calcula backoff exponencial, y **no tiene llamadores**. El reintento es fijo cada 5 minutos.

### T5 · Verificación en aparato (pendiente)
- [ ] Provocar un hueco real en el rig y confirmar que **se rellena solo** al vencer la ventana (60 min por defecto, `SYNC_SEQUENCE_GAP_GRACE_WINDOW_MINUTES`).
- [ ] Confirmar que un hueco que se llena **antes** de la ventana **no** se declara.
- [ ] Confirmar que el badge pasa a **"Sync detenido"** mientras hay staged y vuelve a verde cuando drena.
- [ ] Confirmar que el panel del dueño ya mostraba el problema (la señal existe de punta a punta).
- **Ojo:** `inventory_sync_receipts` es **append-only por trigger**. No se puede borrar ni modificar una fila: para fabricar un hueco hay que **insertar hacia adelante**, y conviene usar un **stream de fixture propio** (otro `source_device_id`) para no tocar el del rig.

### #103 · Hueco de cobertura declarado (pendiente)
La fuente `fulfillment_outbox_events` del contador de pendientes **no tiene test** que afirme que contribuye. Su consulta se verificó por inspección (tabla, columna `state` y valor `'PENDING'` confirmados contra los 5 lugares que lo escriben) y está envuelta en un `try/catch` que **loguea** la falla. Falta el caso: `apps/pos_app/test/ui/features/sales/cloud_sync_status_badge_test.dart`, insertando una fila y afirmando que `getPendingOutboxCount` la cuenta.

---

## 4. El tablero completo (priorizado)

### P0 — Dinero y entrega
- **#96 [P0-DINERO] Cuentas abiertas: re-guardar una cuenta recuperada DUPLICA su contenido.** Escalado: llegó a una **factura emitida** (la 15, C$ 880.00, con las líneas duplicadas). El camino es el uso normal: recuperar la cuenta, agregar una ronda, volver a ponerla en espera y cobrar. Causa: el re-guardado llama `appendItemsToOrder` (`table_order_service.dart:106`) donde debe **reemplazar** (id + `expectedVersion`). Bajo normativa DGI es un comprobante con monto inflado. **No entregar cuentas abiertas hasta arreglar esto.**
- **#62 Cuentas abiertas — matriz cerrada.** Funciona: nombre libre, recuperar, acumular, cobrar, sobrevivir al reinicio, y facturar normal con la cuenta abierta sin alterarla. No funciona: la duplicación de #96, **el cierre de turno las ignora por completo**, y **no hay forma de cancelar** una cuenta (un toque largo sólo la recupera). Pendientes de la matriz: pago dividido, propina/descuento, cambio de operador, Corte X, y si llegan a la nube.
- **#93 Grupos de modificadores (web-first con sync).** Diseño aprobado y entregado; la implementación se la llevó **otra sesión** (rama `feat/extras-modifier-groups`).
- **#63 Extras: el feature está muerto en silencio.** La lectura del catálogo descarta los modificadores: `inventory_repository_impl.dart:152` llama `toProductDomain(entity)` sin `variants` ni `modifiers`. Se resuelve dentro del trabajo de grupos. El parche provisorio se descartó a propósito: crearía divergencia silenciosa.
- **#64 Nombre en la factura.** Diseño **cerrado en lo fiscal** (nombre y RUC/cédula, cada uno opcional por separado; `Cliente: Contado` explícito; persistir) y **bloqueado en lo estructural**: la factura debe ser un **snapshot fiscal** (nombre y cédula guardados en ella, como `invoice_item_modifiers` guarda nombre y precio sin vínculo al producto) **sin** crear clientes automáticamente — un cliente que pide factura a su nombre y no vuelve es **descartable** y no debe ensuciar el catálogo. Fidelidad cuelga de `customer_id`, que queda `NULL` en ese caso.

### P1 — Riesgo vivo
- **#65 · #100 R-16** (arriba).
- **#66 R-19:** la cajera puede cambiar la **tasa comercial** desde Perfil del Negocio. La pantalla no tiene guarda de rol y ahí vive `commercial_exchange_rate_field`.
- **#67** La caída al FX por defecto es **silenciosa**: emite factura con tasa inventada.
- **#68 R-17:** la conciliación de vouchers **nunca llega a la nube**.
- **#69 R-9:** líneas duplicadas **abortan el checkout** (impide vender).
- **#70** Impresión de factura: **nunca salió un ticket** y el auto-print está en falso.
- **#71** Inconsistencia de **timestamps fiscales** entre tablas (desfase de 6 h).
- **#72 Clientes y ASIGNAR CLIENTE:** prerequisito de #64. Nunca probado.
- **#90** El precio del modificador **viene con `0.0` y se concatena** (`15` → `0.015`). Clase D-16, arreglado en el arqueo ciego y no en este campo de dinero.
- **#95** El **editor de productos del BOH de la terminal no sincroniza**: cada edición del dueño es trabajo perdido y el próximo delta la pisa. Verificado con un "Extra Shot" en el S23.
- **#97** El ticket y el export **imprimen el UUID** como nombre de cliente (`receipt_document.dart:427-435` cae al `customerId`; `sales-export.service.ts:239` igual). Familia R-18/D-14.
- **#98** Un **cliente creado en la terminal nunca sincroniza**: no hay sync de salida de clientes, queda `pending` para siempre. Invisible para la nube y otras terminales. Y no hay pantalla para editar un cliente.
- **#99** El badge y su contador mentían (arreglado en T3; el item queda por el detalle histórico).

### P2 — Operación diaria
- **#73** Inventario BOH y flujo, con R-10 (el panel de sync atribuye a la red lo que es inventario) y R-13 (sin aviso de ventas con inventario no aplicado). Visto: INSUMOS vacío y los 58 productos con badge rojo **SIN STOCK** (no bloquea vender).
- **#74** La conciliación de vouchers **no refresca la vista**.
- **#75** Defaults de provisioning peligrosos + FX **sin validación de rango**.
- **#76** El preview de ticket lee config cacheada y niega el régimen fiscal.
- **#77** La activación deja la **venta de verificación sin limpiar** (el runner existe y no se registró).
- **#78** La activación quedó con `pos_build` vacío y un follow-up abierto.
- **#79** La copia ANULADO se imprime sin condición y su resultado no se muestra.
- **#80** R-4: el mensaje de error queda oculto bajo el carrito.
- **#91** El editor de opciones rotula el dinero con `$` en vez de `C$`.

### P3 — Superficies nunca probadas
- **#81** Pago por QR/Transferencia (el Z mostró C$ 0.00, nunca se ejerció).
- **#82** Descuento manual. **#83** Promociones (vimos el badge 2x1, nunca su efecto). **#84** Devoluciones y notas de crédito. **#85** KDS y comanda de cocina. **#86** Historial de Ventas (probado parcialmente: funciona y resuelve el nombre del cajero). **#87** Bitácora de Auditoría. **#88** Lealtad/puntos. **#89** Fase 8.3 del guion integral, declarada NO PROBADA.

### P4 — Infra, docs, release
- **#46** El **gate de tests es no-determinista**: el runner no logra hablar con `flutter_tester` (`WebSocketException: Invalid WebSocket upgrade request`). Pasa con cualquier concurrencia, cae en un archivo distinto cada corrida, y ese archivo siempre pasa aislado. **Preexistente.** Hace que el gate interno del build sea una lotería.
- **#42** Documentar en el informe el ensayo del rig local y el release.
- **#12** Empujar los commits de docs junto al próximo push de código (**no solos**: dispararía un rebuild de producción por docs).
- **#22** Branding: reemplazar "OmniFood NI" por "NHILOS POS" (diferido por decisión del usuario).
- **#45** La tablet debe tomar la update `4013` (ya no depende de nosotros).

---

## 5. Invariantes y lecciones (esto ahorra horas)

1. **`inventory_sync_receipts` es append-only por trigger** (`prevent_append_only_replay_table_mutation`): UPDATE y DELETE levantan excepción. "Avanzar la marca de agua" **sólo** puede hacerse **insertando**.
2. **Un mock puede pasar mientras la integración real está rota.** 457 tests unitarios daban por bueno un código que no podía completar **una sola** declaración contra la base: la auditoría escribía un `target_id` compuesto en una columna `uuid`, la transacción revertía y el error **tiraba el batch completo**. Para algo que escribe en un esquema real con constraints, RLS o triggers, **el test contra base real es el único que cuenta**.
3. **Un grep negativo no es evidencia.** Afirmé "cobrar una cuenta no la borra" buscando `deleteHoldTicket` cuando la operación se llama `liquidateOrder`. Hay que buscar **el llamador**, o mirar el aparato.
4. **Los commits se condicionan al código de salida, nunca a un grep.** El commit de T1 se negó una vez por eso, y evitó que entrara el bug de la auditoría.
5. **`apps/pos_app/pubspec.yaml` está modificado a propósito** (bump local). No commitear solo ni revertir.
6. **`apps/admin_backend/.env` no termina en salto de línea**: un `>>` ingenuo pega la clave nueva a la última línea y **corrompió `R2_ENDPOINT`** una vez. Respaldo en `~/.env_backup_before_r16`.
7. **El TTL del token de identidad es canónico** (`parseCanonicalTtl` exige el valor exacto): no se puede bajar para experimentos. El del token de device-sync **sí** es ajustable (60–3600 s).
8. **Una UI cuya disposición se mueve con el teclado no admite toques encadenados.** Varios falsos positivos salieron de ahí: hay que verificar cada pantalla.
9. **`/tmp` se barre**: los directorios de evidencia desaparecen y el daemon de adb se reinicia, lo que **pierde el túnel** (`adb reverse tcp:3000 tcp:3000` hay que rearmarlo).
10. **`pkill -f`/`pgrep -f` se auto-matchean** si el literal aparece en la misma línea de comandos (me maté mi propia shell una vez). Usar `-x` o aislar el comando.

---

## 6. Riesgos vivos sobre el cliente

1. **La tablet entregada puede entrar en el deadlock de secuencia.** Si su base local se reinicia, o la app se reinstala o re-activa conservando el mismo `terminal id`, **su secuencia vuelve a 1 y la marca de agua del servidor no** — y sus ventas dejan de llegar a la nube **en silencio**. Con T1 eso se auto-repara, pero **el arreglo tiene que llegar al aparato: requiere un release.** Evaluar además una vía explícita de **re-baseline** (que una terminal pueda pedir autorizadamente reiniciar su secuencia).
2. **Cuentas abiertas duplicando importes facturados** (#96). No entregarlas al cliente hasta arreglarlo.
3. **El panel del dueño ya no está desactualizado por el rig** (se reparó), pero la clase de defecto sigue viva en cualquier terminal que pierda una secuencia.

---

## 7. Entorno de pruebas (rig local)

- **S23 Ultra**: `adb -s R5CWB2LQJDJ`. APK de prueba `1.0.1+2013`, `git_commit dd5a63a2`, `terminal_identity S23TEST`, `api_url http://localhost:3000/api`.
  - ⚠ `pubspec` está en `2013`, así que **cualquier rebuild para el S23 y para entrega da códigos distintos**: el de arm64 con `--split-per-abi` instala como `4013`. Es el offset por ABI de Flutter, y el publisher del backend lo replica (`2000 + base`).
  - **Túnel:** `adb reverse tcp:3000 tcp:3000` (se pierde cuando reinicia el daemon).
  - **PIN del dueño** (Maxwell Orozco): `123456`. **PIN de la cajera** (Karla Cajera): `654321`.
  - **Nunca `adb reconnect` sin `-s`**: desconecta todos los dispositivos.
  - El **S23 tiene bloqueo seguro**: adb no puede desbloquearlo, lo tiene que hacer el usuario.
- **Backend local**: `cd apps/admin_backend && nohup node dist/main > /tmp/fx_backend.log 2>&1 &`. Postgres local `omnifood` en `127.0.0.1:5432` (credenciales en el `.env`).
- **Tenant del rig**: `bc3bd4dd-92bb-4cfe-883e-cb5ec97bfe94`. Device: `S23TEST`.
- **Estado de la marca de agua del rig**: flujo `sales`, recibos aceptados `1..10`, sin staged, nube con **16 facturas** (la 13 anulada).
- **Producción**: no se toca. Railway, proyecto `nhilos-pos`, environment **`production`**. **Para desplegar backend se pushea a `main`.**
- **OTA**: el cliente pide `channel=pilot`, `abi=arm64-v8a`. El publisher es `apps/admin_backend/src/scripts/publish-release.js` (compilado) y **descarta los artefactos universales**: los releases tienen que construirse con `--split-per-abi`.

---

## 8. Por dónde seguir

El orden natural es **T2 → T4 → T5** (R-16 completo), y después el **release** para que todo esto llegue a la tablet. Antes de tocar código, leer `odd/tasks/sync-gap-policy.md`, que tiene el diagnóstico y las decisiones de diseño con su razonamiento.
