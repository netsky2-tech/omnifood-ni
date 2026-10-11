# Roadmap de ejecución — NhilosMenu Food Park V1

**Estado:** Baseline de implementación aprobado; implementación no iniciada.
**Autoridad de producto:** `docs/PRDs/prd_nhilosmenu_foodpark_v1.md` (APPROVED / AUTHORITATIVE). Este roadmap baja ese contrato a una secuencia de capacidades ordenadas por dependencias. Ninguna decisión marcada **vinculante** en el PRD (D-01…D-20) se reabre aquí.
**Principios heredados:** `AGENTS.md` — offline-first o muerte, cumplimiento DGI (DT 09-2007), aislamiento multi-tenant por `tenant_id`, presupuesto de revisión < 400 líneas por PR.
**Pregunta rectora de diseño:** *¿Cómo funciona esto cuando el WiFi del Food Park se cae?* La caja sigue vendiendo (NFR-04, AC-20) y el menú público sirve su último snapshot con advertencia de frescura (D-17, AC-18/AC-19).

## Ruta rápida

1. **Contrato:** PRD sección 1 (D-01…D-20) y sección 22 (AC-01…AC-33).
2. **Secuencia:** capacidades ordenadas (sección 5, DAG) — identidad pública → dominio/RLS → medios → disponibilidad POS → autoría/publicación → runtime público → analítica → piloto SOHO → cohorte → revisión comercial. La disponibilidad POS (M4) corre en paralelo desde M0 y converge en el runtime público (M6).
3. **Próximos tres batches:** tres batches fundacionales, cada uno una **cadena funcional de work-unit PRs** (< 400 líneas authored por unidad; output generado divulgado por separado) — `batch_01_public_identity_and_url_contract` (01a→01b), `batch_02_menu_domain_and_rls` (02a→02b→02c), `batch_03_pos_manual_availability_foundation` (03a→03b→03c); resumen en sección 7, contratos completos en `docs/plans/foodpark/`.
4. **Verificación de cobertura:** sección 12 — los 33 AC y las 11 decisiones de diseño abiertas (OD-01…OD-11) están mapeados sin huecos.

---

## 1. Autoridad y trazabilidad

| Insumo | Rol en este roadmap |
|---|---|
| `docs/PRDs/prd_nhilosmenu_foodpark_v1.md` | Autoridad normativa única de producto. Toda capacidad traza a D-*/FR-*/AC-*/EC-*/NFR-* del PRD. |
| `AGENTS.md` | Principios transversales: offline-first, DGI, RLS multi-tenant, TDD, MVVM/Floor en POS, TypeORM en backend. |
| `docs/plans/master_execution_roadmap.md` | Evidencia de fundaciones entregadas (sincronización bidireccional Batch 8, RBAC granular Batch 10, promociones Batch 14.1). El roadmap no hereda sus bloques pendientes 17–19 como alcance de este producto. |
| `docs/plans/owner_dashboard_execution_roadmap.md` | Precedentes de aislamiento (transacción ligada a tenant, prueba RLS en PostgreSQL real, slug de tenant) reutilizables como primitivas, no como alcance copiado. |
| `docs/finance/estrategia_comercializacion.md`, `docs/finance/FINANCIAL_STRATEGY.md` | Empaquetado: perfil operativo Food Park dentro de `OmniFood Operación`; SOHO USD 79/mes fundador; público USD 89/mes (D-18). |
| `openspec/specs/inventory-sync-topologies/spec.md` | Topologías de sincronización existentes que el contrato OD-11 debe respetar. |
| Superficies actuales de catálogo, tenant, sync, sales-core, identidad y owner dashboard | Estado actual verificado por código (sección 3), no por afirmaciones de roadmaps previos. |

Regla de trazabilidad: cada milestone (sección 6) declara los AC que verifica y las compuertas OD que lo bloquean; cada batch (sección 7) hereda esa trazabilidad. La matriz decisión→AC ya vive en el PRD (sección 25.1) y no se duplica: este roadmap cubre AC→milestone.

## 2. Boundary de producto (no se inventa alcance)

Este roadmap no agrega capacidad nueva al PRD. En una frase: **el menú informa y conecta; no vende.** Quedan fuera de toda fase de este roadmap el venue del Food Park, el marketplace compartido, el carrito, el pago, el datáfono, la factura y el SEO de descubrimiento (PRD sección 21, NG-01…NG-08). El backlog diferido de sección 10 cataloga esas expansiones como contratos futuros, no como fases de este roadmap.

## 3. Estado actual verificado y matriz de brechas

Hallazgos del código actual (verificados por lectura directa, no heredados de roadmaps):

| Capacidad | Evidencia actual en código | Brecha para NhilosMenu V1 |
|---|---|---|
| **Identidad y RBAC** | Módulo `identity` con auditoría append-only (`audit-log.entity.ts`), perfiles de seguridad, `AuthoritativeCurrentUserGuard`/`RolesGuard` en uso (p. ej. `reports.controller.ts`, `industry-template.controller.ts`); RBAC granular + PIN/TOTP entregados (master roadmap Batch 10). | No existe ninguna ruta pública no autenticada (sin `@Public`/decorador de bypass en el backend). La superficie pública anónima es capacidad nueva completa. |
| **Aislamiento multi-tenant** | `core/database/rls.interceptor.ts` verifica `tenant_id` del JWT y delega el binding a servicios; precedentes de `set_config('app.tenant_id', $1, true)` en transacción local (`catalog.service.ts`, `invoices.service.ts`); specs de integración contra PostgreSQL real (`invoices.service.db.spec.ts`). | Sólida base reutilizable, pero **ninguna entidad de menú existe** (grep de entidades de menú: cero resultados). RLS para las entidades nuevas debe probarse desde cero. |
| **Tenant** | `tenant.entity.ts` solo tiene name/RUC/activo. No hay slug. | Falta el esquema de URL pública no enumerable (OD-06). El slug de tenant del roadmap de owner dashboard no está implementado; no se asume. |
| **Perfil operativo Food Park existente (POS/fulfillment)** | El POS ya opera el modo `TenantOperationMode.foodparkQsr` (valor de wire `FOODPARK_QSR`, en `apps/pos_app/lib/domain/models/config/tenant_operation_mode.dart`, por defecto en `tenant_config.dart`), y el módulo backend `fulfillment` modela topologías de tenant por modo de operación — sus specs ejercen `operationMode: 'FOOD_PARK'` (`fulfillment-topology.controller.spec.ts`, specs de `tenant-topology-revision.service`). | Esto es un **modo de operación POS/fulfillment, no una implementación de NhilosMenu**: no existe entitlement de menú, superficie pública ni entidades de NhilosMenu (D-18 sigue sin construirse). NhilosMenu lo trata como contexto de empaquetado del perfil operativo, no lo extiende. |
| **Catálogo** | El producto es master data del **módulo inventory** (`inventory/entities/product.entity.ts`, flag de activación `is_active` — no es soft-delete ni disponibilidad); el módulo `catalog` expone escrituras CRUD y el owner dashboard tiene feature `catalog`. | NhilosMenu consume productos por referencia (FR-01); el `is_active` del inventario **no es** disponibilidad de menú (FR-04 lo prohíbe explícitamente). |
| **Promociones** | Motor de promociones POS + backend + feature dashboard (Batch 14.1). | Solo se necesita reflejo (AC-31); ninguna creación desde el menú. |
| **Sincronización** | `sync-batch.controller.ts` y `inbound-sync.controller.ts` (rutas efectivas `/api/v1/sync/*` por el prefijo global `api` de Nest, `main.ts:25`), sync bidireccional cloud (Batch 8), spec `inventory-sync-topologies`. | No existe sincronización de disponibilidad ni de precio hacia un snapshot público; OD-11 define el contrato nuevo sobre las topologías existentes. |
| **Disponibilidad manual (`AVAILABLE / SOLD_OUT`)** | **No existe dominio de disponibilidad de menú** en backend ni en `apps/pos_app/lib`: los términos `availability` presentes en el código pertenecen a ventanas de disponibilidad de loyalty, no relacionadas con este producto. | Confirma el PRD (FR-04): es una **fundación nueva requerida** en el POS Flutter (offline-first), no una capacidad existente. Gate duro antes de cualquier sync de disponibilidad pública. |
| **Medios** | No existe módulo de medios/uploads (lo más cercano es `import-staging` de onboarding, CSV). | Pipeline completo nuevo: validación, optimización, cuota por tenant, servicio gestionado (OD-04, FR-09, AC-17). |
| **Runtime público** | Sin rutas anónimas, sin snapshot/edge/CDN, sin `wrangler` ni configuración de CDN en el repo. | Capacidad nueva completa; el proveedor edge es compuerta OD-01 previa a la implementación. |
| **Owner Dashboard** | SPA React+Vite existente con features auth/catalog/promotions/etc. y utilidad `menu-qr` (`qr-encode.ts`: generación local con `uqr`, payload ≤ 1024 bytes, ECC "Q", contratos testeados). | La feature NhilosMenu de autoría no existe. De `/menu-qr` solo se reutiliza el contrato técnico local de generación/descarga; las colocaciones nuevas codifican únicamente la URL canónica (FR-07). |
| **Entitlement** | Entidad `tenant-capability-event` (eventos de capacidad por tenant con revisión) en `identity`. | Costura natural para el entitlement del perfil operativo Food Park (D-18); la habilitación comercial es fase de piloto, no de implementación. |
| **Analítica** | Analítica de ventas autenticada en dashboard. | El funnel público anónimo (`menu_view`/`item_view`/`whatsapp_tap`) no existe (OD-05). |
| **DGI** | Inmutabilidad de facturas y corrección solo por anulación, probadas en sales-core. | Requisito negativo: el menú no crea documentos fiscales (AC-24); verificación negativa por lote. |

## 4. Supuestos y compuertas de diseño (OD-01…OD-11)

Ninguna decisión de producto está abierta (PRD sección 24). Estas son decisiones de diseño/comercial con dueño y efecto bloqueante. **Ningún milestone cuyo acceso dependa de una compuerta puede implementarse antes de que esa compuerta esté resuelta con evidencia.** Las compuertas marcadas **[Resuelta]** fueron aprobadas por el propietario del producto durante T3 y están especificadas en los contratos de batch de `docs/plans/foodpark/`; las marcadas **[M0]** siguen abiertas y son compuertas de salida de M0 antes de que cualquier milestone implemente superficie pública.

| ID | Compuerta | Dueño | Bloquea | Nota |
|---|---|---|---|---|
| OD-01 | Proveedor y formato del edge/CDN y almacenamiento de snapshots públicos | Architecture | **[M0]** Abierta — compuerta de salida de M0 antes de la implementación de M6; el spike de validación está incluido en M0. La decisión de almacenamiento de medios (R2) ya está tomada (OD-04), pero el proveedor/servicio del snapshot público sigue abierto | Debe satisfacer D-17/NFR-02. |
| OD-02 | Mecanismo de invalidación/actualización del snapshot al publicar y sincronizar | Architecture | **[M0]** Abierta — compuerta de salida de M0; implementación en M6 | Idempotencia de sync (PRD 11.2). |
| OD-03 | Umbral numérico de frescura + copy exacto de la advertencia (español) | Product + Architecture | Habilitación de la sincronización pública dentro de M4→M6 (AC-19) | Sin esta decisión no existe criterio binario de frescura (NFR-03). |
| OD-04 | Pipeline de medios: proveedor, formatos, tamaños, cifras de cuota y fallback | Architecture + Product | **[Resuelta]** Cloudflare R2 vía S3 API; cuota piloto 250 MB/tenant; original ≤ 5 MB; validación/optimización obligatoria; placeholder como fallback. Contrato de entrada de `batch_02_menu_domain_and_rls.md`; implementación en M3 | PRD 12 satisfecho; cifras congeladas. |
| OD-05 | Pipeline de funnel anónimo y política de retención/agregación | Architecture | M7 | Debe satisfacer D-14/FR-10: sin PII ni perfiles individuales. **Abierta.** |
| OD-06 | Esquema de URL pública (slug/subdominio) y payload de QR | Architecture + Security | **[Resuelta]** URL canónica `https://menu.omnifood.ni/m/{publicId}/{slug}`; publicId opaco CSPRNG autoritativo, slug decorativo con redirect canónico. Contrato en `batch_01_public_identity_and_url_contract.md`; descarga en M1 | No-enumeración (PRD 16.2) satisfecha por diseño. |
| OD-07 | Rate limiting y protección de abuso de la superficie pública | Security | **[Resuelta]** Rate limiting por ruta con `@nestjs/throttler` (API oficial verificada en implementación); límite congelado: 30 req/min por IP en `/m/*`, **aprobado explícitamente por el propietario del producto para V1**; defensa en profundidad en edge después. Contrato en `batch_01_public_identity_and_url_contract.md`; enforcement M1/M6 | NFR-05 satisfecho en el contrato; tasa de 429 observada y revisada en la observabilidad del piloto. |
| OD-08 | Mecánica de edición concurrente del borrador (EC-08) | Architecture | M5 | Última confirmación prevalece por elemento; no puede comprometer versiones. **Abierta.** |
| OD-09 | Verificación del número de WhatsApp del tenant | Architecture + Product | M5 (configuración OWNER) | Sin capturar PII de consumidores (D-14). |
| OD-10 | Política de suspensión del menú público por mora del tenant | Comercial + Product | **Entrada al piloto M8** | Explícitamente abierta por el PRD (EC-10); este roadmap no inventa su contenido, pero exige que esté resuelta y documentada **antes** del primer tenant público: el piloto necesita una vía real de suspensión/despublicación. |
| OD-11 | Contrato de sincronización disponibilidad/precio POS → snapshot | Architecture | **[Resuelta en su fundación]** Tabla local separada (jamás columna de `products` ni inferencia), secuencia local monótona + idempotency key con unicidad, **escritor primario único designado por el OWNER durante la activación/comisionamiento desde los dispositivos registrados — backend autoritativo del `device_id`, sincronizado a todo POS, fail-closed hasta que exista designación válida**. Contrato en `batch_03_pos_manual_availability_foundation.md`; la topología cloud completa se especifica en el batch de sync posterior alineándose con `inventory-sync-topologies` y NFR-04 | M4 (pierna local) habilitada. |

**Decisiones de gobernanza adicionales aprobadas y registradas (T3):**

- **Auditoría de publicación (PRD §15.2 enmendada por el propietario):** bitácora **dedicada** `menu_publication_audit`, tenant-scoped, append-only (UPDATE/DELETE prohibidos). **No se reutiliza** la bitácora forense compartida de identidad — ningún contrato de este roadmap reclama ese reuso.
- **Rate limiting V1 (OD-07):** 30 req/min por IP en `/m/*` aprobado explícitamente; tasa de 429 observada en el piloto y recalibrada post-piloto sin debilitar la protección por debajo de un nivel honesto.
- **Dispositivo primario de disponibilidad:** selección por el OWNER en activación/comisionamiento desde dispositivos registrados; backend autoritativo del `device_id`; fail-closed sin designación válida; reasignación solo por el OWNER.
- **Prefijo global:** la URL pública canónica vive en `/m/*` **sin** el prefijo `/api` (estrategia de exclusión en `batch_01_public_identity_and_url_contract.md`).

Supuestos declarados (cada uno se valida con evidencia en el milestone indicado; si fallan, recalibrar antes de avanzar):

| # | Supuesto | Validación | Dueño |
|---|---|---|---|
| A-1 | El backend NestJS existente (Railway) puede alojar la autoría y el contrato de snapshots; el servicio público puede externalizarse al edge elegido en OD-01. | Spike OD-01 con evidencia de enrutado y TLS dentro de M0, antes de su salida. | Architecture |
| A-2 | El tenant llega a NhilosMenu ya `ACTIVATED` por Onboarding V2; ninguna parte de este roadmap toca el contrato de onboarding. | Verificación de contrato existente en M1. | Product |
| A-3 | SOHO conserva su precio fundador USD 79/mes y el público permanece USD 89/mes durante todo el piloto; ningún cambio de precio entra en ningún batch. | Revisión comercial en M8/M10 (AC-21). | Comercial |
| A-4 | El slug/URL pública de NhilosMenu puede compartir contrato con el futuro slug del owner dashboard; si ese trabajo no ha aterrizado, NhilosMenu define el suyo sin esperar. | Decisión registrada en OD-06. | Architecture |
| A-5 | La utilidad `/menu-qr` existente aporta solo el contrato técnico local de generación (payload acotado, sin servicios externos); sus URLs arbitrarias no se heredan. | Reutilización verificada por test en M5. | Frontend |

## 5. DAG de dependencias, ruta crítica y ramas paralelas

```text
M0 Compuertas de diseño — salida: OD-01/02/04/06/07/11 aprobadas con proveedor,
    contrato, cifras y fallback (incluye spike OD-01; sin implementación de producto)
 ├─> M1 Identidad pública y aislamiento multi-tenant (esquema URL OD-06, no-enumeración,
 │     rate limiting/anti-abuso OD-07, sin auth pública)
 │     └─> M2 Dominio de menú + RLS real (borrador/versión/capa operativa, auditoría, i18n-ready)
 │           └─> M3 Medios gestionados — implementación (upload/validación/optimización/cuota;
 │                 contrato ya aprobado en M0)
 │                 └─> M5 Autoría y publicación versionada (dashboard, roles, alérgenos, QR;
 │                       OD-08/OD-09 resueltas antes de entrar)
 ├─> M4 Disponibilidad manual local POS + sincronización (paralelo desde M0 con OD-11
 │     aprobada; persistencia mínima propia, sin depender de M2)
 │     └─ (converge en M6; gate OD-03 antes de habilitar el reflejo público con frescura)
 └─> M6 Runtime público anónimo (requiere M5 y M4; snapshot edge/CDN, noindex, frescura,
       WhatsApp, página neutral)
       └─> M7 Analítica de colocaciones (funnel anónimo; OD-05 resuelta antes de entrar)
             └─> M8 Piloto design-partner SOHO (entitlement D-18; OD-10 resuelta ANTES de entrar)
                   └─> M9 Cohorte 3–5 negocios (D-19)
                         └─> M10 Revisión comercial: compuertas GA/reprecio (D-20)
```

**Ruta crítica:** M0 → M1 → M2 → M3 → M5 → M6 → M7 → M8 → M9 → M10. M3 está en la ruta crítica: sin medios implementados no hay autoría completa. M4 corre en paralelo desde M0 (dependencia factual: solo OD-11, con persistencia mínima propia) y converge en M6.

**Ramas paralelas seguras:**

- **P2 (M4 disponibilidad)** desde M0 (OD-11 aprobada en la salida de M0): POS Flutter (toggle offline-first) y backend (designación en el dominio device-sync existente, sin depender del dominio de menú de M2). **Frontera de integración:** 03a toca backend identity/inbound-sync y **serializa cualquier cambio de migración con Batch 02** (mismo backend, migraciones secuenciales); 03b/03c son POS. Nunca comparte escritores de dominio con la ruta crítica (medios/menú). Gate OD-03 antes de habilitar el reflejo público con frescura.
- Spike de infraestructura OD-01 dentro de M0: prueba de edge/CDN con evidencia; su resultado alimenta la decisión [M0], no define política de autorización.
- Decisiones OD-03/OD-05/OD-08/OD-09/OD-10 pueden avanzarse en paralelo con la implementación mientras no se habilite lo que bloquean; todas deben estar cerradas antes del milestone que las consume.
- **Prohibido:** escritores paralelos sobre el mismo dominio o invariante (dominio de menú, RLS, publicador) sin frontera de integración explícita.

**Compuertas de orden duro (heredadas del PRD 25.3 y FR-04):**

1. Todas las decisiones duras del PRD 25.3 — identidad/acceso público (OD-06, OD-07), **contrato de medios (OD-04: proveedor, cifras de cuota y fallback)** y **contrato del snapshot público/edge (OD-01, OD-02: proveedor edge/CDN e invalidación)** — son **compuertas de salida de M0**, aprobadas antes de que cualquier milestone implemente menú (M2 en adelante). Su implementación llega después, en su milestone.
2. La fundación manual de disponibilidad del POS entregada y probada **antes** de habilitar cualquier sincronización de disponibilidad pública.
3. Sin OD-03 resuelta no existe sync pública de frescura ni advertencia binaria (NFR-03).
4. Sin OD-10 resuelta **no entra el piloto** (M8): ningún tenant público sin política de suspensión/despublicación documentada (EC-10).

## 6. Milestones: resultado, compuertas y evidencia

Cada milestone declara: resultado, dependencias, compuertas de entrada/salida, evidencia mínima y frontera de rollback. Los estados de evidencia siguen el ciclo `Planned → Implemented → Verified → Operationally Proven` (sección 13).

### M0 — Compuertas de diseño y contratos de medios/snapshot público
- **Resultado:** decisiones **completas y aprobadas** para OD-06, OD-07, OD-11 (fundación) y OD-04 (contrato de medios) — **ya resueltas por gobernanza del propietario del producto durante T3** y especificadas en los contratos de batch; queda pendiente de M0 únicamente **OD-01 y OD-02** (contrato del snapshot público/edge: proveedor edge/CDN, formato e invalidación, con spike de validación) más el plan fechado de OD-03/OD-05/OD-08/OD-09/OD-10.
- **Entrada:** PRD aprobado; este roadmap aprobado; gobernanza T3 aprobada.
- **Salida/evidencia:** registros de decisión firmados por sus dueños con evidencia del spike; **ninguna implementación de superficie pública (M6 en adelante) comienza sin OD-01/OD-02** (compuerta dura del PRD 25.3 para el servicio público). Sin implementación de producto en M0: solo decisiones, spike y evidencia.
- **Rollback:** revertir registros de decisión no afecta código (no existe aún); el spike es infraestructura de prueba desechable.

### M1 — Identidad pública y aislamiento multi-tenant
- **Resultado:** esquema de URL pública estable y no enumerable (OD-06), rate limiting y contrato anti-abuso (OD-07), y la regla de que la superficie pública no expone autenticación ni enumeración de tenants.
- **Dependencias:** M0. **Trazabilidad:** AC-01, AC-12 (contrato), AC-25 (base), D-02, D-11, PRD 16.2.
- **Salida/evidencia:** pruebas negativas de enumeración, pruebas de resolución server-side del identificador público, verificación de que ningún endpoint público lista menús.
- **Rollback:** reversión de migraciones/slug sin datos de producción afectados (capacidad no expuesta aún).

### M2 — Dominio de menú y RLS real
- **Resultado:** entidades NhilosMenu (borrador único, versión inmutable, elemento de menú referenciando producto POS, capa operativa precio/disponibilidad, alérgenos estructurados, i18n-ready D-13) con aislamiento por `tenant_id` del JWT, predicados explícitos y prueba en PostgreSQL real de RLS (dos tenants, fail-closed); auditoría append-only de acciones OWNER (AC-30).
- **Dependencias:** M1. **Trazabilidad:** AC-08 (invariante), AC-14 (esquema), AC-25, AC-26 (contrato), AC-30, FR-01/FR-03/FR-05, EC-08/EC-09 (contratos).
- **Salida/evidencia:** spec de integración PostgreSQL con fixtures T1/T2; test de unicidad de versión activa; test de no-mutación de versiones publicadas.
- **Rollback:** migración con down-path probado; sin datos de publicación reales aún.

### M3 — Medios gestionados (implementación)
- **Resultado:** pipeline de subida con validación (tipo/tamaño), variantes optimizadas, cuota por tenant visible, error honesto de cuota excedida (EC-04); el original nunca se sirve público.
- **Dependencias:** M2; OD-04 **resuelta por gobernanza** (R2, cuota 250 MB/tenant, ≤ 5 MB, validación/optimización, placeholder) registrada como contrato de entrada — aquí solo se implementa. **Trazabilidad:** AC-17, AC-29, FR-09, D-16, NFR-06 (alt text).
- **Salida/evidencia:** tests de validación/cuota/optimización; contrato de ciclo de vida que garantiza que borrar una imagen de borrador no rompe snapshots publicados (PRD 12.5).
- **Rollback:** feature flag del pipeline; el contenido ya publicado conserva acceso a sus medios.

### M4 — Disponibilidad manual local POS + sincronización (paralela desde M0)
- **Resultado:** toggle `AVAILABLE / SOLD_OUT` manual en el POS Flutter, offline-first, distinto del flag de activación `products.is_active`, con persistencia local (Floor, args posicionales en `@transaction`), **escritor primario designado por el OWNER en activación/comisionamiento (backend autoritativo, fail-closed sin designación)** y sincronización al cloud respetando NFR-04 (nunca bloquea la venta); contrato de sync según OD-11.
- **Dependencias:** solo M0 con OD-11 — **resuelta por gobernanza en su fundación** (tabla local separada, secuencia monótona + idempotencia, escritor primario único); persistencia mínima de disponibilidad propia, sin depender del dominio de menú (M2). Gate OD-03 antes de habilitar el reflejo público con frescura.
- **Trazabilidad:** AC-04, AC-20, FR-04, D-06, D-17, EC-01, EC-03 (precio vía mismo contrato), FR-12.
- **Salida/evidencia:** tests de dominio POS (offline sin WAN), test de idempotencia de reintentos (PRD 11.2), test de que toda falla de NhilosMenu deja la caja operando.
- **Rollback:** la capacidad manual vive en el POS y sobrevive a cualquier reversión cloud; el reflejo público se desactiva por flag sin tocar la caja.

### M5 — Autoría y publicación versionada
- **Resultado:** feature NhilosMenu en Owner Dashboard: curación desde catálogo POS, contenido editorial (descripciones, ingredientes, destacados, reflejo de promociones), alérgenos con confirmación de responsabilidad del OWNER (bloqueo de publicación sin ella), vista previa fiel y privada, publicación/rollback versionado, colocaciones QR por tipo de fuente (`COUNTER`/`TABLE`/`ENTRANCE`/`SOCIAL`) reutilizando el contrato local de `/menu-qr`, matriz de roles OWNER/MANAGER.
- **Dependencias:** M2, M3; compuertas OD-08, OD-09.
- **Trazabilidad:** AC-02, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-13, AC-28, AC-31, FR-02/FR-05/FR-07, EC-05/EC-08/EC-09/EC-12, D-07/D-08/D-09/D-10/D-12.
- **Salida/evidencia:** tests de roles (MANAGER no publica), test de compuerta de alérgenos, test de rollback sin corrupción, test de resolución de producto retirado (EC-02/AC-28), test de QR que codifica solo la URL canónica.
- **Rollback:** feature flag de la feature de autoría; las versiones ya publicadas permanecen inmutables y servibles.

### M6 — Runtime público anónimo
- **Resultado:** servicio público del último snapshot publicado desde edge/CDN (OD-01/OD-02), `noindex`/`nofollow` y exclusión de sitemaps, advertencia honesta de frescura según umbral OD-03, WhatsApp contextual prellenado con degradación honesta (EC-06), página neutral al despublicar (EC-07), sin carrito/pago/fiscal (AC-05, AC-24).
- **Dependencias:** M4 (frescura), M5 (publicación); compuertas: OD-03 (umbral de frescura) resuelta antes de habilitar el reflejo; OD-01/OD-02/OD-07 ya aprobadas en M0 y aquí implementadas.
- **Trazabilidad:** AC-03, AC-04 (reflejo), AC-05, AC-12, AC-16, AC-18, AC-19, AC-20, AC-24, AC-26, AC-27, AC-32, AC-33, D-03/D-05/D-11/D-15/D-17, NFR-01/02/03.
- **Salida/evidencia:** prueba de servicio sin dependencia del POS ni de la WAN del negocio; test de página neutral sin filtración de borrador; test de advertencia de frescura; verificación negativa DGI por lote.
- **Rollback:** despublicar a página neutral es la degradación segura; jamás se debilita el aislamiento para restaurar disponibilidad.

### M7 — Analítica de colocaciones
- **Resultado:** funnel anónimo agregado `menu_view`/`item_view`/`whatsapp_tap` por tenant y colocación, visible para OWNER/MANAGER desde el dashboard; sin PII, cookies de tracking ni perfiles individuales.
- **Dependencias:** M6 + compuerta OD-05. **Trazabilidad:** AC-15, FR-10, D-14, sección 13 del PRD.
- **Salida/evidencia:** test de agregación y de ausencia de identidad; contrato de retención/purga documentado.
- **Rollback:** desactivar colector por flag; los agregados históricos se conservan según política OD-05.

### M8 — Piloto design-partner SOHO
- **Resultado:** SOHO operando NhilosMenu en producción como entitlement core del perfil operativo Food Park dentro de `OmniFood Operación` (D-18, AC-21), con evidencia operativa y de uso real.
- **Dependencias:** M6 + M7 operacionalmente probados + **OD-10 resuelta y documentada antes de entrar** (la política de suspensión por mora existe antes del primer tenant público). **Trazabilidad:** AC-21, AC-22, D-18/D-19, sección 18 del PRD.
- **Salida/evidencia:** evidencia de confiabilidad operativa, adopción del dueño y uso real del consumidor (tres de las cuatro compuertas D-20, medidas — no demos); sin cambio de precios.
- **Rollback:** vía real de salida del piloto: despublicar el menú de SOHO a página neutral (EC-07, FR-05) y suspender el servicio público bajo la política OD-10 ya vigente, sin tocar la operación del POS (AC-20); los hallazgos alimentan la recalibración. La reversión es operativa (despublicar/suspender), nunca destructiva de datos.

### M9 — Cohorte 3–5 negocios de Food Park
- **Resultado:** expansión controlada a 3–5 negocios (D-19), evidencia multi-tenant y de disposición a pagar.
- **Dependencias:** M8 con hallazgos cerrados (OD-10 ya resuelta antes del piloto; se aplica a cada tenant nuevo de la cohorte).
- **Trazabilidad:** AC-22, D-19/D-20.
- **Salida/evidencia:** sign-off de expansión con evidencia de las cuatro compuertas D-20 en progreso.
- **Rollback:** pausar incorporaciones sin afectar tenants activos.

### M10 — Revisión comercial y compuertas GA/reprecio
- **Resultado:** decisión de GA y/o reprecio **solo** con las cuatro compuertas D-20 cerradas simultáneamente: confiabilidad operativa, adopción del dueño, uso real del consumidor, disposición a pagar.
- **Dependencias:** M9. **Trazabilidad:** AC-23, D-20, sección 18.3 del PRD.
- **Salida/evidencia:** índice de evidencia completo; cualquier tier/SKU distinto es decisión post-piloto documentada fuera de este roadmap.
- **Rollback:** no cerrar compuertas = permanecer en piloto/cohorte; ninguna compuerta puede omitirse ni sustituirse.

## 7. Próximos tres batches (resumen a nivel roadmap)

**Corrección explicada:** los nombres provisionales del artefacto ODD (`batch_01_public_identity_and_menu_contract`, `batch_02_menu_authoring_and_publication`, `batch_03_public_menu_runtime_and_pilot`) agrupaban umbrales de 4–7 PRs — Batch 02 juntaba medios + disponibilidad POS + autoría, y Batch 03 juntaba runtime + analítica + piloto. Eso no son batches revisables: violan el presupuesto de revisión y mezclan superficies y lentes de revisión. La evidencia (FR-04 y PRD 25.3 como compuertas duras, y la matriz de brechas de sección 3) exige fundaciones PR-sized primero. **Cada batch es una cadena funcional de work-unit PRs** (< 400 líneas authored por unidad; output generado divulgado por separado) con contratos completos en `docs/plans/foodpark/`:

### Batch 01 — Identidad pública y contrato de URL
`docs/plans/foodpark/batch_01_public_identity_and_url_contract.md` — **contrato completo creado (T3).**
- **Capacidad:** M1 — **cadena de 2 work units:** `01a` dominio del contrato URL (publicId opaco CSPRNG autoritativo y no enumerable, slug decorativo, redirect canónico 301; fundación horizontal justificada) → `01b` endurecimiento de `/m/*` (404 neutral, `X-Robots-Tag: noindex, nofollow`, **exclusión del prefijo global `/api`**, throttler por ruta con límite **30 req/min/IP aprobado por el propietario**, sin endpoint de listado, dependencia `@nestjs/throttler` declarada, **redacción de URL bearer en el request logger de `main.ts` y en `AllExceptionsFilter`**).
- **Lente dominante de revisión:** seguridad de la superficie pública (no-enumeración, resolución server-side, sin auth).
- **Compuertas de entrada:** OD-06/OD-07 resueltas por gobernanza; sin servicio de datos aún.
- **Trazabilidad destacada:** AC-01 (identidad de tenant), AC-12 (contrato de URL), AC-25 (base), FR-07 (sin QR de URLs arbitrarias).

### Batch 02 — Dominio de menú y RLS
`docs/plans/foodpark/batch_02_menu_domain_and_rls.md` — **contrato completo creado (T3).**
- **Capacidad:** M2 — **cadena de 3 work units:** `02a` migración A (menus/borrador/capa operativa, con políticas RLS `ENABLE`+`FORCE` en la misma migración) → `02b` migración B (versiones editoriales inmutables con índice parcial de una activa, `menu_publication_audit` append-only dedicada con trigger (PRD §15.2 enmendada), frontera operativa sin columnas de precio/disponibilidad) → `02c` prueba de aislamiento real en PostgreSQL con rol `NOSUPERUSER NOBYPASSRLS` vía `SET ROLE` (dos tenants, fail-closed) e invariantes de dominio.
- **Split seguro sin exposición:** cada migración lleva sus políticas RLS y ningún route existe, así que el intermedio está protegido — **sin excepción de tamaño por defecto**; una `size:exception` solo con aceptación explícita del maintainer si la implementación lo demuestra necesario.
- **Lente dominante de revisión:** aislamiento multi-tenant e invariantes del dominio (RLS real, una activa, append-only, frontera operativa).
- **Compuertas de entrada:** Batch 01 verificado; OD-04 resuelta por gobernanza (contrato de entrada; la implementación de medios es M3). Sin APIs de autoría/publicación.
- **Trazabilidad destacada:** AC-08 (invariante), AC-14 (esquema), AC-25/AC-26 (contrato), AC-30.

### Batch 03 — Fundación de disponibilidad manual en el POS
`docs/plans/foodpark/batch_03_pos_manual_availability_foundation.md` — **contrato completo creado (T3).**
- **Capacidad:** M4 (pierna local) — **cadena de 3 work units:** `03a` designación backend del dispositivo primario (OWNER la fija en activación/comisionamiento desde dispositivos registrados; backend autoritativo del `device_id`; sincronizada a todo POS por `/api/v1/sync/inbound/*`; fail-closed sin designación) → `03b` persistencia/dominio/repositorio POS (tabla `product_availability` separada — jamás columna de `products` ni inferencia de inventario; migración Floor 53→54 re-verificada en implementación; secuencia monótona + idempotency key con unicidad; consume la designación; `@transaction` con argumentos posicionales; **mapeo declarado hacia la futura `menu_operational_state` cloud, sync no implementada**) → `03c` toggle MANAGER + prueba de venta intocable. Solo local: sin sync de disponibilidad ni reflejo público (pierna cloud posterior).
- **Lente dominante de revisión:** operación POS offline-first intocable (FR-04/D-06/NFR-04); output Floor/Freezed generado divulgado y verificado por separado, sin contar como authored.
- **Compuertas de entrada:** OD-11 resuelta por gobernanza en su fundación. **Dependencia y frontera:** 03a es backend identity/inbound-sync (se apoya en el device-sync y la sync inbound existentes, Batch 8) y **serializa cualquier cambio de migración con Batch 02**; 03b/03c son POS y proceden solo tras el contrato 03a verificado. `03c` cierra la fundación FR-04 local.
- **Trazabilidad destacada:** AC-04 (fundación), AC-20 (POS nunca bloqueado).

Medios (implementación M3), autoría/publicación (M5), runtime público (M6), analítica (M7), piloto (M8), cohorte (M9) y revisión comercial (M10) **permanecen como milestones de este roadmap y batches posteriores** que T3+ especificará en recalibración, uno por milestone con lente dominante único; no se comprimen en estos tres artefactos. M9/M10 no tienen archivo objetivo en el artefacto ODD y no se les inventa contrato aquí.

## 8. Presupuesto de revisión y pronóstico de PRs

- **Presupuesto duro:** < 400 líneas **authored** (adiciones + eliminaciones) por work unit; el output generado (Floor/Freezed en POS) no cuenta como authored pero se divulga por separado en el diff, se regenera con `build_runner` y se verifica por los tests — jamás se usa para justificar una excepción. Ningún umbrella de 700–1600 líneas se presenta como "un PR revisable".
- Cada PR lleva: implementación, tests enfocados, evidencia (comandos y resultados exactos), observabilidad, frontera de rollback y trazabilidad al AC/FR del PRD. Commits como unidades de trabajo completas (código + tests + docs), Conventional Commits.
- **Encadenamiento:** cuando un milestone no cabe en un PR, se recomienda explícitamente `chained-pr` (PRs apilados, cada uno válidamente mergeable o cadena con tracker draft); prohibido el blob de feature.

| Unidad | PRs estimados | Superficies | Foco de revisión |
|---|---|---|---|
| M0 (decisiones + spike OD-01) | 1–2 unidades de documentación/decisión + spike con evidencia | Docs de decisión, spike edge/CDN | Completitud de compuertas: proveedor/contrato/cifras/fallback aprobados, no planes fechados |
| Batch 01 (URL pública) | 2 work units (01a→01b) | Backend (módulo nuevo, throttler, dependencia declarada) | No-enumeración, redirect canónico, límites congelados, sin auth |
| Batch 02 (dominio + RLS) | 3 work units (02a→02b→02c) | Backend (migraciones con RLS, entidades, specs PostgreSQL real) | Fail-closed RLS, una activa, append-only, frontera operativa |
| Batch 03 (disponibilidad POS) | 3 work units (03a→03b→03c) | Backend identity/inbound-sync (designación en device-sync), POS Flutter (migración Floor 53→54 forward-only, DAO args posicionales, Freezed, MVVM) | Fail-closed sin designación, autoridad OWNER, RLS FORCE en device-sync, offline sin WAN, separación de `products`, venta intocable, generados divulgados |
| M3/M5/M6/M7 (batches posteriores) | 1–2 PRs por milestone (recalibrado) | Backend/Dashboard/Edge | Re-estimado con evidencia de las fundaciones |
| M8/M9/M10 (piloto/cohorte/comercial) | Batches operativos, no de código | — | Evidencia D-20 y política OD-10 vigente |

Carga total prevista hasta el piloto: **8 work units de fundaciones (fijos) + M0 (1–2) + M3 (1) + M5 (2–3) + M6 (1) + M7 (1) = 14–16 PRs revisables**, con margen de +2 por splits atómicos si la implementación lo exige (techo honesto: 18). Cualquier desvío > 400 líneas authored por work unit exige split o excepción `size:exception` con aceptación explícita del maintainer.

## 9. Secuencia piloto → cohorte → GA/reprecio (D-19/D-20)

```text
Piloto design-partner: SOHO          (M8 — entrada gated por OD-10 resuelta)
   │  evidencia operativa y de uso real (3 de 4 compuertas D-20 medibles aquí)
   ▼
3–5 negocios de Food Park            (M9 — OD-10 aplicada a cada tenant)
   │  evidencia multi-tenant y disposición a pagar (4ª compuerta D-20)
   ▼
GA y/o reprecio                      (M10 — solo con las 4 compuertas cerradas)
```

- Empaquetado durante todo el piloto: perfil operativo Food Park dentro de `OmniFood Operación`, NhilosMenu como entitlement core; SOHO USD 79/mes fundador; público USD 89/mes invariante (D-18, A-3). Ningún batch implementa cambios de precio ni SKU.
- Las cuatro compuertas D-20 son obligatorias y ninguna se sustituye por evidencia parcial (AC-23). La ausencia de adopción nicaragüense probada es una limitación declarada del PRD (sección 23); estas compuertas existen por eso mismo.

## 10. Backlog diferido (explícitamente fuera de V1)

Catalogado como contratos futuros con PRD propio; **ningún batch de este roadmap los toca**. **La sección 21 del PRD es autoritativa para los non-goals** y la tabla siguiente es su mapeo detallado de verificación: cada NG usa el AC negativo aplicable o, cuando no existe uno, un control explícito de alcance y diff por lote; nunca evidencia fabricada.

| Tema diferido | Origen | Cheque negativo / control | Condición de reingreso |
|---|---|---|---|
| Administración del venue del Food Park / cuenta del dueño del venue | NG-01, D-02 | AC-01 (no existe superficie ni cuenta del venue); verificación negativa por lote | Nuevo PRD de producto; redefiniría el tenant. |
| Agregación multi-tenant, marketplace compartido, carrito compartido, liquidación entre locatarios (venue-marketplace) | NG-02 | AC-05 y AC-13 negativos (sin carrito, sin QR arbitrario); verificación negativa por lote | Nuevo PRD + revisión de aislamiento y settlement. |
| Modo restaurante | NG-03 | Sin AC de producto: control por alcance (ningún batch lo incluye) y verificación de diff | Contrato propio tras evidencia V1. |
| Cuentas de consumidor / identidad de lealtad en el menú público | NG-04 | AC-15 (funnel estrictamente anónimo, sin identidad ni PII) | PRD separado de portal de consumidor Loyalty; sin acoplamiento con V1. |
| Toma de pedidos, pagos, datáfonos bancarios, facturación, numeración fiscal en la nube (order/payment/datafono) | NG-05, D-03, sección 17 | AC-05 y AC-24 negativos; verificación DGI negativa por lote | Requiere nuevo contrato de producto explícito y revisión DGI; jamás una extensión de este roadmap. |
| Inferencia automática de disponibilidad desde inventario/recetas | NG-06, D-06 | AC-04 (tests negativos FR-04: jamás desde inventario, recetas, BOM ni `products.is_active`) | Prohibida por diseño; no reingresa. |
| SEO de descubrimiento, dominios personalizados, contexto por mesa, multi-menú, traducción automática | NG-07 | AC-12 (noindex/nofollow/exclusión de sitemap), AC-13 (QR solo URL canónica, sin contexto por mesa); negativos por lote | Revisión explícita del PRD (D-11/D-12/D-13). |
| Implementación de producto en cambios de documentación | NG-08 | Sin AC de producto: control por verificación de diff (este cambio contiene solo documentos) | Los batches de implementación son cambios de código propios, nunca de este artefacto. |

## 11. Riesgos, rollback y observabilidad

| Riesgo | Severidad / dueño | Mitigación | Disparador de rollback |
|---|---|---|---|
| Filtración de borrador o enumeración de tenants en superficie pública | Crítica / Security + Backend | M1 no-enumeración, M2 RLS probada en PostgreSQL real, solo snapshots activos públicos, rate limiting (OD-07). | Desactivar exposición pública; jamás debilitar RLS para restaurar servicio. |
| La fundación de disponibilidad se implementa derivada de `products.is_active` o de inventario | Crítica / Product + Backend | FR-04 explícito; tests negativos en M4; verificación de PRD 25.2 por lote. | Rechazar el PR; corrección antes de cualquier sync pública. |
| NhilosMenu bloquea o degrada la venta del POS | Crítica / Product (NFR-04) | El menú solo consume del POS; sync por topologías existentes; tests de venta sin WAN. | Desactivar reflejo público por flag; la caja nunca se toca. |
| Edge/CDN elegido no cumple D-17/NFR-02 | Alta / Architecture | Spike OD-01 con evidencia antes de M6; fallback documentado en la decisión. | Revertir a página neutral + re-decidir OD-01; sin datos perdidos (versiones inmutables). |
| Publicación sin confirmación vigente de alérgenos | Alta / Product + Backend | Compuerta dura en M5 (EC-05); test de bloqueo; advertencia de trazabilidad obligatoria (EC-12). | Corregir compuerta antes de reexponer; auditar publicaciones afectadas (append-only). |
| Cuota de medios degrada silenciosamente contenido publicado | Media / Backend | Error honesto accionable (EC-04); ciclo de vida de medios de versión inmutable (PRD 12.5). | Restaurar acceso a medios de la versión; nunca reescribir snapshots. |
| Doble captura de precios o precios editoriales | Alta / Product | El precio solo viene del POS (FR-12); la autoría no tiene campo de precio. | Rechazar el PR; el snapshot activo no se reescribe retroactivamente. |
| PII del consumidor en eventos o logs | Crítica / Security | D-14 en diseño (OD-05); pseudónimos de tenant (NFR-07); tests de ausencia de identidad. | Desactivar colector; purgar según política OD-05. |
| Exceso de presupuesto de revisión en cualquier batch | Media / Engineering | Batches PR-sized con lente dominante único; split por frontera atómica. | Re-slice antes de review; sin `size:exception` implícita. |

**Principio de recuperación:** el modo degradado seguro es página neutral pública + sync atrasada con advertencia de frescura; la venta local del POS nunca se bloquea (EC-01, AC-20). La recuperación jamás muta facturas, versiones publicadas ni datos fiscales.

**Observabilidad (NFR-07):** eventos privados de salud — publicaciones/rollbacks, latencia del servicio público, errores de medios, estado de frescura, fallos de binding de tenant — con seudónimos de tenant; jamás PII de consumidores ni contenido sensible de menús. La advertencia de frescura al consumidor es honesta y separada de la telemetría interna.

## 12. Trazabilidad de cobertura

### 12.1 AC → milestone (los 33 criterios, sin huecos)

| AC | Milestone(s) | Batch fundacional que aporta evidencia |
|---|---|---|
| AC-01 | M1 (identidad de tenant) + M2 (persistencia tenant-scoped probada) | Batch 01 + Batch 02 |
| AC-02 | M5 | — |
| AC-03 | M6 (precio vía sync M4) | — |
| AC-04 | M4 (fundación) + M6 (reflejo) | Batch 03 (fundación) |
| AC-05 | M6 (verificación negativa) | — |
| AC-06 | M5 | — |
| AC-07 | M5 | — |
| AC-08 | M2 (invariante) + M5 (publicación) | Batch 02 (invariante) |
| AC-09 | M5 | — |
| AC-10 | M5 | — |
| AC-11 | M1/M2 (base) + M5 (matriz) | — |
| AC-12 | M1 (contrato) + M6 (servicio) | Batch 01 (contrato) |
| AC-13 | M5 | — |
| AC-14 | M2 (esquema) + M6 (servicio español) | Batch 02 (esquema) |
| AC-15 | M7 | — |
| AC-16 | M6 | — |
| AC-17 | M3 | — |
| AC-18 | M6 | — |
| AC-19 | M6 (requiere OD-03 + M4) | — |
| AC-20 | M4 (fundación) + M6 (verificado en ambos) | Batch 03 (fundación) |
| AC-21 | M8 | — |
| AC-22 | M8/M9 | — |
| AC-23 | M10 | — |
| AC-24 | M6 (negativo) + verificación negativa por lote | — |
| AC-25 | M2 (RLS real) + M1 (base) + M4 (designación protegida por RLS FORCE en device-sync) | Batch 02 (RLS real) + Batch 03 (03a) |
| AC-26 | M2 (contrato) + M6 (solo activos) | Batch 02 (contrato) |
| AC-27 | M6 | — |
| AC-28 | M5 (resolución) + M6 (versión siguiente) | — |
| AC-29 | M3 | — |
| AC-30 | M2/M5 (auditoría) | Batch 02 (auditoría base) |
| AC-31 | M5 (reflejo) + M6 | — |
| AC-32 | M6 | — |
| AC-33 | Gate de copy por lote en todos los batches + M6 | Todos |

### 12.2 OD → compuerta (las 11 decisiones abiertas, con dueño)

OD-01→**[M0] abierta**, implementación M6 · OD-02→**[M0] abierta**, implementación M6 · OD-03→**abierta**, habilitación de sync pública con frescura M6 · OD-04→**resuelta (gobernanza T3)**, implementación M3 · OD-05→**abierta**, M7 · OD-06→**resuelta (gobernanza T3)**, descarga M1 · OD-07→**resuelta (gobernanza T3)**, enforcement M1/M6 · OD-08→**abierta**, M5 · OD-09→**abierta**, M5 · OD-10→**abierta**, entrada al piloto M8 · OD-11→**resuelta en su fundación (gobernanza T3)**, topología cloud completa en el batch de sync posterior. Detalle de dueños en sección 4; contratos en `docs/plans/foodpark/`. **Ninguna OD queda sin dueño ni sin punto de descarga.**

### 12.3 Cobertura de decisiones vinculantes

La matriz D-01…D-20 → AC vive en el PRD (sección 25.1); dado que los 33 AC están cubiertos arriba, las 20 decisiones quedan cubiertas transitivamente. Las verificaciones negativas de NG-01…NG-08 se definen individualmente en la sección 10 mediante el AC aplicable o un control explícito de alcance/diff por lote; AC-33 protege además el nombre y el copy del producto.

## 13. Ciclo de vida de evidencia y recalibración

| Estado | Evidencia requerida | Quién avanza |
|---|---|---|
| **Planned** | Enlaces de autoridad (AC/FR/OD), resultado, dependencias, compuertas resueltas, pronóstico de líneas, rollback. | Dueño del batch con aprobaciones de compuerta. |
| **Implemented** | PR/commit, frontera real del diff, migración/config, hooks de observabilidad. | Implementador; la afirmación del autor no es verificación. |
| **Verified** | Resultados exactos de tests enfocados, evidencia PostgreSQL/edge/navegador según aplique, casos negativos de seguridad, revisión/CI. | Revisor/CI + dueños de compuerta cuando aplique. |
| **Operationally Proven** | Telemetría de piloto, comportamiento de frescura bajo lag, drill de rollback, sign-off nombrado. | Operaciones con el dueño de dominio. |

**Recalibración:** tras cada batch se re-estima el DAG con conteos reales de líneas y hallazgos; tras batch_03 se especifican los batches de M3 (implementación de medios) y M5 en adelante con la evidencia de las fundaciones en mano. La evidencia es append-only en significado: un fallo posterior agrega un resultado que reemplaza, nunca reescribe un receipt fallido como exitoso.

---

**Siguiente paso:** revisión independiente de los tres contratos de batch cerrada; **comenzar el Batch 01 unit 01a únicamente cuando las compuertas de entrada M0 restantes (OD-01/OD-02: contrato del snapshot público/edge con spike de validación) estén aprobadas por sus dueños y la integración esté explícitamente autorizada por el propietario del producto.** Ninguna implementación de superficie pública (M6 en adelante) sin esas compuertas.
