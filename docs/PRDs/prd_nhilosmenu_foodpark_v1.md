# PRD — NhilosMenu Food Park V1

**Documento:** `docs/PRDs/prd_nhilosmenu_foodpark_v1.md`
**Estado:** **APPROVED / AUTHORITATIVE — NhilosMenu Food Park V1**
**Versión:** 1.0
**Fecha:** 2026-09-19
**Baseline:** `odd/tasks/nhilosmenu-foodpark-product-docs.md` — congelamiento de decisiones V1 completado y aprobado por el propietario del producto
**Rama de documentación:** `docs/nhilosmenu-foodpark-prd` (creada desde `origin/main` en `ab5e818`)
**Idioma del documento:** Español (el modelo de contenido es i18n-ready; ver D-13)

---

## Resultado aprobado

**NhilosMenu Food Park** le da a cada emprendedor de un Food Park un menú digital alojado, en español, actualizado desde su propio POS y compartible por QR o enlace, con contacto por WhatsApp contextual. El consumidor escanea, ve el menú real del negocio —precios finales en córdobas, disponibilidad honesta, alérgenos declarados— y escribe por WhatsApp si quiere consultar o pedir. **El menú no vende: informa y conecta.**

Este PRD es la autoridad de producto de NhilosMenu Food Park V1. Toda decisión marcada como **vinculante** (sección 1) es normativa: ninguna implementación, especificación técnica o prueba puede contradecirla sin una revisión explícita de este documento. El insumo comercial inmediato es el piloto de diseño con SOHO; la expansión y cualquier reprecio están condicionados por evidencia operativa, no por proyecciones.

### Ruta rápida de lectura

1. **Decisiones congeladas:** sección 1 (D-01…D-20) — es el contrato.
2. **Qué construye y qué no:** secciones 5 (boundary) y 21 (non-goals).
3. **Cómo se verifica:** sección 22 (criterios de aceptación AC-01…AC-33).
4. **Qué queda abierto y quién lo resuelve:** sección 24 (decisiones de implementación, no de producto).

---

## 1. Decisiones vinculantes de V1

Las siguientes decisiones están **cerradas y aprobadas**. Cualquier cambio posterior exige revisión explícita de este PRD. Cada decisión tiene un identificador estable usado en la trazabilidad (sección 25).

| ID | Decisión | Alcance normativo |
|----|----------|-------------------|
| **D-01** | Nombre de producto: **NhilosMenu Food Park** | Toda superficie, URL, QR y comunicación usa este nombre en V1. |
| **D-02** | El tenant/cliente es el **emprendedor con su negocio individual** dentro del Food Park (por ejemplo, SOHO), **no** el dueño del venue del Food Park. | Cuentas, datos, facturación y aislamiento pertenecen al negocio del emprendedor. |
| **D-03** | Resultado para el consumidor: **menú digital alojado + contacto contextual por WhatsApp**. Sin carrito, sin toma de pedidos, sin pagos, sin integración con datáfonos bancarios. | La superficie pública es informativa y de contacto; ningún flujo de compra existe en V1. |
| **D-04** | Catálogo: **selección curada de productos del POS**. No existe una fuente paralela de productos ni de precios. | Cada elemento del menú referencia un producto del POS; el contenido editorial se superpone, nunca reemplaza. |
| **D-05** | Precio público: **precio final de venta del POS, únicamente en NIO**. | El menú público muestra el precio tal como lo cobraría el POS; sin conversiones ni precios editoriales. |
| **D-06** | Disponibilidad: estado manual `AVAILABLE / SOLD_OUT` desde el POS local. **Nunca se infiere del inventario.** | El agotado es una declaración del negocio, no un cálculo de existencias o recetas. |
| **D-07** | Contenido gestionado: imágenes, descripciones, ingredientes, **alérgenos estructurados**, variantes/modificadores, destacados editoriales y **promociones respaldadas por el POS**. | El menú enriquece el catálogo del POS con contenido de autoría del negocio. |
| **D-08** | Alérgenos: declaración **manual y revisada**; el **OWNER confirma la responsabilidad al publicar**; el menú público muestra una **advertencia de trazabilidad** obligatoria. | Publicar sin confirmación de alérgenos del OWNER está bloqueado. |
| **D-09** | Publicación: **un borrador y un menú publicado activo**, versionado, con **vista previa y rollback**. | Nunca hay dos versiones públicas activas; el historial de versiones es inmutable. |
| **D-10** | Roles: **MANAGER puede editar borradores, crear y desactivar colocaciones QR y ver la analítica anónima**; **solo el OWNER publica, despublica, cambia la URL pública/ajustes de WhatsApp y confirma declaraciones de alérgenos**. | La autoridad de publicación, URL/WhatsApp y alérgenos es exclusiva del OWNER; la autoría, las colocaciones QR y la lectura de funnel son delegables al MANAGER. |
| **D-11** | Acceso público: **URL estable de NhilosMenu**, compartible **sin autenticación**, con `noindex`/`nofollow` y **excluida de sitemaps**. | El menú es accesible por enlace/QR, no por descubrimiento en buscadores. |
| **D-12** | QR: colocaciones gestionadas **por tipo de fuente** (`COUNTER`, `TABLE`, `ENTRANCE`, `SOCIAL`), **no por mesa individual**. | Una colocación `TABLE` sirve a todas las mesas; no existe identidad por mesa. |
| **D-13** | Idioma: **español en V1**, con **modelo de contenido i18n-ready**; **sin traducción automática**. | El esquema de contenido no hardcodea el español; V1 no traduce. |
| **D-14** | Analítica: **funnel agregado y anónimo únicamente**; sin identidad del consumidor ni PII. | Ningún evento público identifica a una persona; no hay tracking cross-site. |
| **D-15** | WhatsApp: **consulta contextual prellenada** con negocio/producto/URL del menú; **sin pedido estructurado**. | El botón abre un mensaje redactado; la conversación y el pedido ocurren fuera del producto. |
| **D-16** | Medios: imágenes **subidas, validadas, optimizadas, con cuota controlada y servidas por NhilosMenu**. | El menú público no sirve hotlinks externos; la plataforma controla el pipeline de medios. |
| **D-17** | Offline: el menú público sirve el **último snapshot publicado en edge/CDN**; disponibilidad POS desactualizada dispara una **advertencia honesta** y **nunca bloquea la venta local del POS**. | La caída de internet degrada la frescura, jamás la operación de caja. |
| **D-18** | Empaquetado: durante el piloto, **Food Park es un perfil operativo dentro de la oferta pública existente `OmniFood Operación`**, **no un SKU ni un tier separado**; **NhilosMenu es entitlement core de ese perfil**. SOHO conserva su precio fundador de **USD 79/mes** durante su término fundador vigente; el precio público de **USD 89/mes no cambia durante el piloto**. Un tier/SKU distinto es decisión de precio **post-piloto**, habilitada solo por evidencia de las compuertas D-20. | NhilosMenu Food Park no se vende como SKU/add-on separado en V1. |
| **D-19** | Validación: **piloto design-partner con SOHO**, luego **3–5 negocios de Food Park antes de GA o reprecio**. | La secuencia de validación es obligatoria y ordenada. |
| **D-20** | Compuertas de GA/reprecio: **confiabilidad operativa, adopción del dueño, uso real del consumidor y disposición comercial a pagar** — **todas obligatorias**. | Ninguna compuerta puede omitirse ni sustituirse por evidencia parcial. |

---

## 2. Tesis de producto

En un Food Park, cada kiosco compite por atención con vecinos a metros de distancia y con un consumidor que decide en segundos desde el celular. El menú impreso se desactualiza, el agotado se entera en la caja y la consulta termina —o no— en un chat de WhatsApp que el negocio no controla como superficie.

**NhilosMenu Food Park** convierte el catálogo que el emprendedor ya administra en su POS en una superficie pública viva: precios que son los que cobra la caja, agotados que declara el propio negocio, alérgenos declarados con responsabilidad confirmada, y un puente directo a WhatsApp con el contexto exacto de lo que el consumidor está viendo.

La tesis comercial es que el **valor está en la publicación integrada y en la conversión a contacto**, no en generar imágenes de QR: generar un QR de un enlace de Google Drive ya existe (el dashboard de dueños lo entrega hoy); lo que no existe para este mercado atendido es un menú que nace del POS, se mantiene honesto y convierte la atención en conversación. La adopción nicaragüense y la disposición a pagar **no están probadas**: ese es exactamente el trabajo del piloto (D-19, D-20), no una suposición de este documento.

**Pregunta rectora de diseño:** *¿Cómo funciona esto cuando el WiFi del Food Park se cae?* Respuesta normativa: la caja sigue vendiendo (D-17, AC-20) y el menú público sirve su último snapshot publicado con advertencia de frescura (AC-18, AC-19).

---

## 3. Personas

### 3.1 Emprendedor / OWNER del negocio (tenant)

Dueño de un kiosco o negocio dentro de un Food Park. Es el cliente que paga el plan. Administra su catálogo en el POS, quiere que su menú público refleje la realidad de su caja sin doble carga de datos, y decide qué se publica y cuándo. Publica, despublica, confirma alérgenos y configura su URL y WhatsApp (D-10). Su éxito se mide en consultas WhatsApp recibidas con contexto, no en visitas vagas.

### 3.2 MANAGER del negocio

Personal de confianza del emprendedor. Prepara y edita el borrador del menú: descripciones, fotos, destacados, organización. **No puede publicar** ni tocar URL, WhatsApp ni confirmación de alérgenos (D-10). Su trabajo reduce la carga operativa del OWNER sin diluir su autoridad.

### 3.3 Consumidor del Food Park

Persona en el venue con un teléfono móvil. Escanea un QR o abre un enlace compartido. No crea cuenta, no inicia sesión, no deja datos (D-11, D-14). Quiere ver qué hay, cuánto cuesta en córdobas, qué está agotado y cómo consultar. Su paciencia es corta: el menú debe cargar rápido en móvil y sin fricción (ver evidencia de Ipsos, sección 23).

### 3.4 Operador de plataforma (OmniFood)

Equipo que opera la plataforma. No escribe contenido de menús de los tenants. Provisiona tenants, observa salud del servicio y anonimiza/agrega métricas. Toda su acción sobre datos de tenants está aislada y auditada (sección 16).

### 3.5 Fuera de alcance como personas

El **dueño del venue del Food Park**, el **cajero** y el **mesero** no son personas de este producto en V1: el venue no tiene cuenta (D-02, non-goal NG-01) y CASHIER/WAITER no tienen superficie de autoría de menús (heredan el RBAC existente de identidad; ver sección 15).

---

## 4. Lenguaje de dominio

| Término | Definición normativa |
|---------|----------------------|
| **Tenant** | El negocio individual del emprendedor dentro del Food Park (D-02). Toda entidad de este producto pertenece a exactamente un tenant. |
| **Menú** | La superficie pública publicable de un tenant. En V1 existe **un borrador** y **como máximo una versión publicada activa** (D-09). |
| **Elemento de menú (menu item)** | Referencia curada a un **producto del POS** con contenido editorial superpuesto (D-04). No es un producto nuevo. |
| **Snapshot público** | Representación inmutable de una versión publicada, servida por edge/CDN sin depender del POS ni de la base de autoría en caliente (D-17). |
| **Disponibilidad declarada** | Estado manual `AVAILABLE / SOLD_OUT` que el negocio fija desde el POS (D-06). Nunca se deriva de inventario, recetas ni existencias. |
| **Alérgeno estructurado** | Declaración manual categorizada sobre un elemento de menú, revisada y confirmada por el OWNER al publicar (D-08). |
| **Destacado editorial** | Marcado de autoría del negocio sobre elementos de menú, sin efecto en precios ni en el POS (D-07). |
| **Promoción respaldada por el POS** | Promoción existente del motor de promociones del POS que el menú refleja; el menú no crea promociones (D-04, D-07). |
| **Colocación QR (placement)** | Código QR gestionado por tipo de fuente: `COUNTER`, `TABLE`, `ENTRANCE`, `SOCIAL` (D-12). |
| **Consulta contextual (WhatsApp)** | Mensaje prellenado con contexto de negocio/producto/menú que abre la conversación (D-15). No es un pedido. |
| **Funnel anónimo** | Métrica agregada sin identidad: vistas de menú → vistas de elemento → toques de WhatsApp, atribuibles a colocación de forma agregada (D-14). |
| **Cuota de medios** | Límite por tenant de almacenamiento de imágenes gestionadas por NhilosMenu (D-16). |
| **Frescura** | Antigüedad del último dato sincronizado (precio/disponibilidad) respecto al POS; se divulga honestamente cuando degrada (D-17). |

---

## 5. Boundary de producto

### 5.1 Dentro de V1

- Menú digital alojado por tenant, en español, móvil-primero.
- Autoría de contenido (borrador) en la superficie web del dueño (Owner Dashboard).
- Publicación versionada con vista previa y rollback.
- Servicio público del snapshot publicado por URL estable y colocaciones QR.
- Estado de disponibilidad manual sincronizado desde el POS.
- Contacto contextual por WhatsApp.
- Funnel analítico anónimo.
- Gestión de medios con cuota.
- Empaquetado como entitlement core del perfil operativo Food Park dentro de `OmniFood Operación` (D-18).

### 5.2 Fuera de V1 (non-goals)

Ver sección 21. En una frase: **el venue, el marketplace, el carrito, el pago, la factura y el SEO de descubrimiento no existen en este producto.**

### 5.3 Relación con productos existentes

| Producto existente | Relación con NhilosMenu Food Park V1 |
|---|---|
| **POS OmniCore (Flutter, offline-first)** | Fuente de verdad de productos, precios finales en NIO, promociones y estado manual de disponibilidad. El menú consume; jamás escribe en el POS. |
| **Admin backend (NestJS, multi-tenant)** | Superficie de autoría y publicación; aislamiento por `tenant_id` del JWT (sección 16). |
| **Owner Dashboard (React SPA)** | Hospeda la experiencia de autoría del OWNER/MANAGER, junto al generador de QR ya existente (`/menu-qr`), que resuelve el caso ad-hoc anterior y queda como utilidad independiente. |
| **Loyalty V1** | Sin acoplamiento en V1. El menú público no porta identidad de consumidor ni ledger (non-goal NG-04). Un portal de consumidor futuro de Loyalty es un producto separado con PRD propio. |
| **Onboarding V2** | El tenant llega a NhilosMenu ya `ACTIVATED` como negocio POS; la activación del menú es una capacidad posterior del plan, no parte del contrato de onboarding. |

---

## 6. Ciclo de vida del menú

### 6.1 Estados del menú

```text
DRAFT (borrador editable)
   │  OWNER publica (con confirmación de alérgenos vigente)
   ▼
PUBLISHED (exactamente una versión activa pública)
   │  OWNER despublica
   ▼
UNPUBLISHED (URL pública muestra página neutral; sin filtración de borrador)
   │  OWNER vuelve a publicar (nueva versión o rollback a versión previa)
   ▼
PUBLISHED ...
```

### 6.2 Reglas normativas del ciclo

1. **Un borrador y una versión publicada activa** por tenant (D-09). No existen borradores múltiples ni publicaciones paralelas.
2. Cada publicación crea una **versión inmutable**: el **contenido editorial** publicado (descripciones, imágenes, alérgenos, destacados, estructura) nunca se edita en caliente; todo cambio editorial pasa por el borrador y una nueva publicación.
3. **Capa operativa mutable:** el **precio** y la **disponibilidad** NO forman parte del contenido editorial versionado: son una **capa operativa** sincronizada sobre el snapshot publicado, que se actualiza por el contrato de frescura (sección 11) **sin republicación ni reescritura de versiones**.
4. **Vista previa:** el borrador puede previsualizarse con fidelidad de publicación antes de publicar; la vista previa **no es accesible públicamente** ni indexable.
5. **Rollback:** publicar nuevamente una versión anterior del historial la convierte en la nueva versión activa; el historial completo se conserva y es auditable.
6. **Despublicar** es inmediato para el servicio público: la URL deja de servir el menú y muestra una página neutral, sin contenido de borrador ni de versiones pasadas.
7. **Compuerta de alérgenos:** la publicación exige que la confirmación de responsabilidad de alérgenos del OWNER esté vigente para el contenido a publicar (D-08, AC-07).
8. **Elementos del catálogo:** si un producto referenciado se elimina o desactiva en el POS, el elemento de menú debe resolverse antes de la siguiente publicación (EC-02); el snapshot activo no se reescribe retroactivamente.

---

## 7. Requerimientos funcionales

Los requerimientos usan lenguaje normativo (DEBE). Cada FR referencia las decisiones que lo originan.

### FR-01 — Curación de catálogo (D-04)

- El sistema DEBE permitir al OWNER/MANAGER seleccionar productos existentes del POS como elementos de menú.
- Cada elemento de menú DEBE referenciar el identificador del producto del POS; el sistema NO DEBE permitir crear productos ni precios nuevos desde el menú.
- El menú NO DEBE constituir una segunda fuente de verdad de productos o precios.

### FR-02 — Contenido editorial (D-07)

- Cada elemento de menú PUEDE tener: descripción, ingredientes, imágenes gestionadas, variantes/modificadores visibles, marcado de destacado editorial y vínculo a promociones respaldadas por el POS.
- El contenido editorial es propiedad del tenant y se superpone al producto del POS sin modificarlo.
- Las promociones mostradas DEBEN provenir del motor de promociones del POS; el menú NO DEBE crear ni simular promociones propias.

### FR-03 — Alérgenos (D-08)

- El sistema DEBE soportar declaración manual de alérgenos estructurados por elemento de menú.
- La ausencia de declaración DEBE representarse honestamente (por ejemplo, "alérgenos no declarados"), nunca como "sin alérgenos".
- La publicación DEBE exigir confirmación explícita de responsabilidad del OWNER sobre los datos de alérgenos vigentes.
- El menú público DEBE mostrar una advertencia de trazabilidad sobre el carácter declarado por el negocio de la información de alérgenos.

### FR-04 — Disponibilidad manual (D-06)

- El estado `AVAILABLE / SOLD_OUT` se fija manualmente desde el POS local. Esta capacidad manual **es una fundación de implementación requerida por este producto, no una capacidad verificada como ya entregada**: es **distinta de `products.is_active`** (la activación de catálogo no es disponibilidad de menú) y DEBE estar **entregada y probada antes de habilitar cualquier sincronización de disponibilidad pública** (compuerta de dependencia; ver `docs/plans/foodpark/nhilosmenu_foodpark_execution_roadmap.md`).
- El sistema NO DEBE inferir disponibilidad desde inventario, recetas, BOM, existencias **ni desde el flag de activación del producto**.
- El elemento agotado DEBE verse distinto en el menú público (por ejemplo, atenuado con etiqueta "Agotado") sin desaparecer silenciosamente.

### FR-05 — Publicación versionada (D-09)

- El sistema DEBE mantener un borrador editable y como máximo una versión publicada activa.
- Publicar DEBE crear una versión inmutable con timestamp y actor.
- El sistema DEBE ofrecer vista previa del borrador con fidelidad de publicación, no accesible públicamente.
- El sistema DEBE permitir rollback publicando una versión anterior del historial.
- Despublicar DEBE retirar el menú del servicio público de forma inmediata.

### FR-06 — URL pública y acceso (D-11)

- Cada tenant con menú publicado DEBE tener una URL estable de NhilosMenu, compartible sin autenticación.
- La URL NO DEBE cambiar al republicar ni al hacer rollback.
- La superficie pública DEBE servir `noindex`/`nofollow` y estar excluida de sitemaps generados por la plataforma.
- La URL NO DEBE exponer identificadores de otros tenants ni permitir enumeración de menús.

### FR-07 — Colocaciones QR (D-12)

- El sistema DEBE gestionar QR por tipo de fuente: `COUNTER`, `TABLE`, `ENTRANCE`, `SOCIAL`.
- El sistema NO DEBE generar identidad ni contexto por mesa individual.
- Cada colocación DEBE codificar la URL pública estable; la atribución de colocación puede viajar como etiqueta agregada y anónima (D-14).
- Cada colocación gestionada DEBE codificar **únicamente la URL pública canónica de NhilosMenu del tenant**; las colocaciones NO DEBEN codificar URLs arbitrarias externas ni heredar ese comportamiento de la utilidad `/menu-qr` del dashboard. De dicha utilidad solo se reutiliza el contrato técnico local de generación y descarga (payload acotado, sin servicios QR externos).

### FR-08 — WhatsApp contextual (D-15)

- El menú público DEBE ofrecer contacto por WhatsApp con mensaje prellenado que incluya el nombre del negocio y, cuando aplique, el producto consultado y la URL del menú.
- El sistema NO DEBE estructurar ni capturar el pedido: sin carrito, sin formulario de orden, sin confirmación de pedido.
- El número de WhatsApp es configuración del tenant, modificable únicamente por el OWNER (D-10).

### FR-09 — Medios gestionados (D-16)

- Las imágenes del menú DEBEN subirse a NhilosMenu, validarse (tipo y tamaño), optimizarse para servicio web/móvil y respetar la cuota por tenant.
- El menú público NO DEBE servir imágenes por hotlink externo.
- El exceso de cuota DEBE producir un error honesto y accionable, sin degradar silenciosamente el contenido existente (EC-04).

### FR-10 — Analítica anónima (D-14)

- El sistema DEBE registrar funnel agregado: vistas de menú, vistas de elemento y toques de WhatsApp, atribuibles por colocación de forma agregada.
- El sistema NO DEBE registrar identidad del consumidor, PII, huellas identificables persistentes ni tracking cross-site.
- El OWNER DEBE poder consultar su funnel agregado desde la superficie del dueño.

### FR-11 — Modelo i18n-ready (D-13)

- El modelo de contenido DEBE almacenar el texto con marca de idioma, sin asumir un único idioma en el esquema.
- V1 DEBE servir contenido en español y NO DEBE traducir automática ni manualmente a otros idiomas.

### FR-12 — Precio público (D-05)

- El menú público DEBE mostrar el precio final de venta del POS en NIO, sin conversión de moneda y sin precios editoriales.
- El precio mostrado NO DEBE contradecir el precio vigente del POS; la frescura del precio está sujeta al contrato de sincronización (sección 11) y su degradación se divulga honestamente.

---

## 8. Experiencia del consumidor

**Camino feliz:** el consumidor escanea un QR en el mostrador, la entrada o la mesa (o abre un enlace de redes sociales) → el menú carga rápido en su móvil, sin app, sin cuenta, sin login → ve el nombre del negocio, los elementos con fotos, descripciones y precios finales en C$ → ve qué está agotado → toca "Consultar por WhatsApp" y llega al chat con el contexto ya escrito.

Reglas normativas de experiencia:

1. **Sin fricción de entrada:** sin autenticación, sin instalación, sin cookie wall (D-11, D-14).
2. **Honestidad visible:** precios que son los de la caja (D-05); agotados declarados por el negocio (D-06); alérgenos con su advertencia de trazabilidad (D-08); frescura divulgada cuando degrada (D-17).
3. **Contacto, no checkout:** el único llamado a la acción transaccional es WhatsApp (D-15). No existen botones de comprar, carrito ni pago (D-03).
4. **Móvil-primero:** la superficie pública se diseña primero para teléfono de gama media en red móvil; el rendimiento es NFR (sección 20).
5. **Accesibilidad básica:** imágenes con texto alternativo, contraste legible y navegación simple; el detalle normativo mínimo está en NFR-06.

---

## 9. Experiencia del dueño

**Camino feliz del OWNER:** entra al Owner Dashboard → abre NhilosMenu → curva elementos desde su catálogo del POS → completa descripciones, fotos y alérgenos → previsualiza → confirma responsabilidad de alérgenos → publica → comparte sus QR por colocación → observa su funnel anónimo y recibe consultas WhatsApp con contexto.

Reglas normativas:

1. **Cero doble captura de precios:** el precio viene del POS (D-04, D-05). El dueño nunca digita un precio para el menú.
2. **Autoría delegable, publicación no:** el MANAGER prepara; el OWNER publica (D-10).
3. **Vista previa fiel:** lo que el dueño previsualiza es lo que el consumidor verá (D-09).
4. **Rollback sin drama:** volver a la versión anterior es una acción explícita del OWNER desde el historial (D-09).
5. **QR inmediato:** las colocaciones QR se generan y descargan localmente desde el dashboard, reutilizando el contrato técnico de la utilidad `/menu-qr` existente pero codificando únicamente la URL pública canónica (FR-07).
6. **Métrica honesta:** el funnel es agregado y anónimo; el dueño ve tendencias, no perfiles de personas (D-14).

---

## 10. Propiedad de datos y catálogo

| Dato | Fuente de verdad | Escritura desde NhilosMenu |
|---|---|---|
| Productos, precios finales NIO, variantes/modificadores | POS (SQLite local → espejo cloud) | **No.** Solo lectura/referencia. |
| Promociones | Motor de promociones del POS | **No.** Solo reflejo. |
| Disponibilidad `AVAILABLE / SOLD_OUT` | Declaración manual en el POS | **No.** El menú la consume. |
| Descripciones, ingredientes, alérgenos, destacados, imágenes de menú | NhilosMenu (contenido del tenant) | Sí, por OWNER/MANAGER según roles. |
| URL pública, número de WhatsApp, colocaciones QR | NhilosMenu (configuración del tenant) | Sí, solo OWNER. |
| Versiones publicadas y historial | NhilosMenu (inmutable, append-only) | No se editan; solo se republica. |
| Eventos de funnel anónimo | NhilosMenu (agregados) | No editable por el tenant. |

Regla transversal: **ningún write de NhilosMenu modifica el catálogo, precios, promociones, inventario ni ventas del POS.** El menú es consumidor del POS y dueño exclusivo de su contenido editorial.

---

## 11. Sincronización, frescura y semántica offline

### 11.1 Modelo de servicio público

1. El menú público se sirve desde el **último snapshot publicado** en edge/CDN (D-17). El servicio público NO DEBE depender de la disponibilidad del POS, de la base de autoría en caliente ni de la WAN del negocio.
2. La disponibilidad declarada se sincroniza desde el POS hacia el snapshot según el contrato de sincronización **—previa entrega y prueba de la fundación manual de disponibilidad del POS (FR-04)—**; mientras el dato esté fresco, el menú la refleja.
3. Cuando la sincronización de disponibilidad (o de precio) está desactualizada más allá del umbral definido en la compuerta de diseño (OD-03, previa a la implementación de la sincronización pública), el menú público DEBE mostrar una **advertencia honesta de frescura** (por ejemplo, "Disponibilidad posiblemente desactualizada") en lugar de presentar el dato como vigente (D-17, AC-19).
4. La advertencia de frescura es informativa: **nunca bloquea ni degrada la operación de venta del POS**, que es offline-first por diseño (D-17, AC-20).

### 11.2 Principios heredados

- **Offline-first o muerte:** la caída de internet del negocio no detiene la caja; la caída de sincronización solo degrada la frescura del menú con divulgación honesta. Este principio replica la disciplina de Loyalty V1 (operación local sin WAN, nube como espejo eventual) y de Onboarding V2 (lo obligatorio offline es la operación resultante).
- **Sin balances paralelos:** igual que Loyalty no mantiene saldos independientes, NhilosMenu no mantiene precios ni productos paralelos: todo dato comercial del menú deriva del POS o es contenido editorial explícito del tenant.
- **Idempotencia de sincronización:** reintentos de sincronización de disponibilidad no duplican ni corrompen el estado del snapshot; el mecanismo técnico exacto es decisión de diseño (sección 24).

### 11.3 Qué NO requiere V1

- Edición de menú offline desde el POS: la autoría ocurre en la superficie web del dueño y puede requerir conectividad (mismo patrón que Setup Center en Onboarding V2). Lo obligatorio offline es la **venta en el POS** y el **servicio del snapshot público**, no la autoría.
- Actualización del snapshot en tiempo real: la frescura objetivo es NFR (sección 20), no tiempo real.

---

## 12. Contrato de medios

1. **Ingesta:** las imágenes se suben desde la superficie del dueño a NhilosMenu; el sistema valida tipo y tamaño antes de aceptar (D-16).
2. **Optimización:** el sistema genera variantes optimizadas para servicio móvil/web; el original no se sirve directamente al público.
3. **Cuota:** cada tenant tiene una cuota de almacenamiento de medios; el consumo es visible para el OWNER; el exceso produce error honesto (FR-09, EC-04).
4. **Servicio:** el menú público sirve imágenes desde la infraestructura de NhilosMenu; los hotlinks externos no forman parte del contrato (D-16).
5. **Ciclo de vida:** eliminar una imagen de un borrador no rompe snapshots ya publicados: las versiones publicadas conservan acceso a los medios de su versión inmutable.
6. **Accesibilidad:** toda imagen de menú admite texto alternativo editado por el negocio (NFR-06).

Los números concretos de cuota, formatos y tamaños máximos son decisión de diseño posterior (sección 24); este PRD fija el contrato, no las cifras.

---

## 13. Analítica anónima

1. **Eventos del funnel:** `menu_view`, `item_view`, `whatsapp_tap`, agregados por tenant y, de forma agregada, por colocación (D-14).
2. **Prohibido:** identidad del consumidor, PII, cookies de tracking, fingerprinting persistente, seguimiento cross-site, perfiles individuales.
3. **Atribución de colocación:** la colocación viaja como etiqueta agregada en el evento; no construye identidad ni historial de persona.
4. **Visibilidad:** el OWNER consulta su funnel agregado; no existen vistas que desagreguen a individuos.
5. **Retención:** los agregados se conservan según la política definida en diseño; los eventos crudos, si existen, se agregan y purgan según ese contrato (sección 24).

---

## 14. WhatsApp

1. El contacto es una **consulta contextual prellenada**: negocio, producto (cuando aplique) y URL del menú (D-15).
2. **No hay pedido estructurado:** el producto no captura, valida ni confirma pedidos; la conversación vive en WhatsApp (D-03, D-15).
3. El número de WhatsApp es **configuración del tenant**, editable solo por el OWNER (D-10).
4. Si el dispositivo del consumidor no puede abrir WhatsApp, el sistema DEBE degradar honestamente (mostrar el número para contacto manual) sin simular envío (EC-06).
5. El toque de WhatsApp se cuenta en el funnel anónimo (FR-10).

---

## 15. Roles y auditoría

### 15.1 Matriz de permisos de NhilosMenu

Se apoya en el RBAC existente de identidad (OWNER/MANAGER/CASHIER/WAITER, permisos granulares, auditoría append-only). La autorización real se evalúa por permiso, no por nombre de rol.

| Acción | OWNER | MANAGER | CASHIER / WAITER |
|---|:---:|:---:|:---:|
| Editar borrador (contenido, medios, curación) | Sí | Sí | No |
| Vista previa del borrador | Sí | Sí | No |
| **Publicar / despublicar / rollback** | **Solo OWNER** | No | No |
| **Confirmar responsabilidad de alérgenos** | **Solo OWNER** | No | No |
| **Cambiar URL pública / ajustes de WhatsApp** | **Solo OWNER** | No | No |
| Gestionar colocaciones QR | Sí | Sí (crear/desactivar; D-10) | No |
| Ver funnel anónimo | Sí | Sí (solo lectura; D-10) | No |
| Toggle `AVAILABLE / SOLD_OUT` | Vía POS (fundación requerida, FR-04) | Vía POS | Vía POS |

### 15.2 Auditoría

Quedan trazables al menos, con actor, tenant y timestamp, en una bitácora append-only dedicada a publicación de menús (`menu_publication_audit`), protegida por tenant y sin `UPDATE` ni `DELETE`:

- publicación, despublicación y rollback (con versión resultante);
- confirmación de responsabilidad de alérgenos (con contenido confirmado);
- cambios de URL pública y de configuración de WhatsApp;
- cambios de colocaciones QR.

La edición ordinaria de borrador es telemetría de producto, no necesariamente bitácora forense (mismo criterio de separación Audit/Telemetría que Onboarding V2).

---

## 16. Aislamiento multi-tenant y modelo de amenazas de acceso público

### 16.1 Aislamiento de autoría (superficie autenticada)

1. Toda lectura y escritura de autoría pertenece exactamente a un tenant, resuelto desde el JWT verificado (`tenant_id`), nunca desde valores enviados por el cliente (mismo contrato que el backend existente y Onboarding V2).
2. Un actor del Tenant A no puede leer ni escribir borrador, versiones, medios, configuración ni funnel del Tenant B.
3. RLS de PostgreSQL y predicados explícitos de tenant aplican a las entidades nuevas de NhilosMenu, con la misma disciplina defense-in-depth del backend.

### 16.2 Superficie pública (no autenticada): modelo de amenazas

| Amenaza | Contrato normativo |
|---|---|
| Enumeración de tenants/menús | La URL pública no permite listar menús de otros tenants; identificadores públicos no secuenciales ni predecibles; sin endpoints de listado público. |
| Filtración de borrador | El borrador y las vistas previas nunca son accesibles desde la superficie pública; solo snapshots de versiones publicadas activas. |
| Acceso a datos de otros tenants vía snapshot | El snapshot público expone únicamente el contenido publicado de su tenant; sin referencias cruzadas a datos de terceros. |
| Abuso de la superficie pública | La superficie pública es de solo lectura, sin writes; rate limiting y protección básica contra abuso son requisito de diseño (sección 24). |
| PII del consumidor | La superficie pública no solicita, captura ni persiste PII (D-14). |
| QR como bearer | El QR es un apuntador bearer a la URL pública: quien lo escanea ve el menú público, igual que quien recibe el enlace compartido. No es credencial ni expone datos sensibles (mismo principio que el `customerCode` bearer de Loyalty V1). |
| Contenido malicioso del tenant | La validación de medios y contenido sigue el contrato de validación de entrada del backend; el contenido del tenant no ejecuta código en el navegador del consumidor. |

### 16.3 Descubrimiento

El menú es **compartible, no descubrible**: `noindex`/`nofollow` y exclusión de sitemaps (D-11). El SEO de descubrimiento es non-goal (NG-07).

---

## 17. Límite DGI

**El menú público no es un documento fiscal y no participa en ningún flujo fiscal.**

1. NhilosMenu NO crea, numera, modifica ni anula facturas; no existe numeración fiscal en la nube desde este producto (D-03).
2. El cumplimiento DGI (DT 09-2007: numeración secuencial, inmutabilidad, anulación como único mecanismo de corrección) permanece exclusivamente en el POS/Sales.
3. El menú NO DEBE presentar desgloses de impuestos, series, folios ni ningún elemento que pueda confundirse con un comprobante fiscal. El precio mostrado es el precio final de venta (D-05).
4. El flujo WhatsApp es una consulta comercial; el pedido y su eventual facturación ocurren fuera del producto, por los canales del negocio.
5. Ningún cambio futuro de NhilosMenu puede introducir escritura sobre documentos fiscales sin un nuevo contrato de producto explícito y revisión DGI.

---

## 18. Precio, entitlement y política de piloto

### 18.1 Empaquetado (D-18)

- Durante el piloto, **Food Park es un perfil operativo dentro de la oferta pública existente `OmniFood Operación`** (documentada en `docs/finance/estrategia_comercializacion.md`), **no un SKU ni un tier separado**.
- **NhilosMenu es un entitlement core de ese perfil**: todo tenant del perfil operativo Food Park dispone de la capacidad sin cargo adicional.
- **SOHO** conserva su precio fundador de **USD 79/mes** durante su término fundador vigente; el precio público de **USD 89/mes no cambia durante el piloto**.
- Un **tier/SKU distinto para NhilosMenu es una decisión de precio post-piloto**, habilitada únicamente por la evidencia de las compuertas D-20; este PRD no la define.
- La implementación **no modifica** las condiciones generales de la oferta (implementación, soporte, hardware del cliente) documentadas en `docs/finance/FINANCIAL_STRATEGY.md` y `docs/finance/estrategia_comercializacion.md`.

### 18.2 Secuencia de validación (D-19)

```text
Piloto design-partner: SOHO
   │  evidencia operativa y de uso real
   ▼
3–5 negocios de Food Park
   │  evidencia multi-tenant y de disposición a pagar
   ▼
GA y/o reprecio (solo con compuertas D-20 cerradas)
```

### 18.3 Compuertas de GA/reprecio (D-20)

Todas obligatorias; ninguna puede omitirse ni sustituirse:

1. **Confiabilidad operativa** del servicio público y la sincronización (evidencia de operación, no demos).
2. **Adopción del dueño** (dueños publicando y manteniendo menús reales).
3. **Uso real del consumidor** (funnel anónimo con tráfico genuino, no pruebas internas).
4. **Disposición comercial a pagar** (evidencia de willingness-to-pay en el segmento Food Park).

La ausencia de adopción nicaragüense probada es una **limitación declarada** de la evidencia de mercado (sección 23): por eso las compuertas existen y son todas obligatorias.

---

## 19. Casos excepcionales

| ID | Caso | Comportamiento normativo |
|----|------|--------------------------|
| **EC-01** | POS del negocio sin internet | La caja sigue vendiendo (nunca se bloquea por el menú). La sincronización de disponibilidad se atrasa; el menú público sirve el último snapshot y muestra advertencia de frescura cuando el umbral definido en diseño (OD-03) se supera (D-17). |
| **EC-02** | Producto del POS eliminado o desactivado | El elemento de menú queda marcado para resolución antes de la siguiente publicación (retirarlo o reasignarlo). El snapshot activo no se reescribe retroactivamente; el menú público no muestra elementos de productos inexistentes en la siguiente versión. |
| **EC-03** | Cambio de precio en el POS | El precio público se actualiza por el contrato de sincronización/frescura; nunca muestra un precio que contradiga al POS sin divulgación de frescura (FR-12, sección 11). |
| **EC-04** | Cuota de medios agotada | Error honesto y accionable al subir; el contenido ya publicado no se degrada ni pierde imágenes (FR-09). |
| **EC-05** | Publicación sin confirmación de alérgenos vigente | La publicación está bloqueada hasta que el OWNER confirme la responsabilidad (D-08). |
| **EC-06** | Consumidor sin WhatsApp operativo | Degradación honesta: se muestra el número para contacto manual; nunca se simula un envío (FR-08). |
| **EC-07** | Menú despublicado | La URL pública muestra una página neutral; sin contenido de borrador ni versiones históricas (FR-05, sección 16.2). |
| **EC-08** | Ediciones concurrentes del borrador | La última confirmación prevalece por elemento con feedback al actor; el mecanismo técnico exacto (locking/versionado de borrador) es decisión de diseño (sección 24). No se pierden publicaciones ni versiones. |
| **EC-09** | Rollback mientras consumidores ven el menú | El rollback publica una nueva versión activa; los consumidores siguientes reciben la versión revertida. No hay estado mixto ni corrupción de versiones (D-09). |
| **EC-10** | Tenant en mora de pago | La política de suspensión del servicio (y su efecto sobre el menú público) es una **decisión comercial/de diseño posterior explícitamente abierta** (sección 24, OD-10); este PRD no la inventa. |
| **EC-11** | Producto sin imagen | El elemento se muestra con placeholder neutro honesto; la ausencia de imagen nunca se disimula con contenido genérico engañoso. |
| **EC-12** | Alérgenos no declarados en un elemento | El menú muestra "alérgenos no declarados" con la advertencia de trazabilidad; jamás "sin alérgenos" (FR-03). |

---

## 20. Requerimientos no funcionales

| ID | Requerimiento |
|----|---------------|
| **NFR-01 — Rendimiento público** | El menú público debe ser interactivo en móvil de gama media en red móvil típica. La meta numérica de referencia (carga interactiva ≤ 3 s) es un **objetivo tentativo que se fija y valida en la compuerta de diseño previa a la implementación**; mientras esa decisión no exista, este NFR **no constituye un criterio binario de aceptación** y tampoco es una garantía demostrada. |
| **NFR-02 — Disponibilidad del servicio público** | El snapshot público se sirve desde edge/CDN y no depende del POS ni de la WAN del negocio; la indisponibilidad de la autoría no degrada el servicio público. |
| **NFR-03 — Frescura divulgada** | La superación del umbral de frescura de disponibilidad o precio dispara advertencia honesta visible (D-17). Los umbrales **no están definidos en este PRD**: son **compuerta de diseño pre-implementación (OD-03)**; sin esa decisión aprobada no existe criterio binario de frescura y la sincronización pública no puede habilitarse. |
| **NFR-04 — Operación POS intocable** | Ningún estado, falla o mantenimiento de NhilosMenu puede bloquear, retrasar ni corromper la operación de venta del POS (D-17). |
| **NFR-05 — Seguridad** | Aislamiento multi-tenant en autoría (JWT + RLS + predicados), superficie pública de solo lectura con rate limiting, sin PII, sin secretos en el cliente, validación de entradas según el contrato del backend. |
| **NFR-06 — Accesibilidad** | Texto alternativo en imágenes de menú, contraste y navegación móviles básicos; coherencia con el design system del Owner Dashboard. |
| **NFR-07 — Observabilidad** | Eventos privados de salud del servicio (publicaciones, sincronización de disponibilidad, errores de medios, latencia del servicio público) con seudónimos de tenant; nunca PII de consumidores ni contenido sensible. |
| **NFR-08 — i18n-ready** | El modelo de contenido soporta marca de idioma sin migración destructiva futura (D-13). |
| **NFR-09 — Presupuesto de revisión** | La implementación por lotes respeta el presupuesto de revisión del repositorio (< 400 líneas cambiadas por PR de trabajo); la planificación corresponde al roadmap (`docs/plans/foodpark/nhilosmenu_foodpark_execution_roadmap.md`), no a este PRD. |

---

## 21. Non-goals de V1

Queda **explícitamente fuera** de NhilosMenu Food Park V1:

- **NG-01.** Administración del venue del Food Park o cuenta para el dueño del venue (D-02).
- **NG-02.** Agregación multi-tenant, marketplace de descubrimiento compartido, carrito compartido o liquidación entre locatarios.
- **NG-03.** Plan de modo restaurante (la expansión a restaurantes es posterior y requiere su propio contrato).
- **NG-04.** Cuentas de consumidor o identidad de lealtad en el menú público (sin acoplamiento con Loyalty V1).
- **NG-05.** Toma de pedidos, pagos, datáfonos bancarios, creación de facturas o cualquier numeración fiscal en la nube (D-03, sección 17).
- **NG-06.** Inferencia automática de disponibilidad desde ingredientes o recetas (D-06).
- **NG-07.** Descubrimiento por SEO, dominios personalizados, contexto de pedido por mesa, programación multi-menú o traducción automática (D-11, D-12, D-13).
- **NG-08.** Implementación de producto en este cambio de documentación (este PRD no crea código, roadmap ni batches; esos son el roadmap y los batches en `docs/plans/foodpark/`).

---

## 22. Criterios de aceptación

Los criterios son verificables y trazan a decisiones (sección 25). "El sistema" refiere a la implementación conforme de NhilosMenu Food Park V1.

### Catálogo y contenido

- **AC-01 — Tenant correcto.** Dado un negocio de emprendedor en un Food Park, cuando se provisiona NhilosMenu, el menú pertenece al tenant del negocio; no existe cuenta ni superficie para el dueño del venue (D-02).
- **AC-02 — Curación sin fuente paralela.** Dado un elemento de menú, referencia un producto existente del POS; no es posible crear productos ni precios desde el menú (D-04, FR-01).
- **AC-03 — Precio público NIO.** Dado un producto con precio final de venta en el POS, el menú público muestra exactamente ese precio en NIO, sin conversión ni precio editorial (D-05, FR-12).
- **AC-04 — Disponibilidad manual.** Dada la fundación manual de disponibilidad del POS entregada y probada (FR-04), cuando se fija `SOLD_OUT`, el menú público refleja el agotado; ninguna lógica infiere disponibilidad desde inventario, recetas ni desde `products.is_active` (D-06).
- **AC-05 — Sin superficie de compra.** Dado el menú público, no existen carrito, toma de pedidos, pago ni referencia a datáfonos (D-03).
- **AC-06 — Contenido gestionado completo.** Dado un borrador, el OWNER/MANAGER puede gestionar imágenes, descripciones, ingredientes, alérgenos estructurados, variantes/modificadores visibles, destacados editoriales y reflejo de promociones del POS (D-07, FR-02).
- **AC-07 — Compuerta de alérgenos.** Dado un intento de publicación sin confirmación vigente del OWNER sobre alérgenos, la publicación está bloqueada; con confirmación, el menú público muestra la advertencia de trazabilidad y "alérgenos no declarados" donde no haya declaración (D-08, FR-03, EC-05, EC-12).

### Publicación y roles

- **AC-08 — Un borrador, una versión activa.** Dado cualquier estado del tenant, existe a lo sumo un borrador y una versión publicada activa; cada publicación crea una versión inmutable con actor y timestamp (D-09, FR-05).
- **AC-09 — Vista previa fiel y privada.** Dado un borrador, la vista previa refleja la publicación y no es accesible desde la superficie pública (D-09, sección 16.2).
- **AC-10 — Rollback.** Dado un historial de versiones, el OWNER puede republicar una versión anterior; el resultado es una nueva versión activa sin corrupción del historial (D-09, EC-09).
- **AC-11 — Separación de roles.** Dado un MANAGER, puede editar borradores, previsualizar, crear y desactivar colocaciones QR y ver la analítica anónima; no puede publicar, despublicar, hacer rollback, cambiar URL/WhatsApp ni confirmar declaraciones de alérgenos; esas acciones quedan reservadas al OWNER (D-10, sección 15).

### Acceso público y QR

- **AC-12 — URL estable y no indexable.** Dado un menú publicado, su URL es estable ante republicaciones y rollbacks, accesible sin autenticación, sirve `noindex`/`nofollow` y está excluida de sitemaps (D-11, FR-06).
- **AC-13 — QR por colocación.** Dadas las colocaciones `COUNTER`, `TABLE`, `ENTRANCE` y `SOCIAL`, el sistema genera QR gestionados por tipo de fuente que codifican únicamente la URL pública canónica estable (sin URLs arbitrarias); no existe QR ni contexto por mesa individual (D-12, FR-07).
- **AC-14 — Español con modelo i18n-ready.** Dado el contenido V1, se sirve en español y el modelo de contenido soporta marca de idioma sin asumir un solo idioma en el esquema; no existe traducción automática (D-13, FR-11).

### Analítica y WhatsApp

- **AC-15 — Funnel anónimo.** Dado tráfico público real, el sistema registra `menu_view`, `item_view` y `whatsapp_tap` de forma agregada por tenant y colocación, sin identidad ni PII del consumidor (D-14, FR-10).
- **AC-16 — WhatsApp contextual sin pedido.** Dado un toque de contacto, se abre WhatsApp con mensaje prellenado de negocio/producto/URL; no existe captura ni estructuración de pedido (D-15, FR-08).

### Medios y offline

- **AC-17 — Medios gestionados.** Dada una imagen subida, pasa validación, se optimiza, consume cuota por tenant y se sirve desde NhilosMenu; el menú público no sirve hotlinks externos (D-16, FR-09).
- **AC-18 — Snapshot público.** Dado un menú publicado, el servicio público entrega el último snapshot publicado desde edge/CDN sin depender del POS ni de la WAN del negocio (D-17, NFR-02).
- **AC-19 — Advertencia de frescura honesta.** Dada la sincronización de disponibilidad o precio desactualizada más allá del umbral fijado en la compuerta de diseño OD-03 (pre-implementación), el menú público muestra advertencia de frescura en lugar de presentar el dato como vigente (D-17, NFR-03).
- **AC-20 — POS nunca bloqueado.** Dada cualquier falla o estado de NhilosMenu (sin internet, servicio caído, sync pendiente), la venta local del POS continúa sin bloqueo ni degradación (D-17, NFR-04).

### Comercial y cumplimiento

- **AC-21 — Empaquetado y precios.** Dado el piloto, NhilosMenu es entitlement core del perfil operativo Food Park dentro de `OmniFood Operación`, sin SKU ni tier separado; SOHO mantiene USD 79/mes, el precio público permanece en USD 89/mes y todo tier/SKU distinto queda post-piloto y gated por D-20 (D-18).
- **AC-22 — Secuencia de piloto.** Dado el plan de validación, la expansión a 3–5 negocios de Food Park y cualquier GA/reprecio ocurren solo después del piloto design-partner con SOHO (D-19).
- **AC-23 — Compuertas de GA.** Dado un intento de declarar GA o reprecio, exige evidencia simultánea de confiabilidad operativa, adopción del dueño, uso real del consumidor y disposición a pagar; ninguna compuerta puede omitirse (D-20).
- **AC-24 — Límite DGI.** Dado el menú público y toda la superficie de NhilosMenu, no se crean, numera ni modifican facturas ni documentos fiscales; no se presentan desgloses fiscales ni elementos que simulen un comprobante (sección 17).
- **AC-25 — Aislamiento de autoría.** Dado un actor autenticado del Tenant A, no puede leer ni escribir borrador, versiones, medios, configuración ni funnel del Tenant B; el tenant se resuelve del JWT verificado (sección 16.1).
- **AC-26 — Sin filtración de borrador.** Dado un borrador o vista previa, ningún endpoint público los expone; la superficie pública solo sirve versiones publicadas activas (sección 16.2, AC-09).

### Casos excepcionales verificados

- **AC-27 — Despublicado neutro.** Dado un menú despublicado, la URL pública muestra una página neutral sin contenido de borrador ni histórico (FR-05, EC-07).
- **AC-28 — Producto retirado del POS.** Dado un producto eliminado/desactivado en el POS, el elemento de menú queda marcado para resolución antes de la siguiente publicación y desaparece del menú público en la versión siguiente (EC-02).
- **AC-29 — Cuota honesta.** Dada cuota de medios agotada, la subida produce error accionable y el contenido publicado permanece íntegro (FR-09, EC-04).
- **AC-30 — Auditoría de acciones del OWNER.** Dadas publicación, despublicación, rollback, confirmación de alérgenos y cambios de URL/WhatsApp, cada acción queda trazada con actor, tenant y timestamp en bitácora append-only (sección 15.2).
- **AC-31 — Promociones del POS.** Dada una promoción activa del POS reflejada en el menú, proviene del motor de promociones del POS; el menú no crea ni simula promociones propias (D-04, D-07, FR-02).
- **AC-32 — Degradación de WhatsApp.** Dado un consumidor sin WhatsApp operativo, el sistema muestra el número para contacto manual sin simular envío (FR-08, EC-06).

### Producto y documentación

- **AC-33 — Nombre de producto en copy y documentación.** Dada cualquier superficie de usuario, QR, URL, material compartible y artefacto de documentación de V1, el producto se presenta como **NhilosMenu Food Park**; la documentación y el copy no usan nombres alternativos ni marcas paralelas (D-01). La verificación incluye una revisión de copy/documentación por lote, no solo la coincidencia técnica de identificadores.

---

## 23. Evidencia de mercado

> **Convención de etiquetas:** **[Hecho]** = afirmación respaldada por la fuente citada. **[Benchmark]** = práctica de la industria observada en material de proveedores; referencia de diseño, no promesa. **[Recomendación]** = inferencia de producto de este documento. **[Señal local]** = indicio cualitativo, no evidencia de mercado medible.
>
> **Limitación transversal declarada:** no existe evidencia validada de adopción de menús QR ni de disposición a pagar en el segmento Food Park de Nicaragua. Esa brecha es exactamente el trabajo del piloto (D-19, D-20); ninguna cifra de este documento debe leerse como proyección de ingresos o adopción local.

### 23.1 Fuentes

| # | Fuente (fecha de consulta del presente documento: 2026-09-19) | Qué aporta | Etiqueta y limitaciones |
|---|---|---|---|
| 1 | [National Restaurant Association — 2024 Technology Landscape](https://restaurant.org/research-and-media/research/research-reports/2024-technology-landscape-report/) | Panorama tecnológico de la industria restaurantera de EE. UU.; los menús digitales/QR figuran como categoría tecnológica establecida entre los operadores. | **[Hecho]** sobre el mercado de EE. UU. Encuesta a operadores; no extrapolable a Nicaragua ni al segmento Food Park. |
| 2 | [Ipsos — "QR code menus are growing even less popular" (2025-07-21)](https://www.ipsos.com/en-us/qr-code-menus-are-growing-even-less-popular) | Sentimiento de consumidores de EE. UU.: los menús QR generan fricción y su popularidad percibida decrece cuando la experiencia es mala (carga lenta, obligatoriedad, mal diseño). | **[Hecho]** sobre sentimiento en EE. UU. No mide conversión ni mercados latinos. **[Recomendación]** derivada: la fricción de entrada es el riesgo principal del producto → móvil-primero, sin app, sin login, carga rápida (NFR-01, sección 8). |
| 3 | [DataReportal — Digital 2025 Nicaragua](https://datareportal.com/reports/digital-2025-nicaragua) | Línea base de conectividad digital de Nicaragua: penetración móvil y posición de WhatsApp entre las plataformas más utilizadas del país. | **[Hecho]** como contexto de conectividad. Datos agregados de población digital; **no** constituyen evidencia de adopción gastronómica ni de willingness-to-pay. Sustenta la apuesta por móvil-primero y WhatsApp (D-15) como hipótesis a validar, no como hecho de mercado. |
| 4 | [Toast — Mobile payments and digital menus](https://support.toasttab.com/en/article/Setting-up-mobile-payments-and-digital-menus) | Patrón de proveedor líder: menú digital gestionado desde el backoffice del restaurante como capacidad estándar de la plataforma. | **[Benchmark]**. Material de proveedor (EE. UU./Irlanda); incluye capacidades de pago que en V1 son non-goals (NG-05). |
| 5 | [Square — QR code ordering](https://squareup.com/us/en/online-ordering/qr-code-ordering) | Patrón de QR de mesa/entrada hacia menú y pedido como flujo estándar del segmento PYME. | **[Benchmark]**. El componente de *ordering* excede el alcance V1 (D-03); se toma solo el patrón de acceso por QR y menú gestionado. |
| 6 | [Lightspeed — Order Anywhere](https://www.lightspeedhq.com/pos/restaurant/order-anywhere/) | Patrón de menú digital vinculado al POS del restaurante, con precios y disponibilidad derivados del sistema de venta. | **[Benchmark]**. Confirma la direccionalidad "menú derivado del POS" que este PRD adopta en D-04/D-05; las capacidades de pedido son non-goals en V1. |
| 7 | [Revista 360 Grados — Pedidos y Nica Comercio impulsan a los emprendedores de Nicaragua](https://revista-360grados.com/centro-pedidos-y-nica-comercio-impulsan-a-los-emprendedores-de-nicaragua/) | Señal periodística local de digitalización y canales de pedido entre emprendedores nicaragüenses. | **[Señal local]** únicamente. Prensa local; **no** es evidencia de participación de mercado, adopción medible ni disposición a pagar. No se usa para dimensionar el mercado. |

### 23.2 Lectura de producto

1. **[Hecho]** Los menús QR/digitales son una categoría establecida en la industria restaurantera (fuente 1), con evidencia de que la **experiencia mala destruye la adopción** (fuente 2).
2. **[Benchmark]** Los proveedores líderes tratan el menú digital como capacidad integrada de la plataforma POS, no como herramienta suelta (fuentes 4–6). NhilosMenu Food Park sigue esa direccionalidad en su alcance informativo: menú derivado del POS + contacto.
3. **[Hecho, con límite]** Nicaragua tiene base de conectividad móvil y uso intensivo de WhatsApp (fuente 3); eso hace plausible la hipótesis de menú móvil-primero con cierre por WhatsApp, pero **no la demuestra**.
4. **[Recomendación]** El diferenciador defendible no es "generar un QR" (ya cubierto por la utilidad `/menu-qr` del dashboard), sino la **publicación integrada desde el POS con honestidad de datos** (precio real, agotado declarado, alérgenos con responsabilidad) y la **conversión a conversación**. La validación de esa tesis es el piloto, no este documento.

---

## 24. Decisiones abiertas de implementación (no de producto)

Ningún ítem de esta sección es una decisión de producto pendiente: el contrato de producto está cerrado (sección 1). Estos son puntos de **diseño técnico/operativo** que las especificaciones de arquitectura y el roadmap (`docs/plans/foodpark/nhilosmenu_foodpark_execution_roadmap.md`) deben resolver, cada uno con su gate correspondiente.

| ID | Decisión de diseño pendiente | Dueño | Nota |
|----|------------------------------|-------|------|
| OD-01 | Proveedor y formato del edge/CDN y del almacenamiento de snapshots públicos | Architecture | Debe satisfacer D-17 y NFR-02. |
| OD-02 | Mecanismo de invalidación/actualización del snapshot al publicar y al sincronizar disponibilidad | Architecture | Idempotencia de sync (sección 11.2). |
| OD-03 | Umbral numérico de frescura y copy exacto de la advertencia | Product + Architecture | Debe satisfacer D-17/NFR-03; el copy es superficie de usuario en español. |
| OD-04 | Pipeline de medios: formatos, tamaños máximos, cifras de cuota por tenant | Architecture + Product | Debe satisfacer D-16/FR-09. |
| OD-05 | Pipeline de eventos de funnel anónimo y política de retención/agregación | Architecture | Debe satisfacer D-14/FR-10. |
| OD-06 | Esquema de URL pública (slug/subdominio) y formato de payload de QR | Architecture + Security | Debe satisfacer D-11/D-12 y la no-enumeración (16.2). |
| OD-07 | Rate limiting y protección de abuso de la superficie pública | Security | Debe satisfacer 16.2/NFR-05. |
| OD-08 | Mecánica de edición concurrente del borrador (EC-08) | Architecture | No puede comprometer versiones ni publicaciones. |
| OD-09 | Verificación/validación del número de WhatsApp del tenant | Architecture + Product | Debe satisfacer FR-08 sin capturar PII de consumidores. |
| OD-10 | Política de suspensión del menú público por mora del tenant | Comercial + Product | **Explícitamente abierta**: este PRD no la define (EC-10). |
| OD-11 | Contrato exacto de sincronización de disponibilidad/precio POS → snapshot (topología, outbox, reintentos) | Architecture | Debe alinearse con las topologías de sync existentes (`openspec/specs/inventory-sync-topologies/spec.md`) y NFR-04. |

---

## 25. Trazabilidad y criterio de cierre

### 25.1 Matriz de trazabilidad decisión → criterio

| Decisión | Criterios que la verifican |
|----------|---------------------------|
| D-01 | AC-01 (identidad de producto; verificación de copy en implementación), AC-33 (nombre en copy y documentación) |
| D-02 | AC-01 |
| D-03 | AC-05, AC-16, AC-24 |
| D-04 | AC-02, AC-31 |
| D-05 | AC-03, AC-19 |
| D-06 | AC-04 |
| D-07 | AC-06, AC-31 |
| D-08 | AC-07 |
| D-09 | AC-08, AC-09, AC-10, AC-27 |
| D-10 | AC-11, AC-30 |
| D-11 | AC-12 |
| D-12 | AC-13 |
| D-13 | AC-14 |
| D-14 | AC-15 |
| D-15 | AC-16, AC-32 |
| D-16 | AC-17, AC-29 |
| D-17 | AC-18, AC-19, AC-20 |
| D-18 | AC-21 |
| D-19 | AC-22 |
| D-20 | AC-23 |
| Aislamiento/auditoría (secciones 15–16) | AC-25, AC-26, AC-30 |
| Non-goals (sección 21) | Verificación negativa detallada por NG en la sección 10 de `docs/plans/foodpark/nhilosmenu_foodpark_execution_roadmap.md`, con AC aplicable o control explícito de alcance/diff por lote |

Cobertura: las 20 decisiones vinculantes tienen al menos un criterio de aceptación; los 8 non-goals están representados en la sección 21 y protegidos por criterios negativos o por el boundary de cada lote.

### 25.2 Criterio de cierre

Este PRD queda **APPROVED / AUTHORITATIVE** para **NhilosMenu Food Park V1**. No quedan decisiones de producto abiertas; los puntos abiertos de la sección 24 son de diseño/comercial y están explícitamente asignados.

Una implementación **no será conforme** si:

- muestra precios que no sean el precio final de venta del POS en NIO, o infiere disponibilidad desde inventario;
- introduce carrito, pedidos, pagos, numeración fiscal o cualquier write sobre el POS;
- permite publicar sin confirmación de alérgenos del OWNER, o muestra "sin alérgenos" cuando no hay declaración;
- permite más de un borrador o más de una versión publicada activa, o edita versiones publicadas;
- otorga a MANAGER la publicación, la URL/WhatsApp o la confirmación de alérgenos;
- indexa el menú, sirve borradores públicamente, o captura PII del consumidor;
- sirve medios por hotlink externo o degrada silenciosamente el contenido publicado;
- bloquea la venta del POS por cualquier estado de NhilosMenu;
- presenta la frescura degradada como dato vigente;
- vende NhilosMenu como SKU/tier separado durante el piloto, cambia el precio de SOHO o el precio público durante el piloto, o declara GA/reprecio sin las cuatro compuertas;
- presenta la disponibilidad como ya existente en el POS sin entregarla y probarla como fundación, o la implementa como derivada de `products.is_active`.

### 25.3 Descarga al roadmap y los batches

El roadmap de ejecución con dependencias (`docs/plans/foodpark/nhilosmenu_foodpark_execution_roadmap.md`) bajó este contrato a lotes, respetando: identidad/acceso público y contrato de medios probados antes de cualquier milestone de implementación de menú, presupuesto de revisión por lote, y trazabilidad bidireccional con este PRD.
