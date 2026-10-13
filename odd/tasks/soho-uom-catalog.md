# Zona A — Catálogo general de UOMs + conversiones (provisionamiento de plataforma)

**Estado:** EN PROGRESO
**Fecha:** 2026-02-14
**Origen:** Gaps operativos inmediatos de SOHO (Catálogo & Recetas), Zona A. Encuadre del owner: el seeder es provisionamiento inicial de un negocio real — no insertar productos por defecto en tenants; solo UOMs, conversiones, categorías base, roles. Plantillas (cafetería/retail) son Fase 2.
**Review nativa:** pendiente

## Specs

- **S1** — Existe un catálogo de plataforma `uom_catalog` (global, no por tenant) con UOMs universales clasificadas por dimensión (mass, volume, count), su factor ancla exacto y aliases en español/inglés (libra→lb, litro→l, docena→docena, etc.).
- **S2** — Las UOMs de envase (frasco, bote, bolsa, caja, saco, paquete, bandeja, lata) y de servicio (porción, slice, tira, taza-cocina) entran al catálogo con dimensión `container`/`serving` y **sin factor universal**: la conversión es dato del insumo (contenido por envase), nunca del seeder.
- **S3** — Invariante sistémico en la carga de compras y en la creación/edición de insumos: `factor = 1 + purchaseUom ≠ consumptionUom` (resueltas por catálogo, distintas dimensiones o distinto código) es una conversión no configurada → se rechaza con mensaje accionable; identidad misma-dimensión-mismo-código con factor 1 es válida.
- **S4** — `seed-soho-catalog.ts` se divide: (a) seeder de plataforma (UOMs del catálogo vía migración, categorías base, roles) y (b) catálogo SOHO tenant-scoped opcional, fuera del provisionamiento general.
- **S5** — Los 7 insumos con factor inválido (I-05, I-13, I-14, I-15, I-22, I-23, I-29) quedan marcados como pendientes de medición del negocio; el guard de S3 bloquea distorsionar stock/CPP con ellos hasta que tengan contenido declarado.

## Tasks

| ID | Spec | Route | Commit |
|---|---|---|---|
| T1 | S1, S2 | Migración `uom_catalog` + entidad + catálogo puro + tests | `5075a9de` |
| T2 | S3 | Guard en `purchase.service.ts` (recordPurchase, fail-closed) + tests | `5075a9de` |
| T3 | S4 | Plataforma = migración T1; seeder tenant-scoped validado contra el catálogo | `43cdaab4` |
| T4 | S5 | pendingMeasurement + warnings de medición + fixes de anclas (454→453.59237, I-06) | `43cdaab4` |
| T5 | — | Issue #899 creado; implementación BOH read-only pendiente | #899 |

## Descubrimientos de la validación (T3/T4)

- La validación del plan contra el catálogo destapó 3 gaps reales del catálogo mismo: `taza(s)` de cocina (serving, ≠ taza medidora 240ml), `pieza entera` y `pastel entero` — añadidos.
- Las aproximaciones 454 (I-10/I-17/I-18/I-25) fueron reemplazadas por el ancla exacta 453.59237 — corrección respaldada por la plataforma, no invención.
- I-06 porción→unidad: normalización respaldada por la semántica del propio plan (1 pancake preparado = 1 unidad).
- Los 7 pendientes de medición (I-05/13/14/15/22/23/29) se crean marcados: el guard S3 bloquea compras contra ellos hasta que el negocio declare el contenido real.

## Log

- L1 2026-02-14 — Owner: "Valores ahora, vamos a implementar el catalogo general de unidades de medidas y sus respectivas conversiones, investiguemos cuales son para tener un catalogo completo y válido" + "estamos ejecutando seeders generales para provisionamiento inicial, no podes insertar productos by default en los tenants" (gaps 2a/2b: productos/recetas son datos del tenant, fuera del seeder general) + Gap 3: "Issue + BOH read-only".
- L2 2026-02-14 — Diseño aprobado: catálogo de plataforma con dos clases de UOM (universales con ancla física exacta; container/serving sin factor universal — la conversión es dato del insumo). Invariante: factor=1 con UOMs distintas (por catálogo) = no configurado → rechaza.
