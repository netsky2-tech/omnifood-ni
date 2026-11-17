# Entitlements por plan y capacidades por tenant

- **Issue:** [#984](https://github.com/netsky2-tech/omnifood-ni/issues/984)
- **Authority:** `docs/finance/estrategia_precios_nhilos_pos_v1.md`; planes Esencial, Operación y Pro con packs Retail y Cocina.
- **Estado:** especificación de capacidades congelada (`docs/plans/entitlements/catalogo_capacidades_v1.md`),
  tres decisiones pendientes de confirmación; implementación sin empezar.
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

Status: pending.

- Crear `plan_capability`, `tenant_subscription`, `tenant_entitlement_override` y auditoría.
- Definir claves de capacidad en un registro de código.
- RLS, índices y migración inicial.
- Pruebas de aislamiento y de migración de SOHO.

### ENT-02 — Servicio y API de entitlements

Status: pending.

- Resolver capacidades efectivas: plan + add-ons + overrides + expiración.
- Endpoint versionado y contrato estable.
- Pruebas de contrato y de autorización.

### ENT-03 — Guards de backend

Status: pending.

- `CapabilitiesGuard` y decorador.
- Aplicar solo a capacidades premium, nunca al camino fiscal.
- Pruebas de permitido/denegado y de tenant cruzado.

### ENT-04 — Snapshot offline del POS

Status: pending.

- Persistir snapshot en SQLite con versión y TTL.
- Refrescar al sincronizar.
- Probar snapshot ausente, vencido y corrupto.
- Probar que la venta sigue funcionando en todos esos casos.

### ENT-05 — Dashboard y POS UI

Status: pending.

- `useCapabilities()` y `CapabilityGate`.
- Mostrar plan vigente y límites.
- Mensajes de upgrade claros.
- Pruebas de renderizado y accesibilidad.

### ENT-06 — Overrides y operación

Status: pending.

- Alta de override con actor, motivo y expiración.
- Auditoría y consulta.
- Runbook para cambiar plan, aplicar add-on y corregir un mapeo.

## Criterios de aceptación

- [ ] Fuente única de verdad de plan y capacidades por tenant, con RLS probado.
- [ ] POS lee el snapshot offline y sigue vendiendo si está vencido o ausente.
- [ ] Una capacidad premium no comprada no se activa por UI ni por llamada directa.
- [ ] Override auditado con actor, motivo y expiración.
- [ ] SOHO conserva sus funciones y su precio fundador.
- [ ] `PRO` habilita ambos packs, dos terminales incluidas y reportes de margen; `OPERACION` un pack; `ESENCIAL` ninguno sin add-on. Los add-ons de terminal y cuenta extra se cobran sin tope duro.
- [ ] No hay fallback silencioso a "todas las capacidades".
- [ ] Pruebas unitarias, de integración con base real y de contrato pasan; `tsc` y lint limpios.

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

## Riesgos
- Bloquear ventas por un plan vencido.
- Snapshot viejo tras un upgrade.
- Deriva entre contrato comercial y catálogo técnico.
- Complejidad prematura.
- Exposición de datos entre tenants.

## Siguiente paso

Aprobar el issue #984 y ejecutar ENT-01 y ENT-02 en paralelo con el adaptador ESC/POS; ENT-04 y ENT-05 no deben empezar hasta que el contrato de capacidades esté congelado.
