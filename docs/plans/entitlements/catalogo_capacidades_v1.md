# Catálogo de capacidades y entitlements por plan — v1

- **Issue:** [#984](https://github.com/netsky2-tech/omnifood-ni/issues/984)
- **Autoridad comercial:** `docs/finance/estrategia_precios_nhilos_pos_v1.md` §4 (planes, packs, add-ons y matriz de capacidades).
- **Ejecución:** `odd/tasks/plan-entitlements-tenant-capabilities.md` (slices ENT-01 … ENT-06).
- **Estado:** **congelado**. Las tres decisiones estructurales (#1 clientes, #2 kardex, #3 límite de terminales) fueron confirmadas por el dueño del producto el 2026-11-17 y se codifican en ENT-01.

## 1. Propósito

Este documento congela el **registro de claves de capacidad**, su **mapeo a planes y add-ons**, los **límites** y las **reglas de resolución**. Es el contrato entre el negocio y el código: una sola tabla de mapeo, sin `if` por rubro dispersos.

Regla de entrada: **una clave solo entra al catálogo si la función existe en el repositorio**. Una clave que gatea algo inexistente es una promesa de venta falsa. Por eso cada clave lleva su estado real y su evidencia.

## 2. Vocabulario

| Término | Significado |
|---|---|
| `plan_code` | `ESENCIAL`, `OPERACION`, `PRO` (catálogo) y `ENTERPRISE` (fuera del catálogo automático) |
| `capability_key` | Clave estable del catálogo: `<área>.<función>`, en inglés, nunca traducida ni renombrada |
| `add_on` | Compra adicional que suma capacidades o límites (`pack.retail`, `terminal.extra`, …) |
| `entitlement` | Capacidad **efectiva** de un tenant, ya resuelta |
| `override` | Excepción auditada (actor, motivo, expiración) sobre una capacidad o límite |
| **no gated** | Capacidad del núcleo: aparece en la lista efectiva pero **ningún guard puede denegarla** |

> **No confundir con `TenantCapabilityService`.** Ese servicio existente (`apps/admin_backend/src/modules/identity/controllers/capability.controller.ts:40`) versiona *contratos de auditoría* por tenant, con TTL de 24 h y activación OWNER. No es un catálogo de planes. Los entitlements viven en su propio módulo (`entitlements`) y **no** reutilizan esa tabla ni ese servicio.

## 3. Registro de claves

`tipo`: `flag` (booleano) o `limit` (número, `null` = ilimitado). `gated`: si un guard puede denegarla.

### Núcleo — siempre activo, **no gated**

| Clave | Tipo | Estado en código | Evidencia |
|---|---|---|---|
| `core.sales` | flag | EXISTE | `apps/admin_backend/src/modules/sales/controllers/invoices.controller.ts:47` |
| `core.fiscal_invoice` | flag | EXISTE (factura, anulación, nota de crédito, reimpresión) | `admin-invoices.controller.ts:106,119`; reimpresión POS `apps/pos_app/lib/data/repositories/sales/sales_repository_impl.dart:723` |
| `core.cash_shifts` | flag | EXISTE | `sales/controllers/cash-shift.controller.ts:36` |
| `core.catalog` | flag | EXISTE | `catalog` (`catalog.controller.ts:35`), `products` (`product.controller.ts:38`) |
| `core.customers` | flag | EXISTE | módulo `customers` |
| `core.fx_dual` | flag | EXISTE (doble tipo de cambio en el ticket) | `receipt_layout_formatter.dart` (conversión NIO/USD) |
| `core.inventory_simple` | flag | EXISTE (insumos: stock y movimientos) | `insumo.controller.ts:38` |
| `core.reports_essential` | flag | EXISTE | `sales/controllers/reports.controller.ts:89` |
| `core.owner_portal` | flag | EXISTE | `apps/owner_dashboard/src/lib/rbac.ts:36` |
| `core.pos_users` | limit | EXISTE (usuarios POS ilimitados) | matriz de la autoridad §4 |

### Packs — gated

| Clave | Tipo | Estado en código | Evidencia | Cobertura real |
|---|---|---|---|---|
| `inventory.retail` | flag | **EXISTE** con dos huecos | kardex `inventory-reports.controller.ts:126`; compras `inventory-movement.controller.ts:146,193`; conteos `:420`; mermas `:388`; alertas `inventory-reports.controller.ts:149`; CPP `apps/pos_app/lib/domain/services/inventory/kardex_recalculation_engine.dart` | Proveedores: tabla + RLS sí (`1809270000000-EnforceInventoryRls.ts:57`), **sin CRUD propio**. Código de barras: solo campo + búsqueda. Lotes: `lotCode` en movimientos, **sin vencimientos** |
| `inventory.cooking` | flag | **EXISTE** con dos huecos | recetas `recipe.controller.ts:28`; subrecetas `bom-explosion.service.ts`; modificadores `modifiers.controller.ts:40`; producción `inventory-movement.controller.ts:441`; márgenes por plato `inventory-reports.controller.ts:58` | Combos: solo tipo de promoción `COMBO_PACKAGE`. Menú QR: página de dashboard, **sin endpoint que sirva el menú** |

### Transversales — gated

| Clave | Tipo | Estado en código | Evidencia |
|---|---|---|---|
| `promotions` | flag | EXISTE | `promotions.controller.ts:23` |
| `loyalty` | flag | EXISTE | `loyalty.controller.ts:67` |
| `reports.margins` | flag | EXISTE (márgenes por plato, valorización, COGS) | `inventory-reports.controller.ts:58,71` |
| `support.priority` | — | **AUSENTE** | sin coincidencias en `admin_backend/src` |

`support.priority` **no entra como capacidad gateable**: es una obligación de servicio (SLA), no una función del producto. Se modela como atributo del `tenant_subscription` (`support_tier`), visible en el dashboard y auditable, sin guard. Diferido hasta que exista el flujo de soporte.

### Límites — gated por conteo

| Clave | Tipo | Incluido | Add-on | Estado en código |
|---|---|---|---|---|
| `limits.terminals` | limit | Esencial 1 · Operación 1 · Pro 2 | `terminal.extra` (sin tope duro) | **AUSENTE** como cuota; el fleet de terminales sí existe (`identity/controllers/device-sync-token.controller.ts:35`) |
| `limits.owner_accounts` | limit | 2 · 2 · 4 | `owner.account.extra` | EXISTE como usuarios (`identity/controllers/users.controller.ts:38`); no hay cuota |

`terminal.extra` y `owner.account.extra` se agregan al catálogo porque la autoridad los vende; su **enforcement** es ENT-03 y requiere la decisión #3.

## 4. Matriz plan → capacidad

Tomada de la autoridad §4 y de la matriz de capacidades, sin agregar nada:

| Clave | ESENCIAL | OPERACION | PRO |
|---|:---:|:---:|:---:|
| núcleo (`core.*`) | Sí | Sí | Sí |
| `inventory.retail` | Add-on | 1 pack incluido | Sí |
| `inventory.cooking` | Add-on | 1 pack incluido | Sí |
| `promotions` | No | Sí | Sí |
| `loyalty` | No | Sí | Sí |
| `reports.margins` | No | No | Sí |
| `limits.terminals` | 1 | 1 | 2 |
| `limits.owner_accounts` | 2 | 2 | 4 |
| `support_tier` | estándar | estándar | prioritario |

## 5. Precios y reglas de add-on (autoridad §4)

| Concepto | Precio | Regla |
|---|---|---|
| Pack en `ESENCIAL` | +US$39 | Válvula de escape, no ruta de venta: se cotiza primero `OPERACION` |
| Segundo pack en `OPERACION` | +US$29 | El primero va incluido |
| Terminal adicional | US$40/mes (US$29 en Pro; US$35 SOHO) | Sin tope duro por plan |
| Cuenta owner adicional | US$10/mes | Sobre las incluidas |
| Setup de terminal adicional | US$75 (US$50 SOHO) | Enrolamiento |

Reglas de negocio que el catálogo **no** implementa (son de venta, no de código): descuento anual máximo, setup no reembolsable, ofrecer upgrade cuando dos add-ons superan US$30/mes.

## 6. Resolución de capacidades efectivas

```
efectivas = base(plan) ∪ addons(activos) ∪ overrides(vigentes)
```

1. **Plan** aporta sus claves y límites incluidos. `ESENCIAL` no habilita ningún pack salvo add-on.
2. **Add-ons** suman: `pack.*` enciende la clave del pack; `terminal.extra` y `owner.account.extra` incrementan el límite en 1 cada uno (sin tope duro).
3. **Overrides** ganan sobre plan y add-ons, con `actor`, `motivo` y `expires_at` obligatorios; al vencer dejan de aplicar sin borrar el registro.
4. **Sin suscripción**: el tenant recibe el **núcleo** y un estado explícito `sin_plan` en el snapshot. Nunca "todas las capacidades".
5. **Suscripción vencida o suspendida**: se conserva el núcleo; las premium caen.
6. **Snapshot ausente, vencido o corrupto en el POS**: se conserva el núcleo; las premium se consideran no disponibles. La venta, la factura, la anulación, la reimpresión y el cierre de caja **no dependen de ninguna de estas reglas**.

## 7. Claves que ningún guard puede tocar

Lista cerrada, y el motivo de cada una:

- `core.sales`, `core.fiscal_invoice`, `core.cash_shifts` — **DGI y cobro**: ninguna regla de plan puede impedir emitir, anular, reimprimir ni cerrar caja (restricción del issue y `AGENTS.md`).
- `core.customers` — el nombre y RUC del cliente se imprimen en la factura fiscal; gatearlo tocaría el camino fiscal.
- `core.catalog`, `core.inventory_simple` — sin catálogo y sin stock no hay venta válida.
- `core.fx_dual` — el ticket bimoneda es formato de impresión fiscal vigente.

Cualquier clave nueva que se proponga como gateable debe justificar por qué **no** está en esta lista.

## 8. Claves diferidas (no se gatean todavía)

| Clave o función | Motivo | Qué falta |
|---|---|---|
| `support.priority` | Ausente en código; es SLA, no función | Flujo de soporte |
| Vencimientos de lote | Solo `lotCode` en movimientos | Registro y reporte de vencimiento |
| Combos administrables | Hoy solo tipo de promoción | Módulo de combos |
| Menú QR servido | Página de dashboard sin endpoint | Endpoint público del menú |
| CRUD de proveedores | Tabla y RLS sí, sin controlador | Controlador `suppliers` |

Regla: la clave se agrega al catálogo **cuando la función existe y se puede demostrar**, no antes.

## 9. Contrato del snapshot (lo consumen ENT-02 y ENT-04)

```json
{
  "version": 1,
  "planCode": "OPERACION",
  "status": "active",
  "supportTier": "standard",
  "capabilities": ["core.sales", "core.fiscal_invoice", "inventory.retail"],
  "limits": { "limits.terminals": 1, "limits.owner_accounts": 2 },
  "addOns": ["pack.retail"],
  "issuedAt": "2026-11-17T00:00:00Z",
  "expiresAt": "2026-11-18T00:00:00Z"
}
```

- `version` permite evolucionar el contrato sin romper POS desplegados.
- `expiresAt` es el TTL del snapshot (**propuesta: 24 h**, alineado con el TTL que ya usa `TenantCapabilityService`); se refresca al sincronizar.
- `limits` con valor `null` significa ilimitado.
- El POS guarda el snapshot en SQLite y **nunca** decide la venta por él.

## 10. Decisiones confirmadas

### ✔ #1 — `core.customers` es núcleo, no premium

La autoridad se contradice: la fila de `OPERACION` en §4 lista "clientes" como agregado del plan, pero la matriz de capacidades los marca "Sí" en los tres planes. **Confirmada: núcleo.** Razón: el nombre y RUC del cliente se imprimen en la factura fiscal; gatearlo convierte una decisión comercial en un riesgo DGI. Un tenant `ESENCIAL` que no puede registrar al cliente no puede emitir la factura que el Estado le exige.

### ✔ #2 — Kardex: movimientos en el pack, valorización en Pro

El issue pone "kardex" en `inventory.retail` y la autoridad pone "kardex valorizado" en `reports.margins` (Pro). **Confirmada:** el **kardex de movimientos** (entradas, salidas, saldos) va con `inventory.retail`; el **kardex valorizado, COGS y márgenes** van con `reports.margins`. Son dos productos distintos: uno dice qué se movió, el otro cuánto costó.

### ✔ #3 — Límite de terminales: bloquear enrolamiento, nunca la venta

`limits.terminals` no existe como cuota en el código; el fleet sí. **Confirmada:** al superar el límite, el backend **rechaza enrolar un terminal nuevo** (mensaje de upgrade), pero un terminal ya enrolado y activo **sigue vendiendo aunque el plan esté vencido o el snapshot falte**. Nunca se revoca un terminal en operación por plan: dejar a un negocio sin facturar es peor que el ingreso no cobrado.

## 11. Fuera de alcance

Pasarela de pagos y cobro recurrente, facturación electrónica DGI, autoservicio de cambio de plan, medición de uso por transacción, motor de reglas genérico, `Enterprise` en el catálogo automático.
