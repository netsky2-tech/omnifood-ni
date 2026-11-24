# NHILOS — Arquitectura Web y Grupos Transaccionales

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_seo_architecture_v1.0.md` |
| Versión | 1.6 |
| Estado | WORKING DRAFT — agrupación con datos de Planner; prioridad fit-first |
| Owner | Founder / Marketing |
| Base | [Buyer avatar](./nhilos_web_buyer_avatar_v1.0.md), [oportunidades de keywords](./nhilos_web_keyword_opportunities_v1.0.md), [guía de Keyword Planner](./nhilos_web_keyword_planner_guide_v1.0.md), [inventario de contenido](./nhilos_web_content_inventory_and_reuse_v1.0.md) y [análisis de keyword ideas](./nhilos_web_keyword_ideas_analysis_v1.0.md) |
| Fuente de keywords | 14 partes de `Keyword Stats`; 532 keywords únicas; dataset limpio en [`nhilos_web_keyword_planner_historical_v1.0.csv`](./nhilos_web_keyword_planner_historical_v1.0.csv) |
| Fecha | 2026-11-16 |
| Objetivo | Agrupar keywords, definir una principal por grupo y proponer una arquitectura web sin canibalización, filtrada por producto real |

---

## 1. Estado de los datos recibidos

El primer archivo, `Keyword Forecasts 2026-11-16 at 13_16_07.csv`, **no se usó**: era un Forecast agregado por dispositivo, sin columna `Keyword`.

Después llegaron **14 partes de `Keyword Stats`**. En disco hay 15 archivos porque existe un `part13` duplicado; se conservó la versión con timestamp más reciente (`13:37:54`) para cada keyword repetida.

### Lo que dicen los datos

- 578 filas originales.
- **532 keywords únicas** después de normalizar y deduplicar.
- **184** con `Avg. monthly searches = 50`.
- **348** con `Avg. monthly searches = 0`.
- **487** con competencia `Unknown`; 24 `Low`, 8 `Medium`, 13 `High`.
- **44** con modificador Nicaragua/Managua; solo **2** de esas con volumen 50.
- **157** con intención gratis/descargar/crack.
- **13** de marcas competidoras.
- **2** de facturación electrónica.

### Límites de lectura

- Las columnas mensuales vienen vacías o en `0` en todas las filas. **No hay tendencia mensual utilizable.**
- `50` es un bucket de Keyword Planner, no un promedio exacto.
- `0` significa “sin datos suficientes”, no “cero demanda”.
- Solo 3 keywords tienen rango de bid, y las tres son de inventario gratis. No hay CPC útil para las keywords core.
- El archivo no declara ubicación ni idioma. La presencia de `tpv hostelería` y términos de España indica que el set **no está limpio por mercado Nicaragua**.

**Decisión:** no se prioriza por volumen bruto. Se prioriza por **fit con el producto**, usando el volumen solo como señal de orden. El análisis completo está en [`nhilos_web_keyword_ideas_analysis_v1.0.md`](./nhilos_web_keyword_ideas_analysis_v1.0.md).

---

## 2. Criterios de agrupación

- Solo keywords con intención comercial o de soporte que justifiquen una página; las informativas genéricas van a recursos, no a la arquitectura principal.
- Se eliminan duplicados y variantes que significan lo mismo.
- Cada grupo tiene **una sola keyword principal**.
- Cada grupo tiene **una sola URL objetivo**.
- Una URL no compite con otra por la misma intención.
- Las variantes locales no crean página propia salvo que exista contenido local único.
- Las páginas de soporte no se usan como target principal de una keyword transaccional.
- La prioridad es **fit-first**: una keyword con volumen pero sin fit no crea página.
- `0` en el Planner no significa demanda cero; significa que no hay dato suficiente.
- Las keywords de “gratis”, “descargar”, “crack”, Excel o PDF no se convierten en páginas de producto.
- Las marcas competidoras solo entran en comparativas honestas, nunca como página de producto.

### 2.1 Filtro de realidad y claims

Antes de asignar una keyword a una página, la página debe poder sostener el claim con producto real. El inventario completo está en [`nhilos_web_content_inventory_and_reuse_v1.0.md`](./nhilos_web_content_inventory_and_reuse_v1.0.md).

Reglas vinculantes:

- **DGI:** no vender “DGI 100%”, “cumplimiento total” ni “sistema autorizado por la DGI”. La posición exacta de NHILOS: el producto garantiza la **mecánica normativa** de la DT 09-2007 (numeración consecutiva inalterable, anulación solo con motivo formal auditado, trazabilidad y libros exportables). La **autorización formal** (carta de autorización, código y numeración autorizada) la obtiene y la posee **cada cliente contribuyente**; NHILOS no está registrado como empresa ni posee autorización DGI. Aclarar siempre que **no es factura electrónica en línea** y que el cliente registra su propia autorización en el Paso 04 de implementación.
- **Offline:** la continuidad aplica a terminal enrolado y catálogo hidratado. No prometer “nunca pierdes una venta”, “cero pérdida” ni multi-terminal sin internet.
- **Nube:** la sincronización es eventual. No usar “100% sincronizado”, “todo queda sincronizado” ni “instantáneo” como garantía.
- **Datos:** no publicar métricas, capturas o “evidencia real” si los datos son de demostración. Etiquetar “Datos de demostración” o usar datos reales con provenance.
- **Precio/implementación:** no inventar precios ni plazos. Usar “cotización según operación” y “tiempo depende de tu catálogo”.
- **Inventario:** todo claim debe alinearse con `docs/inventario_marco_normativo.md` y declarar los `R-01`..`R-07` que toque.
- **Prueba:** si no hay evidencia, se elimina el claim o se usa un stand-in etiquetado. No se maquilla con diseño.

La H1 actual “Nunca dejas de vender” **no se reutiliza** como promesa principal: es continuidad absoluta. La reemplazamos por una fórmula condicionada, por ejemplo: “Cobra y factura aunque se caiga el internet”.

---

## 3. Grupos transaccionales

| Grupo | Keywords agrupadas | Keyword principal | URL objetivo | Fase |
|---|---|---|---|---|
| G1. Food park / food court | `software para food park`; `sistema POS para food park`; `sistema POS para food court`; `administración de food park`; `software para food park en Managua` | `software para food park` | `/software-pos/food-parks/` | P0 |
| G2. POS para restaurantes | `sistema POS para restaurante`; `sistema POS para restaurante en Nicaragua`; `sistema POS Nicaragua`; `software para restaurantes Nicaragua`; `POS para restaurante`; `punto de venta para restaurante` | `sistema POS para restaurante` | `/software-pos/restaurantes/` | P0 |
| G3. Caja para restaurantes | `sistema de cierre de caja`; `arqueo de caja restaurante`; `cierre de caja restaurante`; `control de caja restaurante`; `programa de caja para restaurante` | `sistema de cierre de caja` | `/software-pos/caja/` | P1 |
| G4. Facturación para cafeterías | `sistema de facturación para cafetería`; `sistema POS para cafetería`; `software para cafeterías Nicaragua` | `sistema de facturación para cafetería` | `/facturacion-dgi/cafeterias/` | P2 |
| G5. POS para bares | `sistema POS para bar`; `POS para bar`; `POS para bares`; `sistema para bares Nicaragua` | `sistema POS para bar` | `/software-pos/bares/` | P1 |
| G6. Facturación DGI para restaurantes | `software de facturación DGI para restaurantes`; `facturación DGI Nicaragua`; `sistema de facturación DGI`; `facturación DT 09-2007` | `software de facturación DGI para restaurantes` | `/facturacion-dgi/restaurantes/` | P0 |
| G7. POS con facturación DGI | `sistema POS con facturación DGI`; `POS con facturación DGI` | `sistema POS con facturación DGI` | `/software-pos/facturacion-dgi/` | P1 |
| G8. POS sin internet | `sistema POS sin internet para restaurante`; `POS sin internet`; `punto de venta sin internet`; `sistema POS offline` | `sistema POS sin internet para restaurante` | `/software-pos/sin-internet/` | P0 |
| G9. Inventario para restaurantes | `sistema de inventario para restaurante`; `control de inventario restaurante`; `inventario de restaurante`; `kardex de restaurante`; `inventario de cocina para restaurante`; `sistema POS inventario` | `sistema de inventario para restaurante` | `/inventario/restaurantes/` | P0 |
| G10. Inventario para food parks | `software de inventario para food park`; `inventario para food park` | `software de inventario para food park` | `/inventario/food-parks/` | P2 |
| G11. Multisucursal | `sistema para varias sucursales de restaurante`; `sistema para varios locales`; `reportes de ventas por sucursal` | `sistema para varias sucursales de restaurante` | `/software-pos/multisucursal/` | P2 |
| G12. Hardware / kit | `kit punto de venta restaurante`; `terminal punto de venta restaurante`; `punto de venta restaurante tablet`; `sistema POS táctil Nicaragua`; `impresora térmica para POS Nicaragua` | `kit punto de venta restaurante` | `/software-pos/hardware/` | P1 |
| G13. Precio, cotización y compra | `precio de sistema POS para restaurante en Nicaragua`; `cotización de sistema POS en Nicaragua`; `comprar sistema de facturación para restaurante` | `precio de sistema POS para restaurante en Nicaragua` | `/precios/` | P0 |
| G14. Demo | `demo de sistema POS para restaurante` | `demo de sistema POS para restaurante` | `/demo/` | P0 |
| G15. Implementación | `instalar sistema POS en mi restaurante` | `instalar sistema POS en mi restaurante` | `/implementacion/` | P1 |
| G16. Comparativas | `mejores puntos de venta para restaurantes`; `comparativa sistemas POS Nicaragua`; `mejor sistema POS Nicaragua`; `POS vs Excel`; `POS local vs nube` | `mejores puntos de venta para restaurantes` | `/comparativas/` | P1 |
| G17. Comida rápida / QSR | `software comida rápida`; `software de comida rápida`; `sistema POS para comida rápida`; `punto de venta comida rápida`; `software para negocio de comida rápida` | `software comida rápida` | `/software-pos/comida-rapida/` | P1 |

### Notas de deduplicación

- `food park` y `food court` son la misma intención comercial: van a `/software-pos/food-parks/`.
- `comida rápida`, `fast food`, `pizzería` y `taquería` no crean una URL por cocina. Van a `/software-pos/comida-rapida/` como página de segmento, con secciones para cada variante.
- `sistema POS para restaurante`, `sistema POS para restaurante en Nicaragua` y `sistema POS Nicaragua` no crean tres URLs. La primera es primaria; las otras son secundarias y locales.
- `sistema de inventario para restaurante` y `sistema de inventario y facturación para restaurante` van a la misma página de inventario. La facturación se explica allí, pero la página DGI conserva su propio ángulo.
- `caja`, `arqueo` y `cierre` son la misma página de feature; los how-to van a recursos.
- `precio`, `cotización` y `comprar` son la misma etapa; no se crean tres URLs.
- `demo` e `instalar` son etapas distintas: una es preventa, la otra es postventa. Sí van en URLs separadas.
- `gratis`, `descargar`, `crack`, Excel, PDF y TPV de España **no crean página**.
- **Revisión de la exclusión retail (2026-11-16):** `conveniencia`, `tienda`, `miscelánea` y `farmacia/ferretería/ropa` **dejan de estar excluidas por fit**: el producto cubre venta y reventa pura sin recetas (`ProductType.SIMPLE`, caso operativo actual). Pasan a **candidatas**: se incluyen en el próximo export de Keyword Planner y se crean URLs solo con demanda medida. La exclusión previa asumía producto exclusivamente gastronómico y quedó obsoleta.
- `facturación electrónica` **no se targetea como producto**: es un gap.
- Las marcas competidoras solo entran en `/comparativas/`, con metodología honesta y fecha.

### Notas de prioridad

- G2 y G9 son P0 por demanda medida y fit directo.
- G1 es P0 por avatar y posicionamiento, no por volumen: el food park es el núcleo del producto.
- G8 es P0 por diferenciador y objeción, no por volumen: offline es la promesa que sostiene la decisión.
- G4, G10 y G11 bajan a P2 porque no tienen volumen observado ni prueba local única.
- G12, G16 y G17 suben a P1 porque tienen keywords con 50 y una intención comercial recognizable.

---

## 4. Arquitectura web propuesta

### 4.1 Reuso de la web actual

> **Principio de construcción (2026-11-16):** la arquitectura SEO de este documento es la fuente de verdad de la estructura del sitio. El artboard `04-sintesis-hibrida.html` es un **prototipo de diseño y media, no la arquitectura**: sus secciones, clips y capturas se reutilizan como bloques de contenido donde la IA los requiere, y se reestructura libremente cuando los briefs lo piden. El diseño se adapta a la arquitectura; la arquitectura nunca se adapta al diseño.

La web desplegada ya tiene secciones que prueban el producto. No se reescribe todo: se reutiliza lo que es verdad y se corrige lo que promete de más.

| Página objetivo | Secciones actuales reutilizables | Ajuste obligatorio |
|---|---|---|
| `/` | Hero, cuatro certezas, hilo, roles, seguridad, demo | Reescribir H1 y claims absolutos; etiquetar datos demo |
| `/software-pos/` | Hero, roles, hilo, seguridad | Ajustar continuidad y “tiempo real” |
| `/software-pos/restaurantes/` | Hilo, roles/cajero, KDS | Enfocar en restaurante |
| `/software-pos/food-parks/` | Hilo, roles, onboarding, demo | Enfocar en food park/food court |
| `/software-pos/comida-rapida/` | Hilo, roles, KDS, demo | Adaptar a mostrador, frito y QSR; no duplicar food park |
| `/software-pos/sin-internet/` | Simulador offline, backoffice sync, FAQ | Quitar “100%”, “todo”, “instantáneo” |
| `/software-pos/caja/` | Roles/supervisor, seguridad, FAQ de caja | Añadir arqueo/cierre específico |
| `/software-pos/bares/` | Hilo, roles, KDS | Adaptar a barra y cuentas abiertas |
| `/software-pos/facturacion-dgi/` | Módulo fiscal, seguridad, FAQ | Separar POS + DGI de facturación sola |
| `/software-pos/multisucursal/` | Módulo de flota, rol supervisor | Explicar consolidación vía nube, no LAN |
| `/software-pos/hardware/` | Onboarding/hardware, FAQ | No prometer hardware no soportado |
| `/facturacion-dgi/` | Módulo fiscal, seguridad, FAQ | Añadir “qué sí y qué no es DT 09-2007” |
| `/facturacion-dgi/restaurantes/` | Módulo fiscal, anulación, FAQ | Explicar Nota de Crédito y folio autorizado |
| `/facturacion-dgi/cafeterias/` | Módulo fiscal, onboarding | Adaptar ejemplos a cafetería |
| `/inventario/` | Módulo BOM/Kardex, seguridad | Alinear con `R-01`..`R-07` |
| `/inventario/restaurantes/` | BOM/Kardex, merma, FAQ | Explicar receta publicada y límites |
| `/inventario/food-parks/` | BOM/Kardex, roles | Adaptar a múltiples puestos |
| `/precios/` | Onboarding, demo | No publicar precio sin aprobación |
| `/demo/` | Formulario, soporte | Mantener canales reales |
| `/implementacion/` | Onboarding | Reemplazar “15 min” por alcance |
| `/comparativas/` | Hilo, módulos | Comparación honesta |
| `/recursos/costeo-recetas/` | BOM/Kardex, módulos | Recurso educativo; no prometer exactitud |
| `/casos/` | Ninguna | No crear hasta tener casos reales |
| `/soporte/` | Soporte/garantías | Publicar solo canales y SLA reales |

Detalle completo, hallazgos `BLOCKER` / `REQUIRED` y tabla de reescritura: [`nhilos_web_content_inventory_and_reuse_v1.0.md`](./nhilos_web_content_inventory_and_reuse_v1.0.md).

### 4.2 Árbol de URLs

```text
/
├── /software-pos/                         [HUB P0]
│   ├── /restaurantes/                     [P0 · G2]
│   ├── /food-parks/                       [P0 · G1]
│   │   └── /managua/                      [P2 opcional · solo con prueba local]
│   ├── /sin-internet/                     [P0 · G8]
│   ├── /caja/                             [P1 · G3]
│   ├── /bares/                            [P1 · G5]
│   ├── /comida-rapida/                    [P1 · G17]
│   ├── /facturacion-dgi/                  [P1 · G7]
│   ├── /hardware/                         [P1 · G12]
│   └── /multisucursal/                    [P2 · G11]
│
├── /facturacion-dgi/                      [HUB P0]
│   ├── /restaurantes/                     [P0 · G6]
│   ├── /cafeterias/                       [P2 · G4]
│   └── /como-anular-factura-vet/          [SOPORTE P2]
│
├── /inventario/                           [HUB P0]
│   ├── /restaurantes/                     [P0 · G9]
│   └── /food-parks/                       [P2 · G10]
│
├── /comparativas/                         [P1 · G16]
│   ├── /pos-vs-excel/
│   └── /pos-local-vs-nube/
│
├── /precios/                              [P0 · G13]
├── /demo/                                 [P0 · G14]
├── /implementacion/                       [P1 · G15]
│
├── /recursos/                             [SOPORTE P2]
│   ├── /merma/
│   ├── /caja/
│   └── /costeo-recetas/
│
└── /casos/                                [P2 · bloqueado hasta tener casos reales]
```

### Regla de los hubs

- `/software-pos/` ataca `sistema POS Nicaragua` (término cabeza; no compite con las páginas de segmento).
- `/facturacion-dgi/` ataca `sistema de facturación DGI en Nicaragua`.
- `/inventario/` ataca `sistema de inventario Nicaragua`.

Los hijos atacan segmentos específicos. El hub no debe usar la misma keyword principal que un hijo.

### Reglas de datos

- El volumen no crea una URL. La intención + el fit + la prueba de producto sí.
- `0` en el Planner no es demanda cero; es ausencia de dato.
- No se crean páginas locales por ciudad sin dirección, caso o contenido diferencial.
- No se crean páginas para “gratis”, “descargar”, “crack”, Excel o PDF.
- No se crean páginas de facturación electrónica: el producto no la ofrece.
- No se crean páginas de marcas competidoras; solo comparativas honestas.
- Food park y QSR son segmentos distintos: food park agrupa puestos; QSR agrupa comida rápida, mostrador y frito.

---

## 5. Mapa de páginas

> Regla de copy: toda página debe declarar su claim permitido y su límite. En DGI, la fórmula base es “mecánica normativa DT 09-2007: consecutivo inalterable y anulación auditada; la autorización DGI (carta, código y numeración) corresponde al contribuyente; no es factura electrónica en línea”. En offline, “terminal enrolado y catálogo hidratado”.

| URL | Keyword principal | Keywords secundarias | CTA |
|---|---|---|---|
| `/software-pos/` | `sistema POS Nicaragua` | `punto de venta Nicaragua`, `software punto de venta Nicaragua`, `programa punto de venta Nicaragua` | Demo |
| `/software-pos/restaurantes/` | `sistema POS para restaurante` | `sistema POS para restaurante en Nicaragua`, `software para restaurantes Nicaragua`, `POS para restaurante`, `punto de venta para restaurante` | Demo |
| `/software-pos/food-parks/` | `software para food park` | `software para food park en Managua`, `sistema POS para food park`, `sistema POS para food court`, `administración de food park` | Demo con menú |
| `/software-pos/sin-internet/` | `sistema POS sin internet para restaurante` | `POS sin internet`, `punto de venta sin internet`, `sistema POS offline` | Demo |
| `/software-pos/caja/` | `sistema de cierre de caja` | `arqueo de caja restaurante`, `cierre de caja restaurante`, `control de caja restaurante`, `programa de caja para restaurante` | Demo |
| `/software-pos/bares/` | `sistema POS para bar` | `POS para bar`, `POS para bares`, `sistema para bares Nicaragua` | Demo |
| `/software-pos/comida-rapida/` | `software comida rápida` | `software de comida rápida`, `sistema POS para comida rápida`, `punto de venta comida rápida`, `software para negocio de comida rápida` | Demo |
| `/software-pos/facturacion-dgi/` | `sistema POS con facturación DGI` | `POS con facturación DGI` | Demo |
| `/software-pos/hardware/` | `kit punto de venta restaurante` | `terminal punto de venta restaurante`, `punto de venta restaurante tablet`, `sistema POS táctil Nicaragua`, `impresora térmica para POS Nicaragua` | Demo |
| `/software-pos/multisucursal/` | `sistema para varias sucursales de restaurante` | `sistema para varios locales`, `reportes de ventas por sucursal` | Demo |
| `/facturacion-dgi/` | `sistema de facturación DGI en Nicaragua` | `facturación DGI Nicaragua`, `sistema de facturación Nicaragua` | Demo/checklist |
| `/facturacion-dgi/restaurantes/` | `software de facturación DGI para restaurantes` | `facturación DGI para restaurantes`, `sistema de facturación DGI`, `facturación DT 09-2007` | Demo/checklist |
| `/facturacion-dgi/cafeterias/` | `sistema de facturación para cafetería` | `sistema POS para cafetería`, `software para cafeterías Nicaragua` | Demo |
| `/inventario/` | `sistema de inventario Nicaragua` | `software de inventario Nicaragua`, `sistema kardex Nicaragua` | Demo |
| `/inventario/restaurantes/` | `sistema de inventario para restaurante` | `control de inventario restaurante`, `inventario de restaurante`, `kardex de restaurante`, `inventario de cocina para restaurante`, `sistema POS inventario` | Demo/calculadora |
| `/inventario/food-parks/` | `software de inventario para food park` | `inventario para food park`, `sistema de inventario para food park` | Demo |
| `/comparativas/` | `mejores puntos de venta para restaurantes` | `comparativa sistemas POS Nicaragua`, `mejor sistema POS Nicaragua`, `POS vs Excel`, `POS local vs nube` | Comparativa |
| `/precios/` | `precio de sistema POS para restaurante en Nicaragua` | `cotización de sistema POS en Nicaragua`, `comprar sistema de facturación para restaurante` | Cotización |
| `/demo/` | `demo de sistema POS para restaurante` | `solicitar demo sistema POS`, `demo sistema POS Nicaragua` | Formulario |
| `/implementacion/` | `instalar sistema POS en mi restaurante` | `instalación sistema POS Nicaragua` | Agenda |

---

## 6. Reglas anti-canibalización

1. **Una keyword principal por URL.** No repetir el mismo primary en dos páginas.
2. **No crear una URL por variante.** Si dos queries significan lo mismo, van a la misma página.
3. **Las variantes locales no crean página automáticamente.** Solo crea `/managua/` si tienes prueba local, dirección, caso o contenido diferencial. Si no, usa una sección en la página padre.
4. **DGI compliance vs POS con DGI son ángulos distintos.**
   - `/facturacion-dgi/restaurantes/`: cumplimiento, factura, VET, anulación.
   - `/software-pos/facturacion-dgi/`: POS, caja, offline, operación diaria con facturación.
5. **Caja vs POS son ángulos distintos.**
   - `/software-pos/caja/`: cierre, arqueo, propinas, descuadres.
   - `/software-pos/restaurantes/`: operación completa del restaurante.
6. **Precio, cotización y compra viven en `/precios/`.** No crear `/comprar/` o `/cotizacion/` si no tienen contenido propio.
7. **Demo e implementación viven separados.** Son etapas distintas: preventa vs postventa.
8. **Canonical self.** No canonizar una página hija al hub salvo que sea contenido duplicado.
9. **Revisar Search Console cada mes.** Si dos URLs empiezan a recibir la misma query, fusiona o diferencia el ángulo.
10. **Food park vs comida rápida.** `/software-pos/food-parks/` agrupa puestos y food court; `/software-pos/comida-rapida/` agrupa mostrador, frito y QSR. No repetir la misma primary.
11. **Inventario vs DGI.** `/inventario/restaurantes/` vende control de stock, recetas y kardex; `/facturacion-dgi/restaurantes/` vende cumplimiento y anulación. La facturación se menciona, no se convierte en la primary del inventario.
12. **Comparativas vs producto.** `/comparativas/` compara con metodología; no es una landing de venta ni repite la primary de `/software-pos/restaurantes/`.
13. **Gratis no es un segmento.** No se crea una página para “gratis” ni para “descargar”. Si se menciona, es dentro de una comparativa honesta.

---

## 7. Enlazado interno

- Home → `/software-pos/`, `/facturacion-dgi/`, `/inventario/`, `/comparativas/`, `/precios/`, `/demo/`.
- Cada hub → sus hijos.
- Cada página hija → `/precios/`, `/demo/` y `/implementacion/`.
- `/software-pos/` → `/software-pos/comida-rapida/`, `/software-pos/bares/` y `/software-pos/restaurantes/`.
- `/software-pos/food-parks/` ↔ `/software-pos/comida-rapida/` (food court vs QSR, con anchors distintos).
- `/facturacion-dgi/restaurantes/` → `/facturacion-dgi/como-anular-factura-vet/`.
- `/inventario/restaurantes/` → `/recursos/merma/` y `/recursos/costeo-recetas/`.
- `/inventario/food-parks/` → `/recursos/merma/`.
- `/software-pos/caja/` → `/recursos/caja/`.
- `/comparativas/` → `/software-pos/restaurantes/`, `/software-pos/sin-internet/` y `/precios/`.
- `/comparativas/pos-vs-excel/` → `/software-pos/` y `/precios/`.
- `/casos/` → páginas de segmento relevantes.

Los anchors deben ser descriptivos, no “click aquí”. No usar el mismo anchor exacto desde 20 páginas al mismo destino.

---

## 8. Fases de construcción

### P0 — Primera ola

1. `/software-pos/`
2. `/software-pos/restaurantes/`
3. `/software-pos/food-parks/`
4. `/software-pos/sin-internet/`
5. `/facturacion-dgi/`
6. `/facturacion-dgi/restaurantes/`
7. `/inventario/`
8. `/inventario/restaurantes/`
9. `/precios/`
10. `/demo/`

### P1 — Segunda ola

- `/software-pos/caja/`
- `/software-pos/bares/`
- `/software-pos/comida-rapida/`
- `/software-pos/hardware/`
- `/software-pos/facturacion-dgi/`
- `/comparativas/`
- `/comparativas/pos-vs-excel/`
- `/implementacion/`

### P2 — Tercera ola

- `/software-pos/multisucursal/`
- `/facturacion-dgi/cafeterias/`
- `/facturacion-dgi/como-anular-factura-vet/`
- `/inventario/food-parks/`
- `/recursos/merma/`
- `/recursos/caja/`
- `/recursos/costeo-recetas/`
- `/software-pos/food-parks/managua/` (solo si hay contenido local real)
- `/casos/` (bloqueado hasta tener casos reales)

---

## 9. Datos integrados y pendientes

La estructura ya incorpora las 14 partes de `Keyword Stats`. Pendientes:

- Confirmar en Keyword Planner la ubicación y el idioma del export; el archivo no los declara y aparecen términos de España.
- Si se necesita medir las 60 keywords exactas, exportarlas aparte: este set es de **ideas**, no de la lista exacta.
- No hay tendencia mensual ni CPC útil: las columnas mensuales están vacías y solo 3 keywords tienen bid.
- Revisar Search Console a los 30–60 días para ver qué páginas reciben impresiones reales.
- Rehacer el orden de P1/P2 solo si aparecen datos de ubicación, idioma o rendimiento que contradigan esta lectura.

No se cambia una URL por un bucket de volumen aislado. La estructura se mantiene fit-first y se ajusta con evidencia de Search Console.

---

## 9bis. Baseline GSC y evidencia SERP (2026-11-16)

> El análisis SERP completo y los veredictos por grupo viven en [`nhilos_web_serp_analysis_v1.0.md`](./nhilos_web_serp_analysis_v1.0.md). Este resumen mantiene solo el estado de acceso y el baseline.

**Acceso GSC:** propiedad de dominio `sc-domain:nhilospos.com`, verificada por TXT en Cloudflare. Lectura vía service account `gsc-plugin-openai@infintytravelsandadventure.iam.gserviceaccount.com` (permiso Restringido). Su default es `sc-domain:infinitravels.com`: **nunca usar esa propiedad ni sus datos para NHILOS**.

**Baseline Search Console (dominio nuevo, dato válido):**

| Ventana | Clics | Impresiones |
|---|---:|---:|
| Últimos 28 días (al 2026-11-13) | 0 | 0 |
| Últimos 90 días (al 2026-11-13) | 0 | 0 |

Todo el progreso posterior se mide contra este cero. El primer checkpoint de baseline real es a los 28 días de la publicación.

**Primer movimiento después del baseline (16–22/11):** 2 clics y 10 impresiones, todo en la home, CTR 20%, posición media 5.8 (mejor día 19/11, pos 3). Detalle en `registro_publicaciones.md`. Queries individuales aún bajo el umbral de privacidad de GSC (no legibles).

**SERP P0 — go/no-go con evidencia de mercado (2026-11-16):**

| Cluster | Veredicto | Gap confirmado |
|---|---|---|
| Food park | GO como posicionamiento | Ningún competidor nicaragüense targetea "food park/food court"; intención comercial (multi-marca, cajas compartidas) |
| POS offline | GO fuerte | Solo jugadores internacionales explican el concepto; ningún POS local lo posee |
| DGI | GO con precisión | Competidores rankean explicando pasos del SFC (DT 09-2007 + Ley 822 art. 143). Nicaragua NO tiene factura electrónica con validación en línea. NHILOS solo garantiza la mecánica; la autorización es del contribuyente |
| Precios/demo | GO — valores pendientes | Benchmark: planes de entrada $21–50/mes (Sabor Suite $21–45, NIXA $29, SistecPOS ~C$1,099, SIECloud $50–80); todos publican precios + CTA WhatsApp/demo. NHILOS publicará precios; valores por definir |
| `sistema POS Nicaragua` (hub P0) | GO — competitivo pero ganable | Rankean SaaS regionales (Viper, Nuxo, Storefront, SistecPOS, POS-Master, Neox) y bancos (LAFISE/BAC, intent distinto: datáfonos). Guías de compra solo genéricas (Nortex). Gap: nadie conecta local-first + fiscal mecánica + food park en una sola propuesta |
| `sistema POS para restaurante` (P0) | GO con diferenciación | Cluster más saturado: POS-Master instalado en marcas locales conocidas (Hippos, Don Parrillón, Espresso Americano); SIECloud, EasyRest, SistecPOS, NIXA. Gaps: nadie detalla offline-first real; precios transparentes son raros |
| `sistema de inventario restaurante` (P0) | GO fuerte | SIECloud/Gastro-Aitech/EasyRest/Adiasoft conectan recetas-inventario, pero gap confirmado: nadie ofrece merma teórico vs físico en tiempo real sin conteo manual — el Kardex Delta Ledger es diferenciador directo |
| Caja/arqueo + comparativas (P1) | GO fuerte | Gap total: NO existen comparativas neutrales de POS en Nicaragua; todas son blogs de fabricantes. `/comparativas/` y `/software-pos/caja/` capturan intención sin competencia |

**Cobertura completa (2026-11-16):** 15 queries analizadas cubriendo los 17 grupos y los 2 clusters informativos (VET/anulación y merma/costeo). Veredictos, mapa competitivo y hallazgo transversal del claim "factura electrónica" en [`nhilos_web_serp_analysis_v1.0.md`](./nhilos_web_serp_analysis_v1.0.md). Los page briefs P0 consumen ese documento como evidencia de mercado.

**Precisión normativa para todo el contenido fiscal:** en Nicaragua el cumplimiento es el **Sistema de Facturación Computarizada (SFC)** bajo la DT 09-2007 y el art. 143 de la Ley 822. El término correcto es "facturación computarizada"; **"factura electrónica" no se targetea ni se usa como claim de producto**.

---

## 10. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Agrupación de 20 keywords transaccionales en 15 grupos, primary por grupo y arquitectura sin canibalización | Equipo NHILOS |
| 1.1 | 2026-11-16 | Añadidos filtro de realidad/claims, reuso de la web desplegada y regla de copy para DGI/offline | Equipo NHILOS |
| 1.2 | 2026-11-16 | Integradas 14 partes de Keyword Stats: 532 ideas, triage por fit, 17 grupos, QSR/comparativas y reordenamiento P0–P2 | Equipo NHILOS |
| 1.3 | 2026-11-16 | Precisión fiscal: NHILOS garantiza solo la mecánica DT 09-2007; la autorización DGI (carta, código, numeración) es del contribuyente. Corregido “con folio autorizado”. Añadido baseline GSC (0/0 en 28d y 90d) y veredictos SERP P0 | Equipo NHILOS |
| 1.4 | 2026-11-16 | SERP completo: 15 queries, 17 grupos + 2 clusters informativos. Análisis consolidado en `nhilos_web_serp_analysis_v1.0.md`; §9bis queda como índice | Equipo NHILOS |
| 1.5 | 2026-11-16 | Principio de construcción: la arquitectura SEO manda sobre el artboard (prototipo de diseño/media, no IA); reestructuración libre según briefs | Equipo NHILOS |
| 1.6 | 2026-11-16 | Reposicionamiento ampliado: producto = venta local-first con control a la medida (SIMPLE → producción, escalera continua); retail (tienda/conveniencia/miscelánea) pasa de excluido a candidato con evidencia de Planner | Equipo NHILOS |
