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
| Contrato del tenant | tabla `tenant_subscription` | Operación (SQL documentado, §4) |
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

**Estado actual:** todavía no hay servicio de escritura de suscripciones; un cambio de plan
es una operación de base de datos documentada. Se hace **siempre** con el alta del rastro en
la misma transacción, o el cambio deja de ser auditable:

```sql
BEGIN;
-- 1) El contrato nuevo (la resolución toma la suscripción más reciente ya iniciada).
INSERT INTO tenant_subscription
  (tenant_id, plan_code, status, starts_at, ends_at, add_ons, support_tier)
VALUES ('<uuid>', 'OPERACION', 'active', '2026-12-01T00:00:00Z', NULL,
        '["pack.retail"]'::jsonb, 'standard');

-- 2) El rastro. previous_value_json guarda el plan anterior.
INSERT INTO tenant_entitlement_change_history
  (tenant_id, change_type, subscription_id, capability_key,
   previous_value_json, new_value_json, actor, reason, occurred_at)
VALUES ('<uuid>', 'plan',
        (SELECT id FROM tenant_subscription WHERE tenant_id='<uuid>'
          ORDER BY created_at DESC LIMIT 1),
        NULL,
        '{"plan_code":"ESENCIAL"}'::jsonb,
        '{"plan_code":"OPERACION","add_ons":["pack.retail"],"status":"active"}'::jsonb,
        'soporte@nhilos.com',
        'Upgrade solicitado por el cliente; contrato firmado 2026-11-25',
        now());
COMMIT;
```

Reglas:

- **No se edita una migración aplicada** para cambiar un plan: los planes son datos del
  tenant, no esquema.
- **Una baja no se hace con `DELETE`.** Se marca `status = 'expired'` (o `ends_at` en la
  fecha de corte). Un plan vencido conserva las cuotas de hardware y el núcleo: el cliente
  no se queda sin cobrar.
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

## 7. Auditoría: cómo verificar lo que se hizo

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

## 8. Lo que este runbook no resuelve (deuda declarada)

- **Cambiar un plan no tiene servicio ni interfaz**: es SQL documentado (§4). El siguiente
  paso natural es un `TenantSubscriptionService` con la misma forma que las excepciones
  (validación + rastro en una transacción), y su comando.
- **No hay UI** para que el cliente vea sus excepciones: la API existe
  (`GET /api/tenant/entitlement-overrides`) y el dashboard todavía no la consume.
- El historial de cambios de plan (`change_type = 'plan'`) se escribe a mano mientras no
  exista ese servicio.
