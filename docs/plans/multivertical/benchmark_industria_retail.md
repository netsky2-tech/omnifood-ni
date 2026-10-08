# Benchmark de industria retail — módulos, capacidades y qué cambia nuestro plan

Documento de análisis. **No propone implementación**: traduce cómo la industria (estándares, ERPs de referencia, especialistas del rubro y competencia local) modela estos negocios, y lo compara con nuestro estado verificado.

Metodología: tres capas de fuente. **Estándares** (ARTS ODM de OMG, GS1 EPCIS+CBV y SGTIN), **plataformas de referencia** (SAP Business One, NetSuite, Odoo, ERPNext, Acumatica) y **especialistas del rubro** (iQmetrix en telecom; CellPoint Pro, CellSmart, MTPOS, Ari, LUCIA POS en celulares; Tellency, BigLedger, NexWave, SerialFlow, Pyrops en electrónica), más **competencia local nicaragüense** (Neox, JC Inventory, Storefront POS, XOLOPOS, Saci). Complementa `adaptabilidad_por_rubro_roadmap.md`.

---

## 1. Los seis hallazgos que cambian el análisis

### F1 — La industria no modela eventos como una lista plana de tipos

GS1/EPCIS separa **tres** cosas que nuestro diseño tenía mezcladas, y el estándar es explícito:

| Parte | Qué representa | Ejemplos normados (CBV 2.0) |
|---|---|---|
| **bizStep** | qué ocurrió | `receiving`, `shipping`, `retail_selling`, `cycle_counting`, `stock_taking`, `inspecting`, `repairing`, `replacing`, `reserving`, `consigning`, `sampling`, `destroying`, `commissioning`, `decommissioning`, `holding` |
| **disposition** | en qué estado quedó el objeto | `sellable`, `in_transit`, `quarantined`, `damaged`, `returned`… |
| **bizTransaction** | el documento que lo respalda | `inv` (factura), `po` (orden de compra), `desadv` (aviso de despacho), `recadv`, `rma`, `pedigree` |

Dato fino que corrige un supuesto común: **`returning` NO es un bizStep válido**. Las devoluciones se modelan con el paso real del proceso (`receiving`, `inspecting`, `staging_outbound`…) más el tipo de transacción `rma`. Es decir: **el documento y el evento son cosas distintas**, y la devolución es una cadena de eventos, no un tipo.

Y `SGTIN = GTIN + número de serie`: la industria distingue formalmente **clase de producto** (lo que se vende) de **instancia específica** (la unidad física que se posee y se rastrea). Nuestro `product` es la clase. La instancia no existe en ningún lado.

Otros estándares relevantes: **ARTS ODM** (OMG) es el modelo de datos operativo de retail de la industria, organizado en *subject areas* y con veinte años de evolución — es el lugar donde verificar nuestros nombres canónicos en lugar de inventarlos.

### F2 — La transferencia es un agregado con estados, no dos contadores

NetSuite distingue tres operaciones que nosotros no tenemos separadas:

| Operación | Impacto contable |
|---|---|
| **Bin transfer** (dentro de una misma ubicación) | **sin impacto** en GL |
| **Inventory transfer** (inmediato) | movimiento de activo |
| **Transfer order** (en tránsito, con cumplimiento y recepción) | activo / **en tránsito**, **nunca COGS** |

SAP Business One usa un **Inventory Transfer document** con bin de origen y destino, y permite partir cantidades entre bins destino. El protocolo que recomienda la práctica de industria para offline-first es un agregado con estados explícitos:

```
DRAFT → DISPATCHED → IN_TRANSIT → RECEIVED → CLOSED
```

con la regla dura: **un tramo sin pareja nunca se vuelve disponible en silencio**. Queda pendiente/excepción y visible.

Esto confirma dos decisiones nuestras (la transferencia **no** afecta CPP; el estado en tránsito es explícito) y agrega una que no teníamos: **la transferencia necesita identidad de documento y ciclo de vida**, no solo dos movimientos.

### F3 — En inventario serializado, el estado es de la unidad, no del producto

El patrón que se repite en todos los especialistas es una proyección de estado por unidad sobre un libro de eventos inmutable:

```
serial_id, sku, custody_store, status, version, last_event_id
status ∈ AVAILABLE | RESERVED | IN_TRANSIT | RECEIVED | SOLD | RETURNED | QUARANTINED
```

Con una consecuencia operativa que la industria exige: **escaneo obligatorio en venta, despacho y recepción**. Sin escaneo no hay custodia verificable.

Nuestro kardex ya es el libro de eventos inmutable correcto. Lo que falta es la **proyección por unidad** encima — y esa proyección es la que habilita garantía, RMA y devolución por unidad.

### F4 — Nunca last-write-wins para custodia serializada

Es el punto donde la industria es más explícita, y nosotros no lo teníamos resuelto. Políticas deterministas recomendadas:

| Conflicto | Manejo |
|---|---|
| El mismo equipo vendido dos veces offline | **conservar ambos registros financieros**, resolver después (devolución, sustitución o investigación de faltante). Nunca borrar una venta |
| Venta vs despacho de transferencia | el primer evento con versión de serie válida gana; el otro es excepción |
| Destino recibe una serie que nunca se despachó | `QUARANTINED`, requiere investigación y aprobación |
| Reintento de sync duplicado | deduplicar por ID de evento inmutable / idempotency key |

Regla transversal: **los terminales offline pueden registrar la realidad localmente, pero nunca sobrescribir historia conflictiva de inventario serializado.** Y debe existir una **cola de reconciliación operable por humanos**; pretender que el conflicto concurrente offline siempre se resuelve solo es el error a evitar.

Nuestra ventaja acá es grande: ya tenemos el libro inmutable, la deduplicación por idempotencia y el concepto de alerta operativa (`AttentionBand`). Lo que falta es **generalizar esa cola** más allá de la secuencia fiscal.

### F5 — Lo que en Nicaragua ya es piso, no techo

La competencia local anuncia, desde C$800/mes: inventario por equipo/IMEI, **cartera con límite de crédito por cliente**, vencimientos y **abonos**, reportes por estado y fecha, **apartado con prima**, **calendario de cuotas**, **mora**, estado de cuenta por cliente, caja, compras, **bodegas y sucursales**, roles y auditoría. Y la especialización vertical es real: en celulares, **activación con operadora y comisiones** es un módulo propio.

Conclusión incómoda y necesaria: **esos módulos no son diferenciación, son el piso del rubro.** Nuestra diferenciación real es otra y hay que protegerla:

1. **Offline-first determinista de verdad** (outbox, idempotencia, secuencia por origen, sync verificable) — el punto más débil de la competencia local.
2. **Kardex y costeo fiscal-grade** (CPP, FX BCN por fecha de factura, inmutabilidad append-only).
3. **Un mismo motor para comida y retail**: recetas/BOM y reventa serializada conviviendo, que es lo que nadie de la lista hace.

Riesgo estratégico explícito: si el plan persigue paridad de módulos contra un competidor de C$800/mes, perdemos por precio y no por arquitectura.

### F6 — "Kit" comercial no es una receta

NetSuite vende **kits**: un ítem que agrupa miembros (teléfono + funda + protector), con precio propio y descarga de componentes. Nuestro `COMPOUND` **no** sirve para eso: está atado a la rama de recetas — `recipe.service.ts:36,43` admite exclusivamente `PREPARED | COMPOUND`, y `checkout_inventory_preparation_service.dart:71` lo mapea a `AuthorityInventoryKind.compound`. Modelar un kit comercial con `COMPOUND` metería un concepto comercial dentro del motor de producción. Son dos cosas distintas y deben tener dos representaciones.

---

## 2. Mapa de módulos de industria vs. nuestro estado

Leyenda: **✔ Existe** (verificado) · **◐ Parcial** · **✘ Ausente** · **⚑ Decisión estratégica**

### Capa 1 — Datos maestros

| Módulo / capacidad | Industria | Nosotros | Nota |
|---|---|---|---|
| Clase de producto (SKU, marca, modelo, categoría, UOM) | Requerido | ◐ | falta marca/modelo; SKU solo existe en el POS local, no en la nube |
| Instancia identificada (SGTIN / serie / IMEI) | Requerido en el rubro | ✘ | GS1 lo formaliza como GTIN + serie |
| Atributos por unidad (grado, condición, defectos, costo) | Requerido en usados | ✘ | resuelve también "caja dañada" en nuevos |
| Jerarquía de ubicaciones (almacén → bin) | Requerido | ✘ | `warehouse` es etiqueta plana (#818) |
| Listas de precios, nivel por cliente, volumen, periodo | Requerido en retail | ✘ | SAP B1: derivación por factor; NetSuite: price levels por cliente |
| Kits y bundles comerciales | Requerido | ✘ | ver F6 |
| Conversiones de UOM | Requerido | ✔ | `uom_conversions` |
| Proveedor con plazo de crédito | Requerido | ✔ | `supplier.entity.ts` |
| Cliente como entidad de crédito | Requerido | ✘ | #820 |

### Capa 2 — Inventario y logística

| Módulo / capacidad | Industria | Nosotros | Nota |
|---|---|---|---|
| Libro de eventos inmutable con costo | Requerido | ✔ | **fortaleza**: kardex append-only + CPP |
| Recepción de compra con documento fiscal y FX | Requerido | ✔ | factura de proveedor + BCN por fecha |
| Transferencias con documento, tránsito y conciliación | Requerido | ✘ | #818, con la forma de F2 |
| Conteos cíclicos por ubicación | Requerido | ◐ | conteos existen, sin dimensión de ubicación |
| Ajustes con motivo, autor y alerta forense | Requerido | ✔ | taxonomía PRD + umbral C$1,500 |
| Merma / destrucción con motivo y aviso DGI | Requerido | ◐ | falta aviso de 10 días y `DESTRUCCION` |
| Cuarentena / staging de RMA (ubicación) | Recomendado | ✘ | el "defectuoso" vive acá, no como tipo de movimiento |
| Reabastecimiento (min/max/par, sugerencia) | Requerido | ◐ | par/min en insumos + reporte de sugeridos |
| Devolución a proveedor y reclamo | Requerido | ✘ | cierra el ciclo de RMA |
| Reversa logística / refurbish con grado | Recomendado | ✘ | Pyrops, BigLedger |

### Capa 3 — Venta y canales

| Módulo / capacidad | Industria | Nosotros | Nota |
|---|---|---|---|
| POS con sesión de caja y arqueo | Requerido | ✔ | cash sessions |
| Apartado / reserva con prima y cuotas | Requerido en el rubro | ✘ | CBV tiene `reserving` como paso normado |
| Trade-in / buy-back con grado | Requerido en celulares | ✘ | es compra a cliente, no devolución |
| Promociones y descuentos | Requerido | ✔ | módulo `promotions` |
| Fidelización / puntos | Común | ✔ | `loyalty` |
| Multi-canal (tienda + web + marketplace, un stock) | Estándar en la industria | ✘ | ⚑ frontera estratégica del producto |
| Activación con operadora y comisiones | Rubro telecom | ✘ | ⚑ plugin de rubro, no core |
| Facturación fiscal DT 09-2007 | Legal | ◐ | serie por sucursal, condición contado/crédito (#539) |

### Capa 4 — Postventa y servicio

| Módulo / capacidad | Industria | Nosotros | Nota |
|---|---|---|---|
| Registro de garantía por unidad | Requerido en el rubro | ✘ | depende de la instancia identificada |
| Orden de servicio / reparación (ticket, técnico, repuestos, cotización) | Requerido en celulares/electrónica | ✘ | CellSmart, CellPoint, Ari: módulo propio |
| RMA a proveedor con seguimiento | Requerido | ✘ | documento con `rma` como tipo de transacción |
| Garantía de fábrica vs. del comercio | Requerido | ✘ | decide quién absorbe el costo |

### Capa 5 — Finanzas, crédito y cobro

| Módulo / capacidad | Industria | Nosotros | Nota |
|---|---|---|---|
| CxC / cartera (límite, plazo, vencimiento, antigüedad) | Requerido | ✘ | #820 |
| Abonos y recibos de caja con numeración propia | Requerido | ✘ | DT 09-2007 3.2 exige los mismos requisitos que una factura |
| Cobranza / mora / interés | Común | ✘ | aplazable; la estructura debe soportarlo |
| CxP a proveedores | Requerido | ◐ | hay plazo de crédito, no documento |
| Caja, arqueo, cierre de turno | Requerido | ✔ | |
| Costeo CPP y multimoneda con FX | Requerido | ✔ | **fortaleza** |

### Capa 6 — Plataforma

| Módulo / capacidad | Industria | Nosotros | Nota |
|---|---|---|---|
| Multi-tenant con aislamiento (RLS) | Requerido | ✔ | |
| Offline-first determinista | Diferenciador | ✔ | **fortaleza principal** |
| Perfil de rubro y capacidades | Requerido para multi-rubro | ✘ | #819 |
| Superficies declarativas (nav, KPI, pantallas) | Requerido para multi-rubro | ✘ | #819 |
| Nivel edge de tienda (LAN broker) | Recomendado | ◐ | Topología A diseñada, no implementada |
| Cola de reconciliación de conflictos con decisión humana | Requerido si hay seriales | ◐ | existen alertas (secuencia/auditoría); falta generalizar |

---

## 3. Qué cambia en nuestro plan

| ID | Decisión nueva | Impacto |
|---|---|---|
| **D14** | **Adoptar el modelo de eventos GS1 de tres partes** (bizStep / disposition / bizTransaction) como vocabulario canónico del inventario, en lugar de una lista plana de tipos de movimiento | Corrige y normaliza la taxonomía propuesta en #818; evita inventar nombres |
| **D15** | **La custodia serializada nunca se resuelve por last-write-wins.** Toda ambigüedad va a una cola de reconciliación con decisión humana, conservando ambos registros financieros | Nuevo requisito de plataforma; se apoya en el patrón de alertas existente |
| **D16** | **Kit comercial ≠ receta.** Un kit descarga componentes y tiene precio propio; una receta produce un ítem | Evita meter un concepto comercial en el motor de producción |
| **D17** | **Grado/condición es atributo de la instancia, no de la clase** | Habilita usados, refurbished y mercancía con empaque dañado con un solo mecanismo |

Ajustes de fase: **Fase 1** suma listas de precios; **Fase 2** toma la forma de agregado con estados de F2; **Fase 3** suma grado/condición y registro de garantía por unidad; **Fase 4** (cartera) suma apartado/cuotas y trade-in como capacidades separadas; **Fase 5** suma servicio técnico, CxP formal, multi-canal y plugins de rubro.

**Prioridad estratégica (F5):** el plan debe priorizar lo que la competencia local no puede copiar barato — offline-first verificable, costeo fiscal-grade, y un solo motor para comida y retail — antes que la paridad de módulos.

---

## 4. Preguntas de alcance abiertas (decidir, no implementar)

| # | Pregunta | Qué define |
|---|---|---|
| Q1 | ¿Multi-canal (web/marketplace sobre un mismo stock) entra algún día, o el producto es tienda? | Si entra, la proyección de disponibilidad debe ser reservable desde el inicio |
| Q2 | ¿Apartado/cuotas es capacidad propia o parte de cartera? | Superficie, roles y ciclo de vida distintos |
| Q3 | ¿Servicio técnico es core o plugin del rubro? | Exige técnico, repuestos, cotización y estados de reparación |
| Q4 | ¿Trade-in / buy-back entra, o solo devoluciones? | Es compra a cliente con grado, no devolución |
| Q5 | ¿CxP formal con documentos, o basta el plazo del proveedor? | Decisión de alcance financiero |
| Q6 | ¿Grado/condición aplica solo a usados, o también a nuevos con empaque dañado? | Decide si es atributo opcional o universal |
| Q7 | ¿Activación con operadora y comisiones entra si algún día el ancla es telecom? | Confirma el modelo de plugins de rubro |
