# `/demo/` — página de conversión del sitio NHILOS POS

Ruta publicada `/demo/`, artboard `design/nhilos-web-foundation/10-demo.html`. Fuente de verdad: `docs/nhilos/web/nhilos_web_page_briefs_v1.0.md` **§9** + la guía SEO de 7 pasos. Esta página **no educa ni vende precio**: responde "¿y si pido la demo, qué me espera?" y convierte. Hoy los CTA primarios de tres páginas publicadas apuntan al formulario del home porque esta página no existe.

---

## 0. Encargo, límites y cómo trabajar

**Qué se construye:** una página nueva, hermana de las cinco existentes. Su centro de gravedad es **el formulario**, no el texto.

**Qué NO se toca:**
- Las cinco páginas existentes ni sus suites.
- `assets/site.css` y `site.js` — **con una excepción declarada y medida**, ver S10: la extensión del handler es parte del trabajo y exige una verificación diferencial del mensaje del home.
- El producto (`apps/`). Solo sitio web.

**Comandos** (desde la raíz del repo):
```
node --test scripts/__tests__/nhilos-demo-artboard.test.mjs        # tu suite
node --test scripts/__tests__/nhilos-home-artboard.test.mjs        # el home no debe romperse
node scripts/build-nhilos-web.mjs
```

**Cómo trabajar (no negociable):**
1. **Test-first.** El guardia se escribe antes y **se ve fallar** (RED).
2. **Verificá el artefacto, no el mensaje de tu script.**
3. **Ninguna capacidad sin evidencia.** Si el formulario no envía a ningún lado, la página no dice que envía a ningún lado.
4. **El brief manda** — salvo donde esta spec demuestra que el brief se contradice o excede un límite propio; en ese caso se reporta y se aplica la regla que aquí se fija, dejándolo anotado.

---

## Specs

### S1. Página, ruta y fuente de verdad
- Ruta `/demo/`; fuente `design/nhilos-web-foundation/10-demo.html`; salida `dist/nhilos-web/demo/index.html`.
- Entrada en `PAGES` (`scripts/build-nhilos-web.mjs`) con `source`, `out`, `url: "/demo/"`, `title`; registro en `design/nhilos-web-foundation/design.json`.
- `assets/site.css` y `assets/site.js` **en relativo** en el artboard (el build las absolutiza y hashea).

### S2. Tono (verbatim del brief §9, vinculante)
> Las reglas del tono mandan: sin urgencia artificial, sin "cupos limitados", sin cuentas regresivas.

**La veracidad es la regla de profundidad:** si un dato del proceso no está decidido (por ejemplo la duración), **la página no lo publica**. Lo que sí está decidido y se publica: el plazo de respuesta (**menos de 24 horas hábiles**) y la condición de costo (**se coordina sin compromiso**).

### S3. Keywords: una primary y dueños explícitos
- **Primary:** `demo de sistema POS para restaurante` — **en un H2 de segmentos, nunca en el H1 ni en el title** (ver S5 y S6).
- Secundarias: `solicitar demo sistema POS`, `demo sistema POS Nicaragua`.
- **Realidad honesta del set:** la página tiene un set delgado **por diseño**; su trabajo es convertir la intención que crearon las otras páginas. La mayor parte del tráfico llega por navegación interna, no por búsqueda — eso es correcto y **no** es canibalización.
- **NO persigue, con dueño:** `instalar / instalación sistema POS` → `/implementacion/` (regla 7: preventa vs postventa, nunca en la misma URL); `precio`, `cotización`, `comprar`, `cuánto cuesta` → `/precios/`; `comparativa` / `mejores POS` → `/comparativas/`; `sistema POS para restaurante`, `POS sin internet`, `sistema de inventario` → sus páginas dueñas. **Esta página no repite esas queries como encabezados.**

### S4. Respuesta rápida en los primeros 150 px
> Pides la demo y te escribimos por WhatsApp. Ves NHILOS POS en un escenario armado según tu tipo de negocio y tu prioridad, con datos de demostración etiquetados. La cotización con cronograma real sale al finalizar. Te confirmamos en menos de 24 horas hábiles.

**Corrección declarada (importante):** el brief dice *"te contactamos por el canal que elegiste"*. Hoy hay **un solo canal**: el formulario compone un mensaje y lo entrega a WhatsApp (verificado en `site.js`); no hay correo ni backend. Prometer "el canal que elegiste" cuando solo existe uno es prometer un menú que no está. La frase dice **WhatsApp**, y cuando exista un segundo canal se amplía aquí y en el brief a la vez.

### S5. H1 de segmento neutro
`Demo de NHILOS POS: qué recibes y cómo se coordina`

**Decisión del fundador (2026-11-20), verbatim:** *"veo que estamos encasillando en restaurantes de nuevo en este contenido para la demo"*. Con el H1 del brief, `/demo/` habría sido **la única página del sitio con un segmento en el H1**: las otras cinco son neutras (`POS sin internet en Nicaragua`, `Sistema POS en Nicaragua`, `Precios de NHILOS POS en Nicaragua`, `Facturación DGI Nicaragua`, `Sistema de inventario en Nicaragua`).

**Y era una contradicción interna del brief:** §9.2 lista `sistema POS para restaurante` entre las queries que esta página **no persigue** porque su dueña es `/software-pos/restaurantes/`, y a la vez le asignaba `demo de sistema POS para restaurante` como primary del H1. La query segmento-calificada sigue siendo objetivo —no tiene otro dueño y su intención es de proceso—, pero se gana en un **H2 de segmentos** (S6), no en la puerta de entrada.

### S6. Jerarquía: 8 H2 y 2 H3, verbatim y en este orden
1. `¿Qué es la demo de NHILOS POS?`
2. `Demo de sistema POS para restaurante, cafetería, food park o mostrador`
   - H3: `Qué se muestra según tu tipo de negocio`
3. `¿Cómo se coordina y cuánto hay que esperar?`
   - H3: `¿Cuánto dura la demo?`
4. `¿Qué necesito preparar?`
5. `¿Con qué datos se muestra el sistema?`
6. `¿Qué pasa después de la demo?`
7. `Preguntas frecuentes sobre la demo`
8. `Pide tu demo`

**El H3 `Qué se muestra según tu tipo de negocio` cambia de padre** (del H2 1 al H2 de segmentos): su texto no se toca, y su lugar lógico es donde viven los segmentos. Declarado, no deslizado.

Contenido por sección: brief §9.4. Lo que no se puede omitir:
1 → definición corta: demostración en un escenario armado según tu tipo de negocio y tu prioridad (bullet aprobado del home v1.5): venta en mostrador, contingencia sin internet, recetas con descuento de insumos, bimoneda. **No es una presentación de slides ni una grabación genérica.**
2 → **el H2 de segmentos**: nombra los cuatro casos seguidos (restaurante, cafetería, food park, mostrador) y dice en una línea qué control ve cada uno; cierra con que es **el mismo sistema con el control ajustado a tu negocio**, y que un mostrador simple no necesita recetas. Aquí vive la frase exacta que se busca: `Demo de sistema POS para restaurante`.
   H3 → los escenarios en una línea cada uno: restaurante con recetas; cafetería/panadería; food park (catálogo por puesto y cobro por terminal); tienda/mostrador (modo simple); más la contingencia sin internet si es tu prioridad. **Los mismos escenarios de la home, sin inventar demos segmentadas.**
2 → el proceso real: pides por el formulario o WhatsApp directo; te confirmamos **en menos de 24 horas hábiles** y se agenda contigo. Sin cupos limitados, sin cuentas regresivas, sin descuento por pedir hoy.
   H3 → la duración **no se publica en minutos**: se arma con tu operación (rubro, lo que te cuesta hoy, cuántas cajas). Lo que sí se afirma: la cotización con cronograma real sale al finalizar.
3 → lo mínimo: qué vendes, cuántas cajas operas, cocina o solo mostrador. **No hay que enviar menú, Excel ni archivo alguno**: la carga del catálogo real es de la implementación.
4 → datos de demostración etiquetados, provenance aprobado: **"Operación real capturada de NHILOS Market & Café · datos de demostración"**. Tus datos reales no entran en la demo.
5 → la cotización con cronograma real sale al finalizar, con el alcance exacto de setup, terminales y packs. Los precios públicos viven en `/precios/`; la implementación es la etapa siguiente. **Nada de "te inscribes ahí mismo" ni permanencia prometida** (los términos de contrato no están definidos).
6 → S9.
7 → S10.

### S6b. Los dos bullets aprobados del home v1.5 (verbatim, no reescribir)
El brief los mantiene aprobados y esta página los sostiene palabra por palabra:
- `Escenario armado según tu tipo de negocio y tu prioridad.`
- `Cotización con cronograma real al finalizar la demo.`

El primero vive en el H2 1 (y su H3); el segundo, en el H2 2 y en el H2 5. **Si se reescriben, dejan de ser los bullets aprobados** y la página empieza a prometer otra cosa que la home.

### S7. Profundidad
**Esta página describe el proceso, no el producto.** Cada bloque responde una pregunta del que está a un clic de pedir: ¿qué recibo?, ¿cómo se coordina?, ¿cuánto espero?, ¿con qué datos?, ¿qué preparo?, ¿qué pasa después? **Nada de descripciones de features** (son de las páginas dueñas) ni tablas de precios (son de `/precios/`).

### S8. Guardia de claims: 10 prohibiciones (verbatim del brief §9.5)
1. **Urgencia artificial — NO.** Ni "últimos cupos", ni "solo esta semana", ni cuentas regresivas, ni descuento por pedir hoy, ni "agenda antes de que suba el precio".
2. **Duración de la demo en minutos — NO.** Anunciar una cifra rompe la promesa de demo personalizada.
3. **"Sin datos de tarjeta" — NO.** No aprobado por producto.
4. **"Demo gratis" / "prueba gratuita" — NO.** La condición de costo no está definida; la frase aprobada es **"se coordina sin compromiso"**.
5. **Plazos más rápidos que el aprobado — NO.** El compromiso es **menos de 24 horas hábiles**. Nada de "en 15 minutos", "de inmediato", "el mismo día".
6. **"La demo incluye tu catálogo real" / migración de datos en la demo — NO.** La carga y la migración son de la implementación.
7. **"Sin compromiso / sin permanencia" como término de contrato — NO.** "Sin compromiso" se usa **solo** como la frase aprobada de coordinación de la demo.
8. **Campos que no sirven a la demo — NO pedir.** Prohibidos: RUC, correo obligatorio, teléfono adicional, presupuesto, y cualquier pregunta que solo cualifique al lead sin cambiar lo que se muestra.
9. **Capturas o métricas sin etiqueta — NO.** Todo dato mostrado es de demostración y lleva su etiqueta.
10. **Estándar transversal — NO:** "facturación impresa", "factura electrónica", "sistema autorizado por la DGI", "cero multas", "nunca pierdes una venta", "100% sincronizado", precios de hardware o BYOD, KDS, exportación contable, y ningún vocabulario interno (números de issue, "entitlements", "go-live") ni frases de roadmap.

### S9. FAQ: 7 preguntas + `FAQPage` en paridad celda por celda
1. `¿La demo tiene costo?` — se coordina sin compromiso (**sin** decir gratis).
2. `¿Cuándo me contactan?` — en menos de 24 horas hábiles.
3. `¿Cuánto dura?` — sin duración publicada: se arma con tus datos.
4. `¿Necesito preparar algo?` — qué vendes, cuántas cajas, cocina o mostrador.
5. `¿Veo el sistema con mi tipo de negocio?` — sí: escenario según tu tipo y prioridad.
6. `¿Los datos de la demo son reales?` — datos de demostración etiquetados.
7. `¿Qué pasa después?` — cotización con cronograma real al finalizar.

**Regla GEO heredada:** entidad y mercado en la primera frase. **Cada respuesta visible idéntica carácter por carácter al `text` del JSON-LD**; toda edición se replica en el mismo commit.

### S10. El formulario: cómo funciona hoy (verificado) y qué hay que extender
**Estado real, leído en `assets/site.js`:** el formulario del home (`id="nhilosDemoForm"`) **no tiene backend**. Valida en el navegador (nombre, negocio, teléfono con ≥8 dígitos, correo opcional con formato), compone un mensaje de texto y hace `window.open('https://wa.me/50581948526?text=…')`. El mensaje lleva: negocio y tipo, terminales, prioridad, nombre, teléfono y correo si existe.

Para `/demo/`:
- **Campos base (4):** nombre, negocio, tipo de negocio, **WhatsApp**.
- **Bloque de contexto (3 + 1):** rubro, **qué te cuesta hoy la operación**, cuántas cajas operas, y un campo abierto corto **opcional**.
- Reusá los `name` y `id` existentes donde existan (`businessName`, `businessType`, `contactName`, `contactPhone`, `terminalCount`, `demoPriority`) para no duplicar contrato de datos.
- **"Cuántas cajas operas" es el mismo dato que "terminales"**: usá `terminalCount`. No inventes un campo paralelo.
- Sin RUC, sin correo obligatorio, sin presupuesto (S8.8).

**Extensión del handler — declarada y medida.** El handler vive en `site.js`, que es **código compartido**: el home lo usa. La extensión debe ser **genérica** (recorrer el `FormData` y anexar los campos nuevos que existan), de modo que **el mensaje del home salga byte por byte idéntico** cuando el formulario es el del home. Eso se prueba con una verificación diferencial: componer el mensaje con el código nuevo usando los campos del home y compararlo con el mensaje del código anterior. Cualquier diferencia es una regresión.

Si preferís no tocar `site.js`: un `<script>` **de la página** puede hacer el trabajo. En ese caso no dupliques la validación accesible del home: reusá sus clases y mensajes (`data-error-for`, `.is-invalid`, `aria-invalid`) para que se comporte igual.

### S11. Canal único y honestidad del envío
El único canal es **WhatsApp**: el mensaje se compone y se abre en el WhatsApp del usuario, que **lo envía él**. Por eso:
- La página **no** dice "enviamos tu solicitud" ni "recibimos tus datos": dice que se abre WhatsApp con el mensaje listo.
- **Ningún dato se almacena** en un servidor del sitio (no hay backend). No prometas lo contrario ni inventes una política de privacidad: podés decir la verdad mecánica: el mensaje sale desde tu WhatsApp y lo enviás vos.
- UTM obligatorio en los enlaces de WhatsApp: `utm_medium=demo`.

### S12. Sin capturas por defecto
El brief define la prueba como **el propio flujo descrito** + los bullets aprobados: esta página **no necesita ninguna captura**. Es la primera del sitio que puede y debe quedar sin material gráfico.

**No agregues una captura "para llenar".** Si se usa una, debe estar ya commiteada, llevar la etiqueta de demostración y **no** puede sugerir "así se verá tu operación". El único dato visual etiquetado es el de la sección 4, y puede resolverse con texto: *"Operación real capturada de NHILOS Market & Café · datos de demostración"*.

### S13. Enlazado interno
**Saliente:** `/` (breadcrumb + `BreadcrumbList`), `/precios/` (`ver planes y precios de NHILOS POS`), `/software-pos/` (`qué es NHILOS POS: venta local-first`), `/facturacion-dgi/` y `/inventario/` (los dos métodos que el comprador verifica antes de decidir), y `/implementacion/` **como texto plano con comentario** (no existe todavía). Cero enlaces rotos.

### S14. Medición (nombres exactos)
`demo_form_inicia` (primer campo enfocado), `demo_form_envia` (envío), `demo_whatsapp_clic` (UTM `utm_medium=demo`), `demo_prepara_lee`, `faq_demo_abre`.
**No hay analítica instalada:** dejá los `data-event` y **no** agregues scripts de terceros.

### S15. Estructura técnica compartida
Shell idéntico a las otras cinco: mismo `<head>`, spine, breadcrumb `Inicio / Demo`, volver arriba, footer, WhatsApp. JSON-LD con `FAQPage`, `BreadcrumbList` y `Organization`. Tokens solo `var(--*)` existentes. Reveal con el patrón del sitio, y **todo elemento con reveal debe verse sin JS**.

### S16. Patrones de sección: inventar, no repetir
Ya usados (**no repetir**): hero con fork, ledger de tres filas, banda comparativa, cinta de precio, líneas de tarifa, tabla comparativa de planes, fichas de plan, banda oscura de riesgo, pares asegurados, tira de setup, píldoras de hardware, escalera de crecimiento, secuencia numerada de anulación, banda de tres capas normativas, tabla de división, fórmula del costo, par merma teórica vs física, tabla de packs.
`faq-cell` y `demo-tag` **sí** se reutilizan. Candidatos propios de esta página: **proceso en tres pasos horizontales** (pides → te escribimos → se agenda), **bloque de expectativas** (lo que recibes / lo que no recibes), **formulario como pieza central** con contexto agrupado. Nombralo en el commit; si no se puede nombrar ni mostrar un cambio de estado legible a 390 px, no va.

### S17. Suite propia (`scripts/__tests__/nhilos-demo-artboard.test.mjs`)
Desde cero, cada guardia **RED** antes de cumplirse. Mínimo 24:
1. H1 verbatim. 2. Los 8 H2 verbatim y en orden. 3. Los 2 H3 verbatim. 4. Title y description con sus límites (**≤60 / ≤155**). 4b. **Ningún segmento en el H1 ni en el title**: falla si aparece restaurante, cafetería, panadería, food park o mostrador. 4c. La query `demo de sistema POS para restaurante` **sí** aparece en un H2. 5. Canonical + `og:title`. 6. Respuesta rápida en los primeros 150 px. 7. Las 10 prohibiciones de S8 ausentes. 8. Claims heredados ausentes. 9. **Cero minutos de duración** en cualquier contexto. 10. **Cero "gratis"/"gratuita"**. 11. Plazo exacto "menos de 24 horas hábiles" presente y **ninguna variante más rápida**. 12. Paridad `FAQPage` celda por celda. 13. Las 7 preguntas y en orden. 14. **Campos obligatorios exactos**: los 4 base + contexto; **ausencia de RUC, correo obligatorio y presupuesto**. 15. `terminalCount` reutilizado, sin campo paralelo. 16. `utm_medium=demo` en todos los enlaces de WhatsApp. 17. Etiqueta de datos de demostración con el provenance aprobado. 18. Rutas relativas en el artboard. 19. `faq-cell`/`demo-tag` reutilizados y ningún patrón de S16 repetido. 20. Todo `var(--*)` existe en `site.css`. 21. Cero rayas (—). 22. Voz: cero narración de sitio. 23. Vocabulario interno prohibido. 24. `PAGES` + `design.json`; WhatsApp presente; sin nombres de personas.
**Y una guardia fuera de la suite de la página:** la verificación diferencial del mensaje del home (S10), como test propio en el lugar donde vive el handler.

### S18. Accesibilidad del formulario
`<label>` real por campo (o `fieldset`/`legend` en los grupos de radios), errores asociados y anunciados, foco al primer campo inválido, `aria-invalid`, y **fallback sin JavaScript**: un enlace de WhatsApp visible dentro de un `<noscript>` (hoy el formulario del home no envía nada sin JS; esta página no repite esa deuda). Objetivos ≥44×44. Contraste AA en placeholders y errores.

### S19. Móvil
Bandas medidas, no asumidas: el formulario a 390 px debe ser de una columna y cada campo legible sin zoom. Reveal con `threshold: 0` + `rootMargin '0px 0px -8% 0px'`.

### S20. Test-first
Cada guardia nace roja contra un defecto real. En el reporte: por guardia, qué falló y por qué.

### S21. Build
`node scripts/build-nhilos-web.mjs` **debe** fallar si falta un asset, si una hoja no está hasheada o si una página publicada conserva referencias relativas a `assets/`/`media/`/`fonts/`. Arreglá la causa; no desactives el guardia. **No publiques** sin autorización.

### S22. Commits
Conventional Commits **en inglés**, ~400 líneas por unidad, código + tests + doc juntos.

### S23. El title: decidido, neutro y dentro del límite
**Decidido (2026-11-20):** `Demo de NHILOS POS: qué recibes y cómo se coordina` — **50 caracteres**, espeja el H1, sin segmento.

Motivo del cambio: el title del brief (`Demo de NHILOS POS · Sistema POS para restaurante en Nicaragua`) **medía 62 caracteres contra un límite declarado de 60** *y además* encasillaba en restaurantes. Un solo cambio resuelve las dos cosas.

### S23b. Defecto medido del brief (histórico)
El title del brief §9.8 mide **62 caracteres** y su límite declarado es **60**:
`Demo de NHILOS POS · Sistema POS para restaurante en Nicaragua` → **62**.

**Regla para el implementador:** no lo acortes por tu cuenta en silencio, y no publiques 62 ignorando el límite. Las tres variantes medidas (§9.8 corregido), elegí **una** y **declarala en el reporte y en el brief**:

| Variante | Caracteres | Qué conserva |
|---|---|---|
| `Demo de sistema POS para restaurante en Nicaragua` | **49** | la keyword exacta, el mercado; pierde la marca (que sí va en `og:title`) |
| `Demo de NHILOS POS · POS para restaurante en Nicaragua` | **54** | marca + intención + mercado |
| `Demo de NHILOS POS · Sistema POS para restaurantes` | **50** | marca + término; pierde el mercado |

Recomendación del padre: la de **54** (marca + intención + mercado). La decisión final es del fundador; la suite exige **≤60**, no una en particular.

### S24. Definición de terminado
1. Artboard con 7 H2 y 2 H3. 2. Suite propia verde, cada guardia en RED. 3. Las cinco suites existentes verdes (home 24, hub 36, precios 25, fiscal 27, inventario 26). 4. Verificación diferencial del mensaje del home sin diferencias. 5. Build sin fallar y `dist/nhilos-web/demo/index.html` existe. 6. `PAGES` y `design.json` actualizados. 7. Title decidido y declarado. 8. Reporte de cierre con lo omitido y su spec.

---

## Tasks

| ID | Specs | Ruta | Commit sugerido |
|---|---|---|---|
| T1 | S1, S15 | Artboard con shell, spine, breadcrumb, tokens; `PAGES` + `design.json`; suite vacía | `feat(web): scaffold the demo page artboard` |
| T2 | S5, S6, S7 | H1 neutro, H2 1 (definición) y H2 2 de segmentos con su H3 | `feat(web): demo page intro and the four segments` |
| T3 | S6, S11 | H2 2 con su H3 (coordinación, plazo, duración no publicada) | `feat(web): how the demo is scheduled` |
| T4 | S6, S12 | H2 3 y 4 (qué preparar, con qué datos) sin capturas | `feat(web): what to prepare and demo data disclosure` |
| T5 | S6, S9 | H2 5 + FAQ de 7 con `FAQPage` en paridad + meta + schema | `feat(web): demo FAQ and schema parity` |
| T6 | S10, S11, S18 | H2 7: el formulario con contexto, extensión genérica del handler y fallback sin JS | `feat(web): demo form with operation context` |
| T7 | S10, S24 | Verificación diferencial del mensaje del home | `test(web): the home demo message is unchanged` |
| T8 | S17 | Suite completa, cada guardia en RED | `test(web): demo page guard suite` |
| T9 | S19, S21 | Móvil medido, build, capturas de pantalla a 1440 y 390 | `fix(web): demo page mobile bands and build` |
| T10 | S24 | Reporte de cierre | — |

---

## Lo que se va a revisar (checklist del padre)

1. Los 7 H2 y 2 H3 **contra el brief**, palabra por palabra.
2. Que no haya urgencia artificial **de ninguna forma**: ni "hoy", ni "últimos", ni contadores, ni un verbo en imperativo con prisa.
3. Que **no se publique una duración** en ninguna unidad (minutos, "media hora", "una hora").
4. Que el plazo sea exactamente *menos de 24 horas hábiles* y que ningún otro lugar de la página prometa algo más rápido.
5. Los campos del formulario: exactos, sin RUC, sin correo obligatorio, sin presupuesto.
6. Que el mensaje del home salga **idéntico** tras extender `site.js`: voy a compararlo.
7. Que el formulario se pueda usar con teclado y con lector de pantalla, y que haya camino sin JS.
8. Que la suite cace defectos inyectados: voy a colar una duración, un "gratis" y un plazo de 24 horas.
9. Que las 138 guardias existentes sigan verdes.
10. Lectura completa de voz: nada que narre la página; todo sobre el proceso del lector.

---

## Log

- **L1.** Pedido del fundador, verbatim: *"procede"* — tras acordar que la cuarta hija sería `/demo/` porque los CTA primarios de tres páginas publicadas apuntan hoy al formulario del home. Implementación fuera de esta sesión (Antigravity) y revisión posterior con defectos inyectados, como las dos anteriores.
- **L2.** Mapeo de la guía SEO de 7 pasos: **1 avatar** → brief §9 (quien ya decidió mirar y quiere saber qué le espera) = S2, S7; **2 keywords** → S3, con la honestidad de un set delgado por diseño; **3 arquitectura** → S1, S13 (destino de los CTA de todo el sitio; preventa separada de postventa por la regla 7); **4 encabezados** → S6; **5 contenido** → S7, S8; **6 FAQ para LLMs** → S9; **7 prototipo + schema** → S15, S16, S10 (el formulario es el prototipo) + paridad de S9.
- **L3.** **El formulario se verificó en el código, no en el brief.** `assets/site.js` no tiene backend: valida en el navegador (nombre, negocio, teléfono ≥8 dígitos, correo opcional) y abre `wa.me` con un mensaje compuesto. De ahí salen tres consecuencias que el brief no dice: el canal es **uno solo** (S11), el mensaje lo envía el usuario (S11), y extender el handler toca **código compartido con el home** → verificación diferencial obligatoria (S10).
- **L4.** Corrección declarada en S4: el brief dice "por el canal que elegiste" y hay un solo canal. La frase dice WhatsApp; si mañana hay dos, se amplía en la página y en el brief a la vez.
- **L5.** **Defecto medido del brief (§9.8):** el title mide **62** caracteres contra un límite declarado de 60. Se fijan tres variantes medidas (49 / 54 / 50) y la regla: elegir una, declararla y corregir el brief. Recomendación del padre: la de 54.
- **L6.** Esta página **no lleva capturas**: el brief define la prueba como el propio flujo. Es la primera del sitio que puede quedarse sin material gráfico, y se declara para que nadie rellene el hueco con una pantalla que no prueba nada.
- **L7.** El dato "cuántas cajas operas" del brief **es** el `terminalCount` que el formulario del home ya recoge: se reutiliza. Crear un campo paralelo rompería el contrato de datos y duplicaría la pregunta en el mensaje de WhatsApp.
- **L8.** La verificación del documento antes de entregarlo cazó dos omisiones: los **bullets aprobados del home v1.5** no estaban citados verbatim. Se agregaron como S6b en vez de renumerar, por la misma razón que en el ODD de inventario: que un número ya citado no apunte a otra regla.
- **L9.** Corrección del fundador (2026-11-20), verbatim: *"veo que estamos encasillando en restaurantes de nuevo en este contenido para la demo"*. Medido antes de decidir: con el brief, `/demo/` habría sido **la única de las seis páginas con un segmento en el H1** (home, hub, precios, fiscal e inventario son neutras; el home nombra los segmentos dentro del texto, dieciséis veces, siempre en conjunto). Decisión: **H1 y title neutros**, y la query `demo de sistema POS para restaurante` se conserva en un **H2 de segmentos** que además nombra cafetería, food park y mostrador — conserva la frase exacta para búsqueda y muestra la amplitud en la misma línea. El H3 del brief pasa a colgar de ese H2 sin cambiar su texto. Dos guardias nuevas, de clase y no de instancia: ningún segmento puede entrar al H1 ni al title, y la query debe existir en un H2.
