# Política de huecos de secuencia en el ingest, y un badge que no mienta

**Origen:** R-16 — el sync se estancaba en silencio y el badge decía que todo estaba bien.
**Estado:** causa raíz reproducida, reparada y verificada en el rig. Implementación del arreglo **no iniciada**.
**Documento de evidencia:** `odd/tasks/` — el diagnóstico completo está en Engram (`r16-sync-stall-diagnostico`).

---

## 1. El problema, ya probado

El ingest exige una secuencia **contigua** por `(tenant, source_device_id, flow_type)`:

```ts
// invoices.service.ts:957-975
const lastReceipt = await receiptRepoFor(manager).findOne({
  where: { tenant_id, source_device_id, flow_type,
           result_status: SYNC_RESULT_STATUS.ACCEPTED },
  order: { source_sequence: 'DESC' },
});
return Number(lastReceipt?.source_sequence ?? 0) + 1;   // marca de agua
```

Si llega un registro con `sourceSequence` mayor que la marca de agua, se guarda en `inventory_sync_outbox`
como `STAGED_FUTURE` con `WAITING_FOR_SEQUENCE_<n>` y **se saltea**. Como la secuencia faltante nunca puede
llegar, **todo lo posterior queda bloqueado para siempre**.

Medido en el rig: recibos `sales seq=1..5 ACCEPTED`, outbox `sales seq=7,8,9,10 STAGED_FUTURE`. **La secuencia
6 no estaba en ninguna de las dos tablas.** Un solo número perdido bloqueaba cuatro documentos reales
(facturas 13, 14, 15, 16 y la anulación de la 13), y el batch reportaba `received=4 processed=0`.

**Reparado y verificado:** una fila de relleno auto-documentada + limpiar los staged →

```
[SYNC-BATCH] result received=4 processed=4 duplicates=0 resultsCount=4
  -> status=ACCEPTED code=APPLIED_NO_INVENTORY_IMPACT retryable=false   (x4)
```

Marca de agua 1..10, nube de 12 a 16 facturas, la 13 marcada ANULADA, badge de ámbar-4 a verde.

**Dato decisivo para el diseño: no hizo falta ninguna rutina de replay.** El outbox del propio dispositivo
drenó solo en la pasada siguiente. **La recuperación ya existe; lo que falta es la política que decida cuándo
un hueco deja de esperar.**

## 2. Lo que ya está construido (no rehacer)

- **La detección existe.** `sync-health/freshness-derivation.ts:176` — `if (terminalHasGap(evidence)) return
  'PARTIAL'`. Los insumos ya están: recibos ACEPTADOS, recibos no aceptados por encima de la marca de agua, y
  filas `STAGED_FUTURE` del outbox (`:49-55`).
- **El endpoint existe.** `GET /operations/sync/freshness` (`sync-health.controller.ts:27`, "sync freshness
  operational read").
- **El panel lo consume.** `useSyncFreshness()` y `FreshnessBadge` en `cash-page.tsx:13,119` y
  `fiscal-page.tsx:4`.
- **El modelo de estados no necesita un valor nuevo.** `ACCEPTED · DUPLICATE · STAGED_FUTURE · REJECTED ·
  BLOCKED_BY_PRIOR_FAILURE · IDEMPOTENCY_MISMATCH`. El hueco se marca `ACCEPTED` con un `result_code`
  distintivo, que es exactamente la forma que usó la reparación del rig.

## 3. Decisiones de diseño

**La política acepta una pérdida, y por eso tiene que ser visible.** Avanzar la marca de agua significa
declarar que el documento de la secuencia faltante **no va a llegar nunca**. La alternativa —no avanzar— es
peor: se pierde **todo lo posterior**. Por eso:

1. **El hueco se marca con una fila auditable**, no se saltea en silencio: `result_status = ACCEPTED`,
   `result_code` distintivo, `idempotency_key` que se lee como lo que es, y `payload_hash` explícito de
   "sin payload". Nunca un hash falso que parezca real.
2. **La ventana es configurable** y conservadora. Un hueco no se declara por impaciencia: el dispositivo
   reintenta cada 5 minutos, así que la ventana debe ser holgada en comparación.
3. **Queda rastro de auditoría** más allá del recibo: quién o qué disparó el relleno, cuándo y con qué ventana.
4. **La terminal se entera.** El mismo estado que ya ve el panel tiene que llegar al badge del POS.

## 4. Plan por tareas

### T1 · Política de huecos en el backend (el núcleo)
- [ ] Un servicio que, para cada `(tenant, source_device_id, flow_type)` con filas `STAGED_FUTURE` por encima
      de la marca de agua, detecte que la secuencia faltante supera la ventana.
- [ ] Escribir la fila de relleno de forma **idempotente** (no dos huecos para el mismo número).
- [ ] Configuración de la ventana, con un valor por defecto conservador y validado.
- [ ] Un evento de auditoría por hueco declarado.
- [ ] Tests: hueco simple, varios huecos consecutivos, hueco que se llena antes de la ventana (no debe
      declararse), y que un hueco ya declarado no se vuelva a declarar.

### T2 · Superficie de salud
- [ ] Exponer en `freshness` el hecho de que hubo un hueco declarado, no sólo que hay staged pendientes.
- [ ] Que el estado no vuelva a `COMPLETE` como si nada hubiera pasado: un hueco declarado es un evento, no
      un estado transitorio.
- [ ] Tests de la derivación con un hueco declarado presente.

### T3 · El badge de la terminal

**Corrección de diseño (importante).** El plan original decía que el POS consumiera el mismo estado que el panel
(`GET /operations/sync/freshness`). **Es imposible:** ese endpoint está detrás de la cadena de autenticación humana
(`AuthGuard`, `AuthoritativeCurrentUserGuard`) **y** de `@Roles(OWNER, MANAGER)`
(`sync-health.controller.ts:25-31`). El badge vive en la pantalla del **cajero**, que no tiene ninguno de los dos, y
en sesión de PIN offline no hay JWT de nube. Un badge honesto sólo para el dueño no sirve.

**Diseño corregido: el terminal calcula el estancamiento con lo que ya sabe.**

- [ ] **La señal de estancamiento es local**: la antigüedad del item más viejo sin confirmar en el outbox, con
      conexión activa. Si supera un umbral holgado respecto al ciclo de sync, el badge dice **"sync detenido"**.
      No requiere endpoint nuevo, no toca autenticación y funciona en sesión de PIN. Es la condición exacta del
      R-16: trabajo que no se confirma aunque haya red.
- [ ] **El contador deja de mentir por omisión.** Hoy `_pendingCount` no cuenta sesiones de caja, movimientos de
      caja, fidelidad ni fulfillment — justo los items que estaban pendientes esa noche. El badge no debe volver a
      verde mientras exista trabajo sin confirmar, sea del dominio que sea.
- [ ] `status` deja de ser la fuente: hoy sólo se modifica dentro de una corrida, así que si ninguna corre conserva
      el `idle` anterior y el badge informa la última corrida en vez de la realidad.
- [ ] Estados: al día (verde), **detenido** (trabajo viejo sin confirmar), degradado (ámbar), sin conexión.
- [ ] El diálogo "Estado de la Nube" conserva **"Último Sync Exitoso"** como el único campo ya honesto, y suma
      el motivo del estancamiento.
- [ ] Tests de los estados y de los dominios que el contador omitía.

**Queda como pieza posterior, no en T3:** que el terminal pueda leer del servidor el **hueco declarado** (que le
diga que un documento se perdió). Eso sí requiere una vía de lectura con credencial de dispositivo y alcance de
terminal — no la de dueño/gerente — y es información que sólo el servidor tiene. Se registra aparte.

### T4 · Defectos adyacentes de la misma familia
- [ ] `onReauthenticationRequired` deja de terminar en `debugPrint` (`main.dart:316-319`): que sea visible.
- [ ] El interceptor de dispositivo no debe mandar requests **sin** header de autorización
      (`device_sync_auth_interceptor.dart`): rutas fuera de la lista blanca deben fallar ruidosamente.
- [ ] Decidir qué hacer con `getNextBackoffDelay` (`sync_service.dart:333`), que existe sin llamadores.

### T5 · Verificación en aparato
- [ ] Provocar un hueco real en el rig y confirmar que se rellena solo al vencer la ventana.
- [ ] Confirmar que un hueco que se llena **antes** de la ventana no se declara.
- [ ] Confirmar que el badge pasa a "detenido" mientras hay staged, y vuelve a verde cuando drena.
- [ ] Confirmar que el panel del dueño ya mostraba el problema (para saber que la señal existe de punta a
      punta).

## 5. Riesgo vivo que este arreglo también tiene que cubrir

**La tablet entregada puede terminar en el mismo deadlock.** Si su base local se reinicia, o la app se
reinstala o re-activa conservando el mismo identificador de terminal, **su secuencia local vuelve a empezar
mientras la marca de agua del servidor no**. A partir de ahí sus ventas dejan de llegar a la nube, en
silencio. Con T1 eso se auto-repara; sin T1, es un cliente nuevo con ventas invisibles.

Conviene además evaluar una **vía explícita de re-baseline** (que una terminal pueda pedir que su secuencia se
reinicie de forma autorizada), porque es la reparación directa del caso, y la política de huecos es la red de
seguridad.

## 6. Preguntas abiertas

- **Qué ventana.** Depende del ritmo real de reintento y de cuánto puede estar caído un servidor sin que eso
  indique un documento perdido. Propuesta inicial: muy por encima del ciclo de 5 minutos.
- **¿Quién decide el relleno?** Automático por política, o con intervención. Automático con auditoría parece
  lo correcto para que un local no quede ciego esperando a un humano.
- **¿Qué se le dice al operador** cuando se declaró un hueco? El documento faltante se perdió: hay que
  decidir si eso es un aviso operativo o un evento de backoffice.
