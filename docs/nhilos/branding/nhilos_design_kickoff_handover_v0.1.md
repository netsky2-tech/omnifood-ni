# NHILOS — Paquete de Inicio para Diseño

**Documento:** `nhilos_design_kickoff_handover_v0.1.md`
**Versión:** 0.1
**Estado:** `FOR DESIGN — KICKOFF PACK`
**Autoridad de origen:** `nhilos_brand_experience_principles_v1.0.md` · `nhilos_brand_identity_brief_v0.1.md`
**Gobernanza:** `nhilos_branding_document_governance_v1.0.md`
**Fecha:** 2026-10-08

---

## 1. Qué se encarga, y en qué orden

El trabajo tiene **tres frentes**. Importa el orden porque dos de ellos no dependen del tercero:

| # | Frente | Depende de | Puede empezar |
|---|---|---|---|
| `F1` | **Prototipo de estructura y contenido del sitio comercial** — arquitectura, jerarquía, flujos, copy aplicado, responsive, accesibilidad | Nada. La IA, el copy y las restricciones ya existen | **Ya** |
| `F2` | **Identidad de marca** — logo, paleta, tipografía, iconografía, dirección de imagen, guía | El brief de identidad | **Ya** |
| `F3` | **Piel visual del sitio** — aplicación de la identidad a las pantallas de F1 | F1 + F2 | Cuando F2 cierre |

**La clave operativa:** `F1` y `F2` corren **en paralelo**. La estructura y el copy no necesitan la
identidad. Lo que no se puede es dar por terminado `F1` como pieza visual antes de que `F2` exista,
porque la piel llegaría tarde y obligaría a rehacer.

**Advertencia de secuencia:** si se arranca `F1` fijando colores, tipografías o el logo actual en
las pantallas, ese trabajo se tira. En `F1` se prototipa con estructura neutra: grises, tipografía
de sistema, jerarquía y espacios. Sin excepción.

---

## 2. Lectura obligatoria, en este orden

### Frente `F1` — estructura y contenido del sitio

| # | Documento | Qué aporta |
|---|---|---|
| 1 | `docs/nhilos/branding/nhilos_branding_document_governance_v1.0.md` | Qué documento gobierna qué. Empezar acá evita contradicciones más adelante |
| 2 | `docs/nhilos/nhilos_brand_experience_principles_v1.0.md` | Tono, personalidad, no-negociables, vocabulario prohibido, [Dirección visual de NHILOS POS](../nhilos_brand_experience_principles_v1.0.md#23-dirección-visual-de-nhilos-pos) dirección visual, [Fotografía de NHILOS POS](../nhilos_brand_experience_principles_v1.0.md#24-fotografía-de-nhilos-pos) fotografía |
| 3 | `docs/nhilos/branding/nhilos_website_product_marketing_brief_v1.0.md` | Posicionamiento, mensajes por capacidad, delimitaciones y lista de bloqueo |
| 4 | `docs/nhilos/branding/nhilos_website_information_architecture_content_wireframe_v1.0.md` | **La pieza central de `F1`**: sitemap, navegación, reglas `N-01`..`N-04`, modelo de contenido y el wireframe de homepage bloque por bloque (`H00`–`H13`) |
| 5 | `docs/nhilos/branding/nhilos_website_homepage_content_v1.1.md` | El copy real de la homepage, sección por sección, con sus restricciones |
| 6 | `docs/nhilos/branding/nhilos_pos_product_page_content_v1.1.md` | El copy de la página profunda de producto, 14 secciones |
| 7 | `docs/nhilos/branding/Recursos/nhilos_website_non_functional_spec_v1.0.md` | **Restricciones de diseño, no de ingeniería**: WCAG 2.1 AA, Core Web Vitals, peso de página, targets táctiles, contraste, movimiento reducido, consentimiento, 404 útil, formulario de demo |

### Frente `F2` — identidad de marca

| # | Documento | Qué aporta |
|---|---|---|
| 8 | `docs/nhilos/branding/nhilos_brand_identity_brief_v0.1.md` | **El encargo**: objetivo, núcleo de marca, restricciones `R-01`..`R-11`, direcciones a explorar, entregables y criterios de aceptación |
| 9 | `docs/nhilos/branding/nhilos_branding_document_governance_v1.0.md` [Cadena de autoridad (lineal, sin ciclos)](nhilos_branding_document_governance_v1.0.md#3-cadena-de-autoridad-lineal-sin-ciclos) y [Estado de anclaje y obligación de re-anclaje](nhilos_branding_document_governance_v1.0.md#7-estado-de-anclaje-y-obligación-de-re-anclaje) | Dónde entra la identidad en la cadena de autoridad |

### Referencia de producto — para que el sitio hable de algo que existe

| # | Documento | Qué aporta |
|---|---|---|
| 10 | `docs/nhilos/branding/Recursos/product_claim_audit_od02_v1.3.md` | Los 43 claims verificados con sus límites. **Es la única fuente de lo que se puede afirmar** |
| 11 | `docs/nhilos/branding/nhilos_pos_media_inventory_v1.0.md` | Inventario de activos visuales del producto, con el estado real de cada uno |
| 12 | `docs/nhilos/manuals/images/` | 33 capturas del producto real |
| 13 | `docs/nhilos/branding/Recursos/nhilos_pos_experience_standard_v1.0.md` | Lenguaje de diseño de la superficie principal del producto, con tokens reales |
| 14 | `apps/pos_app/lib/ui/design_system/nhilos_tokens.dart` | Los tokens implementados: color, radios, tipografía |

---

## 3. Alcance de `F1`

**Qué se prototipa.** El sitio comercial público. La IA define la **jerarquía lógica** de la
información y deja la **decisión técnica de URL abierta** (su [Corporate Purpose — APPROVED](../nhilos_brand_experience_principles_v1.0.md#21-corporate-purpose--approved) lo declara). La estructura de
abajo es lo que se prototipa; el nombre final de cada URL se decide antes de producción y **no
bloquea el prototipo**.

```text
/                    Home
/pos                 Página profunda de producto
/implementacion      Implementación
/soporte             Soporte
/recursos            Recursos → Guías, FAQ
/nosotros            Nosotros
/solicitar-demo      Conversión
/legal/privacidad    Privacidad y Términos
```

**Bloques de la homepage que hay que resolver visualmente:** `H00` a `H13` según el wireframe
(header, hero, la idea operativa, producto en movimiento, roles, continuidad, control del negocio,
implementación, evidencia, soporte, FAQ, CTA final, footer).

**Fidelidad:** prototipo navegable, con estados de foco/hover/error, y con las pantallas en los
breakpoints que la especificación no funcional exige verificar. No hace falta contenido final en
todas las rutas; sí hace falta que la estructura y la jerarquía queden resueltas.

**Idioma:** español de Nicaragua (`es-NI`). El copy ya está escrito; no se reescribe, se aplica.

**Fuera de alcance de `F1`:** UI de producto (POS, dashboard), identidad de marca, pricing y
condiciones comerciales, y la operación de la demo.

---

## 4. Reglas que no se negocian

1. **Todo claim publicado cita un claim verificado del OD-02.** Si una pantalla afirma una
   capacidad, tiene que existir la fila correspondiente. Las secciones del contrato de contenido ya
   listan lo que no se puede afirmar.
2. **Vocabulario prohibido** ([Cómo no hablamos](../nhilos_brand_experience_principles_v1.0.md#142-cómo-no-hablamos) de la constitución): *revolucionario, disruptivo, next
   generation, solución 360, lleva tu negocio al siguiente nivel, plataforma definitiva, el mejor,
   experiencia premium*, y cualquier autodescripción como premium o lujo.
3. **Accesibilidad y rendimiento son criterios de aceptación**, no mejoras posteriores: WCAG 2.1 AA,
   LCP < 2.5 s, INP < 200 ms, CLS < 0.1, carga inicial < 2.5 MB, targets de 44×44 px, contraste
   4.5:1 / 3:1, movimiento reducido respetado.
4. **Sin relleno.** Nada existe solo para llenar espacio ([Sobriedad](../nhilos_brand_experience_principles_v1.0.md#53-sobriedad)). Sin urgencia falsa, sin cifras sin
   fuente, sin métricas inventadas.
5. **Las capturas del producto no son referencia visual final.** La mayoría es anterior a la
   remediación UX vigente. Sirven para entender superficies, no para calcar.
6. **El sitio no habla de NHILOS.** Habla de la operación del cliente.

---

## 5. Decisiones ya tomadas (no reabrir)

| Decisión | Valor |
|---|---|
| CTA único de conversión | **"Solicitar una demo"**, en header, footer, versión móvil y CTA final. La regla `N-04` que lo fija está en estado `DERIVED / PROPOSED` con validación comercial pendiente: es decisión de trabajo, no cierre definitivo |
| Rutas de capacidad de primer nivel | **Prohibidas.** Inventario, fiscal, hardware y dashboard se argumentan dentro de la página de producto, no como rutas propias (`N-03`) |
| Portafolio futuro | **Prohibido** mostrar `Conta`, `ERP` o "coming soon" (`N-02`) |
| Relación homepage ↔ página de producto | La homepage introduce; la página de producto resuelve. No pueden repetirse el hero ni convertirse en listas de módulos |
| Navegación | Los mismos ítems de primer nivel en desktop y en móvil |
| Arquitectura de marca | Una marca con productos. Sin sub-marcas, sin nombres por módulo |
| Dirección visual | 70% sobriedad / 20% producto / 10% gesto memorable · *"cuidado, no caro"* |
| Fotografía | Negocio real, personas reales, producto real, hardware real, contexto operativo |

---

## 6. Decisiones abiertas que necesitan al cliente

1. **URL definitiva de conversión.** La ruta de demo quedó pendiente de decisión en la IA.
2. **¿Fotografía propia desde ahora?** [Fotografía de NHILOS POS](../nhilos_brand_experience_principles_v1.0.md#24-fotografía-de-nhilos-pos) pide negocio real. Producirla toma tiempo y presupuesto;
   definir si `F1` la espera o avanza sin ella.
3. **Receptor de las solicitudes de demo.** No existe asignación (decisión `OD-PP-10` abierta en el
   contrato de producto).
4. **Estados vacíos y de error reales del sitio:** qué se muestra en 404, en fallo de envío del
   formulario y en contenido no disponible.
5. **Prioridad de soportes:** si la identidad se piensa primero para web, para producto o para venta
   presencial.

---

## 7. Qué NO hacer

- No fijar color, tipografía ni el logo actual en las pantallas de `F1` (se tira cuando llegue `F2`).
- No afirmar capacidades que no estén en el registro de claims del OD-02.
- No inventar métricas, cifras, testimonios ni clientes.
- No crear rutas de capacidad ni mostrar productos futuros.
- No diseñar iconografía, paleta ni marca: eso es `F2`, con su propio brief.
- No reescribir el copy aprobado. Si algo no funciona visualmente, se reporta; no se cambia en
  silencio.

---

## 8. Cómo se evalúa la entrega

Una entrega se acepta cuando:

1. Se puede recorrer el sitio y entender qué vende NHILOS y a quién, **sin explicación oral**.
2. Cada afirmación visible tiene respaldo en el registro de claims.
3. Los criterios de accesibilidad y rendimiento de [Luxurización aplicada a NHILOS](../nhilos_brand_experience_principles_v1.0.md#4-luxurización-aplicada-a-nhilos) se cumplen y están medidos, no declarados.
4. La estructura sobrevive si mañana cambia la identidad: el layout no depende de un color
   específico.
5. Los estados (`hover`, `focus`, `error`, `vacío`, `cargando`) están resueltos, no solo el camino
   feliz.
6. El sitio no promete nada que el producto no haga hoy.
