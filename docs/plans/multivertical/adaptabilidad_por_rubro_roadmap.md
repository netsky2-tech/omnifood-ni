# Roadmap de Adaptabilidad por Rubro (Multivertical) — OmniFood NI

Plan de **fundamentos** para que OmniFood sirva a más de un rubro (cafetería, restaurante, minimarket, ferretería, retail electrónico) sin reescribir el dominio cada vez. **No es greenfield**: el producto ya tiene kardex inmutable, costeo CPP con FX BCN, proveedores, compras, conteos, mermas, sync offline determinista y multi-tenant con RLS. Lo que falta no es funcionalidad de rubro: son **las costuras** que permiten declarar un rubro en lugar de programarlo.

> Autoridad del documento: este roadmap **ordena la Fase 0 (cimientos) antes de cualquier épica de rubro**. La dirección de producto fue decidida el 2026-10-08: retail serializado **y** no serializado, con multi-sucursal y multi-bodega.

Issues que este plan materializa: **#818** (dimensión de ubicación, multi-bodega, transferencias) y **#819** (perfil de rubro, capas de capacidad, superficies declarativas).

---

## Decisiones confirmadas

Cerradas antes de implementación. Los batches referencian estas reglas en lugar de reabrirlas.

| ID | Decisión | Impacto |
|----|----------|---------|
| **D1** | **Rubro = conjunto de capacidades con nombre**, no una enumeración cerrada. `CAFETERIA` es un bundle, no un valor de enum que obligue a un release para agregar `FERRETERIA`. | #819 |
| **D2** | **Autoridad única del perfil.** Un documento de perfil versionado, hasheable y append-only, con RLS y lock transaccional, proyectado al POS por el canal fiscal existente. Se reutiliza el patrón ya probado de `tenant_capability_event` (append-only, revisionado, OWNER-only, RLS, advisory lock), que **no** es un sistema de entitlements y sí una forma correcta de almacenar estado de capacidad. | #819, #520 |
| **D3** | **Adaptabilidad = configuración de dominio + superficies declarativas.** `AGENTS.md` reserva Hexagonal para integraciones externas (DGI, bancos, hardware): los adaptadores de rubro viven en el borde (persistencia cloud del perfil, persistencia local del POS, renderizadores de superficie), nunca como puertos que atraviesan el dominio. | #819 |
| **D4** | **El rubro es ortogonal a la fiscalidad.** IVA, ISC, numeración DT 09-2007 y obligaciones DGI **no** se parametrizan por rubro. Un rubro no cambia la corrección fiscal. | #539, #520 |
| **D5** | **Ubicación es dimensión de primera clase del kardex.** La transferencia son **dos movimientos** (envío y entrada) con **estado en tránsito** explícito; nunca un UPDATE. | #818 |
| **D6** | **No especulación.** Un seam se construye cuando hay **dos casos reales** que lo exigen y evidencia en código de que el modelo actual no puede representarlos. Tres casos ya lo exigen: SOHO (BOM/modificadores/KDS/mesas), Telcmax (identidad por unidad, ubicaciones, sin cocina), minimarket (nada de comida, sin serie). | Transversal |
| **D7** | **El ítem declara sus dimensiones de control**: identidad por unidad (serie/IMEI), lote/vencimiento, ubicación, receta/BOM. Reemplaza booleanos dispersos por una taxonomía que un rubro nuevo declara. | #819, #818 |
| **D8** | **Serie y condición de pago son dimensiones del documento fiscal**, no convenciones de prefijo. `dgi_prefix` es libre, por dispositivo, y hoy nada impide que dos terminales usen la misma "serie". | #520, #532 |
| **D9** | **IMEI/serie NO es requisito de la DGI** (research 2026-10-08: DT 09-2007 y FAQ de la DGI exigen "cantidad y clase de bienes", no identidad por unidad). La serialización es épica de **dominio**, sin reloj legal corriendo. | Fase 3 |
| **D10** | **ISC no aplica a la reventa del minorista.** Art. 150 LCT / art. 104 Reglamento: el ISC afecta "únicamente su importación y su primera enajenación"; los sujetos pasivos son fabricante/productor, ensamblador e importador. Un minorista que compra a distribuidores regionales **no** lo traslada en su factura. Se vuelve requisito solo si servimos a un importador o primer enajenante. | Fase 4 (condicional) |

---

## Estado actual verificado (truth pass — 2026-10-08)

Auditoría de solo lectura. Cada fila es evidencia leída, no supuesta.

| Seam | Existe hoy | Falta | Evidencia |
|------|-----------|-------|-----------|
| Perfil de rubro | 3 canales descoordinados: `template_code` (solo siembra datos), `OPERATION_MODE` (solo checkout POS, 3 valores de comida), SQLite local del POS | Campo vertical canónico; capa de capacidades persistida; algo que lea el perfil para layouts | `1787000000000-CreateIndustryTemplatesAndDefaults.ts:65-70`; `tenant_config_service.dart:12-21`; `tenant_operation_mode.dart:11-19`; `tenant.entity.ts:10-37` |
| Taxonomía de ítem | `product_type` (`SIMPLE/COMPOUND/PREPARED/VARIANT_PARENT`), `inventoryPolicy` (`recipeBom/directStock/notTracked`), `is_perishable`, `uom` | Dimensiones declaradas (serie, lote, ubicación, receta) como modelo, no como booleanos | `product.entity.ts:12-70`; `product.dart:22-30` |
| Ubicación | `warehouses` como maestro **plano** sin jerarquía; `warehouse_id` como **etiqueta** nullable en producto/insumo; kardex **sin columna de ubicación**; sin tabla de existencias por ubicación; sin entidad/línea/tránsito de transferencia; `MovementType` sin `TRANSFER` | Todo el modelo de ubicación | `warehouse.entity.ts:13-31`; `product.entity.ts:32`; `insumo.entity.ts:35`; `inventory-movement.entity.ts:11-22,37` |
| Superficies | Nav y KPIs en arrays literales filtrados solo por rol/costo/régimen; POS con rutas estáticas; KDS incondicional; vocabulario de comida en todas las apps | Perfil declarativo que filtre superficies por capacidad | `sidebar.tsx:37-57`; `rbac.ts:44-61`; `kpi-strip.tsx:197-260`; `main.dart:867-947`; `app_drawer.dart:184-199` |
| Fiscal (dimensiones) | Numeración monótona e inalterable contra DELETE; nota de crédito con numeración y reversión en el mismo documento | Serie por sucursal (DT 09-2007 3.1); condición contado/crédito (1.7); inmutabilidad ante UPDATE; back-entry de contingencia (3.3) | Ver #520 D5, #532, #533 F3, #539 y los comentarios de auditoría del 2026-10-08 |

**Lo que ya sirve y no hay que tocar:** kardex append-only con `stock_before/after`, costo unitario/total y costo promedio posterior; CPP en NIO con FX BCN por fecha de factura; factura de compra con identidad fiscal y correcciones compensatorias; proveedores con crédito; conteos físicos con replay idempotente; mermas; UoM binaria con conversiones; sync offline determinista con idempotencia y secuencia por origen.

---

## Los cuatro seams

| Seam | Contrato | Dónde vive | Implementaciones |
|------|----------|------------|------------------|
| **VerticalProfile** | Documento de capacidades versionado y hasheable por tenant, con revisión y auditoría | Cloud (autoridad) + proyección al POS por el canal fiscal; persistencia local en el POS | Un bundle por rubro: `CAFETERIA`, `RESTAURANTE`, `MINIMARKET`, `FERRETERIA`, `RETAIL_ELECTRONICO` |
| **ItemControlDimensions** | Cada ítem declara qué dimensiones controla: identidad por unidad, lote/vencimiento, ubicación, receta/BOM | Dominio (`product`/`insumo`), con validación por capacidad | Producto de cafetería (BOM, perecedero), celular (unidad + ubicación), abarrote (solo ubicación) |
| **LocationModel** | Existencias como proyección `(ítem, ubicación)` reconstruible del kardex; transferencia = envío + entrada + tránsito | Dominio de inventario + sync offline | Un nodo (tenant actual), jerarquía central → sucursales → bodegas de sucursal |
| **SurfaceProfile** | Mapa declarativo `capacidad → clave de superficie` para nav, KPI strip, drawer/rutas del POS, vocabulario de recibo | Cada app (dashboard, POS), leyendo el mismo perfil | Superficie de cafetería (KDS, mesas), superficie de retail (series, garantía, sin cocina) |

---

## Reglas de oro (invariantes)

1. **Un rubro se declara, no se programa.** Si agregar un rubro requiere tocar código de dominio, el seam está mal.
2. **Nada de `if (rubro)` en el dominio.** La condicional por rubro dentro de un servicio de dominio es el síntoma; la capacidad es la solución.
3. **Lo ausente es feature, no bug.** Un rubro sin serie no ve series; no ve "series deshabilitadas".
4. **El rubro no cambia la fiscalidad** (D4). IVA 15%, ISC cuando aplique por rol tributario, y DT 09-2007 se cumplen igual en todos los rubros.
5. **El kardex sigue sagrado.** Append-only, sin DELETE ni UPDATE, correcciones por movimiento compensatorio de signo opuesto. La ubicación no es una excepción.
6. **El contrato offline manda.** Toda configuración de rubro debe caber en el canal determinista de sync, versionada y hasheable, para que un dispositivo re-aprovisionado reproduzca la misma superficie.
7. **Autoridad única.** Un dato de configuración tiene un solo dueño. Tres canales para "rubro" es el defecto actual; agregar un cuarto es el error a evitar.
8. **Un seam sin test de contrato es cosmético.** Si no hay una prueba que falle al agregar un rubro con código, el seam no existe.

---

## Fases

### Fase 0 — Cimientos (bloqueante de todo lo demás)

Esta fase es exactamente lo pedido: dejar asentadas bases, interfaces y adaptadores **antes** de tocar features de rubro.

| # | Slice | Entregable | Issue | Talla |
|---|-------|-----------|-------|-------|
| 0.1 | **VerticalProfile + capacidades** | Campo canónico, documento versionado hasheable, capa de capacidades con revisión y auditoría, proyección al POS offline, reconciliación del triple actual | #819 | L |
| 0.2 | **ItemControlDimensions** | Taxonomía declarada de dimensiones de control; migración de `product_type`/`inventoryPolicy`/`is_perishable` a declaración; validación por capacidad | #819 | M |
| 0.3 | **LocationModel (diseño + modelo)** | Diseño del kardex dimensional, jerarquía de ubicaciones, existencia como proyección `(ítem, ubicación)`, transferencia con tránsito, impacto en el contrato de sync | #818 | L |
| 0.4 | **SurfaceProfile** | Filtrado declarativo de nav, KPI strip, drawer/rutas del POS y vocabulario de recibo; KDS deja de ser incondicional | #819 | M |
| 0.5 | **Dimensiones fiscales** | `serie` por sucursal (DT 09-2007 3.1) y condición contado/crédito (1.7); endurecer inmutabilidad ante UPDATE; autoridad de numeración | #520, #532, #539, #533 | M |

**Gate de Fase 0 (falsable):** declarar `FERRETERIA` debe requerir **solo configuración y datos** — sin cambio en servicios de dominio, sin `if` por rubro, sin migración. Si el gate no pasa, la Fase 0 no cerró y ninguna feature de rubro debe empezar.

**Restricción de 0.3:** puede diseñarse completo en Fase 0, pero su **implementación** vive en Fase 2. La razón es que 0.3 toca el activo más delicado del sistema y no debe implementarse a la par de un cambio de superficies.

### Fase 1 — Retail no serializado (una sucursal)

El rubro más cercano a lo que ya existe: minimarket, ferretería, accesorios, repuestos. Habilita el primer cliente ancla sin multi-sucursal.

- Producto retail: marca/modelo y atributos estructurados; variantes con SKU y precio propios; **SKU/código de barras en la nube** (hoy solo existen en el POS local y el delta de sync los omite); imágenes; historial de precios.
- Verificación funcional del flujo completo en un rubro sin receta: compra → costo CPP → traslado (cuando exista) → venta → kardex → reporte.

### Fase 2 — Multi-sucursal / multi-bodega operativo

Implementación de #818 sobre el diseño de 0.3: transferencias con tránsito, conteos por ubicación, políticas de stock negativo y umbrales por ubicación, reportes y valorización por ubicación.

### Fase 3 — Serialización

Identidad por unidad (IMEI/serie) sobre las dimensiones ya declaradas en 0.2: estado por unidad (en bodega / vendido / devuelto), asociación a factura, garantía y trazabilidad de devolución, RMA de proveedor. Sin bloqueo legal (D9). El diseño debe mantener el kardex como libro de cantidades, con movimientos de cantidad 1 por unidad.

### Fase 4 — Condicionales

- **ISC** (D10): solo si el tenant importa o es primer enajenante.
- **Ciclo de orden de compra / recepción parcial**: decisión fundadora previa lo excluyó; reabrir solo con evidencia de un cliente que lo necesite.
- **Contingencia DT 3.3** (back-entry de facturas manuales): gap conocido y documentado; requiere decisión de negocio además de código.
- **Factura electrónica XML / firma digital**: es el Bloque 19 del roadmap maestro, ortogonal a este plan.

---

## Matriz de capacidades por rubro

| Capacidad | Cafetería | Restaurante | Minimarket | Ferretería | Retail electrónico |
|---|---|---|---|---|---|
| Receta / BOM | Req. | Req. | — | — | — |
| Modificadores | Req. | Req. | — | — | — |
| KDS / cocina | Req. | Req. | — | — | — |
| Mesas / salón | Opc. | Req. | — | — | — |
| Propinas | Req. | Req. | — | — | — |
| Lote / vencimiento | Req. | Req. | Opc. | Opc. | — |
| Multi-ubicación | Opc. | Opc. | Req. | Req. | Req. |
| Identidad por unidad (serie/IMEI) | — | — | — | Opc. | Req. |
| Garantía / RMA | — | — | — | Opc. | Req. |
| Crédito a clientes | — | — | Opc. | Req. | Req. |

Regla: cada fila es una **capacidad** (D1), y cada columna un **bundle declarado** (D2). Ninguna celda debe resolverse con código de dominio.

---

## Presupuesto de revisión y riesgo

| Fase | Talla | Riesgo principal | Mitigación |
|---|---|---|---|
| 0.1 VerticalProfile | L | Cuarta fuente de verdad si no se retira el triple actual | D2 + D7: autoridad única y migración explícita del triple |
| 0.2 ItemControlDimensions | M | Romper items vivos al migrar booleanos a dimensiones | Migración con backfill y regla de no coercionar lo existente |
| 0.3 LocationModel (diseño) | L | Diseñar de más para rubros hipotéticos | D6: solo los tres casos reales documentados |
| 0.4 SurfaceProfile | M | Filtrar mal y esconder algo que el negocio necesita | Test de contrato de superficie por rubro |
| 0.5 Dimensiones fiscales | M | Tocar numeración fiscal de un tenant vivo | #532: hacerlo **ahora**, con un solo tenant y sin documentos que reconciliar; después es una migración sobre datos fiscales emitidos, y "los números impresos no se pueden des-duplicar" |
| Fase 2 implementación | L | Romper el kardex append-only | D5: transferencias como movimientos compensatorios + tránsito |

**Asimetría temporal (de #532):** dos de estos se vuelven **estrictamente más caros** más tarde, porque su corrección requiere migrar datos fiscales o maestros vivos: la autoridad de numeración (0.5) y el maestro de ítems versionado (0.2). El resto se puede posponer sin penalidad. Eso ordena la Fase 0 internamente: **0.5 y 0.2 primero**.

---

## Diferidos y no-goals

- **No-goal:** registro genérico de plugins, carga dinámica de módulos o rutas de código por tenant.
- **No-goal:** reescribir el core en hexagonal (D3).
- **No-goal:** divergencia fiscal por rubro (D4).
- **Diferido:** multi-nivel de sub-recetas, empaques y aprobaciones (deuda ya registrada en el roadmap de inventario).
- **Diferido:** precio por sucursal / listas de precios (abrir issue si un cliente lo pide).

---

## Cómo revisar este plan

1. Lee **Decisiones confirmadas** y **Estado actual verificado** antes de proponer cualquier implementación.
2. Verifica que cada slice declare qué **seam** implementa y cuál es su **test de contrato**.
3. No inicies Fase 1+ mientras el **gate de Fase 0** no pase.
4. Si una propuesta introduce un `if` por rubro en el dominio, rechazala: viola la regla de oro 2.
5. Si una propuesta construye un seam sin dos casos reales, rechazala: viola la regla de oro de D6.
