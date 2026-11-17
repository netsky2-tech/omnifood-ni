# NHILOS — Guía para Keyword Planner de Google

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_keyword_planner_guide_v1.0.md` |
| Versión | 1.2 |
| Estado | WORKING DRAFT — corrida de 14 partes consolidada; guía reutilizable |
| Owner | Founder / Marketing |
| Base | [Buyer avatar](./nhilos_web_buyer_avatar_v1.0.md), [oportunidades de keywords](./nhilos_web_keyword_opportunities_v1.0.md), [análisis de keyword ideas](./nhilos_web_keyword_ideas_analysis_v1.0.md) y [dataset limpio](./nhilos_web_keyword_planner_historical_v1.0.csv) |
| CSV para Get search volume | [`nhilos_web_keyword_planner_exact_v1.0.csv`](./nhilos_web_keyword_planner_exact_v1.0.csv) |
| Lista de seeds para Discover | [`nhilos_web_keyword_planner_seeds_v1.0.txt`](./nhilos_web_keyword_planner_seeds_v1.0.txt) |
| Arquitectura y grupos | [Arquitectura web y grupos transaccionales](./nhilos_web_seo_architecture_v1.0.md) |
| Fecha | 2026-11-16 |
| Objetivo | Obtener volumen, competencia, CPC estimado y variaciones para validar y expandir la lista del sector |
| Regla | No inventar volúmenes. Todo dato debe salir de Keyword Planner o Search Console |

---

> **Corrida 2026-11-16:** se consolidaron 14 partes de `Keyword Stats` y se deduplicaron 532 keywords. El resultado está en [`nhilos_web_keyword_ideas_analysis_v1.0.md`](./nhilos_web_keyword_ideas_analysis_v1.0.md). Esta guía queda para nuevas corridas y para entender el formato de export.

---

## 1. Antes de empezar

Usa una cuenta de Google Ads. Keyword Planner es gratuito, pero puede pedirte configurar una cuenta. No necesitas lanzar campañas.

### Configuración única para todas las corridas

| Setting | Valor | Por qué |
|---|---|---|
| Ubicación | Nicaragua | El negocio es local; no mezclar con Worldwide |
| Idioma | Español | El comprador busca en español |
| Red | Google | No incluir Display ni partners |
| Fecha | Últimos 12 meses | Evita ruido de una sola semana |
| Moneda | La de tu cuenta | No mezclar monedas entre corridas |
| Match | El mismo en todas las corridas | Si usas exacto, mantén exacto |
| Dispositivo | Todos | No hay razón para filtrar todavía |

**Importante:** si quieres data de Managua, corre una segunda tanda con ubicación Managua. No mezcles país y ciudad en la misma corrida.

### CSV para Get search volume

Para la corrida 1 sube [`nhilos_web_keyword_planner_exact_v1.0.csv`](./nhilos_web_keyword_planner_exact_v1.0.csv). Tiene las 60 keywords exactas, una sola columna con el encabezado `Keyword`, sin columna de tipo, en UTF-8.

- Cada keyword cumple el límite de Google: menos de 80 caracteres y 10 palabras o menos.
- No lo abras y guardes en Excel si eso puede cambiar la codificación; súbelo tal cual.
- No agregues columnas: Keyword Planner espera una sola columna para la lista simple.

### Negatives / filtros posteriores

Keyword Planner no siempre maneja negatives de forma limpia en la exploración. Exporta y filtra después:

`gratis`, `free`, `empleo`, `trabajo`, `vacante`, `sueldo`, `salario`, `curso`, `tutorial`, `pdf`, `descargar`, `apk`, `crack`, `españa`, `méxico`, `estados unidos`, `argentina`, `colombia`, `chile`, `perú`.

No excluyas: `Nicaragua`, `DGI`, `VET`, `factura`, `restaurante`, `food park`, `Managua`.

---

## 2. Opciones de búsqueda

| Opción | Cuándo usarla | Qué pegar | Salida |
|---|---|---|---|
| **Get search volume and forecasts** | Validar la lista exacta de 60 keywords | Las 60 de [oportunidades de keywords](./nhilos_web_keyword_opportunities_v1.0.md) | Volumen y competencia base |
| **Discover new keywords** con seeds | Expandir el universo del sector | La lista de 174 seeds, por bloques | Ideas nuevas y clusters |
| **Discover new keywords** por URL | Ver qué términos asocia Google al sitio | `https://nhilospos.com` | Ideas relacionadas con la web actual |
| **Discover new keywords** por categoría | Exploración amplia opcional | Food & Beverage > Restaurants; Business Services > Software | Términos generales del sector |
| **Discover new keywords** por URL de competidor | Cuando tengas competidores | URL del competidor, una por corrida | Términos que ya funcionan en el mercado |

No corras las 174 seeds en una sola tanda si quieres leer los grupos. Haz bloques de 40–60.

---

## 3. Secuencia recomendada

### Corrida 1 — Base exacta

Usa **Get search volume and forecasts** con [`nhilos_web_keyword_planner_exact_v1.0.csv`](./nhilos_web_keyword_planner_exact_v1.0.csv), que contiene las 60 keywords del documento de oportunidades. Exporta la data histórica. Esto te da la línea base para priorizar.

### Corrida 2 — Descubrimiento por clusters

Usa **Discover new keywords** con las 174 seeds, en cuatro bloques:

| Bloque | Seeds | Enfoque |
|---|---:|---|
| A | 40 | POS + facturación/DGI |
| B | 45 | Restaurantes/food park + inventario/merma |
| C | 35 | Caja/propinas + offline + multisucursal |
| D | 54 | Precio/compra + hardware + reportes + local + marca |

Así puedes comparar grupos sin que el output se vuelva una sopa de términos.

### Corrida 3 — URL propia

Usa `https://nhilospos.com` como URL. Si el sitio es nuevo y no devuelve data, no lo fuerces; pasa a la corrida 4.

### Corrida 4 — Categoría o competidor (opcional)

Solo si quieres ampliar. Corre una categoría o un competidor por vez para no contaminar los clusters.

---

## 4. Lista de seeds

**Archivo listo para pegar:** [`nhilos_web_keyword_planner_seeds_v1.0.txt`](./nhilos_web_keyword_planner_seeds_v1.0.txt)

Contiene **174 seeds únicas**, agrupadas así:

| Cluster | Seeds | Ejemplos |
|---|---:|---|
| POS / punto de venta | 20 | sistema POS Nicaragua, sistema POS para food park |
| Facturación / DGI / VET | 20 | facturación DGI Nicaragua, cómo anular factura en la VET |
| Restaurantes / food parks / bares / cafeterías | 25 | software para food park, sistema para food court |
| Inventario / merma / costos / recetas | 20 | control de merma restaurante, kardex restaurante |
| Caja / propinas / cierre / arqueo | 15 | cierre de caja restaurante, arqueo ciego Nicaragua |
| Offline / continuidad | 10 | POS sin internet, sistema POS offline |
| Multisucursal / varios locales | 10 | sistema POS para varias sucursales, sistema POS multisucursal |
| Precio / compra / proveedor / demo | 14 | precio sistema POS Nicaragua, demo sistema POS Nicaragua |
| Hardware | 10 | impresora térmica para POS, lector de código de barras POS |
| Reportes / contabilidad / contador | 10 | reportes de ventas para contador, exportar ventas a Excel |
| Local / ciudades | 10 | sistema POS Managua, sistema POS Masaya |
| Marca / competencia / alternativas | 10 | nhilos app, POS vs Excel |

### Cómo pegarlas

- Abre el `.txt`, copia el bloque completo y pégalo en el campo de keywords.
- Una keyword por línea; no agregues comillas, comas ni numeración.
- Para “Get search volume”, usa la lista exacta de 60, no las 174 seeds.
- Para “Discover”, usa bloques de 40–60 seeds.
- Si Keyword Planner limita el pegado, parte el archivo por cluster.

---

## 5. Cómo exportar

1. Ejecuta la búsqueda.
2. Abre la pestaña **Historical metrics**.
3. Descarga el CSV de keywords.
4. No edites el archivo crudo antes de enviarlo.
5. Nombra los archivos así:

- `kp-ni-es-exact-2026-11.csv`
- `kp-ni-es-discover-a-2026-11.csv`
- `kp-ni-es-discover-b-2026-11.csv`
- `kp-ni-es-url-2026-11.csv`

### Columnas que necesito

| Columna | Uso |
|---|---|
| Keyword | Base de consolidación |
| Avg. monthly searches | Demanda |
| Competition | Presión comercial |
| Top of page bid (low) | Señal de valor comercial |
| Top of page bid (high) | Señal de valor comercial |
| Three-month change | Estacionalidad corta |
| Year-over-year change | Tendencia |
| Currency | Evitar mezclar monedas |
| Ideas group | Si viene incluido, ayuda a agrupar |

No necesitas llenar una plantilla. Para una nueva corrida, pásame el CSV crudo y yo consolido, deduplico y priorizo.

### Error común: exportar Forecast en vez de Historical metrics

El export de **Forecast** se llama `Keyword Forecasts...csv` y solo trae totales de campaña por dispositivo. **No trae filas por keyword**, así que no sirve para agrupar ni priorizar.

Si tu archivo tiene estas señales, está mal:

- No tiene columna `Keyword`.
- Tiene filas como `Campaign1`, `Desktop`, `Mobile`, `Tablet`.
- Tiene columnas de clicks/impresiones/costo estimado, no de búsqueda mensual.
- Pesa muy poco y tiene muy pocas líneas.

Vuelve a **Historical metrics** y descarga **keyword statistics**. El archivo correcto debe tener una fila por keyword y columnas como `Keyword` y `Avg. monthly searches`.

---

## 6. Cómo etiquetar después de exportar

Keyword Planner no da intención. La etiqueta se asigna manualmente:

| Tipo | Señales |
|---|---|
| Transaccional | comprar, contratar, precio, cotización, demo, proveedor, instalar, “para mi restaurante” |
| Consideración | mejor, vs, comparativa, cómo elegir, “para negocio pequeño”, “con inventario” |
| Informativa | cómo, qué, por qué, guía, pasos, requisitos, “cómo anular” |

### Product fit

| Nivel | Criterio |
|---|---|
| Alto | DGI/VET, offline, food park, inventario/merma, caja, multisucursal |
| Medio | POS genérico, software para restaurante, facturación genérica |
| Bajo | solo hardware, solo contabilidad, empleo/curso/gratis |

### Regla de volumen

- Long tail puede mostrar `<10` o quedar en blanco. **No la borres si la intención es alta.**
- B2B local suele tener volúmenes bajos; el volumen no es el único criterio.
- Si el volumen es bajo pero el fit es alto, valida con Search Console o una campaña pequeña.

---

## 7. Checklist de calidad

- [ ] Ubicación: Nicaragua.
- [ ] Idioma: español.
- [ ] Red: Google.
- [ ] Fecha: últimos 12 meses.
- [ ] Moneda anotada.
- [ ] No se usó Worldwide.
- [ ] Se eliminaron duplicados por acentos, singular/plural y variantes.
- [ ] Se filtraron gratis, empleo, curso y sueldo.
- [ ] Se revisó el fit con el producto real.
- [ ] Se conservaron las keywords de 3+ palabras.
- [ ] Se guardaron los CSV crudos.

---

## 8. Qué enviarme de vuelta

- Los CSV crudos de cada corrida.
- Una nota con ubicación, idioma, fecha y moneda usados.
- Si puedes, el bloque o cluster de cada archivo.
- No hace falta que me mandes capturas; el CSV es mejor.

Con eso consolido todo, elimino ruido, cruzo intención con volumen y fit, y preparo la lista final del sector para el siguiente paso.

---

## 9. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Guía de configuración, corridas, seeds de 174 términos y criterios de exportación | Equipo NHILOS |
| 1.1 | 2026-11-16 | Añadida la sección de error común Forecast vs Historical metrics y enlace a la arquitectura | Equipo NHILOS |
| 1.2 | 2026-11-16 | Registrada la corrida de 14 partes y enlazado el análisis/dataset consolidado | Equipo NHILOS |
