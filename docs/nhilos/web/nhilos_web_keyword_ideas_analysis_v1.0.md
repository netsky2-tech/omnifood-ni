# NHILOS — Análisis de keyword ideas del Keyword Planner

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_keyword_ideas_analysis_v1.0.md` |
| Versión | 1.0 |
| Estado | WORKING DRAFT — lectura de datos y triage |
| Owner | Founder / Marketing |
| Base | 14 partes de `Keyword Stats` + [arquitectura SEO](./nhilos_web_seo_architecture_v1.0.md) |
| Dataset limpio | [`nhilos_web_keyword_planner_historical_v1.0.csv`](./nhilos_web_keyword_planner_historical_v1.0.csv) |
| Fecha | 2026-11-16 |
| Objetivo | Convertir las keyword ideas en decisiones de arquitectura, no en una lista de páginas |

---

## 1. Qué se recibió

El usuario exportó **14 partes** de `Keyword Stats` desde Keyword Planner. En disco hay **15 archivos** porque existe un `part13` duplicado:

- `Keyword_Stats 2026-11-16_at_13_35_27_part13.csv`
- `Keyword_Stats_2026-11-16_at_13_37_54_part13.csv`

Para cada keyword duplicada se conservó la versión del archivo con timestamp más reciente. El `part13` de `13:37:54` reemplaza al de `13:35:27`.

El export anterior, `Keyword Forecasts 2026-11-16 at 13_16_07.csv`, **no se usó**: era un Forecast agregado por dispositivo, sin columna `Keyword`.

### Cobertura del export

- Rango: **1 de noviembre de 2025 – 31 de octubre de 2026**.
- Moneda: **USD**.
- Columnas: `Keyword`, `Avg. monthly searches`, `Competition`, cambios 3M/YoY, `In plan?` y 12 columnas mensuales.

---

## 2. Calidad del dataset

| Métrica | Valor |
|---|---:|
| Filas originales | 578 |
| Keywords únicas normalizadas | 532 |
| Filas duplicadas | 46 |
| Duplicados con conflicto | 1 |
| Keywords con `Avg. monthly searches = 50` | 184 |
| Keywords con `Avg. monthly searches = 0` | 348 |
| Competencia `Unknown` | 487 |
| Competencia `Low` | 24 |
| Competencia `Medium` | 8 |
| Competencia `High` | 13 |
| Keywords con modificador Nicaragua/Managua | 44 |
| Keywords locales con volumen 50 | 2 |
| Keywords con intención gratis/descargar/crack | 157 |
| Keywords de marcas competidoras | 13 |
| Keywords de facturación electrónica | 2 |

### Conflictos y límites

- El único conflicto real es `punto de venta para pizzeria`: una fila trae `0` y otra trae vacío. Ambas con competencia `Unknown`. No cambia ninguna decisión.
- Las 12 columnas mensuales vienen vacías o en `0` en todas las filas. **No se puede leer tendencia mensual real**; el único volumen utilizable es el bucket `Avg. monthly searches`.
- `50` es un bucket de Keyword Planner, no un promedio exacto. `0` suele significar “sin datos suficientes”, no “cero demanda”.
- Solo **3 keywords** tienen rango de bid, y las tres son de inventario gratis. No hay CPC útil para las keywords core.
- El archivo no declara ubicación ni idioma. La presencia de `tpv hostelería` y términos de España indica que el set de ideas **no está limpio por mercado Nicaragua**. No se debe leer como demanda local sin filtrar.

---

## 3. Demanda por cluster

| Cluster | Keywords | Con volumen 50 | Lectura |
|---|---:|---:|---|
| Gratis / descarga | 147 | 72 | Mucho volumen, poco fit. No es el comprador de NHILOS. |
| Inventario | 117 | 52 | Demanda real, pero mezclada con Excel, PDF y otros verticales. |
| POS genérico | 103 | 22 | El núcleo comercial: restaurante, bar, punto de venta. |
| Food park / QSR | 27 | 3 | Fit con el avatar; volumen bajo salvo comida rápida. |
| DGI / facturación | 24 | 9 | Volumen genérico de “facturación e inventario”; DGI específico casi no aparece. |
| Caja / arqueo | 14 | 2 | Job real, pero feature y soporte, no cabeza de campaña. |
| Costeo / recetas | 13 | 4 | Intención informativa; útil como recurso y BOM. |
| Marcas competidoras | 13 | 6 | Navegacional; solo comparativas honestas. |
| Bares | 9 | 4 | Segmento con intención comercial. |
| Hardware / kit | 10 | 3 | Kit, terminal y tablet; página de hardware real. |
| Cafetería | 7 | 0 | Sin volumen observado; página secundaria. |
| Mercado incorrecto | 25 | 1 | TPV/hostelería de España y otros términos ajenos. |
| Otro vertical | 6 | 3 | Farmacia, ferretería, ropa, conveniencia. Fuera del avatar. |
| Facturación electrónica | 2 | 0 | Gap de producto; no es página de producto. |
| Otros | 15 | 3 | Comparativas, merma, sucursales, marca propia. |

---

## 4. Lectura estratégica

### 4.1 La demanda del Planner es genérica, no local

Solo 44 de 532 keywords tienen modificador Nicaragua/Managua, y solo 2 de esas tienen volumen 50:

- `sistema pos nicaragua` — 50, Low
- `software para restaurantes nicaragua` — 50, Low

El resto de términos locales aparece con `0`. Eso no significa que no haya mercado: significa que el Planner no tiene datos suficientes para esas colas. La consecuencia es clara: **no se construyen 20 páginas locales ni una por variante**. Se construyen páginas de segmento y se usan los modificadores locales como secundarios.

### 4.2 El volumen grande está en “gratis” y “Excel”

El cluster de gratis/descarga tiene 147 keywords y 72 con volumen 50. Es el grupo más grande. Pero es el peor fit: busca software gratis, descargable o crackeado, no un sistema implementado con soporte, inventario y facturación.

Decisión: **no se crea una página de producto para “gratis”**. Como máximo, un artículo honesto de comparación “POS gratis vs sistema completo” dentro de `/comparativas/`, y solo si se puede sostener sin humo.

### 4.3 El núcleo comercial es POS de restaurante, bar e inventario

Las keywords con volumen y fit real son:

- `sistema pos para restaurante` — 50, Low
- `pos para restaurante` — 50, Low
- `sistema pos nicaragua` — 50, Low
- `software para restaurantes nicaragua` — 50, Low
- `pos para bar` — 50, Low
- `sistema de inventario para restaurante` — 50, Unknown
- `control de inventario restaurante` — 50, Unknown
- `inventario de restaurante` — 50, Low
- `software comida rapida` — 50, Low
- `kit punto de venta restaurante` — 50, Unknown
- `arqueo de caja restaurante` — 50, Unknown

Eso confirma la arquitectura de segmentos, pero cambia el orden: **inventario para restaurantes sube a P0**, y hardware/QSR suben a P1.

### 4.4 DGI no es la puerta de entrada

`facturación dgi nicaragua`, `sistema de facturación dgi` y `facturación dt 09 2007` aparecen con `0`. Lo que sí tiene volumen es “facturación e inventario” genérico.

Decisión: DGI sigue siendo una página de confianza y cumplimiento, no la principal fuente de adquisición. La fórmula sigue siendo “conforme a DT 09-2007 para Sistemas Computarizados, con folio autorizado; no es factura electrónica en línea”.

### 4.5 Facturación electrónica es un gap, no un target

Solo hay 2 keywords y ambas con `0`. NHILOS no debe vender facturación electrónica. No se crea página de producto. Si se crea contenido, debe ser un artículo que explique la diferencia y que pase revisión legal.

### 4.6 Food park y cafetería son posicionamiento, no volumen

`software para food park managua` y las variantes de cafetería aparecen con `0`. El food park sigue siendo el avatar y el ángulo de producto, pero no se justifica una página por ciudad ni por tipo de cocina. Se mantiene una página de food park y una de cafetería como segmento secundario.

### 4.7 Offline es diferenciador, no demanda

Las variantes de `sin internet`, `offline`, `local-first` aparecen con `0`. No se construye la página por volumen; se construye porque es el diferenciador del producto y porque responde a la objeción principal del avatar. La promesa debe ser condicionada: terminal enrolado, catálogo hidratado, sync eventual.

### 4.8 Marcas competidoras: comparación, no producto

Aldelo, Eleventa, Odoo, Soft Restaurant, Sicar y SC050 aparecen con volumen, pero son términos navegacionales. No se targetean como página de producto. Solo entran en `/comparativas/` si hay metodología honesta, fecha y criterios verificables.

---

## 5. Triage aplicado

| Decisión | Keywords | Uso |
|---|---:|---|
| `target_core` | 103 | Mapear a una página de segmento o hub; no una URL por keyword |
| `target_local` | 2 | Usar en la página de segmento correspondiente, con título local |
| `target_secondary` | 173 | Secciones, H2, FAQs y enlaces internos |
| `support_content` | 51 | Recursos, soporte, comparativas o blog |
| `comparison_only` | 18 | `/comparativas/` con metodología honesta |
| `brand_navigational` | 5 | Marca propia; proteger, no crear página SEO |
| `product_gap` | 2 | No crear página de producto |
| `exclude` | 178 | Gratis, mercado incorrecto, otro vertical |

El detalle keyword por keyword está en el CSV limpio. El CSV incluye `cluster`, `decision`, `reason`, `local_intent`, `free_intent`, `brand_intent` y `source_file`.

---

## 6. Implicaciones para la arquitectura

1. **Mantener 17 grupos, no 532 URLs.** La unidad es el job-to-be-done, no la query.
2. **Cambiar primarias donde el dato manda:**
   - `/software-pos/restaurantes/` → `sistema POS para restaurante`
   - `/software-pos/bares/` → `sistema POS para bar`
   - `/software-pos/caja/` → `sistema de cierre de caja`
   - `/inventario/restaurantes/` → `sistema de inventario para restaurante`
   - `/software-pos/hardware/` → `kit punto de venta restaurante`
   - `/software-pos/food-parks/` → `software para food park`
3. **Subir inventario de restaurantes a P0.** Es demanda medida y fit directo.
4. **Subir bares, caja, hardware, QSR y comparativas a P1.** Tienen volumen o intención comercial.
5. **Bajar cafetería, multisucursal e inventario de food park a P2.** Sin volumen observado y sin prueba local única.
6. **No crear páginas para gratis, Excel, PDF, farmacia, ferretería, ropa, conveniencia ni TPV de España.**
7. **No crear página de facturación electrónica.** Es un gap de producto.
8. **No crear `/software-pos/food-parks/managua/` sin prueba local.** El volumen local no lo justifica.
9. **No crear una URL por “restaurante pequeño”, “pizzería” o “taquería”.** Van como sección o variante de QSR/food park.
10. **Mantener offline y DGI como páginas de confianza/conversión.** No son las páginas de mayor volumen, pero sostienen la decisión de compra.

---

## 7. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Unión de 14 partes, deduplicación, triage por fit y lectura estratégica para arquitectura | Equipo NHILOS |
