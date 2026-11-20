# `/facturacion-dgi/` — segunda página hija del sitio NHILOS POS

Ruta publicada `/facturacion-dgi/`, artboard `design/nhilos-web-foundation/08-facturacion-dgi.html`. Fuente de verdad: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` **§4 (v1.7)** + la guía SEO de 7 pasos (metodología vinculante del fundador). Es la página con **mayor riesgo de claim del sitio** (ver S9).

---

## 0. Encargo, límites y cómo trabajar

**Qué se construye:** una página nueva, hermana de `05-home-geo.html`, `06-software-pos.html` y `07-precios.html`. Explica la mecánica fiscal nicaragüense en lenguaje llano y **sostiene una división**: la mecánica la garantiza NHILOS, la autorización es del contribuyente. No vende con miedo, no sobreafirma.

**Qué NO se toca:**
- `05-home-geo.html`, `06-software-pos.html`, `07-precios.html` ni sus suites de pruebas.
- `design/nhilos-web-foundation/assets/site.css` y `site.js` **salvo** que necesites un patrón que ya es sistema (spine, breadcrumb, botones, `faq-cell`). Si un patrón es nuevo, su CSS vive en un `<style>` **de la página**, dentro del artboard (precedente: `07-precios.html`).
- El producto (`apps/`). Esta tarea es solo sitio web.
- El IVA del cliente en pantallas, capturas y `alt` (ver S18).

**Comandos** (desde la raíz del repo):
```
node --test scripts/__tests__/nhilos-facturacion-dgi-artboard.test.mjs   # tu suite (la creás vos)
node --test scripts/__tests__/nhilos-home-artboard.test.mjs               # no debe romperse
node scripts/build-nhilos-web.mjs                                         # construye dist/nhilos-web
```

**Cómo trabajar (no negociable):**
1. **Test-first.** Escribí el test del guardia *antes* del código y **vello fallar** (RED). Un test que nunca falló no prueba nada.
2. **Verificá el artefacto, no el mensaje de tu script.** Si un script dice "listo", abrí el archivo y comprobalo. En este repo un `print` fuera de su `if` reportó una sección escrita que no existía.
3. **Ninguna afirmación de producto sin evidencia en el repo.** Si no podés verificar una celda de la tabla S8 contra código o contra el claim audit, **quitá la fila**; no la suavices con adjetivos.
4. **No inventes material.** Solo capturas reales; cero mockups, cero HTML que simule una pantalla.
5. **El brief manda.** Si el brief y esta spec discrepan, gana el brief; si el brief y la página discrepan, gana el brief.

---

## Specs

### S1. Página, ruta y fuente de verdad
- Ruta: `/facturacion-dgi/`. Archivo fuente: `design/nhilos-web-foundation/08-facturacion-dgi.html`. Salida: `dist/nhilos-web/facturacion-dgi/index.html`.
- Entrada en el array `PAGES` de `scripts/build-nhilos-web.mjs` con `source`, `out`, `url: "/facturacion-dgi/"`, `title`.
- Registro del artboard en `design/nhilos-web-foundation/design.json` (el canvas lo necesita).
- El artboard referencia `assets/site.css` y `assets/site.js` **en relativo** (el canvas lo abre desde `design/`); el build las absolutiza y hashea. No pongas rutas absolutas en el artboard.

### S2. Tono (verbatim del brief §4, vinculante)
> **Tono (vinculante):** sobrio, como un contador explicando una regla. Sin urgencia, sin miedo-venta, sin "multas" como gancho. El lector ya llegó preocupado; los adjetivos se cambian por hechos verificables.

**El trabajo de la página es reducir incertidumbre, no aumentarla.**

### S3. Keywords: una primary y dueños explícitos (brief §4.1–4.2)
- **Primary:** `sistema de facturación DGI en Nicaragua` — el H1 la contiene literalmente (S5).
- Secundarias que esta página posee: `facturación DGI Nicaragua`, `sistema de facturación Nicaragua`, `sistema de facturación DGI para pequeños negocios`, `qué es la DT 09-2007 facturación`.
- **Queries que NO persigue, con dueño** (no crear encabezados para ellas): `software de facturación DGI para restaurantes` y la informativa de trámite → `/facturacion-dgi/restaurantes/`; `sistema POS con facturación DGI` → `/software-pos/facturacion-dgi/`; `cómo anular una factura en la VET` → `/facturacion-dgi/como-anular-factura-vet/`; `comprar sistema de facturación para restaurante` → `/precios/` (regla 6 de anti-canibalización); `sistema de facturación electrónica*` → **sin URL, deliberadamente**; `cómo evitar multas` / `qué pasa si no facturo` → **nada**: son miedo, no mecánica.

### S4. Respuesta rápida en los primeros 150 px (verbatim, con una corrección de puntuación declarada)
> NHILOS garantiza la mecánica que exige la DT 09-2007: consecutivo inalterable, anulación solo con motivo auditado y libros exportables. La autorización, carta, código y numeración, la posee tu negocio como contribuyente.

**Corrección declarada:** el original del brief usa rayas (`—carta, código y numeración—`). Esta página prohíbe las rayas por decisión de estilo del sitio (S18), así que la puntuación pasa a comas y **las palabras no cambian**. Si preferís paréntesis, es equivalente; lo que no se cambia es el contenido de la frase.

### S5. H1 y la aclaración sin scroll
**H1 (verbatim):** `Sistema de facturación DGI en Nicaragua: la mecánica que exige la DT 09-2007`

Debajo del H1, sin necesidad de scroll, la aclaración: **facturación computarizada, no factura electrónica** (S9.2 prohíbe el término prohibido; esta aclaración es la que lo desactiva en la primera pantalla).

### S6. Jerarquía de encabezados: 10 H2 y 2 H3, verbatim y en este orden
El orden sigue **el orden en que el dueño tiene el miedo**, no el de features: validez → autorización → numeración → anulación → qué exige la norma → división de responsabilidad → inspección → impresora → FAQ → cierre.

1. `¿La factura que emite NHILOS POS es válida ante la DGI?`
2. `¿Necesito autorización de la DGI? ¿Quién la tramita?`
   - H3: `Qué es la carta de autorización, en palabras simples`
3. `¿Sirve mi numeración actual o hay que empezar de cero?`
4. `¿Qué pasa cuando hay que anular una factura? Paso a paso`
   - H3: `Por qué una anulación bien hecha protege tu numeración`
5. `Lo que la DT 09-2007 le pide a la facturación computarizada`
6. `Qué garantiza NHILOS y qué le corresponde a tu negocio`
7. `¿Y si llega una revisión de la DGI?`
8. `¿Qué pasa si uso una impresora que NHILOS no soporta?`
9. `Preguntas frecuentes sobre facturación DGI y DT 09-2007`
10. `Solicita una demo con tu operación fiscal real`

**El contenido de cada sección está en el brief §4.4 y se respeta punto por punto.** Resumen de lo que no se puede omitir:
1 → régimen vigente = facturación computarizada (SFC, DT 09-2007 + art. 143 Ley 822); la validez depende de dos cosas: tu autorización (tuya) y la mecánica (NHILOS).
2 → la autorización (carta, código, numeración) la obtiene y la posee cada negocio; NHILOS no emite autorizaciones ni hace trámites; en la implementación se registran RUC y datos de autorización para configurar prefijo y folio inicial.
3 → el sistema **no inventa** numeración: empieza desde el folio inicial que define tu autorización; **no renumera el pasado ni continúa folios de sistemas anteriores**.
4 → los 7 pasos del escenario, con la captura real (S12): no se elimina; motivo obligatorio; autorización de supervisor; **Nota de Crédito con folio correlativo propio**; registro inmutable de quién/cuándo/por qué/desde qué terminal; reversión trazable en kardex si había insumos; exportación del periodo con sus notas de crédito.
5 → las tres mecánicas: numeración consecutiva inalterable, anulación con motivo y rastro, libros exportables. Todo requisito adicional **solo si está verificado contra fuente**.
6 → la tabla de S8.
7 → sobrio, sin prometer resultados: lo que podés mostrar, lo que el sistema no hace (no responde por el negocio), y la recomendación práctica de que el contador prepare la carpeta.
8 → estado honesto: la impresión integrada opera en terminales Sunmi/iPOS; la impresión externa en ticketera genérica **está abierta y no se promete**. El registro fiscal no depende de la impresora. Los kits son de `/software-pos/hardware/` cuando exista.
9 → S10.
10 → CTA suave: demo con el historial de comprobantes y el flujo de anulación, datos etiquetados, + WhatsApp.

### S7. Profundidad y disciplina normativa
Esta página **puede exceder las ~120 palabras por H2** del home: cada párrafo responde una pregunta que el dueño preocupado se hace, no describe el producto. Mantenelo igual de corto que pueda ser, no más largo de lo que necesita.

**Tres capas, siempre distinguidas:** lo que la norma exige (verificado), lo que el rubro hace (declarado como práctica), decisiones de diseño propias (explicables, nunca disfrazadas de norma).

**Nada se eleva a norma por conveniencia comercial.** Todo requisito no verificado contra fuente en el repo (por ejemplo plazos de retención) se redacta **"confírmalo con tu contador"** o se verifica contra la Gaceta antes de publicar.

### S8. La tabla "garantiza / corresponde" (corazón de la página)
Dos columnas. Izquierda: **Garantiza NHILOS (mecánica, verificada en código)**. Derecha: **Le corresponde a tu negocio (contribuyente)**. Filas del brief §4.4, con su identificador:

| Garantiza NHILOS | ID |
|---|---|
| Numeración consecutiva que no se puede saltar ni editar: el sistema asigna el siguiente comprobante, sin botón de edición de folio | `PC-FISC-01` |
| Nada se borra: no existe eliminación física de facturas | `PC-FISC-02` |
| Anulación solo con motivo formal, autorizada con PIN de supervisor y registrada con quién, cuándo y por qué | `PC-FISC-02`, `PC-FISC-05` |
| Nota de Crédito con folio correlativo propio, vinculada a la factura original | `PC-FISC-05` |
| Registro con fecha, hora, terminal y usuario de cada evento crítico | `PC-SEC-03` |
| Libros de ventas y reportes fiscales exportables cuando el contador los pida | `PC-DASH-04` |
| El correlativo sigue operando sin internet y sincroniza en orden, sin duplicar, al reconectar | `PC-OFF-01/02/03` |
| Validación algorítmica de cédula y RUC — **sintáctica**, sin consulta al padrón en línea | `PC-FISC-03` |

Derecha: obtener y mantener tu autorización; entregar RUC y datos de autorización (paso 04 de implementación); emitir en la forma autorizada — incluida la impresión, que depende de tu hardware; conservar comprobantes y libros por el plazo legal (**el plazo lo confirma tu contador**); entregar la información del periodo a tu contador; responder ante la DGI (NHILOS no te representa).

**Verificación obligatoria:** cada celda izquierda se comprueba contra `docs/nhilos/branding/claims/product_claim_audit_od02_v1.3.md` y contra el código (`InventoryValuationService` no aplica aquí; sí `apps/pos_app` y `apps/admin_backend` para cada `PC-*`). **Celda que no se pueda verificar, se elimina con su fila.** El claim audit se cita en un comentario HTML, no visible.

### S9. Guardia de claims: 11 prohibiciones (verbatim del brief §4.5)
1. **"Sistema autorizado / certificado / aprobado por la DGI"** — NO. NHILOS no está registrado ni posee autorización DGI; la posee cada cliente contribuyente.
2. **"Factura electrónica" / "facturación electrónica" / "XML firmado" / "CUFE"** — NO. Nicaragua opera **facturación computarizada** (SFC, DT 09-2007 + Ley 822 art. 143); no existe validación en línea. La FE es futureware (`PC-FISC-04` NOT_IMPLEMENTED).
3. **"Cero multas" / "evita multas" / "protege de sanciones" / "pasa cualquier inspección"** — NO. Ningún software garantiza un resultado ante la DGI.
4. **"Facturación impresa" / "imprime tu factura DGI en cualquier impresora"** — NO. La impresión externa (adaptador ESC/POS genérico) no está implementada; hoy solo la impresora integrada de terminales Sunmi/iPOS. Reemplazo obligatorio: **"factura con la mecánica que exige la DT 09-2007"**.
5. **"Validación de RUC en línea contra el padrón de la DGI"** — NO. La validación es sintáctica y algorítmica.
6. **"Cumplimiento total DGI" / "100% conforme"** — NO. Ningún porcentaje.
7. **"Hacemos el trámite ante la DGI por ti" / "te conseguimos la autorización"** — NO.
8. **Plazos legales de retención con años o número de artículo** — NO hasta verificar contra la Gaceta. Mientras tanto: "el plazo de conservación lo confirma tu contador".
9. **"Continuamos o migramos tu numeración anterior"** — NO. Empieza desde el folio inicial configurado; no renumera ni absorbe folios previos.
10. **Anulación automática o sin autorización** — NO. Exige motivo y autorización de supervisor.
11. **"Cómo anular una factura en la VET"** como contenido de esta página — NO aquí; es trámite del contribuyente y vive en el hijo de soporte, revisado con contador.

**Además, heredadas del sitio (ya son guardia en las otras páginas):** nada de "nunca pierdes una venta", "100% sincronizado", "solución integral", "transformación digital", "ecosistema", "Hardware real", KDS como capacidad vendida, concurrencia de red/caja compartida/vista multi-marca consolidada.

### S10. FAQ: 7 preguntas verbatim, con `FAQPage` en paridad celda por celda
Preguntas (no las reescribas):
1. `¿NHILOS POS está autorizado por la DGI?` — respuesta: **No**, con la división exacta (la respuesta citable que el mercado no da).
2. `¿Necesito carta de autorización para facturar con sistema computarizado?` — sí para el régimen SFC; el trámite es del contribuyente; confirma requisitos vigentes con tu contador.
3. `¿Puedo anular una factura en NHILOS POS?` — sí: motivo obligatorio, autorización de supervisor, Nota de Crédito con folio propio, sin borrado.
4. `¿NHILOS POS es factura electrónica?` — No: facturación computarizada; no hay validación en línea en Nicaragua.
5. `¿Qué pasa con mi facturación si se cae el internet?` — el correlativo sigue en la terminal enrolada y sincroniza al reconectar; detalle y límites → `/software-pos/sin-internet/`.
6. `¿NHILOS POS imprime la factura en mi impresora?` — estado honesto (S9.4).
7. `¿Qué le entrego a mi contador?` — libros exportables y notas de crédito del periodo.

**Regla GEO heredada:** cada respuesta nombra la entidad y el mercado en la primera frase ("NHILOS POS…", "…en Nicaragua"). **Cada texto visible debe ser idéntico, carácter por carácter, al `text` del JSON-LD**; toda edición a uno se replica en el otro **en el mismo commit**.

### S11. Meta (verbatim, brief §4.8)
- **Title (≤60):** `Facturación DGI Nicaragua: mecánica DT 09-2007 | NHILOS`
- **Description (≤155):** `Facturación DGI Nicaragua: mecánica DT 09-2007 — correlativo inalterable, anulación auditada y libros exportables. La autorización es de tu negocio.`
  - La description del brief trae raya. **Sustituila por dos puntos o coma** (S18 prohíbe rayas) y dejá el resto literal.
- `og:title` espeja el title; `canonical` = `https://nhilospos.com/facturacion-dgi/`.

### S12. Evidencia real: dos capturas, ninguna inventada
| Sección | Archivo | Dimensiones |
|---|---|---|
| H2 4 (anulación) | `media/pos_13_dialogo_anular_factura.webp` | **800×1280** |
| H2 5 o 6 (la norma / la división) | `media/dsh_06_fiscal.webp` | **1440×900** |

`width`/`height` en el HTML deben ser **estas** dimensiones reales.

**Lo que la captura muestra (verificado leyendo la imagen, regla: la evidencia se elige por lo que la pantalla muestra, no por lo que dice el nombre del archivo):**
- `pos_13_dialogo_anular_factura.webp`: diálogo "Anular Factura"; "Seleccione el motivo de la anulación de 5:"; opciones **Error de captura / Cliente desiste / Ticket duplicado / Otro**; campo "Detalle (opcional)"; botones CANCELAR y ANULAR; detrás, "EMITIR NOTA DE CRÉDITO" y "ANULAR FACTURA".
- `dsh_06_fiscal.webp`: módulo **Fiscal** con RUC, Facturas 96, Anulaciones, **Auditoría de Secuencia**, Exportaciones, Ventas brutas, **IVA Recaudado**, Notas de crédito, Resumen fiscal DGI.

**Restricción crítica:** la captura del diálogo **no muestra el PIN ni la autorización de supervisor** — ese paso existe en código (`apps/pos_app/lib/ui/features/sales/../identity/supervisor_authorization.dart`, `supervisor_override_modal.dart`) pero es una pantalla posterior. **El `alt` no puede decir que la captura muestra el PIN.** El paso puede enunciarse en la lista numerada (la mecánica existe y está verificada), nunca atribuido a esa imagen.

**Alt:** describe lo que se ve, con las palabras reales de la pantalla. `title` opcional. Etiqueta de honestidad obligatoria junto a cada captura: **"datos de demostración"** (clase `demo-tag` o equivalente ya usada en el sitio).

**No hay captura de "historial de comprobantes con correlativo visible" verificada para esta página.** Si vas a mostrar una tercera, primero **abrí la imagen y comprobá que el número de factura se ve legible a 390 px**; si no, no la uses y dejá el slot documentado con un comentario `<!-- media-slot: … -->` que nombre la captura que falta. No inventes una.

### S13. Enlazado interno
**Entrante (no lo creás vos, ya existe o lo agrega el padre):** home → esta página; hub `/software-pos/` → esta página.
**Saliente, todos con anchor descriptivo y distinto:**
- `/precios/` → `ver planes y precios de NHILOS POS`
- `/software-pos/` → `qué es NHILOS POS: venta local-first`
- `/software-pos/sin-internet/` → límites de la continuidad offline (desde el FAQ)
- `/inventario/` → `control de inventario y kardex` (la mitad física de una revisión)
- `/demo/` y `/facturacion-dgi/restaurantes/`, `/facturacion-dgi/como-anular-factura-vet/`

**Páginas que todavía no existen** (`/inventario/`, `/demo/`, los dos hijos): se nombran como **texto plano**, nunca como enlace roto, con un comentario HTML que marque dónde entra el `<a>` cuando exista. Precedente exacto en `07-precios.html`.

### S14. Medición (nombres exactos)
`facturacion_llega_division` (tabla visible ≥75%), `facturacion_anulacion_lee`, `faq_facturacion_abre`, `cta_demo_facturacion`, `cta_whatsapp_facturacion` (con `utm_medium=facturacion-dgi`).
Si el sitio no tiene analítica instalada, **no inventes un cargador de GA**: dejá los `data-event="…"` puestos y documentá en un comentario que la analítica se conecta aparte. No agregues scripts de terceros sin autorización.

### S15. Estructura técnica compartida
- Shell idéntico a las otras tres: mismo `<head>` base, spine de secciones, breadcrumb `Inicio / Facturación DGI`, botón de volver arriba, footer, WhatsApp.
- **Breadcrumb con `BreadcrumbList`** en el JSON-LD, más `Organization` como en las otras páginas.
- **Tokens:** usá solo `var(--*)` que existan en `assets/site.css`. Tres tokens inventados ya rompieron este proyecto (`--text-heading-lg`, `--web-border`, y una ruta de fuente relativa): si un token no existe, no lo uses — agregalo a `site.css` si es de sistema, o definilo en el `<style>` de la página.
- Iconos: los mismos del sistema si existen; si no, ninguno (nada de librerías nuevas).
- Motion: reusar el patrón de reveal existente. **Un elemento con reveal debe poder verse sin JS** (el sitio ya tuvo un bug de `play()` ignorando `prefers-reduced-motion`).

### S16. Patrones de sección: inventar, no repetir
Ya usados en el sitio (**no repetir**): hero con fork de dos modos (hub), ledger de tres filas (hub), banda comparativa a-vs-b (hub), cinta de precio y líneas de tarifa (precios), tabla comparativa de planes (precios), fichas de plan (precios), banda oscura de riesgo por categoría (precios), pares asegurados (precios), tira de setup en 5 pasos (precios), píldoras de regla de hardware (precios), escalera de crecimiento en 3 pasos (precios).

`faq-cell` **sí se reutiliza** (es sistema). Todo lo demás es nuevo y propio de esta página. Candidatos que el contenido pide y que no existen todavía: **tabla de división de responsabilidad** (dos columnas, es el corazón de la página), **secuencia numerada de anulación** con la captura del diálogo, **banda de tres capas normativas** (norma / práctica / decisión). Elegí y nombralo en el ODD del commit: si un patrón no se puede nombrar ni mostrar un cambio de estado legible a 390 px, no va.

### S17. Suite propia de guardias (`scripts/__tests__/nhilos-facturacion-dgi-artboard.test.mjs`)
Desde cero, un test por regla, cada uno probado en **RED** antes de cumplirlo. Mínimo:
1. H1 verbatim (S5).
2. Los 10 H2 verbatim y en orden (S6).
3. Los 2 H3 verbatim (S6).
4. Title y description verbatim con sus límites (S11).
5. Canonical + `og:title` espejado.
6. Respuesta rápida presente en los primeros 150 px de texto (S4).
7. La aclaración "facturación computarizada, no factura electrónica" cerca del H1.
8. Las 11 prohibiciones de S9 **ausentes** (una aserción por frase prohibida, con la palabra exacta).
9. Claims heredados de otras páginas ausentes (S9 último párrafo).
10. Paridad `FAQPage` celda por celda: cada pregunta y cada respuesta visibles = JSON-LD, carácter por carácter (S10).
11. Las 7 preguntas del FAQ presentes y en orden.
12. La tabla de división existe con 8 celdas izquierda / 6 derecha y sus `PC-*` en el comentario.
13. Cada fila de la tabla izquierda verificada: presente en el claim audit (test que lee el doc y compara).
14. Las dos capturas referenciadas existen, con sus dimensiones reales (800×1280 y 1440×900).
15. Etiqueta "datos de demostración" junto a cada captura.
16. **El `alt` del diálogo no menciona PIN ni supervisor** (S12).
17. Rutas de `media/` y `assets/` relativas en el artboard, absolutas en lo publicado (el build lo garantiza; el test del artboard verifica la forma relativa).
18. `faq-cell` reutilizado; ningún patrón de S16 repetido (aserción por clase CSS de página).
19. Todo `var(--*)` usado existe en `site.css`.
20. Cero rayas (`—`) en el archivo.
21. Voz: cero narración de sitio (regex heredados: "esta página", "página dueña", "enunciada aquí", "mantenida en un solo lugar", "dicho tal cual", "La regla, publicada:").
22. Vocabulario interno prohibido: números de issue, "entitlements", "go-live", "staging", "backlog", "sprint", "hotfix", "TODO", "QA", "WIP" (case-sensitive donde corresponde), "OmniFood".
23. `\bBOM\b` ausente del texto visible y del JSON-LD (permitido en `alt`/`title` si una pantalla real se llama así).
24. Entrada en `PAGES` con `url: "/facturacion-dgi/"` y registro en `design.json`.
25. WhatsApp presente; CTA primaria con el mismo patrón que `/precios/`.
26. Sin nombres de personas reales.
27. Móvil: sin `overflow-x` a 390 px (patrón de las otras suites si existe; si no, dejalo documentado).

### S18. Reglas de voz y estilo (todas vinculantes)
- **El copy habla de la operación del lector, nunca del sitio.** Prohibido narrar la página o su organización.
- **Cero vocabulario interno:** sin números de issue, sin "entitlements", "go-live", "staging", "backlog", "sprint", "hotfix", "TODO", "QA", "WIP".
- **Ningún nombre viejo de proyecto.** "OmniFood" no aparece; el plan de soporte extendido se nombra así.
- **Cero rayas (—).** Decisión de estilo del sitio: dos puntos, coma o paréntesis.
- **`BOM` no aparece** en texto visible ni JSON-LD.
- **IVA: solo del cliente.** Esta página explica la obligación fiscal **del negocio que factura** — su régimen (cuota fija o general) es suyo y la norma es la de él. Lo que **no** puede aparecer es una afirmación sobre **nuestros precios** ("IVA incluido", "IVA aparte", "más IVA", "precios netos"): NHILOS no está inscrita, no recauda IVA, y esas frases son falsas (brief §2.9). Esta página no vende precios: si necesitás hablar de impuestos, hablá del régimen del contribuyente.
- **Nada que suene a hoja de ruta.** Si una capacidad no está, se dice como estado ("la impresión externa está en evaluación y no se promete"), nunca como fecha.

### S19. Accesibilidad y móvil
- Objetivos táctiles ≥44×44 (`WCAG 2.5.8`): si reusás el spine, ya está resuelto en `site.css`; no lo pises.
- Contraste AA en todo texto, incluidos placeholders y enlaces del footer. El separador del breadcrumb usa `--web-text-muted` (el token de borde no es color de texto).
- **Las bandas de ancho se miden, no se asumen.** Si una rejilla de capturas no se lee a 800 px, no la pongas en dos columnas ahí: medí y declararlo en el commit.
- Reveal: `threshold: 0` + `rootMargin '0px 0px -8% 0px'` (el 0.18 nunca disparaba en secciones altas).

### S20. Rendimiento y media
- Solo se publica el media que la página referencia (el build ya lo hace). Presupuesto: no agregues clips nuevos sin autorización; las dos capturas suman < 200 KB.
- Nada de librerías nuevas, ni fuentes nuevas, ni frameworks.

### S21. Test-first, con RED probado
Escribí cada guardia antes de la sección que la cumple, corré, **vello fallar**, y recién después implementá. En el reporte final, por cada guardia: qué falló y por qué. Un guardia que nació en verde no prueba nada y no cuenta.

### S22. Build y publicación
```
node scripts/build-nhilos-web.mjs
```
El build **falla** —y tiene que fallar— si: falta un asset, la hoja de estilos no está hasheada, hay una referencia relativa a `assets/`/`media/`/`fonts/` en una página publicada, o una hoja publicada referencia fuentes en relativo. Si lo ves fallar, arreglá la causa; no desactives el guardia.

**No publiques** (deploy, push) sin autorización explícita. Tu entregable termina en `dist/` construido y la suite verde.

### S23. Commits (si te los piden)
Conventional Commits **en inglés**, unidades revisables de ~400 líneas como máximo. El código, sus tests y su documentación van juntos.

### S24. Definición de terminado
1. Artboard `08-facturacion-dgi.html` completo, con las 10 secciones y los 2 H3.
2. Suite propia verde, con cada guardia probada en RED.
3. Las tres suites existentes siguen verdes (home 24, hub 36, precios 25).
4. `node scripts/build-nhilos-web.mjs` termina sin fallar y `dist/nhilos-web/facturacion-dgi/index.html` existe.
5. `PAGES` y `design.json` actualizados.
6. Capturas reales con dimensiones reales y etiqueta de datos de demostración.
7. Reporte de cierre: qué se implementó, qué se omitió y por qué (con la spec citada), y qué quedó pendiente de tu lado.

---

## Tasks

| ID | Specs | Ruta | Commit sugerido |
|---|---|---|---|
| T1 | S1, S15 | Artboard nuevo con shell, spine, breadcrumb, tokens; `PAGES` + `design.json`; suite creada vacía | `feat(web): scaffold the fiscal page artboard` |
| T2 | S5, S6, S7 | H1, primera sección y H2 1–3 con sus contenidos | `feat(web): fiscal page intro and authorization split` |
| T3 | S6, S12 | H2 4 (anulación) con la captura del diálogo, secuencia de 7 pasos, alt verificado | `feat(web): anulation walkthrough with the real dialog capture` |
| T4 | S6, S8 | H2 5 y 6: norma en tres mecánicas + tabla de división verificada contra el claim audit | `feat(web): normative mechanics and the responsibility table` |
| T5 | S6, S9 | H2 7 y 8 (revisión e impresora) con estado honesto | `feat(web): inspection and printer sections, stated as-is` |
| T6 | S10, S11 | FAQ de 7 preguntas + `FAQPage` en paridad + meta + breadcrumb schema | `feat(web): fiscal FAQ with schema parity` |
| T7 | S17 | Suite completa de guardias, cada una probada en RED | `test(web): fiscal page guard suite` |
| T8 | S19, S20, S22 | Móvil medido, accesibilidad, build, capturas a 1440 y 390 | `fix(web): fiscal page mobile bands and build` |
| T9 | S24 | Reporte de cierre | — |

---

## Lo que se va a revisar (checklist del padre, no del implementador)

1. Los 10 H2 y 2 H3, **contra el brief, palabra por palabra** (no contra la spec).
2. Que cada prohibición de S9 esté realmente ausente y que no haya un sinónimo nuevo.
3. Que cada fila de la tabla izquierda tenga evidencia verificable; si una sobra, sale.
4. Paridad GEO **celda por celda**, no "parecido".
5. Que el `alt` del diálogo no afirme el PIN.
6. Que las dimensiones del HTML sean las reales de los archivos.
7. Que la suite nueva falle si se rompe la regla: voy a **introducir un defecto a propósito** y ver si el guardia lo caza.
8. Que las 85 guardias existentes sigan verdes.
9. Que el build no publique media huérfano y que las rutas se resuelvan como el navegador.
10. Voz: leo la página entera buscando frases que hablen de la página en vez de la operación del lector.

---

## Log

- **L1.** Pedido del fundador, verbatim: *"ahora como viene la construcción de la segunda hija, creame el odd, con todos los detalles, el seguimiento de la guia SEO y todo para la correcta implementacion y me indicas donde esta el archivo, me lo llevare a antigrativy y cuando termine tu me lo revisas. Para no agotar mis quotas, vamos a distribuirlas"*. La implementación se ejecuta fuera de esta sesión (Antigravity) y vuelve al padre para revisión: por eso el documento es autosuficiente y trae checklist de revisión propio.
- **L2.** Mapeo explícito de la guía SEO de 7 pasos a esta página (metodología vinculante): **1 avatar** → brief §4.1 (dueño preocupado, contador que decide si el sistema le crea trabajo) = S2; **2 keywords** → S3 con dueños explícitos; **3 arquitectura** → S1, S13 (hub fiscal, término cabeza, enlazado entrante/saliente); **4 encabezados** → S6 (10 H2 en el orden del miedo); **5 contenido** → S7, S8, S9; **6 FAQ para LLMs** → S10 con entidad y mercado en la primera frase; **7 prototipo + schema** → S6, S11, S15, S16 y la paridad de S10.
- **L3.** Verificación de evidencia hecha antes de escribir la spec: la captura `pos_13_dialogo_anular_factura.webp` (800×1280) muestra el diálogo con motivos **Error de captura / Cliente desiste / Ticket duplicado / Otro**, "Detalle (opcional)" y los botones CANCELAR/ANULAR, con "EMITIR NOTA DE CRÉDITO" y "ANULAR FACTURA" detrás. **No muestra PIN ni autorización de supervisor**; ese paso existe en código (`supervisor_authorization.dart`, `supervisor_override_modal.dart`) pero es una pantalla posterior → el paso se puede enunciar, la captura no lo puede probar. `dsh_06_fiscal.webp` (1440×900) muestra Facturas 96, **Auditoría de Secuencia**, Ventas brutas, **IVA Recaudado** y Notas de crédito.
- **L4.** Corrección de puntuación declarada en S4 y S11: el brief trae rayas y el sitio prohíbe rayas por decisión de estilo. Se cambia la puntuación, **no las palabras**. Si el fundador prefiere conservar la raya del brief, se revierte en ambos lugares.
- **L5.** No existe captura verificada de "historial de comprobantes con correlativo visible" para esta página: se permite usar una tercera solo si el número se lee a 390 px, y si no, el slot queda documentado con `media-slot:` y la captura que falta (S12).
- **L6.** Regla de IVA acotada (brief §2.9, aclaración del fundador): la prohibición es sobre **nuestros precios**. El IVA del cliente —régimen cuota fija o general— es un dato verdadero de su operación y aparece libremente en pantallas, capturas y `alt`.
