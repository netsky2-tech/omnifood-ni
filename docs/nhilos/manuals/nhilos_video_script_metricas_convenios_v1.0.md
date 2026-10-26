# NHILOS POS — Guión de Video: Parte 2, Métricas de Convenios
## Del descuento en caja a la decisión de negocio

**Document ID:** NH-VID-002
**Versión:** 1.0 (borrador para aprobación)
**Estado:** PENDIENTE DE APROBACIÓN — no se implementa ninguna escena hasta aprobar este guión
**Predecesor:** `nhilos_video_script_clientes_convenio_v1.0.md` (cliente empresa → convenio → descuento en POS)
**Duración Total:** 46.5 s (1395 frames @ 30 FPS)
**Composición:** `MetricsShowcase` (nueva, independiente del `ShowcaseMaster` de la parte 1)
**Logo Oficial:** `apps/owner_dashboard/public/logo.png`
**Colores:** `#00BF81` (verde), `#003757` (azul marino), `#CCCCCC` (gris)

---

## 1. Continuidad narrativa

La parte 1 termina con el cobro de una factura con el descuento del 15 % del
**Banco Atlántico de Nicaragua**. La parte 2 responde la pregunta natural que
sigue: **¿y qué gano con haber registrado todo eso?**

El clip arranca en la misma sección **Clientes** del Owner Dashboard, donde el
cajero/administrador ya vio el directorio, y muestra la pestaña **Métricas** con
las ventas acumuladas de ese convenio y de dos empresas más.

Regla de continuidad de datos: mismos nombres, RUC y porcentajes que la parte 1
(`Banco Atlántico de Nicaragua`, `J0310000123456`, convenio 15 %, `SOHO Café`).

---

## 2. Estructura y tiempos

| # | Escena | Frames | Tiempo | Cierre visual |
|---|--------|--------|--------|----------------|
| 1 | Intro oficial (badge "Métricas de Convenios") | 165 | 00:00 – 00:05.5 | Marca |
| 2 | Clientes → pestaña Métricas, rango "Este Mes" | 210 | 00:05.5 – 00:12.5 | Datos cargados |
| 3 | Franja de 4 KPIs con conteo animado | 240 | 00:12.5 – 00:20.5 | Cifras del período |
| 4 | Productos más consumidos + afluencia y horarios pico | 300 | 00:20.5 – 00:30.5 | Patrón de consumo |
| 5 | Ranking por empresa, detalle expandido y exportación | 330 | 00:30.5 – 00:41.5 | Reporte descargado |
| 6 | Outro oficial | 150 | 00:41.5 – 00:46.5 | Marca |

Regla de audio (§6 de la skill): cada escena queda **20–30 frames por encima**
de su MP3. Las duraciones se ajustan sólo hacia arriba después de medir los
archivos generados; nunca se recorta una escena por debajo de su locución + 20.

---

## 3. Locución (voz oficial `es-NI-FedericoNeural`)

| Archivo | Texto |
|---|---|
| `scene_1_intro.mp3` | NHILOS POS. Métricas de convenios: del descuento a la decisión. |
| `scene_2_metrics_nav.mp3` | Cada venta con un cliente corporativo ya quedó registrada. En Clientes, la pestaña Métricas convierte esas ventas en información. |
| `scene_3_kpis.mp3` | De un solo vistazo: facturación neta, descuentos otorgados y su tasa efectiva, tickets y ticket promedio del período. |
| `scene_4_behavior.mp3` | Descubre qué productos consumen, y en qué días y horas llegan, para ajustar tu operación y tus turnos. |
| `scene_5_ranking.mp3` | El ranking compara a cada empresa, y el detalle muestra su consumo real. Exporta el reporte en Excel o PDF para compartirlo. |
| `scene_6_outro.mp3` | NHILOS POS. Conectamos los hilos de tu negocio. |

---

## 4. Detalle escena por escena

### Escena 1 — Intro oficial (0 – 165)
- Fondo sólido `#003757`. Cuatro elementos centrados, en este orden: logo PNG
  oficial, `NHILOS POS` (Renogare, tracking 6 px), badge
  `Métricas de Convenios` (verde al 15 %, borde `#00BF81`) y eslogan en `#CCCCCC`.
- Sin cursor, sin UI. 90 frames de exposición + audio.

### Escena 2 — De Clientes a Métricas (165 – 375)
- **Entorno:** Owner Dashboard, `/customers`, sidebar oficial completo con
  **Clientes** activo (`bg-white/15`), header con `SOHO Café`,
  `RUC: J0310000000000` y badge `En Línea` (verde).
- **Estado inicial:** pestaña `Directorio` activa, tabla de clientes visible con
  tres filas corporativas (Banco Atlántico, Cooperativa La Unión, Clínica San Rafael).
- **Interacciones, en orden:**
  1. Cursor viaja por el sidebar hasta `Clientes`, dwell de 4 frames, clic (ripple).
  2. Cursor sube a la pestaña `Métricas`, dwell, clic.
  3. La pestaña se subraya en `#003757`/primary y el contenido cambia a la
     sección de métricas (skeleton `Cargando métricas de convenios y empresas...`
     durante ~12 frames, luego datos).
  4. Cursor pulsa `Este Mes` (filtro de rango) y los campos de fecha quedan en
     `01/10/2026` – `26/10/2026`.
- **Copy real en pantalla:** tabs `Directorio` / `Métricas` / `Perfil de Lealtad`;
  botones de rango `Este Mes`, `Mes Anterior`, `Últimos 30 días`; etiquetas
  `Desde:` y `Hasta:`.

### Escena 3 — Franja de KPIs (375 – 615)
- **Entorno:** mismas migas, sin sidebar animado; foco en la franja de 4 tarjetas
  (`grid-cols-1 sm:2 lg:4`), entrada escalonada de 6 frames entre tarjetas.
- **Contenido exacto (labels y subtítulos del componente `StatCard`):**

| Tarjeta | Valor | Subtítulo |
|---|---|---|
| Facturación Neta | C$36,145.20 | Bruto: C$41,880.00 |
| Descuentos Otorgados | C$5,734.80 | Tasa efectiva: 13.7% |
| Tickets | 71 | 3 empresas activas |
| Ticket Promedio | C$509.09 | Por transacción |

- **Animación:** conteo numérico de 0 al valor en 30 frames (tabular-nums, sin
  rebote), y un subrayado verde `#00BF81` que recorre la tarjeta de
  `Descuentos Otorgados` (el puente con la parte 1: ese descuento es el beneficio
  que el convenio otorgó).
- Ningún dato se "inventa" en pantalla: los cuatro valores son consistentes con
  la tabla del ranking (ver §5).

### Escena 4 — Productos, días y horas (615 – 915)
- **Entorno:** dos tarjetas lado a lado (`lg:grid-cols-2`).
- **Izquierda — "Productos Más Consumidos en Convenios"** (badge derecho
  `Consolidado general`), filas con número en círculo y columnas cantidad/venta:
  1. Combo Almuerzo Ejecutivo — 46 uds — C$18,400.00
  2. Café Americano — 38 uds — C$2,280.00
  3. Almuerzo del Día — 21 uds — C$2,940.00
  4. Batido de Fresa — 17 uds — C$2,210.00
  5. Croissant de Jamón — 12 uds — C$1,200.00
  Las filas aparecen una por una cada 8 frames.
- **Derecha — "Afluencia Semanal y Horarios Pico"** (badge `Hora de Managua (UTC-6)`):
  - Título interno `DÍAS CON MAYOR DEMANDA`, barras L–D con tickets
    `14, 16, 12, 11, 13, 5, 0`; las barras crecen de abajo hacia arriba en 24
    frames; `Mar` (16) queda en `#003757` sólido como pico y el resto al 50 %.
  - `FRANJAS HORARIAS PREFERIDAS`: badges `12:30 PM (22 tickets)`,
    `1:00 PM (14 tickets)`, `11:30 AM (9 tickets)`, `3:00 PM (6 tickets)`.
  - El cursor resalta temporalmente `Mar` y luego el badge `12:30 PM` (dwell,
    sin clic) para dirigir la mirada.
- **Lectura de negocio (sólo on-screen, sin cambiar la UI):** nota discreta al
  pie, `El almuerzo corporativo concentra la demanda: martes a las 12:30 p. m.`

### Escena 5 — Ranking por empresa, detalle y exportación (915 – 1245)
- **Entorno:** tarjeta "Rendimiento por Empresa y Convenio" con la tabla real.
- **Encabezado de tarjeta:** icono `Building2`, título, hint
  `Haga clic en una empresa para ver sus productos y horarios` y los dos botones
  estándar `Exportar a Excel` / `Exportar a PDF` (variant outline).
- **Tabla (columnas exactas):** Empresa · Convenio Activo · Tickets · Venta Bruta ·
  Descuentos · Venta Neta · % Efectivo · Ticket Prom.
  - Banco Atlántico de Nicaragua (`RUC: J0310000123456`) · Convenio Banco Atlántico · 42 · C$28,560.00 · -C$4,284.00 · C$24,276.00 · 15% · C$578.00
  - Cooperativa La Unión (`RUC: J0310000234567`) · Convenio Cooperativa La Unión · 18 · C$7,380.00 · -C$738.00 · C$6,642.00 · 10% · C$369.00
  - Clínica San Rafael (`RUC: J0310000345678`) · Convenio Clínica San Rafael · 11 · C$5,940.00 · -C$712.80 · C$5,227.20 · 12% · C$475.20
- **Interacciones:**
  1. Cursor hace clic en la fila del Banco Atlántico (chevron `>` gira a `v`).
  2. Se despliega el bloque `DETALLE DE CONSUMO — BANCO ATLÁNTICO DE NICARAGUA`
     con `42 compras registradas` y dos columnas:
     - `Platos y Productos Preferidos`: 1. Combo Almuerzo Ejecutivo 28 uds • C$11,200.00; 2. Café Americano 24 uds • C$1,440.00; 3. Almuerzo del Día 12 uds • C$1,680.00
     - Días/horas preferidas: Martes 9 · Miércoles 8 · Jueves 7; `12:30 PM` y `1:00 PM`.
  3. Cursor pulsa `PDF` del detalle: el botón pasa a estado `loading` (spinner,
     `disabled`), ~18 frames después llega el toast verde
     `Detalle de consumo (PDF)` / `Se descargó el reporte de productos para Banco Atlántico de Nicaragua.`
  4. Cierre de escena: el cursor pulsa `Exportar a Excel` en la cabecera del
     ranking y aparece `Reporte de Convenios (XLSX)` / `Se descargó el reporte de convenios en formato XLSX.`
  - Nota de honestidad visual: los botones muestran spinner **mientras** se
    genera el archivo; no hay barra de progreso falsa (§36 del estándar).

### Escena 6 — Outro oficial (1245 – 1395)
- Fondo `#003757`, tres elementos: logo PNG, `NHILOS POS`, eslogan
  `Conectamos los hilos de tu negocio.` en `#CCCCCC`. Sin otros textos ni URLs.

---

## 5. Datos de prueba (fixtures verificados)

Período: `2026-10-01` a `2026-10-26` (botón `Este Mes`).

| Empresa | Tickets | Bruto | Tasa | Descuento | Neto | Ticket prom. |
|---|---:|---:|---:|---:|---:|---:|
| Banco Atlántico | 42 | 28,560.00 | 15 % | 4,284.00 | 24,276.00 | 578.00 |
| Cooperativa La Unión | 18 | 7,380.00 | 10 % | 738.00 | 6,642.00 | 369.00 |
| Clínica San Rafael | 11 | 5,940.00 | 12 % | 712.80 | 5,227.20 | 475.20 |
| **Consolidado** | **71** | **41,880.00** | **13.7 %** | **5,734.80** | **36,145.20** | **509.09** |

Verificación aritmética: 24,276 / 42 = 578.00 · 6,642 / 18 = 369.00 ·
5,227.20 / 11 = 475.20 · 5,734.80 / 41,880 = 13.69 % · 36,145.20 / 71 = 509.09.
Días: 14+16+12+11+13+5+0 = 71. Horas pico: 22+14+9+6 = 51 (el resto se reparte
en franjas menores).

---

## 6. Implementación prevista (posterior a la aprobación)

- Nueva composición **`MetricsShowcase`** (1920×1080, 30 fps, 1395 frames) en
  `apps/showcase_video/src/compositions/`, con escenas
  `MetricsIntroScene`, `MetricsNavScene`, `MetricsKpiScene`,
  `MetricsBehaviorScene`, `MetricsRankingScene` y `OutroScene` reutilizada.
- Reutilizar `DashboardSidebar`, `NhilosLogo`, `Cursor` y los tokens de
  `src/tokens/brand.ts`; la UI se replica desde
  `corporate-metrics-tab.tsx` (labels, columnas, botones, toasts) sin inventar
  componentes.
- Añadir los 6 textos a `scripts/generate-voiceover.py` con prefijo
  `metrics_` para no sobreescribir los audios de la parte 1.
- Preview con `pnpm --filter showcase_video preview`, still de validación por
  escena, render final con
  `npx remotion render src/index.ts MetricsShowcase out/metrics-showcase.mp4`.
- Entrega en `Pictures/nhilos/clips/nhilos_pos_metricas_convenios.mp4`.

## 7. Preguntas abiertas para aprobación

1. ¿Confirmas el alcance de 6 escenas / 46.5 s, o lo quieres más corto (versión
   de 30 s sin la escena de comportamiento)?
2. ¿Generamos también el reel vertical 9:16 (`SocialReel`) de este tema?
