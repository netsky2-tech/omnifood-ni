# Runbook: planes, capacidades y excepciones

Guía de operación de los entitlements por tenant (issue #984). Está escrita para quien
atiende a un cliente: soporte, implementación o el dueño del producto.

> **Regla de oro.** El plan **nunca** bloquea la venta, la factura, la anulación, la
> reimpresión, el cierre de caja ni la sincronización del POS. Si alguna vez un cambio de
> plan amenaza con impedir cobrar, el cambio está mal hecho: esas claves son de núcleo y no
> admiten excepción ni gating (catálogo §7).

## 1. Qué existe y qué no

| Pieza | Dónde vive | Quién la toca |
|---|---|---|
| Catálogo de planes y claves | `apps/admin_backend/src/modules/entitlements/capability-registry.ts` | Ingeniería (código + migración) |
| Contrato del tenant | tabla `tenant_subscription` | Operación, **solo** por CLI (§4) |
| Excepciones auditadas | tabla `tenant_entitlement_override` | Operación, **solo** por CLI (§3) |
| Rastro de cambios | tabla `tenant_entitlement_change_history` (solo-lectura) | Nadie escribe a mano |
| Consulta para el cliente | `GET /api/tenant/entitlement-overrides` y `…/history` (solo `OWNER`) | El cliente |

No hay interfaz de escritura en la API para excepciones, y es deliberado: el backend no
tiene un rol de plataforma, así que un endpoint protegido por `OWNER` dejaría que cada
cliente se auto-otorgue el plan más alto. La escritura vive en el servidor, con un comando
que exige nombre y motivo.

## 2. Cómo se resuelve lo que un tenant puede usar

```
efectivas = base(plan) ∪ add-ons(activos) ∪ overrides(vigentes)
```

Las excepciones **ganan** sobre el plan y sobre los add-ons, en los dos sentidos: pueden
conceder algo que el plan no incluye y pueden quitar algo que el plan sí incluye. Al vencer
dejan de aplicar solas, **sin borrar el registro**.

## 3. Conceder y revocar una excepción

El comando corre en el servidor, dentro de `apps/admin_backend`:

```bash
# Conceder una capacidad (tipo flag)
npm run entitlements:override -- \
  --tenant=<uuid-del-tenant> \
  --key=inventory.retail \
  --included=true \
  --expires=2026-12-31T23:59:59Z \
  --actor=soporte@nhilos.com \
  --reason="Piloto autorizado por el dueño el 18/11; vence al cerrar el trimestre"

# Conceder una cuota (none = ilimitada)
npm run entitlements:override -- \
  --tenant=<uuid> --key=limits.terminals --limit=3 \
  --expires=2026-12-31T23:59:59Z --actor=soporte@nhilos.com --reason="..."

# Consultar
npm run entitlements:override -- --tenant=<uuid> --list
npm run entitlements:override -- --tenant=<uuid> --history --limit=20

# Revocar (por id o por clave)
npm run entitlements:override -- \
  --tenant=<uuid> --revoke=inventory.retail \
  --actor=soporte@nhilos.com --reason="El cliente canceló el piloto"
```

Qué garantiza el comando, sin que haya que recordarlo:

- **`actor`, `reason` y `expires` son obligatorios.** Una excepción sin rastro no se escribe.
- **Solo claves gateables.** `core.sales`, `core.fiscal_invoice`, `core.cash_shifts` y el resto
  del núcleo se rechazan con `OVERRIDE_TARGET_NOT_GATEABLE`.
- **El valor tiene la forma de su tipo**: `{"included": boolean}` para una capacidad,
  `{"limit": entero ≥ 0 | null}` para una cuota. Cualquier otra cosa: `OVERRIDE_VALUE_INVALID`.
- **Una excepción vigente por clave.** Si ya hay una, se rechaza con `OVERRIDE_ALREADY_ACTIVE`:
  revoque la anterior primero, así cada cambio conserva su propio motivo.
- **La excepción no puede romper el contrato.** Antes de confirmar, el comando resuelve el
  snapshot del tenant con la excepción puesta; si la resolución falla (por ejemplo, conceder
  `promotions.convenio` a un plan sin `promotions`), se revierte todo y no se escribe nada
  (`OVERRIDE_WOULD_BREAK_SNAPSHOT`). Es la garantía de que soporte no puede dejar a un
  cliente con los entitlements irresolubles.
- **Conceder y auditar es una sola transacción**: no existe la excepción sin su fila de
  historial.

Errores y qué significan:

| Código | Qué hacer |
|---|---|
| `CAPABILITY_KEY_NOT_REGISTERED` | La clave no existe en el catálogo: revisar `capability-registry.ts` |
| `OVERRIDE_TARGET_NOT_GATEABLE` | Es una clave de núcleo: no se concede ni se quita |
| `OVERRIDE_VALUE_INVALID` | El valor no corresponde al tipo de la clave |
| `OVERRIDE_ALREADY_ACTIVE` | Revocar la vigente antes de conceder la nueva |
| `OVERRIDE_NOT_ACTIVE` | No hay excepción vigente que revocar con ese id o clave |
| `OVERRIDE_WOULD_BREAK_SNAPSHOT` | Falta el prerrequisito: conceder primero `promotions` |
| `OVERRIDE_ACTOR_REQUIRED` / `OVERRIDE_REASON_REQUIRED` | Faltó nombre o motivo |
| `OVERRIDE_EXPIRATION_REQUIRED` | La expiración no es futura o no es una fecha válida |

## 4. Cambiar de plan o aplicar un add-on

Un cambio de plan se hace **siempre** con el comando, nunca a mano. El comando escribe la
suscripción nueva, su rastro de auditoría y verifica el snapshot resultante **en una sola
transacción**: no existe cambio de plan sin rastro, y un contrato que dejaría los entitlements
irresolubles se revierte entero antes de confirmar.

```bash
# Subir de plan, con add-on y vigencia
npm run entitlements:subscription -- \
  --tenant=<uuid-del-tenant> \
  --plan=OPERACION \
  --add-ons=pack.retail \
  --actor=soporte@nhilos.com \
  --reason="Upgrade solicitado por el cliente; contrato firmado 2026-11-25"

# Suspendir sin borrar el contrato (mora, corte por impago)
npm run entitlements:subscription -- \
  --tenant=<uuid> --plan=OPERACION --status=suspended \
  --actor=soporte@nhilos.com --reason="Mora de dos ciclos; se suspende sin borrar el contrato"

# Renovación con fin de vigencia y nivel de soporte
npm run entitlements:subscription -- \
  --tenant=<uuid> --plan=PRO --support-tier=priority \
  --starts-at=2026-12-01T00:00:00Z --ends-at=2027-11-30T23:59:59Z \
  --actor=soporte@nhilos.com --reason="Renovación anual firmada"

# Consultar el rastro de cambios de plan (la última entrada es el contrato vigente)
npm run entitlements:subscription -- --tenant=<uuid> --list
```

Qué garantiza el comando, sin que haya que recordarlo:

- **`actor` y `reason` son obligatorios.** Un cambio de plan sin rastro no se escribe
  (`SUBSCRIPTION_ACTOR_REQUIRED` / `SUBSCRIPTION_REASON_REQUIRED`).
- **Solo planes del catálogo.** `ESENCIAL`, `OPERACION` y `PRO`; `ENTERPRISE` se cotiza a mano
  y se rechaza con `PLAN_CODE_NOT_REGISTERED`. Un add-on desconocido se rechaza con
  `ADD_ON_NOT_REGISTERED` antes de escribir nada.
- **Estados cerrados.** `--status` acepta `active`, `suspended` y `expired`, y solo esos
  (`SUBSCRIPTION_STATUS_INVALID`).
- **La auditoría la escribe el servicio, no usted.** La fila de
  `tenant_entitlement_change_history` (`change_type = 'plan'`, `subscription_id`, el contrato
  anterior en `previous_value_json` y la forma nueva en `new_value_json`) se inserta en la
  misma transacción que la suscripción. No la agregue a mano jamás.
- **El cambio no puede romper el snapshot.** Antes de confirmar, el comando resuelve los
  entitlements del tenant con el contrato puesto; si la resolución falla (por ejemplo,
  comprar `bundle.convenio` sin `promotions`), se revierte todo y no se escribe nada
  (`SUBSCRIPTION_WOULD_BREAK_SNAPSHOT`).

Errores y qué significan:

| Código | Qué hacer |
|---|---|
| `PLAN_CODE_NOT_REGISTERED` | El plan no está en el catálogo automático: revisar `capability-registry.ts` |
| `ADD_ON_NOT_REGISTERED` | El código de add-on no existe: revisar el catálogo §5 |
| `SUBSCRIPTION_STATUS_INVALID` | Solo `active`, `suspended` o `expired` |
| `SUBSCRIPTION_SUPPORT_TIER_INVALID` | Solo `standard` o `priority` |
| `SUBSCRIPTION_STARTS_AT_INVALID` / `SUBSCRIPTION_ENDS_AT_INVALID` | La fecha no es un instante válido |
| `SUBSCRIPTION_ACTOR_REQUIRED` / `SUBSCRIPTION_REASON_REQUIRED` | Faltó nombre o motivo |
| `SUBSCRIPTION_WOULD_BREAK_SNAPSHOT` | El contrato dejaría los entitlements irresolubles: revise prerrequisitos (p. ej. `bundle.convenio` requiere `promotions`) |

Reglas:

- **No se edita una migración aplicada** para cambiar un plan: los planes son datos del
  tenant, no esquema.
- **Una baja no se hace con `DELETE`.** Se marca `status = 'expired'` (o `ends_at` en la
  fecha de corte) con el comando. Un plan vencido conserva las cuotas de hardware y el núcleo:
  el cliente no se queda sin cobrar.
- Los add-ons se cambian en la misma fila (`add_ons`), no agregando planes.
- Después del cambio, el POS del cliente recibe el snapshot actualizado en su próximo sync;
  el snapshot en caché se descarta solo cuando cambia su **contenido**, no al renovarse.

## 5. Corregir un mapeo plan → capacidad

El catálogo `plan_capability` se siembra desde `capability-registry.ts`. **La fuente es el
código**, no la tabla: editar la tabla a mano desincroniza el repositorio de la realidad y el
próximo despliegue lo sobrescribe.

1. Se corrige `capability-registry.ts`.
2. Se agrega una migración idempotente y reversible que ajuste las filas existentes
   (precedente: `1810500000000-SeedConvenioCapability.ts`).
3. Se corre la cobertura de RLS y las pruebas del módulo.

## 6. SOHO fundador (decisión S5)

SOHO no se registra como `ESENCIAL`: se registra como `OPERACION` a precio fundador, y lo que
falte de su operación se concede con excepciones auditadas **clave por clave**, con el CLI del
§3 y fecha de revisión.

**No existe una clave `legacy.full`.** Las excepciones solo se conceden sobre claves registradas
(hoy 18, ver `capability-registry.ts`); una clave inventada se rechaza con
`CAPABILITY_KEY_NOT_REGISTERED`. La forma ejecutable es una excepción por clave faltante, porque
solo puede haber una vigente por clave:

```bash
for key in inventory.retail inventory.cooking promotions loyalty reports.margins; do
  npm run entitlements:override -- \
    --tenant=<uuid> --key=$key --included=true \
    --expires=2027-01-31T23:59:59Z \
    --actor=soporte@nhilos.com \
    --reason="SOHO fundador (S5): precio fundador con funciones completas hasta la revisión de enero"
done
```

No se edita la tabla de overrides a mano, y no se concede nada que el cliente no haya acordado:
el motivo de cada excepción es lo que se lee en una auditoría.

## 7. Provisión de un tenant nuevo con plan (ENT-08)

Un tenant nuevo se crea **operable en un solo comando**: el mismo `npm run provision` crea el
tenant, su owner, los catálogos por defecto **y su suscripción auditada**, escrita por
`TenantSubscriptionService` — el mismo camino del §4, nunca SQL suelto.

```bash
# Alta estándar de la etapa fundador: PRO por defecto, soporte y add-ons del plan
npm run provision

# Alta con plan explícito, add-ons y nivel de soporte
npm run provision -- --plan=OPERACION --add-ons=pack.retail --support-tier=standard

# Sin add-ons (PRO ya incluye ambos packs)
npm run provision -- --plan=PRO
```

| Bandera | Valores | Predeterminado |
|---|---|---|
| `--plan=<código>` | `ESENCIAL`, `OPERACION`, `PRO` | `PRO` mientras dure la etapa fundador |
| `--support-tier=<nivel>` | `standard`, `priority` | el nivel del plan elegido (PRO → `priority`) |
| `--add-ons=a,b` | códigos del catálogo §5, separados por coma | ninguno |

Qué garantiza el comando:

- **Valida ANTES de crear nada.** Un plan o add-on inválido se rechaza **antes** de abrir la
  base de datos o hacer una sola pregunta: el proceso sale con código 1 y un código estable
  (`PLAN_CODE_NOT_REGISTERED`, `ADD_ON_NOT_REGISTERED`, `SUBSCRIPTION_SUPPORT_TIER_INVALID`,
  `PROVISION_FLAG_NOT_RECOGNIZED`, `PROVISION_ADD_ON_LIST_EMPTY_SEGMENT`). No queda jamás un
  tenant a medio provisionar por un error de escritura de la bandera.
- **La suscripción es auditada.** El actor es el correo del owner recién creado y el motivo
  nombra la provisión; la fila de `tenant_entitlement_change_history` se escribe en la misma
  transacción que la suscripción. Consulte el rastro con el §4 (`--list`).
- **El nivel de soporte por defecto es el del plan**, no un valor fijo: un contrato PRO es de
  soporte `priority` según el catálogo §4; si usted pasa `--support-tier` explícito, manda usted.

## 8. Backfill de clientes existentes (migración 1810700000000)

**Qué hace.** Al desplegar los entitlements, todo tenant sin fila en `tenant_subscription`
queda en `sin_plan` —solo núcleo, suelo de una terminal y dos owners—. Los clientes que hoy
operan perderían compras, recetas, promociones y márgenes de un día para otro. La migración
`1810700000000-BackfillFounderSubscriptions` asigna **PRO** (el plan que da acceso completo,
con su nivel de soporte `priority`) a todo tenant **sin** suscripción, de forma idempotente, y
escribe la fila de rastro de cada alta (`change_type = 'plan'`, contrato anterior nulo,
contrato nuevo, `actor = 'migration:#984-backfill'` y un motivo que explica por qué). Sin
rastro no hay backfill.

**Cómo verificarlo después del despliegue.**

```bash
# El rastro del tenant: la última entrada 'plan' es el contrato vigente
npm run entitlements:subscription -- --tenant=<uuid> --list

# Resuelve el snapshot del tenant (mismo camino que el POS)
#   GET /api/tenant/entitlements desde el dashboard, o:
```

```sql
-- Qué tenants recibió el backfill
SELECT tenant_id, plan_code, status, support_tier, notes
  FROM tenant_subscription
 WHERE notes = 'backfill:#984';

-- Que el rastro existe y explica el porqué
SELECT occurred_at, change_type, new_value_json, actor, reason
  FROM tenant_entitlement_change_history
 WHERE actor = 'migration:#984-backfill';

-- Que nadie quedó sin contrato (debe devolver cero filas)
SELECT t.id FROM tenants t
 WHERE NOT EXISTS (SELECT 1 FROM tenant_subscription s WHERE s.tenant_id = t.id);
```

**La bajada no borra el rastro, a propósito.** `down` elimina **solo** las suscripciones
marcadas con `notes = 'backfill:#984'` — las suscripciones que usted creó por CLI quedan
intactas — y **deja** todas las filas de `tenant_entitlement_change_history`: el historial es
append-only por trigger (migración `1810600000000`) y borrarlo contradiría la garantía de
auditoría del §3. Las filas de rastro quedan como registro de lo que el backfill hizo.

**Un tenant sin suscripción queda en núcleo a propósito, no por olvido.** Si la consulta de
verificación devolviera un tenant sin contrato después del backfill (por ejemplo, un tenant
creado después de correr la migración), no lo "arregle" con SQL: délo de alta con el §7 o
asígnele plan con el §4. El suelo `sin_plan` (núcleo, 1 terminal, 2 owners) es el
comportamiento deliberado del catálogo §6 para quien nunca compró nada.

## 9. Auditoría: cómo verificar lo que se hizo

```sql
-- Todas las excepciones de un tenant, con quién y por qué
SELECT capability_key, value_json, actor, reason, expires_at,
       (expires_at > now()) AS vigente
  FROM tenant_entitlement_override
 WHERE tenant_id = '<uuid>'
 ORDER BY created_at DESC;

-- Rastro completo de excepciones y cambios de plan
SELECT occurred_at, change_type, capability_key, previous_value_json,
       new_value_json, actor, reason
  FROM tenant_entitlement_change_history
 WHERE tenant_id = '<uuid>'
 ORDER BY occurred_at DESC;

-- Qué puede usar el tenant en este instante (misma consulta que el servicio)
SELECT capability_key, value_json FROM tenant_entitlement_override
 WHERE tenant_id = '<uuid>' AND expires_at > now();
```

Nunca se actualiza ni se borra una fila de `tenant_entitlement_change_history`: el historial es
append-only **por procedimiento** — no existe ruta, comando ni servicio que lo haga, y `grant` y
`revoke` solo insertan.

Y no depende de la buena conducta de nadie: la migración
`1810600000000-HardenEntitlementChangeHistory` instala un trigger que rechaza `UPDATE`, `DELETE`
y `TRUNCATE` con `restrict_violation`. Un intento de reescribir el rastro falla ruidosamente en
vez de afectar filas en silencio. Probado con base real bajo un rol `NOSUPERUSER NOBYPASSRLS`
con el tenant ligado: ver, ve; tocar, no puede.

## 10. Lo que este runbook no resuelve (deuda declarada)

- **Cambiar un plan ya tiene servicio y comando** (§4, ENT-07): el rastro de plan se consulta
  con `--list` y la escritura va por `npm run entitlements:subscription`.
- **No hay UI** para que el cliente vea sus excepciones: la API existe
  (`GET /api/tenant/entitlement-overrides`) y el dashboard todavía no la consume.
