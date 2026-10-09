# NHILOS — Homepage Content v1.1

**Documento:** `nhilos_website_homepage_content_v1.1.md`  
**Status:** `APPROVED / AUTHORITATIVE CONTENT CONTRACT — PUBLICATION GATED`  
**Scope:** Homepage pública de NHILOS (`/`)  
**Masterbrand:** NHILOS  
**Product:** NHILOS POS  
**Version:** 1.1  
**Date:** 2026-10-08  
**Authority:** Contrato de contenido aprobado para la homepage. La versión se numera 1.1 para coincidir con la referencia de dependencia declarada en `nhilos_pos_product_page_content_v1.1.md`.  
**Upstream chain (per `nhilos_branding_document_governance_v1.0.md`, §3):** `nhilos_brand_experience_principles_v1.0.md` (v1.0) → `product_claim_audit_od02_v1.3.md` (v1.3) → `nhilos_website_product_marketing_brief_v1.0.md` (v1.0) → `nhilos_website_information_architecture_content_wireframe_v1.0.md` (v1.0)  
**Downstream:** `nhilos_pos_product_page_content_v1.1.md` — contrato de contenido de la página profunda de producto; este documento es su referencia de contraste en el Gate E.  
**Referencia técnica transversal:** `Recursos/nhilos_website_non_functional_spec_v1.0.md` (v1.0) — gates heredados, no redefinidos aquí.  
**NHILOS +1:** Este documento honra el principio `NHILOS +1` (`nhilos_brand_experience_principles_v1.0.md` §11): el hero entrega un siguiente paso real (Ver cómo funciona), la FAQ reduce fricción de evaluación y el CTA final conduce a una demo preparada según el contexto que el prospecto comparta.  
**GATE DE PUBLICACIÓN:** la publicación de la homepage está bloqueada hasta completar los gates A–E de §18 y el contraste cruzado (Gate E) contra `nhilos_pos_product_page_content_v1.1.md`.

---

## 0. Purpose

Este documento convierte el wireframe de homepage de la IA (`nhilos_website_information_architecture_content_wireframe_v1.0.md` §5, bloques `H01`–`H13`) en un contrato de contenido operativo. Define el copy propuesto por bloque, la jerarquía de mensajes, los CTAs, los claim IDs, las restricciones de publicación y los requisitos de media y rendimiento.

La homepage es la capa superficial y temprana del sitio: establece NHILOS, hace entendible NHILOS POS, demuestra valor con producto real, reduce incertidumbre y dirige hacia una demo. No profundiza: eso pertenece a la página de producto.

> **Regla principal:** el comportamiento real y vigente del producto tiene precedencia sobre cualquier claim de marketing.

Este documento no autoriza por sí mismo la publicación de claims funcionales, comerciales, contractuales o de compatibilidad. No define: identidad visual final, design system, rutas técnicas, pricing, SLA ni operación de demo.

## 1. Authority & Decision Model

### 1.1 Authority basis

1. `nhilos_brand_experience_principles_v1.0.md` (v1.0) — constitución de marca; personalidad verbal (§14), sobriedad (§5.3) y `NHILOS +1` (§11).
2. `product_claim_audit_od02_v1.3.md` (v1.3) — autoridad de claims; allowlist D4 y blocklist D5.
3. `nhilos_website_product_marketing_brief_v1.0.md` (v1.0) — fuente del messaging por capacidad, incluido el messaging de homepage (§5.1).
4. `nhilos_website_information_architecture_content_wireframe_v1.0.md` (v1.0) — estructura de bloques H00–H13 y sus reglas.

Cuando exista conflicto, prevalece el upstream correspondiente según la cadena de `nhilos_branding_document_governance_v1.0.md`. Este documento nunca contradice a su upstream: lo implementa y, como máximo, lo acota.

### 1.2 Decision classes

| Status | Meaning | Publication authority |
| :---- | :---- | :---- |
| `INHERITED` | Derivado directamente de una autoridad upstream vigente. | Publicable dentro de su scope, sujeto a verificación de versión. |
| `DERIVED` | Traducción narrativa que no introduce comportamiento nuevo. | Publicable si no amplía el claim fuente. |
| `PROPOSED` | Copy, CTA o formulación creativa todavía no validada. | No autoriza publicación. |
| `EVIDENCE_REQUIRED` | Requiere evidencia de producto, media, legal o comercial. | Bloqueado hasta completar el gate. |
| `APPROVED_FOR_PUBLICATION` | Validado por el gate correspondiente. | Publicable dentro del alcance aprobado. |

### 1.3 Publication rule

Cada bloque de copy conserva su estado. El diseño visual, un video preparado o una captura de pantalla no convierten un claim `EVIDENCE_REQUIRED` en aprobado. Todo claim técnico citado en este documento referencia su ID del OD-02 (§17).

---

## 2. Homepage Job & Division of Labour

### 2.1 Page job (`H00`, inherited)

La homepage debe:

1. establecer NHILOS;
2. hacer entendible NHILOS POS;
3. demostrar valor;
4. reducir incertidumbre;
5. dirigir hacia una conversación/demo;
6. hacerlo mediante producto y evidencia, no mediante ruido.

### 2.2 Regla de división de labores con la página de producto

> **La homepage introduce la propuesta; la página de producto resuelve preguntas.**

Esta regla es vinculante en ambas direcciones:

- La homepage presenta cada capacidad como argumento breve con producto real; no desarrolla matrices de escenarios, límites técnicos detallados ni comparativas. Cada argumento de la homepage deja un siguiente paso claro hacia el contenido profundo.
- La página de producto (`nhilos_pos_product_page_content_v1.1.md`) resuelve las dudas que la homepage abre; no repite el hero de la homepage con más palabras ni se convierte en una lista indiscriminada de módulos.
- Ninguna capacidad se presenta con mayor profundidad en la homepage que en la página de producto. Si este documento y la página profunda entran en conflicto, se escala; no se resuelve editando unilateralmente (G-02).

**Gate E (§18.6)** verifica el cumplimiento de esta regla por contraste directo entre ambos contratos.

---

# 3. Section H01 — Header

## Purpose

Identificar la marca maestra y ofrecer una navegación contenida con un único CTA de conversión. Sin megamenús ni navegación basada en features.

## Proposed copy

**Wordmark**

> NHILOS

**Primary navigation (per wireframe, `APPROVED_WEBSITE`)**

> Producto · Cómo funciona · Implementación · Recursos · Nosotros

**Primary CTA**

> Solicitar una demo

**Status:** `INHERITED (estructura) / PROPOSED (labels definitivos)`

## Situation → Behavior → Effect

- **Situación:** el visitante llega sin saber qué ofrece NHILOS ni por dónde empezar.
- **Comportamiento:** encuentra una navegación corta orientada a evaluación (producto, cómo funciona, implementación) y un único CTA de conversión visible.
- **Efecto:** el visitante puede orientarse sin fricción y el camino hacia la demo queda a un paso en todo momento, sin competir con banners ni CTAs múltiples.

## Claim IDs

| ID | Claim | Class | OD-02 source | Gate |
| :---- | :---- | :---- | :---- | :---- |
| HM-01 | La navegación primaria organiza el sitio por destinaciones de producto, no por features. | Editorial | N/A | MARKETING |
| HM-02 | Existe un único CTA primario de conversión: `Solicitar una demo`. | Editorial | N/A | MARKETING |

## Restrictions

- Sin mega-menú; sin banners promocionales; sin CTAs principales múltiples.
- Ninguna capacidad se convierte en item de navegación de primer nivel (regla `N-03` del wireframe).
- No usar `NHILOS POS by NHILOS` (regla `N-01`).

---

# 4. Section H02 — Hero

## Purpose

Responder rápidamente qué es, para quién y por qué importa. El hero no se convierte en una lista de beneficios: una promesa, un contexto y un producto real.

## Proposed copy

**EYEBROW**

> NHILOS POS

**HEADLINE**

> **El punto de venta que sigue operando cuando se cae el internet. Diseñado para Nicaragua.**

**SUPPORTING COPY**

> Cobrá y facturá en tu caja aunque falle la conexión, con numeración correlativa conforme a la DT 09-2007. Cuando vuelve el internet, tus ventas e inventarios sincronizan con la nube.

**CREDENTIALS LINE**

> Hecho para el comercio local: bimoneda (NIO/USD), conciliación de vouchers BAC y Banpro, y monitoreo de ventas desde cualquier dispositivo con internet.

**PRIMARY CTA**

> Solicitar una demo

**SECONDARY CTA**

> Ver cómo funciona

**PRODUCT PROOF**

> [UI real del flujo de venta en terminal vigente — Gate D]

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el dueño de un comercio de alta rotación perdió ventas por una caída de internet y desconfía de los sistemas que dependen de la nube.
- **Comportamiento:** el hero presenta un punto de venta que opera en el terminal local, cumple la normativa de Sistemas Computarizados de Facturación (DT 09-2007) y sincroniza al recuperar conexión; la prueba visual muestra la interfaz real del producto.
- **Efecto:** el visitante entiende en segundos qué es NHILOS POS, para qué mercado está hecho y por qué le importa, y tiene dos caminos claros: profundizar o solicitar una demo.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-03 | NHILOS POS sigue operando en caja cuando se cae el internet (terminal enrolado e hidratado). | PC-OFF-01, PC-OFF-02 | Product |
| HM-04 | Se puede cobrar y facturar offline; al volver la conexión, ventas e inventarios sincronizan con la nube. | PC-OFF-01, PC-OFF-02, PC-OFF-03 | Product / Engineering |
| HM-05 | La facturación respeta la numeración correlativa de la DT 09-2007 (Sistemas Computarizados de Facturación), con prefijo y folio autorizados por la DGI. | PC-FISC-01, PC-FISC-02 | Product / Compliance |
| HM-06 | Cobro bimoneda nativo (NIO/USD) y conciliación de vouchers de tarjeta BAC y Banpro al cierre de turno. | PC-PAY-04, PC-PAY-01, PC-PAY-02 | Product / Payments |
| HM-07 | El dueño monitorea sus ventas desde cualquier dispositivo con internet. | PC-DASH-01, PC-DASH-02 | Product |

## Restrictions

- No publicar sin evidencia adicional: “control total de tu negocio”, “nunca pierdas una venta”, “vende sin límites” o cualquier afirmación absoluta de continuidad (blocklist D5, H06 Avoid).
- No presentar el cumplimiento fiscal como garantía absoluta: la delimitación de OD-02-R02 (parametrización previa del folio autorizado) se comunica en la página de producto, no se elimina aquí.
- No afirmar integración electrónica automática con datáfonos: la conciliación es manual y desacoplada (LIM-02); el detalle pertenece a la página de producto.
- No usar “en tiempo real” sin el contrato de frescura del dashboard (PC-DASH-02); aquí se dice “monitoreo… desde cualquier dispositivo con internet”.
- La frase de credenciales no promete soporte operativo: los canales y coberturas de soporte permanecen gated (§12, H10).
- Product proof: solo media del build vigente con provenance registrada (Gate D); sin mockups ni prototipos.

---

# 5. Section H03 — The operating idea (La idea operativa)

## Purpose

Explicar que NHILOS POS conecta la operación completa — venta, operación, control, visibilidad — y no solamente el momento del cobro. Este bloque introduce la arquitectura que la página de producto detalla.

## Proposed copy

**SECTION EYEBROW**

> La operación completa

**HEADLINE**

> **La venta es el inicio. La operación es lo que sigue.**

**BODY**

> NHILOS POS guarda la operación en una base de datos local en cada terminal, sincroniza con la nube cuando hay conexión y consolida la información en un panel web para el dueño. Los datos de cada negocio en la nube permanecen aislados por inquilino.

**VISUAL**

> [Flujo real del producto: VENTA → OPERACIÓN → CONTROL → VISIBILIDAD]

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el visitante asume que “punto de venta” significa solo cobrar, y no ve por qué debería cambiar de sistema.
- **Comportamiento:** el bloque explica la idea operativa: base local como fuente de verdad en caja, sincronización hacia la nube con aislamiento por inquilino, y consolidación en el panel del dueño; el visual muestra el flujo con producto real.
- **Efecto:** el visitante entiende la propuesta de valor diferenciada (operación conectada, no solo cobro) y qué parte del sistema vive en cada superficie.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-08 | La base de datos local (SQLite) es la fuente de verdad en caja. | PC-OFF-02 | Product |
| HM-09 | La nube consolida la información con aislamiento estricto por inquilino (PostgreSQL RLS). | PC-SEC-01 | Engineering |
| HM-10 | La sincronización es bidireccional, asíncrona y por deltas, con detección de red. | PC-OFF-03 | Engineering |

## Restrictions

- El diagrama VENTA → OPERACIÓN → CONTROL → VISIBILIDAD es conceptual (`INHERITED` del wireframe); el visual debe usar producto real cuando exista (H09 proof hierarchy).
- No traducir la idea operativa en una lista de módulos: eso es lo que la división de labores (§2.2) prohíbe.
- No afirmar sincronización multi-terminal sin internet (PC-OFF-05 es futureware, blocklist D5).

---

# 6. Section H04 — Product in Motion

## Purpose

Demostrar el producto mediante tres trabajos reales — vender, controlar, supervisar — cada uno con media vigente, contexto y resultado. No tres cards genéricas de features.

## Proposed copy

**HEADLINE**

> **El producto trabajando, no descrito.**

### Workflow 01 — Vender

> Seleccionar → configurar → confirmar → cobrar.
> [Captura o video del flujo de venta vigente]
> **Contexto:** el cajero construye la cuenta y aplica las opciones configuradas del producto.

### Workflow 02 — Controlar

> Venta → inventario → movimiento → contexto.
> [Captura del descuento de insumos por receta o del Kardex]
> **Contexto:** la venta descuenta los insumos de la receta publicada y el movimiento queda registrado.

### Workflow 03 — Supervisar

> Operación → datos → dashboard → decisión.
> [Captura del panel web del dueño]
> **Contexto:** el dueño revisa la venta neta del periodo, las horas pico y el ranking de productos.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el visitante quiere ver el producto funcionando antes de entregar tiempo a una demo.
- **Comportamiento:** cada workflow muestra una secuencia real de acción y decisión sobre media del build vigente, con una línea de contexto y resultado.
- **Efecto:** el visitante reconoce tareas propias en el producto y reduce la incertidumbre sobre qué es NHILOS POS en la práctica.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-11 | El flujo de venta incluye selección, modificadores configurados y cobro. | PC-OFF-01, PC-FOH-02 | Product |
| HM-12 | La venta descuenta insumos por receta (BOM) y registra movimientos en un Kardex inmutable, con tolerancia a stock negativo en offline. | PC-INV-01, PC-INV-02, PC-INV-04 | Product |
| HM-13 | El dashboard muestra KPIs de venta neta, horas pico y ranking de productos, con indicador de frescura de sincronización. | PC-DASH-01, PC-DASH-02, PC-DASH-03 | Product |

## Restrictions

- Cada workflow demuestra una acción o decisión real (regla del wireframe H04); prohibida la fila de tres cards genéricas.
- HM-12 hereda la limitación de LIM-05: la deducción aplica solo a productos `COMPOUND` con receta publicada; la delimitación completa se desarrolla en la página de producto.
- Cada pieza de media exige registro de provenance (asset, build, fecha de captura, aprobación) según Gate D.
- No mostrar estados, cifras o botones que no existan en el build vigente.

---

# 7. Section H05 — Roles / Jobs

## Purpose

Permitir que distintos visitantes reconozcan su contexto operativo desde trabajos reales, sin taxonomía artificial de personas.

## Proposed copy

**HEADLINE**

> **Tres maneras de usar el mismo sistema.**

### Quien cobra

> Rapidez y claridad en cada venta, incluso en la fila de la hora pico.  
> [Ver operación]

### Quien gestiona

> Control y contexto: recetas, inventario y anulaciones supervisadas.  
> [Ver capacidades]

### Quien dirige

> Visibilidad para decidir: la operación consolidada en un panel web.  
> [Ver producto]

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** en un mismo negocio conviven quien cobra, quien supervisa inventario y anulaciones, y quien dirige sin estar presente.
- **Comportamiento:** cada columna conecta un trabajo real con la parte del sistema que lo atiende y un enlace hacia el contenido profundo correspondiente.
- **Efecto:** cada visitante encuentra su entrada al producto sin leer todo el sitio, y los destinos de navegación apuntan a contenido real.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-14 | Quien cobra registra ventas y cobros —incluido el cobro bimoneda— en el terminal. | PC-OFF-01, PC-PAY-04 | Product |
| HM-15 | Quien gestiona cuenta con permisos diferenciados, supervisión de anulaciones e información de inventario. | PC-SEC-02, PC-INV-02 | Product / Security |
| HM-16 | Quien dirige consulta la venta neta y el ranking de productos desde el panel web. | PC-DASH-01, PC-DASH-03 | Product |

## Restrictions

- No convertir la sección en una matriz de permisos: la matriz RBAC pertenece a la página de producto.
- Los destinos `[Ver operación]`, `[Ver capacidades]`, `[Ver producto]` deben apuntar a contenido que exista; si un destino no existe todavía, el bloque no se publica (AP-10 del wireframe).
- No atribuir a un rol acceso a capacidades pendientes de implementación.

---

# 8. Section H06 — Continuidad operativa

## Purpose

Demostrar la filosofía de fiabilidad de NHILOS POS con un escenario concreto y sus condiciones. Este es el argumento central de la marca; se comunica con límites declarados, no con promesas absolutas.

## Proposed copy

**EYEBROW**

> Continuidad operativa

**HEADLINE**

> **El internet se cae. La caja no.**

**BODY**

> En un terminal enrolado y con su catálogo local hidratado, la venta, el cobro, el ticket y la deducción de recetas operan sobre la base de datos local. El cambio de cajero funciona por PIN, sin depender de la conexión. Cuando la conectividad se restaura, la información pendiente sincroniza con la nube, y el operador ve en pantalla el estado de conexión y los documentos pendientes.

**FLOW (wireframe `INHERITED`)**

```text
INTERNET DISPONIBLE
        ↓
   OPERACIÓN NORMAL
        ↓
INTERRUPCIÓN DE CONECTIVIDAD
        ↓
   OPERACIÓN LOCAL*
        ↓
CONECTIVIDAD RESTAURADA
        ↓
     SINCRONIZACIÓN*
```

`*` Los pasos dependen del terminal enrolado, del catálogo hidratado y de las condiciones operativas vigentes.

**SECONDARY CTA**

> Conocer los escenarios de continuidad → página de producto

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** la conexión a internet del local se interrumpe durante el servicio.
- **Comportamiento:** sobre un terminal previamente enrolado con catálogo local, la operación de caja continúa sobre SQLite; el personal accede por PIN cifrado sin conexión; el operador ve el estado de sincronización en pantalla; al recuperar conexión, los pendientes sincronizan.
- **Efecto:** el servicio de caja continúa durante la interrupción y la información llega a la nube después, dentro de los límites declarados — el enrolamiento inicial, la primera descarga de catálogo y los cambios de usuarios requieren internet.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-17 | La operación de caja (venta, cobro, ticket, receta) continúa offline en un terminal enrolado e hidratado. | PC-OFF-01, PC-OFF-02 | Product / Engineering |
| HM-18 | El personal accede y cambia de cajero por PIN cifrado sin internet, tras haber iniciado sesión en línea al menos una vez. | PC-OFF-04 | Product / Engineering |
| HM-19 | La información pendiente sincroniza con la nube al restaurarse la conectividad. | PC-OFF-03 | Engineering |
| HM-20 | El operador ve el estado de conectividad y el conteo de documentos pendientes de sincronizar. | PC-FOH-03 | Product |

## Restrictions

- Límites declarados (G-06): `works_when` terminal enrolado con catálogo local hidratado en SQLite; `does_not_work_when` enrolamiento inicial, primera descarga de catálogo/precios, cambios de usuarios y consolidación al dashboard central (LIM-01). El copy del bloque debe conservar la frase condicional del terminal enrolado e hidratado.
- Prohibido: cualquier claim absoluto de continuidad (“funciona sin internet en cualquier situación”, promesas de cero pérdida de datos, sincronización garantizada) — H06 Avoid del wireframe y blocklist D5.
- No confundir operación local con operación multi-dispositivo: la red multi-terminal sin internet es futureware (PC-OFF-05) y no se menciona.
- La matriz completa de escenarios y topologías se desarrolla en la página de producto; este bloque introduce y enlaza.

---

# 9. Section H07 — Control del negocio

## Purpose

Mostrar la transición de la operación a los datos: qué información consolidada existe, con qué frescura, y para qué decisión sirve. Superficies del dueño (web), no del cajero.

## Proposed copy

**EYEBROW**

> Control del negocio

**HEADLINE**

> **De la operación a la decisión, sin estar metido en la cocina.**

**BODY**

> El panel web del dueño consolida la venta neta, las horas pico y el ranking de productos, con un indicador visual de frescura que muestra si los terminales están al día. Los reportes de ventas y notas de crédito se exportan para el contador, con filtros por rango de fechas, turno y estado fiscal.

**VISUAL**

> [Dashboard real del build vigente, con el badge de frescura visible]

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el dueño de un food park con varios puntos necesita saber cómo va la operación sin recorrer cada caja.
- **Comportamiento:** abre el panel web, revisa los KPIs del periodo, verifica la frescura de sincronización de cada terminal y exporta el reporte fiscal para su contador.
- **Efecto:** el dueño dispone de contexto para decidir sobre datos consolidados, sabiendo qué tan actualizados están.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-21 | El dashboard web ejecutivo muestra venta neta, horas pico y ranking de productos con participación calculada. | PC-DASH-01, PC-DASH-03 | Product |
| HM-22 | El monitor de frescura indica si los datos mostrados están al día o si hay terminales con sync retrasado. | PC-DASH-02 | Product |
| HM-23 | Los reportes de ventas, notas de crédito y cumplimiento DGI se exportan con filtros por fecha, turno y estado fiscal. | PC-DASH-04 | Product |

## Restrictions

- El dashboard requiere acceso web a internet para consultar el API cloud (limitación de PC-DASH-01); el copy no sugiere lo contrario.
- No prometer “rentabilidad neta” ni indicadores de costo sin metodología aprobada (restricción CV del contrato de producto).
- No publicar capturas del dashboard sin provenance del build vigente (Gate D) y datos autorizados o de prueba controlada.
- Los términos de los KPIs usan la semántica aprobada del contrato de producto (CV-005); sin sinónimos inventados.

---

# 10. Section H08 — Implementation

## Purpose

Reducir la ansiedad de adoptar software: mostrar que existe un proceso preparado, con verificación antes de operar. Sin tiempos, SLA ni alcance inventados.

## Proposed copy

**EYEBROW**

> Implementación

**HEADLINE**

> **Llegás a operar con el sistema probado, no improvisado.**

**BODY**

> El arranque parte de plantillas de catálogo por industria —cafetería, food park, restaurante, retail— y un proceso de implementación que prepara, configura y verifica antes del go-live. Un Setup Center valida que el terminal imprimió ticket, generó folio DGI y sincronizó antes de operar en producción.

**FLOW**

```text
01 Entender la operación → 02 Preparar catálogo → 03 Configurar
→ 04 Probar → 05 Capacitar → 06 Verificar → 07 Go-live
```

**CTA**

> Conocer implementación

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el dueño teme que cambiar de sistema detenga su negocio durante la transición.
- **Comportamiento:** el bloque muestra que existe un proceso con plantillas por industria y una verificación controlada (venta de activación con ticket, folio DGI y sync) antes de operar.
- **Efecto:** el visitante percibe preparación y un criterio objetivo de go-live, y tiene un enlace hacia el detalle del proceso.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-24 | Existen plantillas de catálogo preconfiguradas por industria y un Setup Center con checklist y prueba de venta controlada de activación. | PC-ONB-01, PC-ONB-03 | Product / Operations |
| HM-25 | Los tiempos, entregables y alcance de implementación se definen por acuerdo comercial. | N/A | MARKETING |

## Restrictions

- No publicar tiempos garantizados (“go-live en X días”), número de sesiones, SLA ni alcance universal de migración (governance del wireframe §8).
- La secuencia 01–07 es representación propuesta; debe alinearse con el playbook operacional vigente antes de publicarse como proceso oficial.
- Los entregables y condiciones comercialmente vinculantes se declaran solo en la página de producto / implementación, con el alcance acordado.

---

# 11. Section H09 — Evidence

## Purpose

Sostener cada afirmación con la jerarquía de prueba del wireframe: producto real primero; casos, testimonios y cifras solo con autorización y evidencia.

## Proposed copy

**STRUCTURE (per proof hierarchy, `INHERITED`)**

1. **Producto real** — media vigente con provenance (Gate D).
2. **Workflow real** — los tres workflows de H04.
3. **Caso de cliente** — `EVIDENCE_REQUIRED`: solo con cliente real, permiso y contexto suficiente.
4. **Testimonio verificable** — `EVIDENCE_REQUIRED`: solo con consentimiento.
5. **Cifra verificable** — `EVIDENCE_REQUIRED`: solo con metodología y periodo documentados.
6. **Trust / compliance evidence** — la trazabilidad de claims de §17 y el cumplimiento DT 09-2007 argumentado en H02/H07.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el visitante evaluador necesita evidencia antes de confiar, y las afirmaciones sin respaldo la destruyen.
- **Comportamiento:** la página demuestra con producto real y workflows reproducibles; los elementos de prueba que dependen de clientes (casos, testimonios, cifras) permanecen bloqueados hasta contar con autorización y evidencia.
- **Efecto:** la confianza se construye por evidencia y consistencia (§5.3 de la constitución), no por adjetivos.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-26 | Toda la media publicada corresponde al producto vigente con provenance registrada. | N/A | MARKETING / Content |
| HM-27 | Los casos de cliente, testimonios y cifras se publican solo con autorización y evidencia. | N/A | MARKETING / Legal |

## Restrictions

- No publicar logos, cifras o testimonios sin autorización/evidencia (regla H09 del wireframe). No se crea una sección vacía de casos para aparentar tracción.
- La sección de Casos / Clientes permanece condicional según la IA; su ausencia no se disimula con contenido genérico.

---

# 12. Section H10 — Support

## Purpose

Mostrar que la experiencia continúa después de la compra, sin promesas inventadas: canales, horarios y compromisos se publican solo cuando existan SLA y canales unificados aprobados.

## Proposed copy

**HEADLINE**

> **Cuando necesitás ayuda, el siguiente paso queda claro.**

**BODY**

> El servicio incluye un proceso de soporte con canales de contacto definidos. Antes de iniciar, te indicamos qué información preparar y cómo dar seguimiento a tu caso.

**LINKS**

> Ayuda · Contacto · FAQ

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el comprador potencial teme quedar solo después de la compra (anti-patrón AP-08 del wireframe).
- **Comportamiento:** la homepage declara que existe un proceso de soporte con canales definidos y enlaza al detalle, sin comprometer horarios ni tiempos no aprobados.
- **Efecto:** la compra deja de terminar en el CTA; la expectativa de atención queda establecida y el detalle vive en la página de soporte.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-28 | Existe un proceso de soporte con canales de contacto definidos para clientes cubiertos. | N/A | MARKETING / Operations |

## Restrictions

- SLA, horarios, cobertura y canales concretos permanecen `EVIDENCE_REQUIRED` (wireframe H10); la página de soporte es su dueña. No publicar “24/7”, “atención inmediata” ni compromisos de resolución no pactados.
- El copy de credenciales del hero (H02) no sustituye este gate: ninguna frase de esta sección promete cobertura.

---

# 13. Section H11 — FAQ

## Purpose

Resolver las preguntas iniciales de evaluación con respuestas breves que enlazan a la profundidad. Cada respuesta funcional cita sus claims y no contradice el copy principal.

## Proposed copy

### ¿Qué es NHILOS POS?

> Un punto de venta offline-first para el comercio de alta rotación: vende, cobra y factura en el terminal local, y consolida la operación en un panel web para el dueño.  
> **Claims:** HM-29 (PC-OFF-01, PC-OFF-02).

### ¿Para qué tipo de operación está pensado?

> Para gastronomía y retail de alta rotación en Nicaragua: cafeterías, food parks, restaurantes y comercios similares. El alcance por tipo de negocio se confirma en la evaluación.  
> **Claims:** posicionamiento del Brief (MARKETING).

### ¿Qué sucede cuando se pierde la conectividad?

> En un terminal enrolado y con catálogo local, la venta, el cobro y el ticket continúan sobre la base de datos local. El enrolamiento inicial y los cambios de catálogo requieren internet.  
> **Claims:** HM-30 (PC-OFF-01, PC-OFF-02).

### ¿Cómo se sincroniza la operación?

> Automáticamente, en segundo plano, cuando la conexión vuelve. La nube es eventualmente consistente; el operador ve el estado y los pendientes en pantalla.  
> **Claims:** HM-31 (PC-OFF-03, PC-FOH-03).

### ¿Qué capacidades de inventario existen?

> Descuento de insumos por receta (BOM) en productos configurados, Kardex inmutable y control de costeo. El detalle completo vive en la página de producto.  
> **Claims:** HM-32 (PC-INV-01, PC-INV-02).

### ¿Cómo funciona la implementación?

> Con plantillas por industria, configuración y una verificación controlada antes del go-live. Los tiempos y el alcance se acuerdan comercialmente.  
> **Claims:** HM-24 (PC-ONB-01, PC-ONB-03).

### ¿Qué soporte está disponible?

> Un proceso de soporte con canales definidos. Los horarios y coberturas se publican cuando estén aprobados; el detalle vive en la página de soporte.  
> **Claims:** HM-28.

### ¿Cómo puedo solicitar una demo?

> Con el botón `Solicitar una demo`: compartís el contexto de tu operación y la demostración se prepara sobre lo que te interesa revisar.  
> **Claims:** HM-33.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el visitante acumula dudas de evaluación que el flujo narrativo no resolvió y no está listo para una demo.
- **Comportamiento:** ocho preguntas iniciales del wireframe reciben respuestas breves, delimitadas y con enlaces al contenido profundo.
- **Efecto:** las objeciones tempranas se resuelven sin fricción y cada respuesta conduce a un siguiente paso.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-29 | NHILOS POS es un punto de venta offline-first que consolida la operación en un panel web. | PC-OFF-01, PC-OFF-02, PC-DASH-01 | Product |
| HM-30 | En terminal enrolado e hidratado, la venta, el cobro y el ticket continúan offline. | PC-OFF-01, PC-OFF-02 | Product / Engineering |
| HM-31 | La sincronización ocurre automáticamente en segundo plano al volver la conexión; la nube es eventualmente consistente. | PC-OFF-03, PC-FOH-03 | Engineering |
| HM-32 | El inventario descuenta insumos por receta (BOM) en productos configurados y registra un Kardex inmutable. | PC-INV-01, PC-INV-02 | Product |
| HM-33 | La demo se solicita desde el CTA y se prepara según el contexto compartido. | N/A | MARKETING / Commercial |

## Restrictions

- Responder primero la pregunta; después la condición. Sin respuestas promocionales que no resuelvan la duda.
- Ninguna respuesta introduces una capacidad que no esté en las secciones anteriores: la FAQ no es la puerta trasera de nuevos claims.
- Las respuestas con claims técnicos se re-verifican cuando cambie el build anclado del OD-02.

---

# 14. Section H12 — Final CTA

## Purpose

Convertir el interés en una conversación contextualizada. La demo es una conversación demostrada, no un recorrido de pantallas.

## Proposed copy

**HEADLINE**

> **Veamos cómo funciona en tu operación.**

**BODY**

> Contanos cómo vendés y cuál es tu principal reto. La demo se prepara sobre tu contexto, con los flujos que realmente te interesan revisar.

**PRIMARY CTA**

> Solicitar una demo

**Status:** `PROPOSED`

## Situation → Behavior → Effect

- **Situación:** el visitante ya entendió la propuesta y necesita un próximo paso de bajo riesgo.
- **Comportamiento:** el CTA invita a compartir contexto mínimo; la demo se prepara según ese contexto (`NHILOS +1`, §11 de la constitución).
- **Efecto:** la conversación comienza con el problema del prospecto, no con el catálogo del vendedor.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-33 (reutilizado) | Ver §13, H11 — la demo se prepara según el contexto compartido. | N/A | MARKETING / Commercial |

## Restrictions

- La operación de la demo (owner, canal, SLA, calendario, datos mínimos) permanece `EVIDENCE_REQUIRED / OPEN` (OD-IA-03 del wireframe). El CTA no promete tiempos de respuesta.
- El formulario, cuando se construya, debe cumplir NF-13 del spec no funcional (errores inline, sin pérdida de datos, bloqueo de doble envío, degradación con correo alternativo) y NF-11 (consentimiento antes de terceros). Su contrato fino pertenece a la página de producto / demo landing.

---

# 15. Section H13 — Footer

## Purpose

Cerrar la página con la arquitectura de footer aprobada por la IA: marca, producto, recursos, empresa, legal y CTA.

## Proposed copy

```text
NHILOS
Conectamos los hilos de tu negocio.

PRODUCTO
NHILOS POS · Cómo funciona · Capacidades · Implementación · Soporte

RECURSOS
Guías · Casos* · FAQ

EMPRESA
Nosotros

LEGAL
Privacidad · Términos

[Solicitar una demo]
```

`*` Casos aparece solo cuando exista contenido publicable suficiente (wireframe §2.3).

**Status:** `INHERITED (estructura) / PROPOSED (labels)`

## Situation → Behavior → Effect

- **Situación:** el visitante llega al final de la página sin haber convertido o buscando algo específico.
- **Comportamiento:** el footer ofrece la arquitectura completa del sitio y el CTA primario una última vez, con el tagline de marca reafirmando el territorio.
- **Efecto:** ningún final de página es un dead end y la estructura del sitio queda visible de un vistazo.

## Claim IDs

| ID | Claim | OD-02 source | Gate |
| :---- | :---- | :---- | :---- |
| HM-34 | El tagline `Conectamos los hilos de tu negocio.` se usa como línea de marca del footer. | N/A | MARKETING (tagline aprobado por Founder) |

## Restrictions

- Sin productos futuros como `coming soon` (AP-02). Sin enlace de `Contacto` independiente hasta que exista una experiencia de contacto definida (wireframe §2.3).
- Legal (Privacidad, Términos) existe como capa de confianza; su copy es `EVIDENCE_REQUIRED` (OD-IA-13).

---

# 16. Media & Performance Rules (gates heredados del spec no funcional)

La homepage es la página de mayor carga media del sitio. Los siguientes umbrales se heredan verbatim de `Recursos/nhilos_website_non_functional_spec_v1.0.md` (v1.0) vía `nhilos_website_information_architecture_content_wireframe_v1.0.md` §18.1; este documento no define valores nuevos.

| Gate | Valor heredado | Aplicación homepage |
| :---- | :---- | :---- |
| LCP (NF-02) | `< 2.5 segundos` (p75) | El hero (imagen o video principal) debe renderizarse inmediatamente. |
| INP (NF-03) | `< 200 milisegundos` | Menú, CTAs y formularios responden sin lag percibido. |
| CLS (NF-04) | `< 0.1` | Ningún bloque del hero o de workflows “salta” al cargar media. |
| Peso inicial (NF-05) | `< 2.5 MB` comprimido | Presupuesto que gobierna cuánta media carga el primer viewport. |
| Imágenes (NF-06) | `WebP`/`AVIF` con fallback JPG/PNG; `srcset` por viewport; `loading="lazy"` fuera del viewport inicial | Aplica a todas las capturas de H04, H07 y H09. |
| Video demo (spec §1.2) | autoplay `muted` sin controles; pausa fuera de viewport (`IntersectionObserver`); `preload="none"`/`metadata` si no está en la primera sección | Aplica a videos de workflow en H02/H04. |
| Movimiento reducido (NF-10) | `prefers-reduced-motion` cancela reveals y transiciones | Aplica a toda la homepage. |

**Regla editorial derivada:** si un bloque no puede sostenerse con media dentro del presupuesto de página, el bloque se simplifica; el presupuesto no se negocia con decoración.

---

# 17. Cross-Section Claim Register

Registro de trazabilidad exigido por `G-04` de `nhilos_branding_document_governance_v1.0.md`. Los IDs `HM-*` son slots de contenido de la homepage; los IDs `PC-*` son capacidades técnicas de `product_claim_audit_od02_v1.3.md`. Todo claim `TÉCNICO / RESPALDADO` cita al menos un `PC-*` vigente; los claims `MARKETING` con `N/A` no afirman capacidad técnica.

| Claim ID | Section | Assertion (resumen) | OD-02 ID(s) | Tipo | Estado |
| :---- | :---- | :---- | :---- | :---- | :---- |
| HM-01 | H01 Header | Navegación por destinaciones de producto, no features. | N/A | MARKETING | MARKETING |
| HM-02 | H01 Header | CTA primario único `Solicitar una demo`. | N/A | MARKETING | MARKETING |
| HM-03 | H02 Hero | Sigue operando en caja cuando se cae el internet. | PC-OFF-01, PC-OFF-02 | TÉCNICO | RESPALDADO |
| HM-04 | H02 Hero | Cobro y facturación offline; sincronización al volver la conexión. | PC-OFF-01, PC-OFF-02, PC-OFF-03 | TÉCNICO | RESPALDADO |
| HM-05 | H02 Hero | Numeración correlativa DT 09-2007 con prefijo/folio autorizados. | PC-FISC-01, PC-FISC-02 | TÉCNICO | RESPALDADO |
| HM-06 | H02 Hero | Bimoneda NIO/USD y conciliación de vouchers BAC/Banpro. | PC-PAY-04, PC-PAY-01, PC-PAY-02 | TÉCNICO | RESPALDADO |
| HM-07 | H02 Hero | Monitoreo de ventas desde cualquier dispositivo con internet. | PC-DASH-01, PC-DASH-02 | TÉCNICO | RESPALDADO |
| HM-08 | H03 Operating idea | Base local SQLite como fuente de verdad en caja. | PC-OFF-02 | TÉCNICO | RESPALDADO |
| HM-09 | H03 Operating idea | Aislamiento estricto por inquilino en la nube (RLS). | PC-SEC-01 | TÉCNICO | RESPALDADO |
| HM-10 | H03 Operating idea | Sincronización bidireccional asíncrona por deltas. | PC-OFF-03 | TÉCNICO | RESPALDADO |
| HM-11 | H04 Product in Motion | Flujo de venta con selección, modificadores y cobro. | PC-OFF-01, PC-FOH-02 | TÉCNICO | RESPALDADO |
| HM-12 | H04 Product in Motion | Descuento de insumos por receta, Kardex inmutable, tolerancia a stock negativo. | PC-INV-01, PC-INV-02, PC-INV-04 | TÉCNICO | RESPALDADO |
| HM-13 | H04 Product in Motion | Dashboard con KPIs, ranking y frescura. | PC-DASH-01, PC-DASH-02, PC-DASH-03 | TÉCNICO | RESPALDADO |
| HM-14 | H05 Roles | Quien cobra registra ventas y cobros bimoneda. | PC-OFF-01, PC-PAY-04 | TÉCNICO | RESPALDADO |
| HM-15 | H05 Roles | Quien gestiona: permisos diferenciados, anulaciones supervisadas, inventario. | PC-SEC-02, PC-INV-02 | TÉCNICO | RESPALDADO |
| HM-16 | H05 Roles | Quien dirige: venta neta y ranking desde el panel web. | PC-DASH-01, PC-DASH-03 | TÉCNICO | RESPALDADO |
| HM-17 | H06 Continuidad | Operación de caja offline en terminal enrolado e hidratado. | PC-OFF-01, PC-OFF-02 | TÉCNICO | RESPALDADO |
| HM-18 | H06 Continuidad | Acceso y cambio de cajero por PIN cifrado sin internet (tras login en línea previo). | PC-OFF-04 | TÉCNICO | RESPALDADO |
| HM-19 | H06 Continuidad | Sincronización de pendientes al restaurar conectividad. | PC-OFF-03 | TÉCNICO | RESPALDADO |
| HM-20 | H06 Continuidad | Visibilidad de estado de conexión y pendientes en pantalla. | PC-FOH-03 | TÉCNICO | RESPALDADO |
| HM-21 | H07 Control | Dashboard: venta neta, horas pico, ranking con participación. | PC-DASH-01, PC-DASH-03 | TÉCNICO | RESPALDADO |
| HM-22 | H07 Control | Monitor de frescura de sincronización. | PC-DASH-02 | TÉCNICO | RESPALDADO |
| HM-23 | H07 Control | Exportación de reportes de ventas, notas de crédito y cumplimiento DGI. | PC-DASH-04 | TÉCNICO | RESPALDADO |
| HM-24 | H08 Implementation | Plantillas por industria y Setup Center con verificación de activación. | PC-ONB-01, PC-ONB-03 | TÉCNICO | RESPALDADO |
| HM-25 | H08 Implementation | Tiempos y alcance de implementación definidos por acuerdo comercial. | N/A | MARKETING | MARKETING |
| HM-26 | H09 Evidence | Media publicada corresponde al producto vigente con provenance. | N/A | MARKETING | MARKETING |
| HM-27 | H09 Evidence | Casos, testimonios y cifras solo con autorización y evidencia. | N/A | MARKETING | MARKETING |
| HM-28 | H10 Support | Existe proceso de soporte con canales definidos. | N/A | MARKETING | MARKETING |
| HM-29 | H11 FAQ | Punto de venta offline-first con panel web para el dueño. | PC-OFF-01, PC-OFF-02, PC-DASH-01 | TÉCNICO | RESPALDADO |
| HM-30 | H11 FAQ | Venta, cobro y ticket continúan offline en terminal enrolado. | PC-OFF-01, PC-OFF-02 | TÉCNICO | RESPALDADO |
| HM-31 | H11 FAQ | Sincronización automática en segundo plano; nube eventualmente consistente. | PC-OFF-03, PC-FOH-03 | TÉCNICO | RESPALDADO |
| HM-32 | H11 FAQ | Descuento de insumos por receta y Kardex inmutable. | PC-INV-01, PC-INV-02 | TÉCNICO | RESPALDADO |
| HM-33 | H11 FAQ / H12 Final CTA | La demo se solicita desde el CTA y se prepara según el contexto compartido. | N/A | MARKETING | MARKETING |
| HM-34 | H13 Footer | Tagline de marca en footer. | N/A | MARKETING | MARKETING |

**Cobertura de claims del OD-02 sin cobertura publicada previa:** este contrato incorpora las capacidades `PC-OFF-04` (HM-18), `PC-FISC-01` (HM-05), `PC-FISC-02` (HM-05), `PC-PAY-02` (HM-06) y `PC-SEC-01` (HM-09), que carecían de cita en contenido publicado. Las capacidades `PC-FISC-03`, `PC-PAY-05`, `PC-INV-06` y `PC-ONB-02` permanecen sin cita en la homepage deliberadamente: son capacidades de resolución profunda que corresponden a la página de producto (ver §20). Las capacidades futureware `PC-OFF-05`, `PC-FISC-04` y `PC-PAY-03` no se citan (blocklist D5).

---

# 18. Publication Gates & Definition of Done

## 18.1 Gate A — Product truth

Cada claim `TÉCNICO` de §17: existe en la versión pública, funciona en el escenario descrito, tiene flujo demostrable y no depende de configuración presentada como universal.

## 18.2 Gate B — Operational truth

Escenario de continuidad (H06) verificado contra el terminal enrolado e hidratado; límites LIM-01 conservados en copy; implementación alineada al playbook vigente.

## 18.3 Gate C — Commercial and legal truth

Sin pricing, SLA, compromisos de soporte ni tratamiento de datos publicado sin aprobación; legal del footer revisado.

## 18.4 Gate D — Evidence and media

Toda captura y video de H02, H04, H07 y H09 proviene del build vigente con registro de provenance (asset, build, workflow, fecha, owner, aprobación); formatos y lazy-loading según §16.

## 18.5 Gate F — Non-functional acceptance

Los gates NF-01..NF-13 del spec no funcional (heredados por el wireframe §18.1) verificados para la homepage, con énfasis en LCP, peso de página y formatos de imagen (§16).

## 18.6 Gate E — Website consistency (cross-check contra la página de producto)

Contraste directo entre este documento y `nhilos_pos_product_page_content_v1.1.md`:

- la división de labores de §2.2 se cumple en ambas direcciones: la homepage no profundiza más que la página de producto, y la página de producto no repite el hero de la homepage con más palabras;
- ningún término usado aquí con semántica técnica (`offline-first`, `terminal enrolado`, `hidratado`, `Kardex`, `frescura`) contradice la definición de la página de producto;
- los CTAs y destinos de navegación del footer y de H05 existen;
- ningún módulo futuro aparece como disponible;
- el registro de cobertura del OD-02 (índice inverso del OD-02) se actualiza para reflejar las nuevas citas `HM-*` de §17.

## 18.7 Definition of Done

- [x] un bloque por sección del wireframe H01–H13, con los nombres de bloque preservados;
- [x] cada bloque lleva propósito, copy propuesto, Situación → Comportamiento → Efecto, Claim IDs y restricciones;
- [x] cada claim técnico cita un `PC-*` vigente del OD-02 v1.3 (§17);
- [x] los límites declarados (`works_when`/`does_not_work_when`) se conservan en H02 y H06 (G-06);
- [x] los gates no funcionales se heredan verbatim, sin valores inventados (§16);
- [ ] verificación claim por claim contra el build anclado vigente (Gate A);
- [ ] media con provenance aprobada (Gate D);
- [ ] Gate E ejecutado y documentado contra `nhilos_pos_product_page_content_v1.1.md`;
- [ ] Gates A–F cerrados formalmente.

Los ítems `[x]` corresponden a cierre editorial/estructural de este contrato; los `[ ]` son gate-dependent y no bloquean la aprobación del contrato, solo su publicación.

---

# 19. Editorial and UX Rules

## Writing rules

- Escribir desde situaciones reconocibles del negocio (fila de la hora pico, internet caído, dueño fuera del local).
- Copy delimitado y sobrio, sin superlativos ni auto-descripción de estatus (§5.3 y §14.2 de la constitución): prohibido el vocabulario de §14.2 y todo equivalente.
- Verbos concretos: cobrar, facturar, sincronizar, consultar, revisar, preparar.
- Una sola idea principal por bloque; el hero no es una lista de beneficios.
- Números y textos de UI solo desde fuentes verificables (G-05): nada transcrito de memoria ni de builds obsoletos.
- “En tiempo real”, “total” y “automático” no se usan sin definición y evidencia.

## UX rules

- Lectura progresiva: marca → promesa → demostración → confianza → conversión.
- Cada bloque responde: ¿cuál es la siguiente acción lógica? (regla CTA del wireframe §13).
- Máximo dos CTAs visibles por bloque (primario + secundario).
- Los detalles condicionados viven cerca del claim al que aplican; las delimitaciones no se esconden en la FAQ.
- Touch targets, contraste y estructura semántica según NF-01, NF-07, NF-08 y NF-09.

---

# 20. Open Decisions & Dependencies

| ID | Decision / dependency | Status | Owner | Note |
| :---- | :---- | :---- | :---- | :---- |
| OD-HM-01 | Cobertura de capacidades profundas sin cita en la homepage: `PC-FISC-03` (validación Cédula/RUC), `PC-PAY-05` (split bill), `PC-INV-06` (producción batch), `PC-ONB-02` (importación CSV). | `OPEN` | Product / Content | Corresponde a la página de producto decidir si las incorpora (división de labores §2.2); la homepage no las cita para no convertirse en lista de módulos. |
| OD-HM-02 | Copy definitivo del hero y de la línea de credenciales. | `PROPOSED` | Marketing | Derivado del Brief §5.1; requiere validación editorial. |
| OD-HM-03 | Media del build vigente con provenance para H02/H04/H07. | `EVIDENCE_REQUIRED` | Content / Product | Depende del inventario de medios (Gate D, OD-IA-07). |
| OD-HM-04 | Operación de demo (owner, canal, SLA, flujo). | `EVIDENCE_REQUIRED / OPEN` | Commercial / Web | OD-IA-03 del wireframe; bloquea la experiencia posterior al CTA. |
| OD-HM-05 | Actualización del índice inverso del OD-02 con las nuevas citas `HM-*`. | `OPEN` | Claims owner | El índice inverso del OD-02 referencia solo la página de producto; debe extenderse a este documento en su próxima revisión (G-02: se escala, no se edita aquí unilateralmente). |
| OD-HM-06 | Legal del footer (privacidad / términos). | `EVIDENCE_REQUIRED` | Legal | OD-IA-13 del wireframe. |

---

# 21. Final Content Contract

La homepage de NHILOS introduce la propuesta: un punto de venta que sostiene la operación cuando la conectividad falla, cumple la normativa fiscal de Sistemas Computarizados (DT 09-2007), conecta la venta con el inventario y le devuelve al dueño visibilidad desde la nube — con aislamiento estricto por inquilino. La demuestra con producto real y la delimita con límites declarados. Todo lo que exige profundidad pertenece a la página de producto, y el contraste entre ambos contratos es el Gate E.

> **Contrato narrativo:** propuesta introducida con producto real → límites declarados → siguiente paso claro.

**Version:** `1.1`  
**Status:** `APPROVED / AUTHORITATIVE CONTENT CONTRACT — PUBLICATION GATED`  
**Publication authority:** `NOT GRANTED`

---

**Final disposition:** `CONTENT CONTRACT APPROVED — PUBLICATION BLOCKED UNTIL GATES A–F AND GATE E CROSS-CHECK PASS`.
