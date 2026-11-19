# NHILOS — Brief de Captura de Medios del Home

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_media_capture_brief_v1.0.md` |
| Versión | 1.0 |
| Estado | ACTIVO — capturas pendientes para cerrar evidencia de §2 y §6 del home |
| Owner | Founder |
| Audiencia | Founder, Web |
| Propósito | Especificar dos capturas nuevas que demuestren, sin ambigüedad, el claim de cada sección del home |
| Documento padre | `nhilos_web_home_copy_v1.0.md` (v1.5) · `nhilos_web_page_briefs_v1.0.md` (v1.4) |

## 1. Resultado de la auditoría de medios del home

Auditoría sección por sección del artboard `design/nhilos-web-foundation/05-home-geo.html` contra el claim que cada sección afirma. Solo se evalúan las secciones con recurso visual; el hero quedó definido y aprobado aparte.

| Sección | Claim visible | Recurso auditado | Veredicto | Acción |
|---|---|---|---|---|
| §2 `#offline` | "sigue cobrando", "todo lo que vendes queda registrado", "se sincroniza solo y en orden" | `pos_offline_live_loop.mp4` | **DÉBIL** — el testigo real (nube naranja + contador de pendientes) mide ~8 px al tamaño de despliegue; el clip no muestra venta ni sincronización | Captura 1 |
| §5 `#fiscal` | "numeración consecutiva que no se puede saltar", "toda anulación exige motivo y queda auditada" | antes `dsh_03_historial_comprobantes.webp` | **INCORRECTO** — la imagen mostraba el resumen de Ventas y el rótulo del navegador declaraba "historial de comprobantes" (dato falso) | Corregido a `dsh_06_fiscal.webp` (módulo Fiscal: correlatividad, IVA, pestañas Anulaciones y Auditoría de secuencia) |
| §6 `#inventario` | "cada venta descuenta lo que consumió", "sabes qué hay, qué se usó y qué se perdió" | `dsh_bom_live_loop.mp4` | **PARCIAL** — prueba composición de receta y costo por plato, no el descuento ni la merma | Captura 2 |
| §7 `#segmentos` (bimoneda) | "cobra en córdobas y dólares sin descuadres" | antes `pos_caja_step1_loop.mp4` | **INCORRECTO** — el clip era catálogo y carrito, sin ninguna moneda | Corregido a `pos_06_pantalla_cobro.webp` (total C$140.00 / $3.82 USD, TC BCN 36.6241, pago y vuelto en ambas monedas) |

Descartados como fuente: `dsh_20_kardex_delta_ledger.webp` (estado vacío, "No hay correcciones pendientes"), `pos_offline_narrative_loop.mp4` (scroll sin cambio de estado) y los reels de `Pictures/nhilos/Clips/` (encuadre 9:16 con titular y pie de marca incrustados; piezas de redes, no loops editoriales).

## 2. Captura 1 — Continuidad offline (§2)

**Objetivo:** demostrar que la terminal cobra con la red caída, que la venta queda registrada en cola local y que se sincroniza sola al reconectar.

### Formato

| Campo | Requisito |
|---|---|
| Tipo | Grabación de pantalla continua del dispositivo, un solo take |
| Duración | 25 a 40 segundos (el recorte final a loop de 6 a 8 segundos lo hace Web) |
| Resolución | Nativa del dispositivo, vertical, sin recortes ni reescalado |
| Audio | No requerido (se descarta) |
| Notificaciones | Modo No molestar activo; sin banner ni toast de ninguna app |
| Datos | Solo datos de demostración: sin nombres de clientes, sin RUC o cédula real, sin montos atípicos |

### Secuencia obligatoria (en este orden)

1. Terminal en línea, catálogo visible, testigo de nube en estado sincronizado.
2. Desactivar la red del dispositivo (WiFi y datos).
3. Esperar a que el testigo cambie a estado offline con contador de pendientes.
4. Agregar un producto y completar la venta hasta la confirmación de cobro.
5. Mostrar el contador de pendientes incrementado después de esa venta.
6. Reactivar la red.
7. Esperar a que el contador se vacíe y el testigo vuelva a sincronizado.

### Ventana mínima aceptable

Si el take completo falla en algún paso, el mínimo publicable es: paso 3, paso 4 con cobro confirmado, paso 5 (contador incrementado) y el regreso a sincronizado del paso 7.

### Criterios de aceptación

- El cobro se completa con la red caída, sin mensaje de error ni bloqueo.
- Se ve el contador de pendientes subir después del cobro.
- Se ve el estado volver a sincronizado tras reconectar, sin intervención manual.
- Ningún fotograma contiene datos personales reales.

### Entrega

Archivo raw en `Pictures/nhilos/Clips/`, nombre `nhilos_pos_offline_cola_sync_raw.mp4`.
Web recorta ventana, comprime a loop mudo y publica en `media/pos_offline_cola_sync_loop.mp4`.

## 3. Captura 2 — Kardex con movimientos y merma (§6)

**Objetivo:** demostrar que cada venta y cada merma quedan registradas como movimiento auditable por ítem, con stock del sistema, conteo físico y diferencia.

El Kardex es un registro denso de lectura: según la regla de medios del proyecto, este caso se cubre con captura estática, no con clip.

### Formato

| Campo | Requisito |
|---|---|
| Tipo | Captura estática del panel, ventana maximizada, zoom 100% |
| Resolución | 1440 × 900 o superior (2× si está disponible) |
| Tema | Claro |
| Barra del navegador | Ocultar marcadores; URL visible como en las capturas vigentes |
| Datos | Tenant de demostración; sin datos de personas reales |

### Secuencia

1. Panel › Inventario.
2. Pestaña **Kardex**.
3. Rango de fechas con movimientos reales; debe incluir al menos un movimiento de tipo **Venta**, uno de **Mermas** y, si existe, un **Ajuste**.
4. Ordenar por Fecha descendente y dejar visible la tabla con las columnas Fecha, Ítem, Tipo, Cant., Costo Unit.

### Variante preferida (si el panel permite verla)

Estado de conciliación o diferencias con stock del sistema, conteo físico y diferencia detectada por ítem, más el sello de auditoría del último movimiento. Es la evidencia más directa del claim "qué se usó y qué se perdió".

### Criterios de aceptación

- Se leen las cifras de cantidad y costo.
- Aparecen los tipos de movimiento que prueban descuento por venta y merma.
- La captura no muestra estado vacío ni mensaje de "sin movimientos".

### Entrega

`Pictures/nhilos/capturas/inv_kardex_movimientos.png`.
Web la publica como `media/dsh_23_kardex_movimientos.webp` y actualiza el rótulo y el alt de la sección.

## 4. Integración en el artboard

| Sección | Contenedor en `05-home-geo.html` | Cambio previsto |
|---|---|---|
| §2 `#offline` | `.device` con `<video>` (~línea 696) | `src` al nuevo loop mudo, `muted playsinline loop preload="metadata"`; se conserva la etiqueta "datos de demostración" |
| §6 `#inventario` | `.proof` con `<video>` (~línea 785) | `<img>` con la captura nueva, `width`/`height` explícitos, `loading="lazy"`, alt con íte­m, tipo de movimiento y diferencia; rótulo del navegador y etiqueta "datos de demostración" actualizados |

La suite `scripts/__tests__/nhilos-home-artboard.test.mjs` valida existencia del archivo, atributos de video y presencia de la etiqueta de demostración; se corre después de cada sustitución.

## 5. Prohibiciones heredadas

- Sin mockups ni reconstrucciones HTML: solo UI real.
- Sin datos personales reales; placeholders del tipo "Ej. John Doe".
- Sin promesas que el producto no cumple: nada de "factura electrónica", "autorizado por la DGI" ni "cero multas".
- Todo recurso con datos de demostración conserva su etiqueta visible.

## Nombres de archivo y caché

`dist/nhilos-web/_headers` sirve `/media/*` con `Cache-Control: public, max-age=604800`.
Un recurso que se reemplaza conservando el nombre queda cacheado hasta siete días en
el navegador y en el borde de Cloudflare, y el cambio no llega a nadie aunque el deploy
haya subido los bytes nuevos. Paso a paso: se confirmó con `curl` que el borde servía
591.632 bytes mientras el archivo desplegado pesaba 804.717.

Regla: todo recurso que cambie de contenido cambia de nombre e incluye los primeros
ocho caracteres de su `sha256` antes de la extensión.

```
pos_offline_cola_sync_loop.97aa1094.mp4
pos_offline_cola_sync_poster.cf458b78.webp
```

Al reemplazar un recurso, actualizar las referencias en el artboard y comprobar con
`curl` que el borde devuelve el tamaño nuevo. Una verificación con `?v=aleatorio`
no cuenta: esquiva la caché que ve el visitante.

## Hero en movimiento — requisitos de captura (2026-11-19)

**Camino A (inmediato, sin captura nueva):** `pos_hero_live_loop.mp4` ya existe —grabación de pantalla real de la terminal con la demo, 6,78 s, 1080×2316—. Re-encode a ~600 KB (`-threads 1`) e inserción en el marco de terminal del hero, como en el hub.

**Camino B (upgrade, cámara real):** vertical 4K/1080, trípode, luz difusa sin reflejos, pantalla legible; la mano entra, sostiene la terminal real de NHILOS con el catálogo demo visible, un toque real; 6–10 s; primer y último frame casi idénticos para el loop; pantalla limpia (sin notificaciones ni datos personales); prohibido fondo verde o equipos ajenos. Entrega a `Pictures/nhilos/recursos/` — el procesado (re-encode, loop, verificación de frames) lo hace el agente.

Referencia del defecto que se repite: `pos_on_hand.mp4` es sintético (fondo verde que aparece, notch de iPhone, mano que cambia de forma entre frames) y está prohibido por la regla de medios auténticos.
