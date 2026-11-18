# Entitlements por plan y capacidades por tenant

- **Issue:** [#984](https://github.com/netsky2-tech/omnifood-ni/issues/984)
- **Authority:** `docs/finance/estrategia_precios_nhilos_pos_v1.md`; planes Esencial, Operación y Pro con packs Retail y Cocina.
- **Estado:** especificación **congelada** con las tres decisiones estructurales confirmadas;
  ENT-01 entregado y verificado. ENT-02 es el siguiente slice.
- **Riesgo:** medio-alto. Toca backend, dashboard y POS; un error puede bloquear ventas.

## Specs

S1. «Sin fallback silencioso a "todas las capacidades".» — un tenant sin suscripción recibe el
núcleo y un estado `sin_plan` explícito.
S2. «El snapshot no puede impedir vender, facturar, anular, reimprimir ni cerrar caja.»
S3. «Los guards no se aplican al camino fiscal ni al cobro.»
S4. «Un tenant sin suscripción no recibe "todas las capacidades" por defecto.»
S5. SOHO: `OPERACION` con precio fundador US$79 y override temporal `legacy.full` auditado, no
`ESENCIAL`.
S6. «Ocultar o deshabilitar funciones premium con mensaje de upgrade, no con errores crípticos.»
S7. «En `Operación` va un pack incluido; el segundo cuesta +US$29/mes. En `Esencial` un pack
cuesta +US$39/mes. En `Pro` van ambos packs incluidos.»
S8. «Núcleo siempre activo: venta, factura, anulación, reimpresión, caja/turnos, catálogo,
inventario simple, reportes esenciales, portal del propietario.»
S9. «Una sola tabla de mapeo entre contrato comercial y claves técnicas» y una clave solo
entra al catálogo si la función existe en el repositorio.

Registro de claves, matriz plan→capacidad, límites, add-ons, reglas de resolución y contrato
del snapshot: `docs/plans/entitlements/catalogo_capacidades_v1.md`.

## Objetivo

Tener una fuente única de verdad de qué plan y qué capacidades tiene cada tenant, con snapshot offline para el POS, guards en backend, gating de UI y overrides auditables, sin que el estado del plan bloquee la emisión de facturas ni la venta.

## Problema

No existe una entidad de suscripción, plan o entitlement. Hoy el empaquetado comercial es manual y no hay forma de impedir que un tenant de Esencial use funciones de Pro, ni de demostrar qué compró cada cliente. Al mismo tiempo, un gating ingenuo puede dejar a un negocio sin cobrar cuando el POS está offline.

## Por qué

Los planes solo existen si el producto puede demostrar qué compró cada tenant. Sin entitlements, el empaquetado es manual, no se puede auditar un upgrade y el soporte depende de memoria. A la vez, el gating no puede convertirse en un candado sobre la venta: el negocio debe cobrar aunque el plan esté vencido o el POS esté offline.

## Alcance

### Modelo de datos

- Catálogo global `plan_capability`: `plan_code` + `capability_key` + `value_json`.
- `tenant_subscription`: tenant, plan, estado, vigencia, precio contractual, moneda, add-ons y notas. Sin cobro automático.
- `tenant_entitlement_override`: tenant, capability, valor, actor, motivo, expiración.
- Historial de cambios de plan y overrides.
- RLS en todas las tablas con `tenant_id`; el catálogo de planes es global y de solo lectura para el tenant.

### Catálogo de capacidades

- Núcleo siempre activo: venta, factura, anulación, reimpresión, caja/turnos, catálogo, inventario simple, reportes esenciales, portal del propietario según entrega.
- `inventory.retail`: kardex, CPP, proveedores, compras, conteos, mermas, alertas, código de barras, lotes/vencimiento.
- `inventory.cooking`: recetas/BOM, subrecetas, modificadores, producción, combos, márgenes por plato, menú QR.
- `promotions`, `loyalty`, `reports.margins`, `support.priority`.
- Incluidos: `terminal.included`, `owner.accounts.included`. Los add-ons suman y no hay tope duro por plan.
- Add-ons: `pack.retail`, `pack.cooking`, `terminal.extra`, `owner.account.extra`.

### Planes

| Plan | Capacidades base | Incluidos |
| --- | --- | --- |
| `ESENCIAL` | núcleo | 1 terminal incluida, 2 cuentas owner |
| `OPERACION` | núcleo + un pack + promotions + loyalty | 1 terminal incluida, 2 cuentas owner |
| `PRO` | núcleo + ambos packs + promotions + loyalty + reports.margins + support.priority | 2 terminales incluidas, 4 cuentas owner |

`ENTERPRISE` se cotiza manual y no entra en el catálogo automático.

### API y sync

- `GET /tenant/entitlements` para dashboard y POS.
- Respuesta versionada: plan, estado, capacidades efectivas, límites, add-ons, `issuedAt`, `expiresAt`, `version`.
- Snapshot del POS en SQLite; refresco al sincronizar; TTL explícito.
- Si el snapshot falta o está vencido: el núcleo sigue operando; las capacidades premium se consideran no disponibles, salvo override explícito.
- El snapshot no puede impedir vender, facturar, anular, reimprimir ni cerrar caja.

### Guards y UI

- `CapabilitiesGuard` y decorador `@RequireCapability(...)` en backend.
- `useCapabilities()` y `CapabilityGate` en dashboard y POS.
- Ocultar o deshabilitar funciones premium con mensaje de upgrade, no con errores crípticos.
- Los guards no se aplican al camino fiscal ni al cobro.

### Migración

- SOHO: `OPERACION` con precio fundador y override temporal `legacy.full` para no quitarle funciones mientras se confirma su contrato. Conserva 2 cuentas owner y sus add-ons de terminal a US$35/mes con US$50 de enrolamiento.
- Tenants existentes: mapear al plan que corresponda a sus funciones actuales; auditar cada mapeo.
- Un tenant sin suscripción no recibe "todas las capacidades" por defecto.

## Fuera de alcance

- Pasarela de pagos, cobro recurrente, dunning o facturación automática.
- Facturación electrónica DGI.
- Autoservicio de cambio de plan.
- Medición de uso por transacción.
- Motor de reglas genérico o scripting de capacidades.

## Restricciones

- Offline-first: el plan no puede ser un punto único de fallo para cobrar.
- DGI: ninguna regla de plan impide emitir, anular o reimprimir un documento fiscal.
- Gating explícito y observable; nada de `if` por rubro dispersos.
- Una sola tabla de mapeo entre contrato comercial y claves técnicas.
- Migración reversible y no destructiva.
- Forecast: 6 slices; cada slice debe caber en una unidad revisable y no mezclar backend, POS y dashboard en el mismo cambio.

## Unidades de trabajo

Cada unidad se entrega como slice revisable y no mezcla backend, POS y dashboard en el mismo
cambio. Las claves de capacidad que usan están congeladas en el catálogo (S9).

### ENT-01 — Catálogo, tablas y migración

Status: done (`3bcc032f`).

- `plan_capability` (global), `tenant_subscription`, `tenant_entitlement_override` y
  `tenant_entitlement_change_history` (append-only) en
  `1810400000000-CreateEntitlementsTables.ts`.
- Registro de claves en código: `capability-registry.ts` (10 de núcleo, 2 packs, 3
  transversales, 2 límites; `support.priority` fuera por ser SLA).
- ENABLE + FORCE RLS con política por comando en las tres tablas del tenant; catálogo global
  declarado en el manifest de cobertura.
- Seed idempotente del mapeo plan→capacidad (51 filas, una por plan y clave).
- Pruebas: registro y matriz (13), aislamiento cross-tenant y re-ejecución de la migración (7
  con base real y rol NOSUPERUSER NOBYPASSRLS). La migración de la data de SOHO queda en ENT-06.

### ENT-02 — Servicio y API de entitlements

Status: done (`fb240ac1` reglas, `43bd2528` endpoint).

- `entitlement-resolution.ts`: resolución pura de §6 (plan ∪ add-ons ∪ overrides vigentes) sin
  base de datos, reloj ni contexto de Nest. Falla cerrada ante plan, add-on, clave u override
  fuera de catálogo.
- `EntitlementsService.snapshot()`: lee contrato y overrides dentro de una transacción con
  `app.tenant_id` ligado, así que las políticas RLS son la última defensa; sella el sobre
  (`version`, `issuedAt`, `expiresAt` con TTL de 24 h).
- `GET /api/tenant/entitlements`: contrato v1 de nueve campos, para cualquier rol autenticado
  del tenant; el tenant sale del token, nunca del request.
- Pruebas: 21 unitarias de reglas y 6 con base real (contrato completo, add-ons y overrides
  vigentes/vencidos, `sin_plan`, suspendida y aislamiento entre tenants bajo rol restringido).

### ENT-03 — Guards de backend

Status: done (`34beadb8` mecanismo, `71135bbd` aplicación).

- `@RequireCapability(...keys)` + `CapabilitiesGuard` con snapshot memoizado por request
  (WeakMap sobre el objeto request: sin caché entre requests ni TTL) y tenant tomado de las
  mismas fuentes que `@GetTenantId()`.
- Falla cerrado ante clave no registrada o clave de núcleo en un decorador.
- Aplicado a **todas** las funciones premium, lecturas y escrituras: promociones, programas de
  lealtad, recetas y producción (Cocina), compras/proveedores/conteos/merma/kardex (Retail) y
  valorización/COGS/ajustes (márgenes). `insumo.controller` queda sin decorar por ser núcleo.
- Convenios B2B: se decide por el tipo **efectivo**, así un PATCH que solo cambia el descuento
  tampoco evade el requisito del bundle.
- `entitlements-fiscal-paths.spec.ts` falla si el decorador aparece alguna vez en `sales/`,
  `loyalty-sync`, `device-sync-token`, catálogo, clientes o el contrato de auditoría.

Fuera de ENT-03 por decisión: las cuotas (`limits.terminals`, `limits.owner_accounts`) son
conteo y bloqueo de enrolamiento, no gating de función; van en ENT-03b.

### ENT-03b — Cuotas de terminales y cuentas owner

Status: done (`bcb8093e` servicio, `cb882c89` aplicación).

- `TenantQuotaService`: asiento ocupado = credencial no dada de baja con actividad
  `GREATEST(issued_at, rotated_at)` dentro de 30 días; la baja explícita libera de inmediato; límite
  `null` nunca bloquea. Cuentas owner: `OWNER` activos, sin ventana.
- Enforce solo en los dos endpoints de aprovisionamiento de credencial y en creación/ascenso a
  OWNER. Renovación de token, sync, baja, venta, fiscal y caja quedan fuera, con spec de fuentes.
- El conteo excluye el asiento del mismo intento de activación, porque el aprovisionamiento es
  idempotente: un reintento legítimo devuelve la credencial existente en vez de un 409 por una
  cuota que ya cumple. `IS DISTINCT FROM` evita el `<> NULL` que habría sacado del conteo a las
  credenciales de bootstrap.

Deuda registrada: `IdentityModule` provee `EntitlementsService` y `TenantQuotaService` directamente
en lugar de importar `EntitlementsModule`, porque `identity.module.spec.ts` no tolera los
repositorios extra de `forFeature`. Es el mismo grafo (ambos sin estado sobre `DataSource`) y hay
que normalizarlo cuando ese spec se pueda tocar.

### ENT-04 — Snapshot offline del POS

Status: done (`1e9f26ef` códigos del backend, `5269e257` snapshot, `2999a6c4` reclasificación).

- Backend: 403 `CAPABILITY_REQUIRED` con `missingCapabilities` y 409 `QUOTA_EXCEEDED` con
  `limitKey`/`limit`/`occupied`, para que el POS no dependa de la prosa (ENT-04a).
- POS: snapshot cacheado en `local_configs` bajo `entitlements:<tenantId>` con TTL del servidor;
  ausente, vencido o corrupto resuelve a `empty()` (sin capacidades premium), y un refresh
  fallido conserva el anterior sin lanzar hacia la UI.
- `classifySyncFailure` y `purchaseReactionAction` (funciones puras): un rechazo de plan es
  `planBlocked`, no `authBlocked`, y se repropaga **antes** de cualquier ruta de descarte.
- Un dominio bloqueado por plan se retiene y se libera solo cuando cambia el **contenido** de los
  entitlements — no cuando se renueva el TTL, que es lo que pasaría con cada pasada de sync.

Notas de ejecución:

- El worker de este slice se colgó 30 minutos en un `flutter test` (proceso `flutter_tester`
  huérfano); el código estaba escrito y se terminó de revisar y verificar en el padre.
- Se eliminó la spec de integración que dejó el worker: sus casos no correspondían al
  comportamiento real (el 403 de compras no pasa por `_runDomain`). En su lugar la decisión se
  extrajo a `purchaseReactionAction`, que sí se prueba.

### ENT-05 — Dashboard y POS UI

Status: done (`79ba10d3` POS, `a5e542cb` dashboard).

- POS: `PremiumLockedView` y `BohRouteGuard(capability: …)`. El permiso por rol se evalúa primero y
  gana; solo después la capacidad. Sin snapshot en contexto falla cerrado, y las rutas de núcleo no
  reciben `capability`, así que la venta y la caja no pasan por este camino.
- Dashboard: `useEntitlements()` con TTL de 24 h y sin reintentos en 4xx (un rechazo de plan es una
  respuesta, no una falla); cualquier error cae a "sin capacidades premium", nunca a "todo
  permitido". `evaluateRouteAccess` devuelve primero la denegación por rol y después la de plan.
- Mensaje contractual único en ambas apps:
  `La función requiere el plan o el complemento que incluye "<key>". Actualice su plan para usarla.`
- Cubierto: compras, proveedores, conteos, merma, alertas, kardex (`inventory.retail`); recetas,
  comparación de versiones, producción y costo por plato (`inventory.cooking`); valorización, COGS
  y márgenes (`reports.margins`); convenios B2B (`promotions.convenio`).
- Pruebas que fallan si alguna vez se mapea una clave `core.*` a una ruta, si un permiso denegado
  deja de ganarle a una capacidad concedida, o si el copy contractual cambia.

Nota: el worker de ENT-05b declaró un hueco — el tab de valorización tenía el mapeo pero no el gate,
porque cablearlo rompía el fixture `w3-inventory`, que afirmaba la tabla sin stubear entitlements.
Lo cerró el padre: el tab quedó cableado y el fixture ahora stub de entitlements como concedido.

### ENT-06 — Overrides y operación

Status: done.

- Alta de override con actor, motivo y expiración: `entitlement-override-input.ts` (reglas puras)
  y `entitlement-overrides.service.ts` (`grant`).
- Auditoría y consulta: el alta y su fila en `tenant_entitlement_change_history` se escriben en
  la misma transacción; `revoke` termina la excepción sin borrarla; consulta por
  `GET /api/tenant/entitlement-overrides` y `…/history` (solo `OWNER`) y por el CLI.
- Runbook: `docs/operations/entitlement_overrides_runbook.md`.

**Decisión del dueño (2026-11-18): la excepción se concede por CLI interno, no por HTTP.** El
backend no tiene rol de plataforma (`UserRole` = OWNER/MANAGER/CASHIER/WAITER), así que un
endpoint de escritura protegido por `OWNER` dejaría que cada cliente se auto-otorgue el plan
Pro. Sin rol nuevo: `src/scripts/entitlement-override.ts` + `npm run entitlements:override`, y
el tenant solo lee. Una prueba estructural falla si alguien agrega una ruta de escritura a ese
controlador.

Propiedades que quedaron garantizadas (no por convención, por construcción):

- Ninguna excepción puede apuntar a una clave de núcleo: el registro la rechaza antes de
  escribir (`OVERRIDE_TARGET_NOT_GATEABLE`), igual que el resolver.
- Una excepción **no puede dejar el snapshot irresoluble**, ni al concederla ni al revocarla: antes
  de confirmar, el servicio resuelve el snapshot con el cambio puesto dentro de la misma
  transacción y revierte si falla (`OVERRIDE_WOULD_BREAK_SNAPSHOT`). Cubre los dos sentidos: por
  conceder `promotions.convenio` sin `promotions`, y por **revocar** `promotions` cuando el
  convenio sigue concedido por excepción — el caso que encontró la verificación independiente y
  que la primera versión no cubría.
- Una sola excepción vigente por clave, y cada cambio con su propio motivo: conceder sobre una
  vigente exige revocarla (`OVERRIDE_ALREADY_ACTIVE`).
- `actor`, `reason` y `expires_at` (futura) obligatorios también al revocar.

Evidencia: unit de reglas 9/9, DB 8/8 (incluye la reversión completa del snapshot irresoluble en
los dos sentidos y el aislamiento RLS con rol `NOSUPERUSER NOBYPASSRLS`), CLI 11/11, controlador
7/7 con la aserción de "ninguna ruta de escritura" a nivel de prototipo y de fuentes del módulo;
`tsc` 0 y ESLint limpio en los archivos tocados.

Corte de la entrega: 4 commits, ~2.100 líneas (≈900 de producción, ≈960 de prueba, ≈260 de
documentación). No se parte en piezas menores porque la regla, su prueba con base real y su
control de acceso describen un mismo comportamiento; separarlas dejaría el servicio sin la
prueba que lo sostiene.

### ENT-07 — Servicio de suscripciones (cambio de plan y add-ons)

Status: done.

Motivo: hoy cambiar de plan es SQL a mano (runbook §4). Un cambio de plan es una decisión
comercial que mueve lo que el cliente puede usar; escribirla a mano significa que el rastro
depende de que la persona recuerde insertar la fila de auditoría en la misma transacción.

Specs:

- **S10.** El cambio de plan escribe la suscripción nueva y su rastro
  (`change_type = 'plan'`, `previous_value_json` = contrato anterior, `new_value_json` = nueva
  forma) **en la misma transacción**: no existe cambio sin rastro, igual que en las excepciones.
- **S11.** Un plan fuera del catálogo (`findPlan`) o un add-on desconocido (`ADD_ON_CODES_LIST`)
  se rechazan con código estable antes de escribir nada. Los estados válidos son `active`,
  `suspended` y `expired`, y solo esos.
- **S12.** `actor` y `reason` son obligatorios (catálogo §6.3), también aquí.
- **S13.** Post-condición simétrica a las excepciones: antes de confirmar se resuelve el snapshot
  resultante y se revierte si queda irresoluble (`SUBSCRIPTION_WOULD_BREAK_SNAPSHOT`). Un cambio
  de plan nunca puede dejar al tenant sin entitlements servibles.
- **S14.** La entrega es interna (CLI `npm run entitlements:subscription`), igual que las
  excepciones: el backend no tiene rol de plataforma y el tenant no se auto-asigna planes. Sin
  endpoint de escritura, y una prueba estructural falla si aparece una ruta de escritura.
- **S15.** El runbook §4 deja de ser SQL manual y usa el comando; el rastro de plan se consulta
  con `--list`.

Evidencia: `TenantSubscriptionService` (`changePlan`, `list`) con validación pura exportada
(`normalizePlanChange`, códigos `PLAN_CODE_NOT_REGISTERED`, `ADD_ON_NOT_REGISTERED`,
`SUBSCRIPTION_STATUS_INVALID`, `SUBSCRIPTION_ACTOR_REQUIRED`, `SUBSCRIPTION_REASON_REQUIRED`,
`SUBSCRIPTION_WOULD_BREAK_SNAPSHOT`). Un cambio de plan **supersede**: inserta la fila nueva y
nunca edita ni borra la anterior. La post-condición resuelve el snapshot en `max(now, starts_at)`,
así una renovación con fecha futura se valida en el momento en que tomará efecto.
CLI `npm run entitlements:subscription` (`--plan`, `--status`, `--add-ons`, `--support-tier`,
`--starts-at`, `--ends-at`, `--actor`, `--reason`, `--list`). Runbook §4 ya no es SQL manual.

Pruebas: unit 23/23 (11 del gate puro, 12 del CLI, incluida la que prueba que ninguna fila de la
matriz de planes concede ni quita una clave de núcleo), DB 7/7 (transacción única, valor anterior
capturado, plan y add-on desconocidos rechazados sin escribir, post-condición que revierte, y
aislamiento RLS con `set_config('app.tenant_id')` previo a mutar), `tsc` 0, ESLint limpio en los
archivos tocados.

Dos riesgos que el revisor debe mirar, declarados y no escondidos:

1. `contract_price`, `currency` y `notes` no son banderas del CLI: la fila nueva usa los valores
   por defecto del esquema. Arrastrar el precio anterior sería una decisión de política comercial
   que no corresponde inventar en código; hoy el precio se fija aparte.
2. Un `starts_at` anterior al contrato vigente hace que la resolución siga eligiendo la fila
   vieja: el operador ve "aplicado" algo que el snapshot ignora. No está bloqueado; la
   post-condición valida lo que realmente gana, así que no se rompe nada, pero confunde. Candidato
   a guard si aparece en operación.

Allowed edit surfaces (el escritor no toca nada fuera de esto):

```
apps/admin_backend/src/modules/entitlements/tenant-subscription.service.ts
apps/admin_backend/src/modules/entitlements/tenant-subscription.service.spec.ts
apps/admin_backend/src/modules/entitlements/tenant-subscription.db.spec.ts
apps/admin_backend/src/modules/entitlements/entitlements.module.ts
apps/admin_backend/src/scripts/entitlement-subscription.ts
apps/admin_backend/src/scripts/entitlement-subscription-args.ts
apps/admin_backend/src/scripts/entitlement-subscription-args.spec.ts
apps/admin_backend/package.json
docs/operations/entitlement_overrides_runbook.md
```

### Deuda declarada por ENT-06

- **Cambiar de plan sigue siendo SQL documentado** (runbook §4): falta un
  `TenantSubscriptionService` con la misma forma que las excepciones (validación + rastro en una
  transacción) y su comando. Mientras no exista, la fila de historial de `change_type = 'plan'`
  se escribe a mano.
- El dashboard no consume `GET …/entitlement-overrides`: el cliente no ve sus excepciones en UI.
- No hay tenant SOHO en el código (SOHO aparece como plantilla y catálogo), así que el alta de
  SOHO con precio fundador es un paso operativo por entorno (runbook §6), no una migración. **No
  existe una clave `legacy.full`**: el runbook lo decía y era inexistente; la forma ejecutable es
  una excepción por clave registrada que falte.
- ~~El rastro auditable no es inmutable en la base.~~ **Resuelto**: la migración
  `1810600000000-HardenEntitlementChangeHistory` instala un trigger que rechaza `UPDATE`, `DELETE`
  y `TRUNCATE` con `restrict_violation` (idempotente y reversible), y
  `entitlement-audit-immutability.db.spec.ts` lo prueba bajo rol restringido con el tenant
  ligado — el caso que antes era un no-op silencioso por RLS. El comentario de la entidad se
  corrigió: afirmaba que no existían políticas de `UPDATE`/`DELETE`, y sí existen; lo que hace
  verdadera la inmutabilidad es el trigger.
- Una sola excepción vigente por clave se garantiza con una consulta dentro de la transacción, no
  con una restricción de base: dos operadores concurrentes podrían conceder la misma clave a la
  vez. Bajo riesgo mientras el único escritor sea el CLI, pero es un invariante sin dientes en la
  base.

## Criterios de aceptación

- [x] Fuente única de verdad de plan y capacidades por tenant, con RLS probado.
- [x] POS lee el snapshot offline y sigue vendiendo si está vencido o ausente.
- [x] Una capacidad premium no comprada no se activa por UI ni por llamada directa.
- [x] Override auditado con actor, motivo y expiración.
- [ ] SOHO conserva sus funciones y su precio fundador. — **pendiente operativo**: no existe un
  tenant SOHO en el código; el alta se hace por entorno con el runbook §6 (OPERACION a precio
  fundador + excepción `legacy.full` auditada por CLI).
- [x] `PRO` habilita ambos packs, dos terminales incluidas y reportes de margen; `OPERACION` un pack; `ESENCIAL` ninguno sin add-on. Los add-ons de terminal y cuenta extra se cobran sin tope duro.
- [x] No hay fallback silencioso a "todas las capacidades".
- [x] Pruebas unitarias, de integración con base real y de contrato pasan; `tsc` y lint limpios.

## Checks

- `npm test` en `apps/admin_backend` con `maxWorkers: 2`.
- Pruebas de base real y RLS.
- `npm run test:e2e` cuando aplique.
- `flutter test --concurrency=2` en POS.
- `flutter analyze`.
- Prueba manual de upgrade/downgrade y de venta offline con snapshot vencido.

## Evidencia

Especificación de capacidades escrita y validada contra el código: inventario de funciones
premium con evidencia `path:line` en `docs/plans/entitlements/catalogo_capacidades_v1.md` §3.
Hallazgos que cambian el plan de implementación:

- `support.priority` **no existe** en código: se modela como `support_tier` del contrato, no
  como capacidad gateable.
- No hay cuota de terminales: `limits.terminals` se apoya en el fleet existente
  (`device-sync-token.controller.ts:35`), pero el conteo y el enforcement son trabajo nuevo.
- `TenantCapabilityService` (`identity/controllers/capability.controller.ts:40`) versiona
  contratos de auditoría; **no** es el catálogo de planes y no se reutiliza.
- Proveedores tiene tabla y RLS pero no CRUD propio; combos y menú QR están a medias. No se
  gatean hasta que la función exista (§8 del catálogo).

### Evidencia de ENT-01 (`3bcc032f`)

| Check | Comando | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | exit 0 |
| Lint | `npx eslint src/modules/entitlements src/migrations/1810400000000-CreateEntitlementsTables.ts` | exit 0 |
| Unitario | `npx jest src/modules/entitlements --runInBand` | 13/13 |
| Regresión RLS | `npx jest src/core/database/tenant-rls-coverage --runInBand` | 35/35 (el manifest editado parsea limpio) |
| Base real | `npm run test:db -- src/modules/entitlements` | 7/7 |

Nota de entorno: el worktree no tenía `node_modules`; se verificó con un symlink temporal al
`node_modules` del checkout principal (lockfiles byte-idénticos) y se eliminó después. No se
corrió la suite completa.

Dos correcciones durante la verificación, ambas en el spec nuevo (no en la migración): una
anotación `readonly` para que compile `includes()`, y el patrón *unbound* del spec de RLS —
`RESET app.tenant_id` sobre un GUC propio deja cadena vacía y `''::uuid` lanza error de cast en
lugar de denegar, así que la rama sin bind no toca el GUC y hace `SET ROLE` al rol restringido.
Es un matiz del helper RLS del repo, no de esta migración.

### Evidencia de ENT-02

| Check | Comando | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | exit 0 |
| Lint | `npx eslint src/modules/entitlements` | exit 0 |
| Unitario | `npx jest src/modules/entitlements --runInBand` | 34/34 (13 de ENT-01 + 21 nuevos) |
| Regresión RLS | `npx jest src/core/database/tenant-rls-coverage --runInBand` | 35/35 |
| Base real | `npm run test:db -- src/modules/entitlements` | 13/13 (7 de ENT-01 + 6 nuevos) |

Dos correcciones durante la verificación: un estrechamiento de tipo en el lector de overrides
de límite (`unknown` → `number | null`) y el formato que exige prettier en el spec nuevo. La
regla de negocio que el catálogo no fijaba quedó registrada en §6.1 antes de codificarla.

### Catálogo v1.1 — cierre de huecos de pricing

Auditoría con evidencia antes de gatear nada. Cuatro huecos reales, no supuestos:

| Hueco | Qué era | Corrección |
|---|---|---|
| H1 | `promotions`, `loyalty` y `reports.margins` se gateaban sin línea de precio propia | Bundles Marketing US$19, Inteligencia US$19 y (convenios) US$15 |
| H2 | `convenio` B2B existía y no estaba en el catálogo: se regalaba dentro de `promotions` | Clave propia `promotions.convenio` con requisito `promotions` |
| H3 | El costo por plato lo reclamaban **dos** claves (`inventory.cooking` y `reports.margins`) | Se queda en Cocina; `reports.margins` queda en valorización y COGS de inventario |
| H4 | `loyalty-sync` (`POST point-transactions/sync`) parecía gateable | Nunca se decora: es flujo transaccional del POS, familia del camino fiscal |

Decisión del dueño: **bundles** (no venta a la carta ni planes cerrados), con las tres líneas a
US$19, US$19 y US$15. Verificado que la escalera no se rompe: Operación+Cocina+Inteligencia = 137
< Pro 149; Esencial+Marketing = 68 < Operación 89.

Implementación: `promotions.convenio` en el registro con `requires`, efecto de add-on
multi-clave, `CAPABILITY_PREREQUISITE_MISSING` en el resolver, y migración
`1810500000000-SeedConvenioCapability` para las bases que ya corrieron ENT-01.

## Log

- **L1 (solicitud del usuario):** continuar con #984 tras diferir la entrega de #983 por falta
  del equipo físico. Primero pedir un recordatorio del alcance del issue.
- **L2:** el usuario elige *especificación de capacidades primero, luego ENT-01*: congelar el
  registro de claves y el mapeo plan→capacidad antes de escribir tablas y migración.
- **L3 (hallazgo de recon):** la autoridad comercial se contradice sobre `clientes` (fila de
  `OPERACION` vs matriz) y solapa kardex con kardex valorizado. Ambas se resuelven en el
  catálogo §10 y esperan confirmación antes de ENT-01, porque la migración las codifica.
- **L4 (hallazgo de recon):** el repo no tiene plan, suscripción ni entitlement: es verde. Pero
  sí tiene un `TenantCapabilityService` de contratos de auditoría que **no** debe confundirse
  con entitlements.
- **L12 (ENT-05 entregado, `79ba10d3` + `a5e542cb`):** gating de UI en las dos apps, compuesto con
  el RBAC existente y con el mensaje contractual único. POS 15/15 pruebas propias; dashboard con
  `tsc` 0, oxlint sin errores y 1911/1911 en la suite completa. Con esto los seis slices del feature
  quedan entregados salvo ENT-06 (overrides y operación).
- **L11 (ENT-04 entregado, `1e9f26ef` + `5269e257` + `2999a6c4`):** el POS cachea el snapshot con
  TTL y un rechazo de plan deja de confundirse con una sesión caída. Un dominio bloqueado por
  plan retiene sus filas y se libera solo ante un cambio real del plan. Evidencia: 601/601 en
  `test/data/services`, 35/35 en las suites nuevas, `flutter analyze` limpio, y 95/95 + 1541/1541
  del lado backend.
- **L10 (ENT-03b entregado, `bcb8093e` + `cb882c89`):** cuotas de asientos con ventana de gracia.
  Decisión del dueño: cuenta el equipo activo; la baja libera al instante; el que murió se libera
  solo a los 30 días. Corrección del padre en la revisión: el conteo excluye el asiento del mismo
  intento, para no romper la idempotencia del aprovisionamiento. 1600/1600 unitarias, 19/19 con
  base real, 35/35 cobertura.
- **L9 (ENT-03 entregado, `34beadb8` + `71135bbd`):** guard y decorador aplicados a todos los
  endpoints premium, con red de regresión que protege el camino fiscal y de sincronización.
  Corrección del padre durante la revisión: el chequeo de convenios pasa a decidir por el tipo
  efectivo, porque un PATCH sin `type` dejaba editar un convenio existente sin el bundle.
  726/726 en promotions+loyalty+inventory, 103/103 en entitlements+promotions, 35/35 de cobertura.
- **L8 (catálogo v1.1):** auditoría de huecos de pricing y cierre con tres bundles y la clave
  `promotions.convenio`. 41 pruebas unitarias y 14 con base real verdes; la migración de semilla
  es idempotente y reversible.
- **L7 (ENT-02 entregado, `fb240ac1` + `43bd2528`):** resolución de §6 como función pura y `GET
  /api/tenant/entitlements` con contrato v1 de nueve campos y TTL de 24 h. 40 pruebas verdes (21
  unitarias nuevas, 6 con base real y 13 heredadas entre unitarias y de base). El catálogo se
  amplió con §6.1 para fijar qué límites ve un plan suspendido y qué suelo tiene `sin_plan`.
- **L6 (ENT-01 entregado):** registro, entidades, migración con RLS y seed, con 55 pruebas
  verdes (13 unitarias + 7 con base real + 35 de regresión de cobertura RLS) y `tsc`/`eslint`
  limpios. Commit `3bcc032f`.
- **L5 (decisiones del dueño del producto, 2026-11-17):** (1) `core.customers` es núcleo;
  (2) kardex de movimientos en `inventory.retail` y valorizado/COGS/márgenes en
  `reports.margins`; (3) `limits.terminals` bloquea el enrolamiento de un terminal nuevo pero
  nunca revoca ni bloquea la venta de un terminal en operación. Se codifican en ENT-01.

## Riesgos
- Bloquear ventas por un plan vencido.
- Snapshot viejo tras un upgrade.
- Deriva entre contrato comercial y catálogo técnico.
- Complejidad prematura.
- Exposición de datos entre tenants.

## Siguiente paso

Aprobar el issue #984 y ejecutar ENT-01 y ENT-02 en paralelo con el adaptador ESC/POS; ENT-04 y ENT-05 no deben empezar hasta que el contrato de capacidades esté congelado.
