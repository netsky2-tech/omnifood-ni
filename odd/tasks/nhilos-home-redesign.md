# Feature: nhilos-home-redesign

Rediseño de la home de nhilospos.com como nuevo artboard independiente (no destruye el prototipo 04). Fuente de contenido: `docs/nhilos/web/nhilos_web_home_copy_v1.0.md` v1.3. Fuente de diseño: `design/system.md`. Inspiración: impeccable.style + tasteskill.dev + referencia visual del usuario (hero split PayOne-like, pero único NHILOS).

## Specs

- **S1**: Hero split — "La idea del hero en impeccable me gusta para nuestro sitio también, donde a un lado iría el H1 y al otro lado un montaje de un dispositivo con la UI de nuestra app" (ref visual: `/mnt/c/Users/Octavio Morales/Downloads/WhatsApp Image 2026-11-16 at 5.01.32 PM.jpeg` — PayOne template, solo inspiración estructural). Izquierda: H1 (`Sistema POS para restaurante en Nicaragua que sigue vendiendo sin internet`) + subhead + CTAs (`Solicitar una demo` primario, `Ver cómo funciona` secundario). Derecha: montaje de dispositivo S23 con UI real del POS (clip `media/pos_hero_live_loop.mp4` en bezel) + tarjetas flotantes de prueba con datos reales etiquetados como demostración.
- **S2**: Inspiraciones — "Hay partes de esas paginas como en taste 'How it works', 'Before and after' y 'Questions' que son visualmente atractivas y pueden ser utiles" — mapeo: How it works → "Cómo funciona" (hilo operativo en pasos numerados); Before and after → "Antes y después" (cuaderno/Excel/statu quo vs NHILOS, del avatar); Questions → FAQ. "La idea tampoco es copiar fielmente pero si tomarlo de inspiración y hacer algo único". "No queremos una pagina generica o de plantilla, necesitamos algo único, atractivo y de alto nivel como lo exige nhilos".
- **S3**: Contenido = exactamente el copy de `docs/nhilos/web/nhilos_web_home_copy_v1.0.md` v1.3: jerarquía H1–H3, regla de profundidad (≤120 palabras por H2, jerga técnica vetada), FAQ humano (6) + FAQ GEO (10, anchor `#faq-geo`), JSON-LD v1.3 (Organization + SoftwareApplication + FAQPage) tal cual el bloque de código del documento.
- **S4**: Diseño = `design/system.md` estrictamente (tokens, tipografía, rampa emerald/navy, contrastes AA, `prefers-reduced-motion`, targets 44px, `< 2.5s` LCP). 70% sobriedad / 20% producto / 10% gesto.
- **S5**: Media = solo archivos existentes en `design/nhilos-web-foundation/media/` (los 7 MP4 + capturas webp). Sin mockups ni UI dibujada. Videos con el mismo tratamiento CSS `img, video` y `object-fit: contain`. Datos de demo etiquetados.
- **S6**: Claims bloqueados: "factura electrónica", "cero multas", "sistema autorizado por la DGI", "nunca pierdes una venta", "100% sincronizado", "solución integral", "transformación digital", "ecosistema". Precios = placeholder cotización (nunca cifras).
- **S7**: Archivo nuevo `design/nhilos-web-foundation/05-home-geo.html`. NO modificar `04-sintesis-hibrida.html` ni `scripts/build-nhilos-web.mjs` (la migración del build es un paso posterior aprobado aparte).
- **S8**: Responsive verificado en 1440 / 1024 / 390. Sin scroll hijacking. Máximo 1 video reproduciéndose a la vez (coordinador de viewport). Rhythm: solo video donde hay cambio de estado visible; resto estático.

## Tasks

- **T1** (S1-S8): Construir `05-home-geo.html` completo con todas las secciones del copy v1.3, JSON-LD integrado y validación JS/JSON propia.
- **T2** (S7-S8): Verificación del padre: screenshots 1440/1024/390 con Chrome headless + validación JSON-LD + node --check de scripts → veredicto por S#.

### T10 — El turno, con la pantalla real de cada paso

`#como-funciona` es hoy un muro de texto: cuatro pasos numerados y cero evidencia. Existen cuatro capturas reales sin usar que mapean **1:1** a los cuatro pasos, y ese mapeo no se inventa: cada captura prueba lo que el paso afirma.

| Paso | Captura | Lo que la captura prueba |
|---|---|---|
| 01 El pedido entra | `media/pos_04_carrito_barra.webp` | Catálogo con `Total: C$ 75.00` y `1 producto agregado` |
| 02 Queda registrado | `media/pos_10_historial_ventas.webp` | Historial con `Facturas: 2` y `Anuladas: 0` |
| 03 El cobro cierra | `media/pos_07_cobro_efectivo_vuelto.webp` | Cobro con `C$ 500.00` recibido y `Vuelto: C$ 275.00` |
| 04 El cuadre queda | `media/pos_16_cierre_turno_corte_z.webp` | Arqueo ciego y `Cerrar Turno (Corte Z)` |

**Specs.**

- S1. Cada paso lleva su captura, dentro de un marco, con `alt` que describa lo que se ve y la etiqueta `Captura real de la terminal · datos de demostración`.
- S2. La captura no se recorta para encajar: se muestra completa, con `width`/`height` reales leídos del archivo.
- S3. Cero copy nuevo. Los cuatro textos de paso quedan como están, y el `CLAIM GUARD (#993/#983)` del paso 02 se conserva intacto.
- S4. El patrón no repite el libro de rutas del hub: aquí los cuatro pasos son horizontales y numerados, no filas con texto a un lado y medio al otro.
- S5. Tokens de `assets/site.css` solamente, y todo `var(--*)` que se nombre tiene que existir en ese archivo.
- S6. A 390 los cuatro pasos se apilan sin desborde horizontal (`overflowX` = 0).

**Fuera de alcance, ya decidido:** `#que-es` sigue sin material (darle capturas lo volvería la banda del hub). Y el hero no se anima todavía: el único clip de terminal en mano disponible (`pos_on_hand.mp4`) es footage sintético —fondo verde que aparece, notch de iPhone, la mano cambia de forma entre frames— y está prohibido por regla. El hero en movimiento necesita una grabación real nueva, no un clip generado.

## Log

- **L1**: "Bien, con eso ya hecho nos tocaría el rediseño de la home actual. Ya tenemos un system design, skills y demás. Pero quiero recalcar la inspiración de https://impeccable.style/ y https://www.tasteskill.dev/ Hay partes de esas paginas como en taste 'How it works', 'Before and after' y 'Questions' que son visualmente atractivas y pueden ser utiles para algunas secciones de nuestor copy. Esto ultimo es de taste, pero impeccable tambien tiene lo suyo. La idea tampoco es copiar fielmente pero si tomarlo de inspiración y hacer algo único para nuestro tipo de página. La idea del hero en impeccable me gusta para nuestro sitio también, donde a un lado iría el H! y al otro lado un montaje de un dispositivo con la UI de nuestra app." (ref imagen PayOne) "algo como este ejemplo. Espero haberme explicado bien y que captes la idea. No queremos una pagina generica o de plantilla, necesitamos algo único, atractivo y de alto nivel como lo exige nhilos."
- **L2**: Contexto previo acordado: copy fuente = home_copy v1.3; profundidad lean (el home vende, no explica); escalera de control simple→producción; precisión DGI (mecánica NHILOS / autorización del contribuyente); artboard es prototipo, la arquitectura SEO manda.
- **L3**: T1 ejecutado inline (el worker gentle-ai-worker falló 2× en background: narraba la escritura sin ejecutar tool calls). `design/nhilos-web-foundation/05-home-geo.html` construido en 3 pasadas: 781 líneas + corrección de CTAs (5 enlaces wa.me/50581948526).
- **L4**: T2 verificación del padre — veredicto por S#:
  - **S1 Hero split: PASS** — bezel S23 en CSS con `pos_hero_live_loop.mp4` real, chips flotantes (C$153.06 ticket / Offline cobro local), nota de datos de demostración. Verificado en captura 1440px.
  - **S2 Inspiraciones: PASS** — How it works → hilo de 4 pasos con línea emerald; Before/After → tarjetas Antes (warn) vs Con NHILOS (ok) basadas en el avatar, sin métricas inventadas; Questions → FAQ GEO como grid de tarjetas Q/A. Único, sin copiar plantilla.
  - **S3 Copy: PASS** — texto verbatim de home_copy v1.3; JSON-LD embebido y validado (Organization + SoftwareApplication + FAQPage, 10 preguntas).
  - **S4 Sistema de diseño: PASS** — tokens §3/§4/§5 de system.md; emerald-700 en eyebrows sobre claro (AA), emerald-400/500 solo sobre navy; targets ≥44px; shadow estructural sin blur marketing.
  - **S5 Media: PASS** — 5 referencias media/, todas existentes (pos_hero, pos_offline, pos_caja, dsh_bom + dsh_03); object-fit contain; etiquetas "datos de demostración" presentes.
  - **S6 Claims: PASS** — grep de 8 frases bloqueadas: 0 usos como afirmación; 2 coincidencias de "factura electrónica" son la mención meta-lingüística verbatim del copy GEO ("sin llamar factura electrónica a una facturación computarizada") — uso que niega el claim.
  - **S7 Aislamiento: PASS** — solo se creó 05-home-geo.html; 04 y build intactos.
  - **S8 Responsive/motion: PASS** — cero overflow horizontal (probe DOM: count=0 a 504px y 1440px); capturas 1440/1024/390 OK; reveal único + reduced-motion; coordinador de viewport (1 video, threshold 0.12); sin scroll hijacking.
  - Corrección aplicada: CTAs "Solicitar una demo" abren WhatsApp directo (wa.me) en hero, header y CTA final.
- **L5**: Riesgo: item 3 (el artboard nuevo coexiste con el prototipo 04; la migración del build es decisión aparte). Verificación: capturas multi-breakpoint + probes DOM + validaciones realizadas. Pendiente de decisión del usuario: revisión visual de 05, migración del build (ENTRY → 05) y deploy.
- **L5**: Riesgo: item 3 (el artboard nuevo coexiste con el prototipo 04; la migración del build es decisión aparte). Verificación: capturas multi-breakpoint + probes DOM + validaciones realizadas. Pendiente de decisión del usuario: revisión visual de 05, migración del build (ENTRY → 05) y deploy.
- **L6**: Decisión del founder (v1.4): H1 generalizado a "Sistema POS en Nicaragua que sigue vendiendo sin internet"; aplicado en artboard (h1, title, og:title, JSON-LD) y sincronizado en home_copy v1.4 y page_briefs v1.4. Long-tail restaurante reservada para /software-pos/restaurantes/.
- **L7**: Verificación integral (gentle-ai-verify, task mwk0cgwp-3-oiru) — 21 checks: PASS 13 / FAIL 5 / PARTIAL 3. Correcciones aplicadas post-verificación:
  - A1: FAQ unificado (decisión founder v1.5) documentado en copy; 10 respuestas GEO aprobadas con entity-first 10/10 ("NHILOS POS" + "Nicaragua" en primera oración); paridad visible==JSON-LD restaurada (regla h); #faq-geo como alias del contenedor; bullets inventados eliminados ("30 minutos", "sin datos de tarjeta", "cobro mensual", "por adelantado") y reemplazados por derivados aprobados.
  - B2: meta description 209→153 caracteres (bug de la v1.3 del propio doc corregido).
  - C2: etiqueta "datos de demostración" añadida al video bimoneda (#segmentos).
  - C4: aria-describedby en inputs, errores con grupo para businessType/demoPriority (sin default pre-seleccionado, validación agregada — anti-encasillamiento).
  - C6: `</script>` duplicado eliminado.
  - B1: h4 de footer → h3 (nivel skip corregido).
  - D1: NOTA — el diff de 04-sintesis-hibrida.html es el trabajo fiscal previo intencional sin commitear (no defecto de 05); decisión de commit del usuario.
  - Deudas de documentación (a)-(h) del verificador absorbidas en copy v1.5.
- **L8**: Test de regresión durable creado: `scripts/__tests__/nhilos-home-artboard.test.mjs` (15 tests, `node --test`) — cubre H1 único, claims, FAQ unificado con paridad schema/página, entity-first, meta limits, integridad JSON-LD, anchors, em-dash, media+labels, WhatsApp, debris, depth rule, form anti-default, datos personales. Estado final: 15/15 PASS.
- **L9**: Auditoría de medios por sección (excluyendo hero). Hallazgos y correcciones:
  - §5 Fiscal: el recurso usado (`dsh_03_historial_comprobantes.webp`) mostraba el resumen de Ventas, no comprobantes; el rótulo del navegador declaraba un contenido falso. Sustituido por `dsh_06_fiscal.webp` (módulo Fiscal, correlatividad, IVA, pestañas Anulaciones / Auditoría de secuencia) con rótulo y alt corregidos.
  - §7 Bimoneda: el clip (`pos_caja_step1_loop.mp4`) era catálogo y carrito, sin ninguna moneda. Sustituido por `pos_06_pantalla_cobro.webp` (total C$140.00 / $3.82 USD, TC BCN 36.6241, pago y vuelto en NIO/USD), nativo 1080x2316, encaja exacto en el marco `.device`.
  - §2 Offline: recurso real pero testigo ilegible al tamaño de despliegue (~8 px) y sin venta ni sincronización. Decisión del founder: nueva captura limpia en dispositivo (opción C).
  - §6 Inventario: recurso parcial (prueba receta y costo, no descuento ni merma). `dsh_20_kardex_delta_ledger` está en estado vacío. Decisión: nueva captura del Kardex poblado.
  - Descartados: reels de `Pictures/nhilos/Clips/` (9:16 con copy de marca incrustado) y `pos_offline_narrative_loop.mp4` (scroll sin cambio de estado).
  - Brief de captura creado: `docs/nhilos/web/nhilos_web_media_capture_brief_v1.0.md` (formatos, secuencias, criterios de aceptación, puntos de integración).
  - Commit: fdd140fd. Suite 15/15 PASS.
