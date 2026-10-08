# NHILOS --- Website Information Architecture & Content Wireframe

**Documento:**
`nhilos_website_information_architecture_content_wireframe_v1.0.md`\
**Versión:** 1.0\
**Estado:** APPROVED / AUTHORITATIVE WEBSITE INFORMATION ARCHITECTURE &
CONTENT WIREFRAME\
**Marca maestra:** NHILOS\
**Producto público actual:** NHILOS POS\
**Tipo:** Information Architecture + Content Wireframe\
**Upstream principal:**
`nhilos_website_product_marketing_brief_v1.0.md` (v1.0)\
**Upstream de marca:** `nhilos_brand_experience_principles_v1.0.md` (v1.0)

------------------------------------------------------------------------

# 0. Document Contract

## 0.1 Purpose

Este documento traduce la autoridad del Website Product & Marketing
Brief en una arquitectura concreta de navegación, jerarquía de páginas y
wireframes de contenido para el website público de NHILOS.

No define:

-   identidad visual final;
-   design system;
-   copy público definitivo;
-   claims funcionales definitivos;
-   implementación técnica;
-   pricing;
-   SLA comercial;
-   métricas no verificadas.

## 0.2 Authority rule

La arquitectura debe respetar:

1.  NHILOS como masterbrand.
2.  NHILOS POS como producto público actual.
3.  El producto real como autoridad sobre cualquier claim.
4.  `Core Promise First`.
5.  `NHILOS +1`.
6.  claridad, precisión, cuidado, sobriedad y fiabilidad.
7.  producto real + evidencia por encima de adjetivos.
8.  no anunciar productos futuros como si existieran.

## 0.3 Decision classification

  ---------------------------------------------------------------------
  Status                             Uso
  ---------------------------------- ----------------------------------
  `INHERITED`                        Decisión heredada directamente de
                                     una autoridad aprobada.

  `DERIVED`                          Traducción necesaria al contexto
                                     web.

  `PROPOSED`                         Hipótesis de IA, contenido, CTA o
                                     UX todavía revisable.

  `EVIDENCE_REQUIRED`                Requiere validación de producto,
                                     legal, comercial, customer proof o
                                     mercado.

  `APPROVED_WEBSITE`                 Decisión aprobada específicamente
                                     para el website.

  `SUPERSEDED`                       Reemplazada por una decisión
                                     posterior.
  ---------------------------------------------------------------------

**Regla:** una propuesta incluida aquí no se convierte automáticamente
en autoridad de publicación.

------------------------------------------------------------------------

# 1. Strategic Architecture

## 1.1 Operating model

**Status: `DERIVED / APPROVED_WEBSITE`**

Mientras NHILOS POS sea el único producto público aprobado, el website
opera como:

``` text
NHILOS — MASTERBRAND
        ↓
PUBLIC WEBSITE
        ↓
NHILOS POS — CURRENT PRODUCT
```

No se presentará un portafolio ficticio ni placeholders para productos
futuros.

## 1.2 Core architecture principle

> **La homepage vende la idea y demuestra el producto. Las páginas
> profundas resuelven preguntas.**

La arquitectura debe ser:

-   simple en navegación;
-   profunda en contenido;
-   orientada a tareas reales;
-   demostrativa;
-   escalable;
-   compatible con SEO;
-   preparada para incorporar un segundo producto sin rehacer todo el
    sitio.

## 1.3 Re-architecture trigger

Reabrir la IA raíz cuando ocurra cualquiera de estos eventos:

-   aprobación pública de un segundo producto;
-   nueva categoría comercial;
-   cambio material de mercado;
-   separación real de dominios/product sites;
-   nueva autoridad de Brand Identity que requiera otra arquitectura.

------------------------------------------------------------------------

# 2. Information Architecture

## 2.1 Approved logical sitemap

**Status: `APPROVED_WEBSITE`**

La IA final se alinea con el modelo masterbrand-first / single-product
del Website Brief. Las páginas de implementación y soporte pertenecen
conceptualmente a NHILOS POS aunque su ruta técnica final permanezca
abierta.

``` text
/
├── Home
│
├── NHILOS POS
│   ├── Overview
│   ├── Operación / Cómo funciona
│   ├── Capacidades / use cases
│   ├── Implementación
│   └── Soporte
│
├── Casos / Clientes        [condicional: solo con evidencia suficiente]
├── Recursos
│   ├── Guías
│   └── FAQ
│
├── Nosotros / NHILOS
│
├── Solicitar una demo
│
└── Legal                    [no-promotional / required before launch]
    ├── Privacidad
    └── Términos
```

### Route governance

La jerarquía anterior es **lógica**, no una fijación de dominio,
subpath, subdomain, redirect o canonical. La decisión técnica de URL
permanece abierta.

Reglas:

-   `Operación / Cómo funciona` es un mismo destino conceptual; no crear
    dos páginas redundantes por naming.
-   `Implementación` y `Soporte` no constituyen productos ni categorías
    independientes: son experiencias profundas de NHILOS POS.
-   `Casos / Clientes` no se publica hasta existir evidencia,
    autorización y contexto suficientes.
-   `Legal` existe como capa de confianza y cumplimiento, no como
    contenido comercial.

## 2.2 Public navigation

### Primary navigation

**Status: `APPROVED_WEBSITE`**

``` text
NHILOS

Producto
Implementación
Recursos
Nosotros

[Solicitar una demo]
```

`Cómo funciona` no necesita un item adicional de navegación: vive dentro
de NHILOS POS → Operación.

`Soporte` tampoco necesita un item adicional de navegación primaria en
el lanzamiento; queda accesible desde Producto y desde el footer.

### Producto navigation

``` text
Producto
│
└── NHILOS POS
    ├── Overview
    ├── Operación / Cómo funciona
    ├── Capacidades / use cases
    ├── Implementación
    └── Soporte
```

La navegación no debe convertir cada capability en una página de primer
nivel.

## 2.3 Footer architecture

**Status: `APPROVED_WEBSITE`**

``` text
NHILOS
Conectamos los hilos de tu negocio.

PRODUCTO
NHILOS POS
Operación / Cómo funciona
Capacidades
Implementación
Soporte

RECURSOS
Guías
Casos / Clientes*
FAQ

EMPRESA
Nosotros

LEGAL
Privacidad
Términos

[Solicitar una demo]
```

`*` Casos / Clientes solo aparece cuando existe contenido publicable
suficiente.

No se fija un enlace independiente de `Contacto` mientras no exista una
experiencia de contacto distinta y operativamente definida de la
demo/soporte.

Los futuros productos no deben aparecer como `coming soon`.

------------------------------------------------------------------------

# 3. Navigation Rules

## N-01 --- Brand ownership

**Status: `INHERITED`**

El website acumula valor en NHILOS. No utilizar:

``` text
NHILOS POS by NHILOS
```

## N-02 --- No portfolio theater

**Status: `INHERITED / DERIVED`**

No mostrar:

``` text
NHILOS
├── POS
├── Conta — Coming Soon
└── ERP — Coming Soon
```

## N-03 --- Capability ≠ top-level navigation

**Status: `DERIVED`**

Inventario, fiscalidad, pagos, dashboard, producción, auditoría,
sincronización y otras capacidades deben entrar inicialmente como
argumentos dentro de journeys y páginas profundas.

## N-04 --- Conversion CTA

**Status: `DERIVED / PROPOSED`**

Usar un CTA primario consistente: **Solicitar una demo**. La etiqueta y
jerarquía quedan definidas para la IA; la condición de que la demo sea
la conversión GTM primaria sigue pendiente de validación comercial.

No se fijan todavía:

-   canal;
-   owner;
-   SLA;
-   calendario;
-   formulario definitivo;
-   reglas de qualification.

------------------------------------------------------------------------

# 4. Content Model

Cada contenido público debe clasificarse antes de producirse.

  Content object   Ejemplo                        Función
  ---------------- ------------------------------ ------------------------
  Product          NHILOS POS                     Explicar producto
  Workflow         Vender / cobrar / supervisar   Demostrar operación
  Capability       Inventario / continuidad       Resolver pregunta
  Proof            Screenshot / video / caso      Demostrar
  Implementation   Onboarding / go-live           Reducir incertidumbre
  Support          Atención / ayuda               Establecer expectativa
  Guide            Guía práctica                  Educación
  Case             Caso de cliente                Evidencia
  FAQ              Objeciones                     Decision support
  Company          NHILOS                         Confianza
  Demo             Solicitud                      Conversión

------------------------------------------------------------------------

# 5. Homepage Content Wireframe

**Status:** `PROPOSED`\
**Copy:** CONCEPT ONLY --- NOT APPROVED FOR PUBLICATION.

## H00 --- Page job

La homepage debe:

1.  establecer NHILOS;
2.  hacer entendible NHILOS POS;
3.  demostrar valor;
4.  reducir incertidumbre;
5.  dirigir hacia una conversación/demo;
6.  hacerlo mediante producto y evidencia, no mediante ruido.

## H01 --- Header

``` text
┌────────────────────────────────────────────────────┐
│ NHILOS     Producto  Cómo funciona  Implementación│
│            Recursos  Nosotros       [Solicitar una demo]│
└────────────────────────────────────────────────────┘
```

### Content

-   logo / wordmark NHILOS;
-   primary navigation;
-   primary CTA.

### Avoid

-   mega-menu innecesario;
-   múltiples CTAs principales;
-   banners promocionales;
-   navegación basada en features.

------------------------------------------------------------------------

## H02 --- Hero

### Job

Responder rápidamente:

-   qué es;
-   para quién;
-   por qué importa.

### Content structure

``` text
EYEBROW
NHILOS POS

HEADLINE
[Territorio de promesa — copy pendiente de validación]

SUPPORTING COPY
[Qué resuelve / para quién — pendiente]

PRIMARY CTA
[Solicitar una demo]

SECONDARY CTA
[Ver cómo funciona]

PRODUCT PROOF
[UI real / workflow real]
```

### Content status

-   Brand territory: `INHERITED / DERIVED`
-   Headline: `PROPOSED`
-   Functional statements: `EVIDENCE_REQUIRED`
-   Product media: `EVIDENCE_REQUIRED`

### Rule

El hero no debe convertirse en una lista de beneficios.

------------------------------------------------------------------------

## H03 --- The operating idea

### Job

Explicar que NHILOS POS conecta la operación, no solamente el momento
del cobro.

``` text
VENTA
  ↓
OPERACIÓN
  ↓
CONTROL
  ↓
VISIBILIDAD
```

### Suggested content

``` text
SECTION EYEBROW
La operación completa

HEADLINE
[Idea central — pendiente]

BODY
[Breve explicación — pendiente]

VISUAL
[Flujo real del producto]
```

### Proof

Debe utilizar producto real cuando sea posible.

------------------------------------------------------------------------

## H04 --- Product in Motion

### Job

Demostrar el producto mediante trabajos reales.

### Workflow A --- Vender

``` text
Seleccionar
→ configurar
→ confirmar
→ cobrar
```

### Workflow B --- Controlar

``` text
Venta
→ inventario
→ movimiento
→ contexto
```

### Workflow C --- Supervisar

``` text
Operación
→ datos
→ dashboard
→ decisión
```

### Wireframe

``` text
┌────────────────────────────────────────────┐
│ PRODUCT IN MOTION                          │
│                                            │
│ [Workflow 01]                              │
│ Screenshot / video                         │
│ Contexto + resultado                       │
│                                            │
│ [Workflow 02]                              │
│ Screenshot / video                         │
│ Contexto + resultado                       │
│                                            │
│ [Workflow 03]                              │
│ Screenshot / video                         │
│ Contexto + resultado                       │
└────────────────────────────────────────────┘
```

### Rule

No presentar tres cards genéricas de features. Cada módulo debe
demostrar una acción o decisión real.

------------------------------------------------------------------------

## H05 --- Roles / jobs

### Job

Permitir que distintos visitantes reconozcan su contexto operativo.

``` text
┌────────────────┬────────────────┬────────────────┐
│ QUIEN COBRA    │ QUIEN GESTIONA │ QUIEN DIRIGE   │
│                │                │                │
│ rapidez        │ control        │ visibilidad    │
│ claridad       │ contexto       │ decisión       │
│                │                │                │
│ [Ver operación] │ [Ver capacidades] │ [Ver producto]│
└────────────────┴────────────────┴────────────────┘
```

### Rule

No convertir esto en una taxonomía de "personas" artificial. Debe hablar
desde trabajos reales.

------------------------------------------------------------------------

## H06 --- Continuidad operativa

### Job

Demostrar la filosofía de fiabilidad de NHILOS POS.

### Wireframe

``` text
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

`*` Cada afirmación funcional debe validarse contra el producto real y
sus condiciones operativas.

### Content

-   explicación simple;
-   workflow;
-   producto real;
-   delimitaciones relevantes.

### Avoid

No utilizar claims absolutos como:

> "Funciona sin internet en cualquier situación."

------------------------------------------------------------------------

## H07 --- Control del negocio

### Job

Mostrar la transición:

``` text
OPERACIÓN
   ↓
DATOS
   ↓
CONTEXTO
   ↓
DECISIÓN
```

### Content

-   dashboard real;
-   métricas disponibles;
-   contexto de lectura;
-   relación con la operación.

### Status

Functional claims: `EVIDENCE_REQUIRED`.

------------------------------------------------------------------------

## H08 --- Implementation

### Job

Reducir la ansiedad asociada con adoptar software.

### Narrative

``` text
Entendemos
    ↓
Preparamos
    ↓
Configuramos
    ↓
Probamos
    ↓
Capacitamos
    ↓
Verificamos
    ↓
Go-live
```

### Content

``` text
EYEBROW
Implementación

HEADLINE
[Promesa de implementación — pendiente]

BODY
[Qué puede esperar el cliente]

FLOW
01 → 02 → 03 → 04 → 05 → 06 → 07

CTA
[Conocer implementación]
```

No inventar SLA, tiempos o alcance hasta validación comercial.

------------------------------------------------------------------------

## H09 --- Evidence

### Proof hierarchy

``` text
1. Producto real
2. Workflow real
3. Caso de cliente
4. Testimonio verificable
5. Cifra verificable
6. Trust / compliance evidence
```

### Wireframe

``` text
┌────────────────────────────────────────────┐
│ EVIDENCIA                                  │
│                                            │
│ [Producto real]                            │
│                                            │
│ [Caso / cliente]                           │
│                                            │
│ [Testimonio / evidencia]                   │
└────────────────────────────────────────────┘
```

### Status

Customer proof: `EVIDENCE_REQUIRED`.

No publicar logos, cifras o testimonios sin autorización/evidencia.

------------------------------------------------------------------------

## H10 --- Support

### Job

Mostrar que la experiencia continúa después de la compra.

``` text
HEADLINE
[Soporte sin promesas inventadas]

BODY
[Cómo obtener ayuda]

LINKS
Ayuda
Contacto
FAQ
```

SLA y canales concretos permanecen sujetos a validación.

------------------------------------------------------------------------

## H11 --- FAQ

### Initial questions

1.  ¿Qué es NHILOS POS?
2.  ¿Para qué tipo de operación está pensado?
3.  ¿Qué sucede cuando se pierde la conectividad?
4.  ¿Cómo se sincroniza la operación?
5.  ¿Qué capacidades de inventario existen?
6.  ¿Cómo funciona la implementación?
7.  ¿Qué soporte está disponible?
8.  ¿Cómo puedo solicitar una demo?

Cada respuesta funcional debe pasar por el claim verification gate
correspondiente.

------------------------------------------------------------------------

## H12 --- Final CTA

### Territory

``` text
HEADLINE
[Veamos cómo funciona en tu operación]

BODY
[Mensaje de transición de marketing a conversación]

PRIMARY CTA
[Solicitar una demo]
```

La operación real de la demo todavía requiere definir:

-   owner;
-   canal;
-   SLA;
-   calendar flow;
-   datos mínimos.

------------------------------------------------------------------------

## H13 --- Footer

``` text
NHILOS
Conectamos los hilos de tu negocio.

Producto
  NHILOS POS
  Cómo funciona
  Capacidades
  Implementación
  Soporte

Recursos
  Guías
  Casos
  FAQ

Empresa
  Nosotros
  Contacto

Legal
  Privacidad
  Términos

[Solicitar una demo]
```

------------------------------------------------------------------------

# 6. NHILOS POS --- Product Page Wireframe

**Route:** `/pos`\
**Status:** `PROPOSED`

## P01 --- Hero

``` text
NHILOS POS

[Qué es y qué resuelve]

[Solicitar una demo]

[Producto real]
```

## P02 --- Product essence

Territorio:

> Cuidamos la operación.

Debe demostrarse con producto, no quedarse como slogan aislado.

## P03 --- Operational workflows

La página debe explicar el producto mediante workflows completos y
verificables.

``` text
VENTA
↓
COBRO
↓
[efectos operativos verificables]
↓
CONTROL / VISIBILIDAD
```

Cada capability se presenta como:

> **Situación → Comportamiento → Efecto**

No como nombre de módulo + icono + claim genérico.

### P03-bis --- Loyalty y promociones como argumento de contenido

**Status:** `DERIVED / EVIDENCE_REQUIRED`

Loyalty entra a la página `/pos` como argumento de contenido dentro del flujo operativo, conforme a la regla `N-03` (Capability ≠ top-level navigation): no se crea ningún nodo de navegación ni ruta nueva.

Situación → Comportamiento → Efecto:

- **Situación:** el negocio quiere fidelizar clientes y ejecutar promociones sin depender de conectividad ni de tarjetas plásticas.
- **Comportamiento:** el cliente se identifica en mostrador por QR (`NHL1:{code}`), código, teléfono o búsqueda por nombre, con datos locales; al guardar la venta con cliente seleccionado se acumulan puntos a la tasa configurada, y el canje es un descuento validado (mínimo, saldo y tope al total) iniciado por el operador; las promociones activas localmente se aplican de forma automática y determinista; las transacciones de puntos sincronizan a la nube de forma idempotente; el dueño configura programas, recompensas y ajustes con actor y motivo.
- **Efecto:** la fidelización opera dentro del flujo de caja sin detener la venta, con límites declarados: tasa plana (sin reglas de programa ni sellos), beneficio de catálogo de recompensas no aplicado al carrito, consistencia eventual en la nube (deriva de redondeo de hasta 0.5 punto por transacción, sin paridad exacta de saldo en tiempo real) y configuración restringida al rol OWNER/MANAGER.

Claims de los que depende este argumento (OD-02 v1.3, extensión loyalty): `PC-LOY-01`, `PC-LOY-02`, `PC-LOY-03`, `PC-LOY-04`, `PC-LOY-05`, `PC-LOY-06`. Lo no implementado (expiración, tiers, campañas, KPIs de loyalty, portal del consumidor, paridad exacta POS↔nube) no se comunica como capacidad, según §4.1 del OD-02.

## P04 --- Continuity + control / visibility

La página debe cubrir explícitamente los dos temas que el Website Brief
considera centrales en la evaluación:

### Continuidad

-   escenario de conectividad realmente soportado;
-   qué continúa;
-   qué se guarda;
-   qué ocurre al recuperar conectividad;
-   límites y condiciones.

### Control / visibilidad

-   dashboard o superficies reales disponibles;
-   métricas realmente disponibles;
-   contexto de lectura;
-   relación con la operación.

Todo claim funcional permanece `EVIDENCE_REQUIRED`.

## P05 --- Roles

Mostrar las necesidades humanas sin crear una taxonomía artificial de
personas:

-   quien cobra → rapidez y claridad;
-   quien supervisa → control y contexto;
-   quien dirige → visibilidad para decidir.

Los destinos de navegación deben apuntar a contenido real, no a módulos
asumidos.

## P06 --- Real product gallery / proof

-   screenshots reales;
-   video real, cuando exista;
-   workflows reales;
-   hardware real cuando sea relevante;
-   evidencia de clientes cuando exista.

No publicar interfaces, estados o comportamientos que no existan en el
producto.

## P07 --- Implementation

La implementación debe reducir incertidumbre y mostrar preparación.

Link hacia la experiencia de Implementación de NHILOS POS.

## P08 --- Hardware / compatibility

Cuando sea material para evaluar el producto, explicar compatibilidad
únicamente con equipos y condiciones verificadas.

No utilizar `homologado`, `certificado` o equivalentes sin autoridad
correspondiente.

## P09 --- Support

Link hacia la experiencia de Soporte. Mostrar proceso, límites y
siguiente paso sin inventar SLA.

## P10 --- FAQs

Resolver las preguntas de evaluación que no hayan quedado claras en el
flujo principal, incluyendo:

-   qué es;
-   alcance;
-   continuidad;
-   implementación;
-   soporte;
-   limitaciones relevantes;
-   cómo solicitar demo.

## P11 --- CTA

``` text
[Solicitar una demo]
```

# 7. How It Works --- Content Ownership

**Status: `APPROVED_WEBSITE`**

`Cómo funciona` no se mantiene como una página independiente en la IA
raíz. Es el nombre de la intención/contenido dentro de **NHILOS POS →
Operación**.

## Content sequence

``` text
01 — Panorama
02 — Operación
03 — Continuidad
04 — Sincronización
05 — Control
06 — Visibilidad
07 — Implementación
08 — CTA
```

La intención puede tener una URL propia en el futuro solo si la
evidencia de búsqueda, contenido o conversión demuestra que la
separación aporta valor material. No se crea por anticipación.

# 8. Implementation --- Content Wireframe

**Route:** `/implementacion`

## Sections

``` text
Hero
↓
Qué ocurre antes del go-live
↓
Preparación
↓
Configuración
↓
Pruebas
↓
Capacitación
↓
Verificación
↓
Go-live
↓
Soporte inicial
↓
FAQ
↓
CTA
```

### Required governance

No publicar:

-   tiempos garantizados;
-   SLA;
-   cobertura;
-   número de sesiones;
-   responsables;
-   entregables específicos;

sin evidencia comercial/operacional.

------------------------------------------------------------------------

# 9. Support --- Content Wireframe

**Route:** `/soporte`

## Sections

``` text
Hero
↓
Cómo pedir ayuda
↓
Canales
↓
Qué información preparar
↓
Qué esperar del proceso
↓
FAQ
↓
Contacto
```

Los canales y SLAs son `EVIDENCE_REQUIRED`.

------------------------------------------------------------------------

# 10. Resources Architecture

**Route:** `/recursos`

## Resource types

### Guides

Contenido educativo y decision support.

### Cases / Clients

Nodo condicional. Publicar únicamente cuando exista:

-   cliente real;
-   permiso;
-   evidencia;
-   contexto suficiente.

No crear una sección vacía de "Casos" para aparentar tracción.

### FAQ

Preguntas recurrentes y objeciones.

## Rule

No crear un blog por obligación editorial.

Cada pieza debe responder una pregunta concreta del comprador o usuario.

------------------------------------------------------------------------

# 11. About NHILOS

**Route:** `/nosotros`

## Job

Explicar la empresa sin desplazar al producto.

### Suggested structure

``` text
NHILOS
↓
Qué creemos
↓
Qué estamos construyendo
↓
Cómo pensamos la operación
↓
Principios
↓
Producto actual
↓
Contacto
```

### Brand foundation

Puede utilizar:

> Conectamos los hilos de tu negocio.

El contenido corporativo debe respetar el Brand Experience Principles.

------------------------------------------------------------------------

# 12. Demo Conversion Flow

**Logical destination:** Solicitar una demo

**Route:** pendiente de decisión URL

## Purpose

Convertir interés en una primera interacción útil.

### Proposed flow

``` text
CTA
 ↓
Demo landing
 ↓
Contexto mínimo
 ↓
Solicitud
 ↓
Confirmación
 ↓
Contacto / agenda
```

### Unknowns

`EVIDENCE_REQUIRED / OPEN`

-   canal;
-   owner;
-   SLA;
-   calendar;
-   form fields;
-   qualification rules;
-   privacy notice;
-   confirmation experience.

------------------------------------------------------------------------

# 13. CTA Architecture

## Primary CTA

**Label for IA:**

> Solicitar una demo

**Status:** `PROPOSED` as GTM primary conversion; `APPROVED_WEBSITE` as
the primary CTA label/placement pattern.

## Secondary CTA candidates

-   Ver cómo funciona
-   Conocer NHILOS POS
-   Ver implementación
-   Explorar capacidades

No usar simultáneamente demasiados CTAs de igual jerarquía.

## CTA rule

Cada página debe responder:

> ¿Cuál es la siguiente acción lógica después de consumir este
> contenido?

------------------------------------------------------------------------

# 14. SEO Content Architecture

**Status: `DERIVED + EVIDENCE_REQUIRED`**

El SEO no debe alterar la personalidad ni producir contenido artificial.

## Approved page intent map

  -------------------------------------------------------------------------------------
  IA node                 Search / intent role    Status
  ----------------------- ----------------------- -------------------------------------
  Home                    Marca + categoría +     `DERIVED`
                          discovery               

  NHILOS POS / Overview   Producto / categoría    `DERIVED`

  NHILOS POS / Operación  Evaluación / cómo       `DERIVED`
                          funciona                

  NHILOS POS /            Evaluación de           `DERIVED`
  Capacidades             capacidades / use cases 

  Implementación          Decision support        `DERIVED`

  Soporte                 Post-sale / support     `DERIVED`
                          intent                  

  Recursos / Guías        Informational           `DERIVED`

  Casos / Clientes        Commercial proof        `CONDITIONAL`

  Recursos / FAQ          Objection / long-tail   `DERIVED`

  Nosotros                Brand trust             `DERIVED`

  Demo                    Conversion              `PROPOSED / PENDING GTM VALIDATION`
  -------------------------------------------------------------------------------------

Keyword research permanece pendiente. No crear URLs adicionales
únicamente para cubrir keywords.

# 15. Mobile Information Architecture

Mobile no debe ser una versión reducida de desktop.

## Mobile navigation

``` text
NHILOS
[Menu]
[Solicitar una demo]
```

Dentro:

``` text
Producto
  NHILOS POS
    Overview
    Operación / Cómo funciona
    Capacidades
    Soporte

Implementación

Recursos
  Guías
  Casos / Clientes*
  FAQ

Nosotros
```

`*` solo cuando exista evidencia publicable.

Los items de primer nivel del menú móvil son los mismos que la navegación primaria de
escritorio (§2.2): `Producto`, `Implementación`, `Recursos`, `Nosotros`. `Implementación` es
un item de primer nivel en ambos breakpoints; dentro del menú `Producto` permanece anidado
como experiencia de NHILOS POS, igual que en el árbol `Producto navigation` de escritorio.

## Mobile rules

-   CTA principal accesible;
-   navegación corta;
-   contenido escaneable;
-   workflows legibles;
-   producto real antes de decoración;
-   media optimizada;
-   reduced motion respetado.

------------------------------------------------------------------------

# 16. Content Status Matrix

  Elemento                             Status
  ------------------------------------ ---------------------------------
  NHILOS masterbrand                   `INHERITED`
  NHILOS POS current product           `INHERITED`
  Masterbrand-first / single-product   `DERIVED / APPROVED_WEBSITE`
  Logical sitemap                      `APPROVED_WEBSITE`
  Primary navigation                   `APPROVED_WEBSITE`
  Footer architecture                  `APPROVED_WEBSITE`
  Homepage section order               `APPROVED_WEBSITE`
  Product page structure               `APPROVED_WEBSITE`
  Implementation / Support IA          `APPROVED_WEBSITE`
  Hero copy                            `PROPOSED / CONCEPT ONLY`
  Functional product claims            `EVIDENCE_REQUIRED`
  Customer logos                       `EVIDENCE_REQUIRED`
  Testimonials                         `EVIDENCE_REQUIRED`
  Pricing                              `EVIDENCE_REQUIRED / OPEN`
  Demo operational flow                `EVIDENCE_REQUIRED / OPEN`
  Demo as GTM primary conversion       `PROPOSED / PENDING VALIDATION`
  URL implementation                   `EVIDENCE_REQUIRED / OPEN`
  SEO keywords                         `EVIDENCE_REQUIRED / OPEN`
  Brand visual tokens                  `DEFERRED`
  Product media inventory              `EVIDENCE_REQUIRED`
  Legal copy / privacy                 `EVIDENCE_REQUIRED`

**Interpretación:** la aprobación de la IA no aprueba los elementos que
dependan de evidencia externa.

# 17. Anti-patterns

El website no debe caer en:

## AP-01 --- Feature wall

``` text
20 cards
20 icons
20 claims
0 narrative
```

## AP-02 --- Fake ecosystem

Productos futuros presentados como si estuvieran disponibles.

## AP-03 --- Hero sin producto

Promesa abstracta sin evidencia visual.

## AP-04 --- Marketing theater

Superlativos, cifras no verificadas, claims de liderazgo o lenguaje de
estatus.

## AP-05 --- Technical dump

Arquitectura, stack o jerga técnica utilizada como sustituto de valor.

## AP-06 --- SEO factory

Decenas de páginas creadas solamente para capturar keywords.

## AP-07 --- Demo black box

CTA que termina en una experiencia sin claridad sobre qué ocurre
después.

## AP-08 --- Support invisibility

La compra termina en el CTA.

------------------------------------------------------------------------

## AP-09 --- IA duplication

No mantener dos páginas que respondan esencialmente la misma pregunta
solo por diferencias de naming (`Cómo funciona` vs `Operación`,
`Soporte` root vs soporte de POS).

## AP-10 --- Navigation inflation

No convertir recursos condicionales, capacidades o experiencias
operativas en nuevos items de navegación primaria sin evidencia de
necesidad.

------------------------------------------------------------------------

# 18. Acceptance Criteria --- IA + Content Wireframe

**Closure status: PASS**

-   [x] la arquitectura mantiene NHILOS como masterbrand;
-   [x] NHILOS POS permanece como producto público actual;
-   [x] no aparecen productos futuros como placeholders;
-   [x] existe una navegación primaria definida y contenida;
-   [x] existe footer architecture;
-   [x] existe sitemap lógico;
-   [x] homepage tiene una secuencia narrativa;
-   [x] product page tiene estructura alineada al Website Brief;
-   [x] implementation tiene estructura;
-   [x] support tiene estructura;
-   [x] resources tiene estructura;
-   [x] demo tiene flujo conceptual;
-   [x] cada sección tiene un job;
-   [x] claims funcionales quedan separados de contenido conceptual;
-   [x] evidence-required queda identificado;
-   [x] no se inventan SLA, pricing, métricas o proof;
-   [x] SEO queda estructurado sin convertirse en content factory;
-   [x] mobile IA está contemplada;
-   [x] anti-patterns están definidos;
-   [x] las decisiones downstream permanecen explícitamente abiertas
    donde corresponde;
-   [x] la siguiente etapa puede comenzar sin reinterpretar la
    arquitectura.
-   [ ] los gates no funcionales de §18.1 están verificados contra
    `nhilos_website_non_functional_spec_v1.0.md` antes de cualquier
    sign-off de lanzamiento del sitio.

**Nota:** URL técnica, claims, pricing, buyer/ICP, proof, legal y
operación de demo siguen siendo gates downstream; no son blockers de la
aprobación de esta IA.

## 18.1 Non-functional acceptance gates (inherited)

**Status: `INHERITED` — gate obligatorio, no omisible**

El cierre estructural de este bloque de aceptación no sustituye el gate no funcional. Los
umbrales siguientes se heredan de
`Recursos/nhilos_website_non_functional_spec_v1.0.md` (referencia técnica transversal según
`nhilos_branding_document_governance_v1.0.md` §3). Conforme a la regla `G-02`, ningún
sign-off de esta IA o del sitio es válido si omite estos gates: la aprobación de la IA queda
explícitamente condicionada a ellos.

| # | Gate | Valor heredado (verbatim) | Fuente (spec no funcional) |
|---|------|---------------------------|----------------------------|
| NF-01 | Conformidad de accesibilidad | WCAG 2.1 **Nivel AA** como estándar base de aceptación | §2 (intro) |
| NF-02 | LCP | `< 2.5 segundos` (percentil 75, "Good") | §1.1 |
| NF-03 | INP | `< 200 milisegundos` | §1.1 |
| NF-04 | CLS | `< 0.1` | §1.1 |
| NF-05 | Peso de página inicial | `< 2.5 MB` comprimido | §1.2 |
| NF-06 | Formato de imágenes | Servidas en formatos modernos (`WebP` o `AVIF` con fallback a JPG/PNG); redimensionadas por viewport con `srcset`; `loading="lazy"` fuera del viewport inicial | §1.2 |
| NF-07 | Touch targets | Área táctil mínima de `44x44 CSS pixels` en móvil para todo elemento interactivo | §2.4 |
| NF-08 | Contraste de texto | Mínimo `4.5:1` texto normal y `3:1` texto grande (H1, H2) | §2.1 |
| NF-09 | Contraste de UI | Mínimo `3:1` para controles interactivos (botones, inputs, estados activos) | §2.1 |
| NF-10 | Movimiento reducido | Con `prefers-reduced-motion` activo, CSS/JS cancela reveals, paralajes y transiciones suaves | §2.4 |
| NF-11 | Consentimiento antes de terceros | Ninguna cookie no esencial o script de terceros (píxeles, analytics) sin consentimiento explícito del usuario; "Rechazar todo" tan accesible y visible como "Aceptar todo" | §3.2 |
| NF-12 | Página 404 útil | Vista personalizada y sobria con enlaces directos a Home, Producto y Soporte; sin dead ends | §6 (QA checklist) |
| NF-13 | Formulario de demo (fiabilidad) | Errores inline justo debajo del campo afectado (prohibido `alert()`); sin pérdida de datos al fallar la validación; bloqueo de doble envío (botón deshabilitado + estado "Enviando..."); degradación elegante con correo alternativo si falla el envío | §4 |

El spec no funcional no declara valor numérico para ninguna puerta adicional de esta IA más
allá de las listadas; no se inventó ningún valor. Cualquier umbral nuevo debe importarse
desde el spec, nunca definirse en este documento.

------------------------------------------------------------------------

# 19. Open Decisions

  ID         Decision                               Status
  ---------- -------------------------------------- ----------------------------
  OD-IA-01   Dominio / URL canónica                 `OPEN`
  OD-IA-02   Subpath vs subdomain para NHILOS POS   `OPEN`
  OD-IA-03   Operación final de demo                `EVIDENCE_REQUIRED / OPEN`
  OD-IA-04   Buyer principal / ICP definitivo       `EVIDENCE_REQUIRED`
  OD-IA-05   Pricing público                        `OPEN`
  OD-IA-06   Casos y clientes publicables           `EVIDENCE_REQUIRED`
  OD-IA-07   Inventario de screenshots / video      `EVIDENCE_REQUIRED`
  OD-IA-08   Keyword research                       `OPEN`
  OD-IA-09   Mercado y localización inicial         `OPEN`
  OD-IA-10   Analytics / privacy implementation     `OPEN`
  OD-IA-11   Brand Identity System                  `DEFERRED`
  OD-IA-12   Claims funcionales publicables         `EVIDENCE_REQUIRED`
  OD-IA-13   Legal copy: privacidad / términos      `EVIDENCE_REQUIRED`

Estas decisiones no invalidan la IA aprobada. Deben resolverse antes de
publicar las superficies que dependan de ellas.

------------------------------------------------------------------------

# 20. Next Execution Sequence

``` text
IA + Content Wireframe v1.0 — APPROVED
        ↓
Claim verification pass
        ↓
Legal / privacy gate
        ↓
Real product media inventory
        ↓
Homepage detailed copy/content pass
        ↓
Product page detailed copy/content pass
        ↓
Visual exploration
        ↓
Website prototype
        ↓
Non-functional acceptance spec
        ↓
Build
```

No se requiere otra reinterpretación de la IA antes de pasar a contenido
detallado y prototipo.

# 21. Definition of Done

Este documento está listo para promoción como autoridad de IA cuando:

-   la IA haya sido auditada;
-   el sitemap lógico haya sido validado;
-   la homepage narrative haya sido validada como estructura;
-   product / implementation / support / resources hayan sido revisados;
-   CTA y demo flow tengan definición conceptual suficiente;
-   claims y evidence gaps estén explícitamente controlados;
-   no existan blockers estructurales.

**Estado:** todos los criterios anteriores están cerrados en v1.0.

Las decisiones técnicas y operativas downstream permanecen abiertas y
deben resolverse mediante sus propios gates.

**Target promotion achieved:**

> `Version 1.0 — APPROVED / AUTHORITATIVE WEBSITE INFORMATION ARCHITECTURE & CONTENT WIREFRAME`

------------------------------------------------------------------------

# 22. Surgical Correction Register

  -------------------------------------------------------------------------
  ID                      Correction                Result
  ----------------------- ------------------------- -----------------------
  SC-01                   Eliminada duplicación     CLOSED
                          entre `/como-funciona` y  
                          Operación.                

  SC-02                   Consolidada la jerarquía  CLOSED
                          de Implementación y       
                          Soporte bajo la           
                          experiencia de NHILOS     
                          POS, sin forzar una URL   
                          técnica.                  

  SC-03                   Reducida la navegación    CLOSED
                          primaria a los nodos      
                          realmente necesarios.     

  SC-04                   Alineado el CTA a         CLOSED
                          `Solicitar una demo`,     
                          manteniendo su primacía   
                          GTM como propuesta        
                          pendiente.                

  SC-05                   Ampliada la product page  CLOSED
                          para cubrir Continuidad,  
                          Control/Visibilidad,      
                          Roles, Proof,             
                          Hardware/compatibility,   
                          FAQs y límites            
                          relevantes.               

  SC-06                   Eliminados destinos de    CLOSED
                          navegación que asumían    
                          capacidades específicas   
                          no verificadas, como      
                          `dashboard` como destino  
                          autónomo.                 

  SC-07                   Incorporados Legal y      CLOSED
                          governance de             
                          contacto/demo sin         
                          inventar operación.       

  SC-08                   Separada aprobación       CLOSED
                          estructural de claims,    
                          pricing, buyer/ICP, proof 
                          y URL técnica.            

  SC-09                   Ajustado SEO para         CLOSED
                          reflejar la IA aprobada y 
                          evitar una content        
                          factory.                  

  SC-10                   Añadidas reglas contra    CLOSED
                          duplicación e inflación   
                          de navegación.            

  SC-11                   Importados los gates no   CLOSED
                          funcionales del spec
                          (WCAG, CWV, peso,
                          targets, contraste,
                          404, consentimiento,
                          formularios) como §18.1
                          con condición de
                          sign-off.

  SC-12                   Corregido el registro
                          falso "Consistencia con
                          Website Brief: PASS"; la
                          reconciliación de rutas
                          queda documentada por
                          decisión explícita.       CLOSED

  SC-13                   Alineada la navegación
                          móvil con la primaria de
                          escritorio:
                          `Implementación` es de
                          primer nivel en ambos
                          breakpoints.              CLOSED
  -------------------------------------------------------------------------

# 23. Short Re-Audit --- Closure

**Resultado: PASS --- 10/10 checks closed --- 0 blockers --- 0 high
findings.**

  Check                               Result
  ----------------------------------- --------
  Consistencia con Website Brief      RECONCILIADO (ver registro abajo)
  Consistencia con Brand Experience   PASS
  Exceso de páginas / navegación      PASS
  Gaps de contenido crítico           PASS
  Homepage vs Product Page boundary   PASS
  Claims accidentales como hechos     PASS
  SEO / IA                            PASS
  CTA hierarchy                       PASS
  Mobile IA                           PASS
  Open decisions correctly bounded    PASS

### Registro de reconciliación con el Website Brief

La versión anterior de este bloque registraba "Consistencia con Website Brief: PASS" mientras
el Brief v1.0 §5 prescribía rutas de capacidad de primer nivel (`/inventario`, `/fiscal`,
`/hardware`, `/dashboard`) que esta IA nunca contuvo y que su regla `N-03` prohíbe. Ese PASS
era falso por silencio. La reconciliación se resolvió **por decisión explícita**, no por
omisión:

- el Brief dejó de prescribir rutas: su §5 fue reescrito como mensajes por capacidad, sin rutas;
- la IA es dueña de la navegación y las rutas; el Brief es dueño del messaging
  (`nhilos_branding_document_governance_v1.0.md` §6, corregido en esa misma remediación);
- el conflicto previo queda registrado aquí y en el registro de correcciones quirúrgicas
  (SC-11..SC-13).

### Closure statement

La arquitectura queda **cerrada y aprobada** para pasar a la siguiente
etapa. La aprobación no autoriza publicación automática de copy, claims,
proof, pricing, legal ni promesas operativas: esos elementos conservan
sus gates de evidencia correspondientes.
