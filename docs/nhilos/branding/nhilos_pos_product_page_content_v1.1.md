# NHILOS POS — Product Page Content v1.1

**Status:** `APPROVED / AUTHORITATIVE CONTENT CONTRACT — PUBLICATION GATED`  
**Scope:** Página profunda de producto NHILOS POS  
**Masterbrand:** NHILOS  
**Product:** NHILOS POS  
**Version:** 1.1  
**Date:** 2026-10-02  
**Authority:** Contrato de contenido aprobado para la página profunda de producto.  
**Upstream chain (per `nhilos_branding_document_governance_v1.0.md`):** `product_claim_audit_od02_v1.3.md` (v1.2) → `nhilos_website_information_architecture_content_wireframe_v1.0.md` (v1.0)  
**NHILOS +1:** Este documento honra el principio `NHILOS +1` (`nhilos_brand_experience_principles_v1.0.md` §11): la demo se prepara según el contexto que el prospecto comparte (Sección 12), y los estados de éxito y error le devuelven un siguiente paso definido.
**DEPENDENCIA PENDIENTE — no existe en el repositorio:** `nhilos_website_homepage_content_v1.1.md` no existe en ningún lugar del repositorio. Este documento NO puede promocionarse para publicación hasta que esa dependencia exista. La alineación con ella y la verificación de capacidades contra builds y evidencia vigentes permanecen como gates separados de publicación.  
**GATE DE PUBLICACIÓN:** la publicación de esta página está bloqueada por (a) la creación de `nhilos_website_homepage_content_v1.1.md` y (b) la verificación de capacidades contra el build vigente.

---

## 0\. Purpose

Este documento convierte la arquitectura narrativa de la página de producto en un contrato de contenido operativo. Define el copy propuesto, jerarquía de mensajes, CTAs, microcopy, requerimientos de evidencia, claim IDs, restricciones de publicación y necesidades de media.

La página de producto profundiza lo que la homepage introduce: explica el producto en el contexto de una operación real, muestra workflows concretos, establece expectativas sobre continuidad y control, describe los roles y el proceso de implementación, y facilita solicitar una demostración.

> **Regla principal:** el comportamiento real y vigente del producto tiene precedencia sobre cualquier claim de marketing.

Este documento no autoriza por sí mismo la publicación de claims funcionales, comerciales, contractuales o de compatibilidad.

## 1\. Authority & Decision Model

### 1.1 Authority basis

Este artefacto toma como referencias principales:

1. `nhilos_website_homepage_content_v1.1.md` — referencia de alineación prevista; no se considera contrastada en esta auditoría.  
2. `Product_Requirement_Document.md`  
3. `Product_Requirement_Document_v2.md`  
4. `prd_modulo_ventas.md`  
5. `prd_gestion_inventario.md`  
6. `prd_produccion_preelaboracion_batch.md`  
7. `prd_procesamiento_pago_datafonos.md`  
8. `prd_onboarding.md`  
9. `prd_audit_trail.md`  
10. `DESIGN.md`  
11. `DESIGN_BACKOFFICE.md`  
12. `owner_dashboard_execution_roadmap.md`  
13. `master_execution_roadmap.md`  
14. Propuesta técnico-económica OE-001OM, únicamente para el alcance contractual específico de SOHO.

Cuando exista conflicto, prevalece la autoridad de producto, operación, seguridad, cumplimiento y contrato que corresponda. La documentación histórica o de arquitectura no prueba por sí sola que una capacidad esté disponible en la versión que se mostrará públicamente.

### 1.2 Decision classes

| Status | Meaning | Publication authority |
| :---- | :---- | :---- |
| `INHERITED` | Derivado directamente de una autoridad upstream vigente. | Publicable dentro de su scope, sujeto a verificación de versión. |
| `DERIVED` | Traducción narrativa que no introduce comportamiento nuevo. | Publicable si no amplía el claim fuente. |
| `PROPOSED` | Copy, CTA o formulación creativa todavía no validada. | No autoriza publicación. |
| `EVIDENCE_REQUIRED` | Requiere evidencia de producto, operación, legal/compliance, comercial o soporte. | Bloqueado hasta completar el gate. |
| `APPROVED_FOR_PUBLICATION` | Validado por el gate correspondiente. | Publicable dentro del alcance aprobado. |
| `STALE` | Requiere nueva verificación por cambios de producto, contrato o contexto. | No publicar hasta revalidar. |
| `SUPERSEDED` | Reemplazado por una decisión posterior. | No utilizar. |

&nbsp;

### 1.3 Publication rule

Cada bloque de copy debe conservar su estado. El diseño visual, una demo preparada o una captura de pantalla no convierten un claim `EVIDENCE_REQUIRED` en aprobado.

---

# 2\. Product Page Job

La página debe:

1. explicar qué es NHILOS POS en términos concretos;  
2. ubicarlo dentro de una operación comercial real;  
3. demostrar los workflows principales de venta, cobro y operación relacionada;  
4. explicar el alcance de continuidad y sincronización sin promesas absolutas;  
5. mostrar qué información y controles existen, sin sugerir analítica o reportes no verificados;  
6. distinguir necesidades de cajeros, supervisores y responsables del negocio;  
7. utilizar medios reales y vigentes del producto;  
8. describir la implementación como un proceso sujeto al alcance acordado;  
9. aclarar hardware y compatibilidad con base en evidencia por dispositivo;  
10. explicar cómo solicitar soporte sin inventar SLA o coberturas;  
11. responder preguntas frecuentes que influyen en la decisión;  
12. conducir a una demo contextualizada.

### Regla narrativa transversal

> **Situación → Comportamiento → Efecto**

Cada bloque debe:

- **Situación:** partir de una tarea, fricción o condición reconocible;  
- **Comportamiento:** explicar qué hace NHILOS POS y qué intervención requiere la persona;  
- **Efecto:** expresar el resultado operativo observable, sin atribuir beneficios no demostrados.

La secuencia no obliga a que las tres partes sean frases separadas. Sí exige que el mensaje contenga una relación causal comprensible.

### Relación con la homepage

La homepage introduce la propuesta y la página profunda resuelve preguntas. La relación editorial exacta con la homepage v1.1 debe validarse en el Gate E; hasta entonces, esta regla funciona como criterio de diseño y no como constancia de consistencia ya verificada. La página no debe convertirse en una lista indiscriminada de módulos ni repetir el hero de la homepage con más palabras.

---

# 3\. Section 01 — Product Promise

## Purpose

Presentar el producto con una promesa clara y acotada: un punto de venta que acompaña el flujo de venta y la operación asociada, con especial atención a las condiciones reales de conectividad.

## Proposed copy

**Eyebrow**

> NHILOS POS

**Headline**

> **Vende y organiza la operación desde un mismo punto de trabajo.**

**Supporting copy**

> Cuando cada pedido requiere coordinar productos, cobros y tareas posteriores, el equipo necesita un flujo claro. NHILOS POS reúne el registro de ventas y las capacidades operativas disponibles para que el negocio trabaje con información más ordenada.

**Primary CTA**

> Solicitar una demo

**Secondary CTA**

> Explorar cómo funciona

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** una venta no termina al seleccionar un producto; puede implicar personalizaciones, cobro y procesos posteriores.  
- **Comportamiento:** NHILOS POS permite registrar ventas y, según la configuración y capacidades habilitadas, relacionarlas con cobros y tareas operativas.  
- **Efecto:** el equipo trabaja sobre un flujo de venta más estructurado y con información registrada en el sistema.

## Claim IDs

| ID | Claim | Class | Evidence needed | Gate |
| :---- | :---- | :---- | :---- | :---- |
| PP-001 | NHILOS POS es un punto de venta para registrar operaciones comerciales. | Functional | Scope vigente del producto y flujo de venta demostrable. | Product |
| PP-002 | El producto relaciona el registro de venta con capacidades operativas asociadas. | Functional | Workflow end-to-end de la versión pública. | Product |
| PP-003 | El flujo permite trabajar con claridad. | Outcome | Validación de UX y evidencia de uso; evitar presentar como resultado garantizado. | Product / UX |
| PP-004 | La promesa de continuidad aplica a escenarios soportados, no de forma absoluta. | Product / Architectural | Matriz de escenarios y pruebas vigentes. | Product / Engineering |

&nbsp;

## Restrictions

No publicar sin evidencia adicional:

- “Todo tu negocio en una sola plataforma”.  
- “Control total de tu negocio”.  
- “Nunca pierdas una venta”.  
- “Vende sin límites”.  
- “Funciona siempre, incluso sin internet”.  
- Cifras de ahorro, velocidad o productividad no medidas.

---

# 4\. Section 02 — Product in Context

## Purpose

Ayudar al visitante a reconocer cómo encaja NHILOS POS en su jornada. La sección debe explicar el contexto de uso antes de profundizar en funcionalidades.

## Proposed copy

**Headline**

> **Una operación conectada por tareas, no por pantallas aisladas.**

**Supporting copy**

> En un negocio de atención rápida o servicio en mesa, el equipo registra pedidos, confirma cobros y coordina lo que sucede después. Cuando esas tareas se gestionan sin un flujo común, aumenta la necesidad de repetir información y verificar estados manualmente.

> NHILOS POS está diseñado para organizar el trabajo de venta y las capacidades relacionadas que estén habilitadas en la configuración del negocio.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Context cards

### Atención en mostrador

**Situación**

El equipo recibe pedidos consecutivos y necesita registrar productos y completar el cobro con un flujo directo.

**Comportamiento**

El POS permite seleccionar productos y registrar la operación de venta, con las opciones de cobro disponibles.

**Efecto**

La venta queda registrada dentro del flujo del sistema.

**Status:** `EVIDENCE_REQUIRED`

### Servicio en mesa

**Situación**

Una cuenta puede permanecer abierta mientras se agregan productos o se organiza el servicio.

**Comportamiento**

Cuando la modalidad y la configuración lo soportan, el POS permite retener cuentas o asociarlas a mesas para recuperarlas posteriormente.

**Efecto**

El equipo puede continuar trabajando sobre una cuenta abierta sin tener que tratarla como una venta finalizada.

**Status:** `EVIDENCE_REQUIRED`

### Operación con inventario

**Situación**

La venta de un producto puede consumir existencias o ingredientes.

**Comportamiento**

En productos y recetas configurados para ello, el sistema registra los movimientos de inventario correspondientes al flujo de venta.

**Efecto**

La información de ventas e inventario puede mantenerse relacionada para el control operativo.

**Status:** `EVIDENCE_REQUIRED`

## Visual direction

Mostrar tres escenas reales, no tres ilustraciones genéricas:

1. selección y registro de una venta;  
2. cuenta abierta o mesa, si está disponible en la versión pública;  
3. consulta de una vista real de inventario o de movimientos relacionados.

No mostrar simultáneamente interfaces de prototipos, versiones antiguas y producto vigente como si pertenecieran a una misma experiencia.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| PC-001 | El POS contempla escenarios de atención en mostrador. | Flujo real y configuración disponible. | Product |
| PC-002 | El POS contempla cuentas abiertas o mesas en modalidades soportadas. | Pruebas de flujo y alcance por modalidad. | Product |
| PC-003 | Las ventas pueden relacionarse con movimientos de inventario configurados. | Prueba de venta a Kardex/stock. | Product |
| PC-004 | La experiencia mostrada corresponde a la versión vigente. | Inventario de capturas y build identificable. | Product / Content |

&nbsp;

---

# 5\. Section 03 — Core Workflows

## Purpose

Demostrar cómo se ejecutan las tareas principales. Cada workflow debe explicar el punto de partida, la intervención de la persona y el resultado observable. La sección debe priorizar la demostración sobre las descripciones abstractas.

## Workflow A — Registrar una venta

**Headline**

> **Del pedido al registro de venta.**

**Situación**

El cajero necesita encontrar los productos solicitados y construir la cuenta sin perder claridad sobre lo que está cobrando.

**Comportamiento**

Selecciona productos desde la interfaz de venta y revisa la cuenta antes de continuar con el cobro. Si el producto tiene opciones configuradas, el flujo puede incluir su selección.

**Efecto**

La cuenta refleja los productos y opciones registrados para esa operación.

**CTA**

> Ver el flujo de venta

**Status:** `EVIDENCE_REQUIRED`

## Workflow B — Personalizar productos

**Headline**

> **Cada pedido puede incluir las opciones configuradas para el producto.**

**Situación**

Un cliente solicita cambios, extras o alternativas que forman parte de la oferta del negocio.

**Comportamiento**

Cuando existen grupos de modificadores configurados, el equipo selecciona las opciones permitidas y el sistema aplica las reglas definidas para el producto.

**Efecto**

La cuenta registra la configuración seleccionada y, cuando corresponde, el ajuste de precio asociado.

**Status:** `EVIDENCE_REQUIRED`

**Restriction:** no insinuar que cualquier modificador altera inventario o que todos los productos admiten personalización. Esas capacidades dependen de la configuración y del comportamiento vigente.

## Workflow C — Completar un cobro

**Headline**

> **Registra cómo se pagó la venta.**

**Situación**

Una cuenta está lista para cobrarse y el equipo necesita registrar el medio de pago utilizado.

**Comportamiento**

El cajero selecciona el método disponible y completa el flujo correspondiente. En el esquema semiautomático de tarjeta documentado, la transacción financiera ocurre en el datáfono bancario y NHILOS POS registra el pago tras la confirmación del cajero.

**Efecto**

La venta conserva el registro del cobro en el sistema. La aprobación financiera depende del datáfono y del adquirente.

**Status:** `EVIDENCE_REQUIRED`

**Restriction:** no afirmar integración bancaria automática universal, autorización directa desde el POS o conciliación automática para todos los bancos y terminales.

## Workflow D — Mantener una cuenta abierta

**Headline**

> **Continúa una cuenta mientras el servicio sigue en marcha.**

**Situación**

El pedido aún no está listo para cobrarse o debe permanecer abierto durante el servicio.

**Comportamiento**

En modalidades soportadas, el equipo guarda la cuenta en espera y la recupera desde una terminal autorizada conforme a las reglas de concurrencia disponibles.

**Efecto**

La operación puede continuar sobre la cuenta pendiente sin registrarla prematuramente como venta cerrada.

**Status:** `EVIDENCE_REQUIRED`

## Workflow E — Consultar información operativa

**Headline**

> **Revisa la información que deja la operación.**

**Situación**

La persona responsable necesita revisar ventas, inventario u otra información disponible para entender lo ocurrido.

**Comportamiento**

Accede a las superficies de consulta habilitadas para su rol y configuración.

**Efecto**

Dispone de información registrada para apoyar la supervisión y la gestión, dentro de los límites de actualización y alcance de cada vista.

**Status:** `EVIDENCE_REQUIRED`

**Restriction:** no prometer indicadores, reportes, frescura en tiempo real o rentabilidad neta sin contrato de métricas y evidencia.

## Workflow visual

Representar los workflows con una secuencia breve de pasos y capturas reales. Evitar mockups que inventen botones, estados, métricas o rutas.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| CW-001 | El POS permite seleccionar productos y construir una cuenta. | Test de venta y captura vigente. | Product |
| CW-002 | El flujo puede incluir modificadores configurados. | Casos de grupos obligatorios/opcionales y límites. | Product |
| CW-003 | El sistema registra pagos con los métodos disponibles. | Casos por método de pago y estados. | Product / Payments |
| CW-004 | El esquema de tarjeta puede requerir confirmación manual posterior al datáfono. | Flujo actual por adaptador y dispositivo. | Payments |
| CW-005 | Existen cuentas abiertas/retención en modalidades soportadas. | E2E y matriz de modalidad. | Product |
| CW-006 | Existen superficies de consulta para información operativa. | Rutas, roles, semántica y estado de disponibilidad. | Product / Backoffice |

&nbsp;

---

# 6\. Section 04 — Continuity

## Purpose

Explicar la continuidad operativa como una capacidad condicionada por topología, hardware, estado local y escenarios probados. La comunicación debe generar una expectativa correcta sobre qué puede continuar, qué queda pendiente y qué sucede al recuperar conectividad.

## Proposed copy

**Eyebrow**

> Continuidad operativa

**Headline**

> **Si la conexión falla, importa qué puede continuar y qué queda pendiente.**

**Supporting copy**

> La conectividad puede interrumpirse durante la jornada. En los escenarios soportados, NHILOS POS conserva localmente determinadas operaciones y sincroniza la información pendiente cuando se recupera la conexión.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el negocio pierde temporalmente la conexión a internet.  
- **Comportamiento:** según la topología y las capacidades habilitadas, el POS puede continuar determinadas tareas localmente y mantener transacciones pendientes de sincronización.  
- **Efecto:** el equipo puede conservar parte del flujo operativo y posteriormente sincronizar la información, sujeto a los límites del escenario.

## Required explanation

La sección debe responder con lenguaje no técnico:

1. ¿Qué tareas continúan durante la interrupción?  
2. ¿Qué información se conserva localmente?  
3. ¿Qué acciones o servicios quedan limitados?  
4. ¿Qué sucede cuando vuelve la conectividad?  
5. ¿Se requiere una acción de la persona?  
6. ¿Qué dispositivos y configuraciones están cubiertos?

Las respuestas deben completarse a partir de una matriz de escenarios validada para la versión que se comercializa.

## Visual

```
CONEXIÓN DISPONIBLE
        ↓
OPERACIÓN EN EL POS
        ↓
INTERRUPCIÓN DE CONECTIVIDAD
        ↓
CAPACIDADES LOCALES SOPORTADAS*
        ↓
CONEXIÓN RESTAURADA
        ↓
SINCRONIZACIÓN DE PENDIENTES*
```

&nbsp;

`*` Los pasos exactos dependen de la topología, el hardware y las pruebas vigentes.

## Critical restrictions

No publicar como claims absolutos:

- “Funciona sin internet siempre”.  
- “Nunca se detiene”.  
- “Todas las funciones operan offline”.  
- “Sincronización instantánea garantizada”.  
- “Cero pérdida de datos” sin evidencia y alcance explícitos.  
- “Funciona sin importar la conexión”.

No confundir operación local con operación multi-dispositivo. La continuidad de un dispositivo autónomo y la continuidad de una red con nodo local son escenarios diferentes.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| CT-001 | NHILOS POS utiliza un enfoque offline-first en los escenarios definidos. | Arquitectura vigente y matriz de capacidades por topología. | Product / Engineering |
| CT-002 | Determinadas operaciones pueden continuar localmente durante una desconexión soportada. | Pruebas por operación, dispositivo y tipo de fallo. | Engineering |
| CT-003 | Existe sincronización posterior de información pendiente. | Evidencia de outbox/sync y reconciliación. | Engineering |
| CT-004 | El comportamiento depende del escenario soportado. | Matriz de compatibilidad y restricciones aprobada. | Product |
| CT-005 | El usuario conoce los límites y estados pendientes relevantes. | UX, estados visibles y pruebas de comprensión. | Product / UX |

&nbsp;

---

# 7\. Section 05 — Control / Visibility

## Purpose

Explicar cómo el registro de operaciones puede aportar contexto para revisar lo que ocurre en el negocio. Diferenciar claramente la información que genera el POS de las vistas administrativas o analíticas que estén disponibles.

## Proposed copy

**Headline**

> **Registra la operación. Consulta la información disponible.**

**Supporting copy**

> Cuando necesitas revisar una venta, entender movimientos de inventario o consultar resultados de la operación, el valor está en contar con registros y vistas que permitan relacionar la información. NHILOS POS y las superficies administrativas habilitadas ofrecen ese contexto dentro de su alcance vigente.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Content blocks

### Ventas registradas

**Situación:** necesitas revisar las operaciones realizadas.

**Comportamiento:** consulta la información de ventas que esté disponible para tu rol y periodo.

**Efecto:** puedes revisar los registros accesibles sin asumir que todas las vistas se actualizan al instante.

### Inventario y movimientos

**Situación:** una existencia cambia por compras, ventas, producción o ajustes.

**Comportamiento:** el sistema registra movimientos según los procesos de inventario configurados y las capacidades disponibles.

**Efecto:** los registros permiten consultar el historial y el estado de inventario dentro del alcance de las vistas vigentes.

### Supervisión y trazabilidad

**Situación:** ciertas acciones requieren revisión o autorización.

**Comportamiento:** las capacidades de permisos y bitácora registran acciones específicas cuando están implementadas y habilitadas.

**Efecto:** la información disponible aporta trazabilidad para revisar eventos, sin equivaler a una garantía absoluta de prevención de fraude.

## Publication requirements

Antes de publicar esta sección, definir:

- cuáles vistas existen en producción;  
- cuáles son POS y cuáles pertenecen al backoffice;  
- qué roles pueden acceder;  
- qué datos y periodos se muestran;  
- cuándo se sincroniza la información;  
- qué estados de datos incompletos, desconocidos o desactualizados se exponen;  
- qué términos de indicadores han sido aprobados;  
- qué controles están implementados y cuáles son todavía roadmap.

## Restrictions

No afirmar:

- “Control total en tiempo real”.  
- “Detecta todo fraude”.  
- “Rentabilidad neta” o “utilidad real” sin datos de gastos y metodología aprobada.  
- “Todos los movimientos son inalterables” sin delimitar la implementación vigente y su evidencia.  
- “Un solo dashboard muestra todo” si no existe cobertura demostrada.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| CV-001 | El sistema registra información de ventas consultable. | Vistas, permisos y evidencia de datos. | Product |
| CV-002 | Existen capacidades de inventario y consulta de movimientos. | Flujo y vistas disponibles. | Product |
| CV-003 | Determinadas acciones pueden quedar registradas en bitácora. | Eventos instrumentados y consultas verificadas. | Engineering / Security |
| CV-004 | La información presentada refleja su frescura y alcance. | Contrato de sincronización y copy de estados. | Product / Operations |
| CV-005 | Los indicadores y términos públicos tienen semántica aprobada. | Diccionario de KPI y revisión de negocio. | Product / Finance |

&nbsp;

---

# 8\. Section 06 — Roles

## Purpose

Mostrar cómo distintas personas interactúan con el producto desde sus responsabilidades, sin sugerir que todos los roles tienen las mismas facultades ni convertir la sección en una matriz técnica de permisos.

## Proposed copy

**Headline**

> **Cada persona trabaja desde la responsabilidad que le corresponde.**

**Supporting copy**

> Quien registra ventas necesita un flujo directo. Quien supervisa necesita revisar operaciones y resolver excepciones autorizadas. Quien dirige el negocio necesita consultar la información disponible para organizar su gestión.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Role 1 — Quien cobra

**Title**

> Registrar y cobrar con claridad.

**Situation:** recibe pedidos y necesita completar operaciones consecutivas.

**Behavior:** utiliza la interfaz de venta y los métodos de pago habilitados, según sus permisos.

**Effect:** registra las ventas y los cobros que le corresponden.

**CTA:** Ver el flujo de venta

**Status:** `EVIDENCE_REQUIRED`

## Role 2 — Quien supervisa

**Title**

> Revisar operaciones y atender excepciones.

**Situation:** debe revisar una operación o autorizar una acción que excede las facultades ordinarias.

**Behavior:** utiliza las funciones de consulta y autorización que estén asignadas a su rol.

**Effect:** puede intervenir dentro de los permisos definidos y dejar trazabilidad cuando la función correspondiente lo registra.

**CTA:** Conocer las capacidades de control

**Status:** `EVIDENCE_REQUIRED`

## Role 3 — Quien dirige

**Title**

> Consultar información para gestionar.

**Situation:** necesita entender cómo marcha la operación y revisar información consolidada.

**Behavior:** accede a las vistas administrativas y reportes habilitados para su usuario.

**Effect:** dispone de contexto para apoyar decisiones, respetando la cobertura, actualización y semántica de los datos disponibles.

**CTA:** Explorar la visibilidad operativa

**Status:** `EVIDENCE_REQUIRED`

## Restrictions

- No presentar roles como equivalentes a permisos concretos sin revisar la matriz RBAC vigente.  
- No prometer que una persona puede supervisar desde cualquier dispositivo.  
- No atribuir a un rol acceso a reportes o configuraciones que estén pendientes de implementación.  
- No sugerir que la bitácora elimina la necesidad de controles humanos.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| RL-001 | El POS soporta tareas de venta y cobro. | Flujos y permisos reales. | Product |
| RL-002 | Existen permisos diferenciados para acciones específicas. | Matriz RBAC vigente y pruebas. | Security / Product |
| RL-003 | Existen superficies de consulta para responsables del negocio. | Backoffice vigente y roles habilitados. | Product |
| RL-004 | Las capacidades mostradas corresponden a los permisos reales. | Validación por rol y captura. | Product / Security |

&nbsp;

---

# 9\. Section 07 — Gallery

## Purpose

Hacer visible el producto real. La galería debe reducir incertidumbre sobre la interfaz y demostrar los workflows explicados en las secciones anteriores.

## Gallery structure

### Media 01 — Pantalla de venta

**Caption propuesta**

> Selecciona productos y revisa la cuenta antes de continuar.

**Qué debe demostrar:** interfaz vigente, selección de productos y resumen de cuenta.

**Evidence:** captura de build identificable y flujo reproducible.

### Media 02 — Modificadores

**Caption propuesta**

> Aplica las opciones que el negocio configuró para cada producto.

**Qué debe demostrar:** grupos y reglas reales de modificadores.

**Evidence:** configuración activa y caso de prueba.

### Media 03 — Cuenta abierta o mesas

**Caption propuesta**

> Mantén una cuenta abierta cuando el flujo de servicio lo requiere.

**Qué debe demostrar:** guardar, recuperar y estados reales de la cuenta.

**Evidence:** modalidad soportada y prueba de concurrencia aplicable.

### Media 04 — Cobro

**Caption propuesta**

> Registra el método de pago utilizado en la venta.

**Qué debe demostrar:** pantalla de pago y estados reales. Si se muestra tarjeta, dejar claro el paso que ocurre en el datáfono cuando aplique.

**Evidence:** prueba por método y adaptador.

### Media 05 — Inventario / movimientos

**Caption propuesta**

> Consulta la información de inventario disponible para tu operación.

**Qué debe demostrar:** vista real, periodo, filtros y significado de los datos.

**Evidence:** datos de prueba controlados o información autorizada y anonimizada.

### Media 06 — Vista administrativa

**Caption propuesta**

> Revisa información de la operación desde la superficie administrativa disponible.

**Qué debe demostrar:** versión actual, alcance real de la vista y contexto de actualización.

**Evidence:** versión desplegada o aprobada para publicación, rol y frescura de datos.

## Media rules

Prioridad:

1. producto real y vigente;  
2. workflow reproducible;  
3. caso de cliente autorizado y verificable;  
4. testimonio con consentimiento y contexto;  
5. métricas con metodología y periodo documentados.

No utilizar:

- dashboards ficticios;  
- datos de clientes sin autorización;  
- métricas decorativas;  
- capturas antiguas presentadas como actuales;  
- pantallas de roadmap como si fueran funcionalidad disponible;  
- interfaces retocadas que cambien estados, cifras o comportamiento.

Cada asset debe tener un registro mínimo:

| Field | Requirement |
| :---- | :---- |
| Asset ID | Identificador único |
| Product version | Build o release |
| Workflow | Qué demuestra |
| Device / form factor | Dispositivo y resolución |
| Data status | Demo, anonimizada o real autorizada |
| Capture date | Fecha de captura |
| Owner | Responsable de validación |
| Approval | Estado de aprobación |
| Expiration trigger | Cambio que obliga a revisar |

&nbsp;

**Status:** `EVIDENCE_REQUIRED`

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| GL-001 | Las capturas corresponden al producto vigente. | Inventario de assets y release. | Product |
| GL-002 | Cada imagen representa el workflow indicado. | Reproducción y revisión. | Product |
| GL-003 | Los datos visibles están autorizados y contextualizados. | Revisión de privacidad y consentimiento. | Legal / Product |
| GL-004 | Los estados y cifras no fueron alterados de forma engañosa. | Revisión editorial y de producto. | Content / Product |

&nbsp;

---

# 10\. Section 08 — Implementation

## Purpose

Reducir la incertidumbre sobre la puesta en marcha. Explicar que la implementación requiere entender la operación, preparar la configuración, validar el flujo y acordar el alcance; no convertir el proceso en una promesa universal de tiempo o resultado.

## Proposed copy

**Eyebrow**

> Implementación

**Headline**

> **Antes de operar, preparamos el sistema para tu forma de trabajar.**

**Supporting copy**

> Cada negocio tiene productos, métodos de cobro, equipos y rutinas distintas. La puesta en marcha comienza por entender ese contexto y definir la configuración, las pruebas y el acompañamiento que correspondan al alcance acordado.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Journey

```
01  Entender la operación
          ↓
02  Definir alcance y requisitos
          ↓
03  Preparar catálogo y configuración
          ↓
04  Configurar dispositivos y usuarios
          ↓
05  Probar los flujos acordados
          ↓
06  Capacitar según el alcance
          ↓
07  Verificar y aceptar la puesta en marcha
          ↓
08  Go-live
```

&nbsp;

La secuencia es una representación propuesta. Debe alinearse con el playbook operacional y el contrato vigente antes de publicarse como proceso oficial.

## Situation → Behavior → Effect

- **Situación:** el negocio tiene que trasladar su forma de operar al sistema.  
- **Comportamiento:** se recopila la información necesaria, se prepara la configuración y se verifican los flujos dentro del alcance acordado.  
- **Efecto:** el negocio llega al go-live con una configuración y un estado de aceptación definidos.

## What the visitor should know

Cuando exista autoridad suficiente, describir:

- información que debe preparar el negocio;  
- responsables de cada etapa;  
- equipos requeridos;  
- configuración incluida;  
- pruebas y criterios de aceptación;  
- capacitación contemplada;  
- condiciones para go-live;  
- servicios y costos aplicables, cuando se decida publicarlos.

## Restrictions

No publicar sin autoridad comercial/operativa:

- “Implementación en 15 minutos”.  
- “Go-live garantizado en X días”.  
- “Sin esfuerzo”.  
- número garantizado de sesiones de capacitación;  
- alcance universal de migración;  
- hardware incluido;  
- SLA o soporte incluido;  
- tiempos garantizados de respuesta;  
- precios o condiciones de un cliente como si fueran tarifas públicas.

La meta de onboarding documentada en un PRD no equivale automáticamente a un compromiso comercial o a un tiempo garantizado para cada cliente.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| IM-001 | NHILOS cuenta con un proceso de implementación. | Playbook vigente. | Operations |
| IM-002 | La implementación contempla preparación y verificación. | Checklist y criterios de aceptación. | Operations |
| IM-003 | La capacitación forma parte del alcance cuando así se acuerda. | Oferta y contrato aplicables. | Commercial / Operations |
| IM-004 | El go-live depende de criterios definidos. | Gate y acta de aceptación. | Operations |
| IM-005 | Los tiempos y entregables publicados reflejan compromisos vigentes. | Política comercial aprobada. | Commercial |

&nbsp;

---

# 11\. Section 09 — Hardware / Compatibility

## Purpose

Ayudar al visitante a entender que el hardware condiciona la experiencia y que la compatibilidad debe confirmarse por modelo, sistema operativo, periféricos y modalidad de operación.

## Proposed copy

**Headline**

> **El equipo correcto depende de cómo opera tu negocio.**

**Supporting copy**

> Un punto de venta puede funcionar en distintos formatos de dispositivo, pero no todos los equipos ofrecen las mismas capacidades. Antes de definir la instalación, revisamos el hardware, los periféricos y el escenario de conectividad que requiere tu operación.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Compatibility dimensions

La página debe comunicar únicamente combinaciones verificadas:

- marca y modelo del dispositivo;  
- sistema operativo y versión;  
- tamaño y resolución de pantalla;  
- impresora integrada o externa;  
- conexión USB, Bluetooth, LAN u otro medio;  
- lector, cajón u otros periféricos;  
- soporte de SDK o driver;  
- topología de red;  
- operación autónoma o multi-dispositivo;  
- limitaciones conocidas.

## Known project context — not blanket compatibility claims

La documentación del proyecto incluye trabajo específico con Sunmi V2s, impresión térmica ESC/POS y empaquetado Android. También contempla topologías de tablet autónoma y entornos con nodo local, tablets y KDS.

Estos antecedentes no autorizan a afirmar que todos los modelos Sunmi, impresoras ESC/POS, dispositivos Android, Windows o Linux sean compatibles en producción.

## Situation → Behavior → Effect

- **Situación:** el negocio dispone de un equipo o necesita elegir uno.  
- **Comportamiento:** se valida el modelo, los periféricos y la modalidad de operación contra la matriz de compatibilidad vigente.  
- **Efecto:** el cliente conoce qué configuración puede utilizar y qué requisitos debe resolver antes de la puesta en marcha.

## CTA

> Consultar compatibilidad

## Restrictions

No publicar:

- “Compatible con cualquier dispositivo”.  
- “Funciona con cualquier impresora”.  
- listas de marcas sin modelos y versiones validados;  
- compatibilidad basada únicamente en que un driver exista;  
- fotos de hardware que sugieran que está incluido en el precio;  
- soporte multi-dispositivo universal.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| HC-001 | NHILOS POS tiene combinaciones de hardware soportadas. | Matriz de compatibilidad vigente. | Engineering / Product |
| HC-002 | El dispositivo mostrado corresponde a una configuración probada. | Evidencia de instalación y pruebas. | Engineering |
| HC-003 | Los periféricos indicados funcionan en el escenario descrito. | Prueba por modelo, conexión y versión. | Engineering |
| HC-004 | Los requisitos y límites se comunican antes de la implementación. | Checklist comercial/técnico. | Operations |

&nbsp;

---

# 12\. Section 10 — Support

## Purpose

Explicar cómo solicitar ayuda y qué expectativa puede tener el cliente, sin transformar un acuerdo específico en una promesa general del producto.

## Proposed copy

**Headline**

> **Cuando necesitas ayuda, el siguiente paso debe estar claro.**

**Supporting copy**

> Una incidencia puede afectar una tarea, un dispositivo o la sincronización de información. El canal de atención y el proceso aplicable dependen del servicio contratado y del tipo de incidente. Antes de iniciar, te indicamos qué información preparar y cómo dar seguimiento.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Required public support model

Definir antes de publicar:

- canal oficial de contacto;  
- información necesaria para reportar;  
- categorías de incidentes;  
- horario y disponibilidad;  
- condiciones de atención;  
- alcance incluido;  
- exclusiones;  
- escalamiento;  
- tratamiento de incidentes críticos;  
- comunicación de estado;  
- compromisos de respuesta y resolución, solo si existen SLA aprobados.

## Situation → Behavior → Effect

- **Situación:** una tarea no funciona como se espera o aparece una incidencia.  
- **Comportamiento:** el cliente utiliza el canal contratado y aporta la información requerida; NHILOS sigue el proceso de diagnóstico y atención aplicable.  
- **Efecto:** ambas partes cuentan con un caso identificable y un siguiente paso definido, sin garantizar de antemano un tiempo de resolución no pactado.

## Contract boundary

La propuesta OE-001OM contiene condiciones específicas de servicio para SOHO. Su alcance no debe trasladarse automáticamente al website como oferta general.

## Restrictions

No publicar sin autoridad:

- “Soporte 24/7”.  
- “Atención inmediata”.  
- “Resolución garantizada”.  
- “Soporte ilimitado”.  
- tiempos de respuesta o resolución no pactados;  
- cobertura de hardware o redes de terceros que no esté contratada.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| SP-001 | Existe un canal/proceso de soporte para clientes cubiertos. | Política y canal vigentes. | Operations |
| SP-002 | El cliente puede conocer el alcance del servicio aplicable. | Planes y contratos aprobados. | Commercial |
| SP-003 | El proceso contempla seguimiento de incidentes. | Flujo operativo y sistema de registro. | Operations |
| SP-004 | Horarios y compromisos publicados son contractualmente válidos. | SLA/contratos y aprobación legal. | Commercial / Legal |

&nbsp;

---

# 13\. Section 11 — FAQs

Las respuestas siguientes son copy propuesto. Cada una queda bloqueada hasta que el contenido coincida con la versión pública, la configuración y el alcance comercial vigentes.

## FAQ-01 — ¿Qué es NHILOS POS?

**Respuesta propuesta**

NHILOS POS es un punto de venta que permite registrar operaciones comerciales y utilizar las capacidades relacionadas que estén habilitadas para el negocio, como métodos de pago, cuentas abiertas o procesos de inventario según su configuración.

**Status:** `EVIDENCE_REQUIRED`

## FAQ-02 — ¿Para qué tipo de negocio está pensado?

**Respuesta propuesta**

La solución se ha diseñado con foco en operaciones de atención y venta que requieren registrar productos, cobros y tareas relacionadas. El alcance aplicable a cada tipo de negocio debe confirmarse según los flujos, la configuración y el hardware soportados.

**Status:** `EVIDENCE_REQUIRED`

No convertir casos históricos o una arquitectura extensible en una promesa de cobertura ilimitada para cualquier industria.

## FAQ-03 — ¿Qué sucede si se pierde internet?

**Respuesta propuesta**

Depende del dispositivo y del escenario configurado. En los escenarios de continuidad soportados, determinadas operaciones pueden conservarse localmente y sincronizarse al recuperar conectividad. Antes de la implementación se debe confirmar qué tareas están cubiertas y cuáles requieren conexión.

**Status:** `EVIDENCE_REQUIRED`

## FAQ-04 — ¿La sincronización ocurre en tiempo real?

**Respuesta propuesta**

La sincronización depende de la conectividad, el estado de los dispositivos y los procesos habilitados. La información local y la información visible en superficies cloud pueden tener diferencias temporales. El comportamiento aplicable debe explicarse según el escenario de uso.

**Status:** `EVIDENCE_REQUIRED`

No prometer sincronización instantánea o frescura uniforme para todos los datos.

## FAQ-05 — ¿Puedo gestionar inventario desde NHILOS POS?

**Respuesta propuesta**

El producto contempla capacidades de inventario que pueden relacionarse con ventas, recetas, compras, producción y movimientos, según el alcance habilitado. La disponibilidad concreta de cada proceso debe confirmarse para tu configuración.

**Status:** `EVIDENCE_REQUIRED`

## FAQ-06 — ¿Puedo cobrar con tarjeta?

**Respuesta propuesta**

El flujo de tarjeta depende del datáfono, el banco adquirente y la integración disponible. En el esquema semiautomático, el cobro financiero se procesa en el equipo bancario y luego se registra en el POS siguiendo los pasos definidos.

**Status:** `EVIDENCE_REQUIRED`

No afirmar integración automática con todos los bancos o terminales.

## FAQ-07 — ¿Qué equipos necesito?

**Respuesta propuesta**

Los equipos dependen de la modalidad de operación, el volumen de trabajo y los periféricos requeridos. Antes de la puesta en marcha se valida la compatibilidad del dispositivo y de los accesorios necesarios.

**Status:** `EVIDENCE_REQUIRED`

## FAQ-08 — ¿Cómo es la implementación?

**Respuesta propuesta**

La implementación comienza por entender la operación y definir el alcance. Después se prepara la configuración, se prueban los flujos acordados y se verifica la preparación para el go-live. Los entregables, tiempos y capacitación dependen de la propuesta aceptada.

**Status:** `EVIDENCE_REQUIRED`

## FAQ-09 — ¿Qué soporte está incluido?

**Respuesta propuesta**

El soporte depende del plan y de las condiciones contratadas. Antes de iniciar el servicio se deben confirmar los canales, horarios, alcance y condiciones aplicables.

**Status:** `EVIDENCE_REQUIRED`

## FAQ-10 — ¿Cómo puedo ver NHILOS POS en funcionamiento?

**Respuesta propuesta**

Puedes solicitar una demo para conversar sobre tu operación y revisar los flujos que correspondan a tus necesidades. La demostración debe utilizar capacidades reales y explicar cualquier requisito o limitación relevante.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## FAQ rules

- Responder primero la pregunta; después explicar la condición relevante.  
- Evitar respuestas promocionales que no resuelvan la duda.  
- No esconder limitaciones detrás de lenguaje ambiguo.  
- No incluir precios, disponibilidad o condiciones comerciales sin aprobación.  
- Revisar las respuestas cuando cambien producto, hardware, soporte o contratos.

---

# 14\. Section 12 — Demo CTA

## Purpose

Convertir el interés en una conversación útil y contextualizada. La demo debe servir para entender el negocio y mostrar los workflows que realmente aplican, no para recorrer pantallas sin relación con las necesidades del visitante.

## Proposed copy

**Headline**

> **Veamos cómo funcionaría NHILOS POS en tu operación.**

**Supporting copy**

> Cuéntanos cómo vendes, qué necesitas coordinar y cuál es el principal reto de tu operación. Así podremos preparar una demostración enfocada en lo que realmente te interesa revisar.

**Primary CTA**

> Solicitar una demo

**Status:** `PROPOSED`

## Conversion principle

> **La demo es una conversación demostrada.**

## Form fields

Solicitar únicamente la información necesaria para preparar el contacto:

- nombre;  
- negocio;  
- medio de contacto;  
- tipo de operación;  
- principal reto o necesidad.

**Preferred question**

> ¿Qué te gustaría mejorar de tu operación?

Evitar un campo genérico de “Mensaje” si una pregunta contextual puede producir información más útil.

## Microcopy

**Intro**

> Comparte algunos datos para que podamos entender tu contexto.

**Submit**

> Enviar solicitud

**Privacy note**

> Utilizaremos tus datos para atender esta solicitud conforme a la política de privacidad aplicable.

La nota y el enlace de privacidad requieren revisión legal y deben corresponder a la política publicada.

**Success state — proposed**

> Recibimos tu solicitud. Revisaremos la información y te contactaremos por el medio indicado.

No mostrar este estado hasta que el backend confirme que la solicitud fue recibida.

**Error state — proposed**

> No pudimos enviar la solicitud. Verifica los datos e inténtalo nuevamente.

## CTA requirements

Antes de habilitar el formulario:

- definir destinatario y responsable de seguimiento;  
- definir validación de campos;  
- implementar protección contra spam;  
- confirmar tratamiento de datos y consentimiento;  
- probar estados de éxito y error;  
- definir el proceso de contacto posterior;  
- evitar prometer un tiempo de respuesta si no está acordado.

## Claim IDs

| ID | Claim | Evidence needed | Gate |
| :---- | :---- | :---- | :---- |
| DM-001 | El visitante puede solicitar una demo. | Formulario y flujo de recepción funcionales. | Web / Operations |
| DM-002 | La demo se prepara según el contexto compartido. | Proceso comercial y criterios de preparación. | Commercial |
| DM-003 | La información del formulario se trata conforme a la política publicada. | Revisión legal y prueba del flujo de datos. | Legal / Engineering |
| DM-004 | Los mensajes de confirmación reflejan el estado real del envío. | Integración y pruebas de estados. | Engineering |

&nbsp;

---

# 15\. Section 13 — Loyalty & Promotions

> **Nota de trazabilidad:** sección añadida como extensión posterior a la v1.1 aprobada, sin renumerar las secciones 01–12 existentes. Los claims de esta sección citan la extensión loyalty del OD-02 (`PC-LOY-01..06`), registrada en el OD-02 antes de ser citada aquí (orden de gobernanza `G-04`).

## Purpose

Explicar cómo el POS identifica clientes, acumula y canjea puntos, y aplica promociones de forma determinista, con los límites exactos de cada capacidad. La sección debe generar una expectativa correcta sobre lo que la lealtad hace hoy y lo que explícitamente no hace.

## Proposed copy

**Eyebrow**

> Lealtad y promociones

**Headline**

> **Identificás al cliente, acumulás puntos y aplicás promociones sin detener la caja.**

**Supporting copy**

> El cliente se identifica en mostrador por QR, código, teléfono o búsqueda por nombre, incluso sin internet. Los puntos se acumulan en cada venta y se canjean como descuento con reglas visibles: mínimo de puntos, validación de saldo y descuento nunca mayor al total. Las promociones configuradas centralmente se aplican solas y de forma determinista, y el dueño ajusta puntos con actor y motivo.

**Status:** `PROPOSED / EVIDENCE_REQUIRED`

## Situation → Behavior → Effect

- **Situación:** el negocio quiere fidelizar clientes y ejecutar promociones, pero el mostrador no puede depender de una conexión ni de reglas que nadie opera en el momento.
- **Comportamiento:** el cajero identifica al cliente con datos locales (`NHL1:{code}` por QR, código, teléfono o nombre); al guardar la venta con cliente seleccionado, el sistema acumula puntos a la tasa configurada y registra el canje validado cuando el operador lo inicia; el motor de promociones aplica de forma determinista las promociones activas localmente; las transacciones de puntos sincronizan a la nube con llave de idempotencia.
- **Efecto:** la fidelización y las promociones operan dentro del flujo de caja sin detener la venta, con la configuración y la economía de recompensas en manos del dueño, deriva de redondeo acotada (hasta 0.5 punto por transacción) y sin paridad exacta de saldo en tiempo real.

## Restrictions

No publicar sin evidencia adicional, ni insinuar:

- acumulación por reglas de programa, sellos o visitas (la tasa es plana);
- acumulación automática de puntos en la nube desde tickets;
- recompensas cuyo beneficio (descuento o producto gratis) se aplique solo al total del carrito;
- ciclo de intención/anulación de canje manejado desde el POS;
- expiración de puntos, niveles (tiers), campañas o dashboards de KPIs de loyalty;
- portal del consumidor;
- paridad exacta de saldo POS↔nube en tiempo real.

## Claim IDs

| ID | Claim | OD-02 source | Evidence needed | Gate |
| :---- | :---- | :---- | :---- | :---- |
| LY-001 | Los clientes acumulan puntos automáticamente en cada venta guardada localmente, offline. | PC-LOY-01 | Flujo earn demostrable con cliente seleccionado y tasa plana visible. | Product |
| LY-002 | Los puntos se canjean como descuento en mostrador con salvaguardas, siempre iniciado por el operador. | PC-LOY-02 | Validaciones de mínimo, saldo y tope al total demostrables; beneficio de catálogo no aplicado al carrito. | Product |
| LY-003 | Las transacciones de puntos sincronizan a la nube de forma idempotente; los duplicados no cuentan doble. | PC-LOY-03 | Ingesta con llave de idempotencia y prueba de replay; sin promesa de paridad exacta en tiempo real. | Engineering |
| LY-004 | Los clientes se identifican en mostrador por QR, código, teléfono o búsqueda por nombre, totalmente offline. | PC-LOY-04 | Cliente existente localmente; formato QR `NHL1:{code}`; permiso de cámara para escaneo. | Product |
| LY-005 | Las promociones (buy-X-get-Y free, porcentaje, monto fijo, combo) se aplican de forma automática y determinista en el POS y se administran centralmente. | PC-LOY-05 | Promoción activa localmente (push de nube recibido); filas malformadas descartadas; sin ligar a reglas de puntos. | Product |
| LY-006 | El dueño configura programas y recompensas, ajusta puntos con actor y motivo, y ve la economía profit-aware de cada recompensa. | PC-LOY-06 | Rol OWNER/MANAGER; sin KPIs de loyalty, campañas, tiers ni portal del consumidor. | Product / Backoffice |

&nbsp;

---

# 16\. Cross-Section Claim Register

Este registro consolida los claims mínimos de la página y sirve como base para la fase de verificación.

| Claim ID range | Section | Claim family | Primary evidence owner |
| :---- | :---- | :---- | :---- |
| PP-001–PP-004 | Product Promise | Posicionamiento y alcance | Product |
| PC-001–PC-004 | Product in Context | Contextos de uso | Product |
| CW-001–CW-006 | Core Workflows | Flujos de venta, cobro, retención y consulta | Product / Payments |
| CT-001–CT-005 | Continuity | Operación local y sincronización | Engineering / Product |
| CV-001–CV-005 | Control / Visibility | Datos, inventario, bitácora y métricas | Product / Finance / Security |
| RL-001–RL-004 | Roles | Tareas, permisos y superficies | Product / Security |
| GL-001–GL-004 | Gallery | Veracidad y vigencia de media | Product / Content / Legal |
| IM-001–IM-005 | Implementation | Proceso y compromisos | Operations / Commercial |
| HC-001–HC-004 | Hardware / Compatibility | Dispositivos y periféricos | Engineering |
| SP-001–SP-004 | Support | Canales y condiciones de atención | Operations / Commercial |
| FAQ-01–FAQ-10 | FAQs | Respuestas públicas | Owners por tema |
| DM-001–DM-004 | Demo CTA | Conversión y tratamiento de datos | Web / Commercial / Legal |
| LY-001–LY-006 | Loyalty & Promotions (§15) | Identificación de cliente, puntos, canje y promociones | Product / Engineering |

&nbsp;

## Claim verification fields

Cada claim debe contar con:

- `claim_id`;  
- copy exacto;  
- sección;  
- tipo de claim;  
- fuente de autoridad;  
- evidencia concreta;  
- versión de producto;  
- escenario/configuración aplicable;  
- responsable de aprobación;  
- estado;  
- fecha de verificación;  
- condición de expiración o revalidación.

Un claim no se considera aprobado por estar documentado en un PRD. Se requiere evidencia de comportamiento vigente y revisión del responsable correspondiente.

---

# 17\. Publication Gates

## Gate A — Product truth

Confirmar que cada capacidad:

- existe en la versión pública;  
- funciona en el escenario descrito;  
- tiene un flujo demostrable;  
- no depende de una configuración que se presenta como universal;  
- no está únicamente en roadmap o en pruebas aisladas.

## Gate B — Operational truth

Confirmar:

- topologías y escenarios soportados;  
- comportamiento offline y sincronización;  
- implementación vigente;  
- canales y alcance de soporte;  
- condiciones para go-live;  
- responsables operativos.

## Gate C — Commercial and legal truth

Confirmar:

- planes y precios que se decida mostrar;  
- alcance incluido/excluido;  
- hardware incluido o propiedad del cliente;  
- términos de soporte;  
- privacidad del formulario;  
- autorizaciones de logos, testimonios y casos;  
- ausencia de promesas contractuales accidentales.

## Gate D — Evidence and media

Confirmar:

- capturas actuales;  
- datos anonimizados o autorizados;  
- workflows reproducibles;  
- correspondencia entre caption y pantalla;  
- accesibilidad de imágenes y videos;  
- coherencia entre página, demo y producto.

## Gate E — Website consistency

Confirmar:

- continuidad narrativa con la homepage;  
- CTAs funcionales;  
- navegación y enlaces correctos;  
- ausencia de módulos futuros presentados como disponibles;  
- términos consistentes;  
- comportamiento responsive y accesible.

**Publication status:** `BLOCKED UNTIL REQUIRED CLAIMS AND GATES ARE APPROVED`.

---

# 18\. Editorial and UX Rules

## Writing rules

- Escribir desde situaciones reconocibles del negocio.  
- Describir acciones observables, no capacidades abstractas.  
- Explicar efectos operativos sin convertirlos en garantías.  
- Preferir verbos concretos: registrar, seleccionar, revisar, guardar, consultar, confirmar.  
- Utilizar términos técnicos solo cuando ayuden a comprender una decisión o limitación.  
- Mantener una sola idea principal por bloque.  
- Evitar superlativos y afirmaciones absolutas.  
- No utilizar “inteligente”, “automático”, “en tiempo real” o “total” sin definición y evidencia.

## UX rules

- La página debe permitir lectura progresiva: promesa, contexto, demostración, confianza y conversión.  
- Los workflows deben ser comprensibles sin conocimientos técnicos.  
- Los detalles condicionados deben estar cerca del claim al que aplican.  
- No ocultar restricciones relevantes en FAQs si el claim principal puede generar una expectativa equivocada.  
- La galería debe complementar la explicación, no sustituirla.  
- Los CTAs deben indicar claramente qué ocurrirá al activarlos.  
- El formulario debe pedir pocos datos y comunicar el tratamiento de la información.

## Visual direction

Alinear la presentación con la identidad NHILOS y el sistema visual del website. El diseño debe priorizar claridad, legibilidad, producto real y jerarquía funcional. No asumir que los tokens del POS o del backoffice se trasladan automáticamente al sitio público sin una decisión de diseño web.

---

# 19\. Open Decisions & Dependencies

Las siguientes decisiones deben cerrarse antes de la publicación. La tabla registra el estado de cierre verificado contra artefactos del repositorio:

| ID | Decision / dependency | Status | Owner | Evidence / Concrete Artifact Linkage | Detailed Resolution |
| :---- | :---- | :---- | :---- | :---- | :---- |
| OD-PP-01 | Definir el scope público exacto de NHILOS POS. | `PARTIALLY RESOLVED` | Product | NH-SA-0001 §2–§3; NH-SO-0001 §2–§5; reconciliación de build `1.0.1+6`. | Alcance congelado: POS 1.0.x + Owner Dashboard v2.0. Falta declaración formal de aprobación por versión como artefacto único de referencia. |
| OD-PP-02 | Confirmar workflows que pueden mostrarse en producción. | `PARTIALLY RESOLVED` | Product / QA | NH-AUD-POS-001 §3/§4 (workflows ejecutados); hold (retención y recuperación de ticket en espera, Workflow D) en NH-GL-0001 §2.C. | Workflows A/B/C/E evidenciados en auditoría; actualizaciones visuales dependen de los hallazgos PX remediados antes de publicar capturas. |
| OD-PP-03 | Aprobar matriz de continuidad por topología y dispositivo. | `PARTIALLY RESOLVED` | Engineering / Product | CD-05 §1–§3; CD-14; EX-17; NH-POL-BAK-001; NH-MAN-POS-001; NH-MAN-CTG-001; exclusión multi-dispositivo en NH-SO-0001 §5. | Topología single-terminal Q80 verificada. Multi-device y multi-sucursal quedan explícitamente fuera del scope comunicable; escenarios y límites documentados. |
| OD-PP-04 | Definir vistas administrativas disponibles y su frescura. | `CLOSED` | Product / Backoffice | NH-MAN-DSH-001 §2–§9. | Inventario de vistas y contrato de frescura del Owner Dashboard establecidos y publicados como artefacto manual. |
| OD-PP-05 | Aprobar nomenclatura de roles y capacidades. | `PARTIALLY RESOLVED` | Product / Security | NH-MAN-DSH-001 §8 (roles publicados); CD-15 (matriz de 4 roles). | Publicables Cajero / Supervisor / Owner según manual. La página pública adopta el modelo de 3 roles (Cajero / Supervisor / Owner) conforme a NH-MAN-DSH-001 §8; el cuarto rol de la matriz CD-15 (Mesero) pertenece al escenario de restaurante full-service (CD-15) y queda excluido del alcance público del perfil SOHO retail-food. |
| OD-PP-06 | Preparar capturas y videos de la versión vigente. | `PARTIALLY RESOLVED` | Content / Product | NH-AUD-POS-001 encabezado (17 capturas ADB con provenance); registro de media y criterios de captura post-remediación definidos. | Existe banco de capturas con provenance y criterios de renovación. Falta ejecutar capturas finales post-remediación y aprobar el media register. |
| OD-PP-07 | Aprobar proceso y entregables de implementación. | `CLOSED` | Operations / Commercial | OP-01 + OP-07 + CD-07/08/09/10 + NH-SO-0001 §4/§6 + readiness §14. | Playbook operativo completo y trazable desde provisioning hasta go-live; alcance comunicable definido. |
| OD-PP-08 | Publicar matriz de compatibilidad. | `PARTIALLY RESOLVED` | Engineering | NH-CHK-HW-001; checklist Q80. | Perfil verificado: MIRAY Q80 / iPOS Android 12 / impresora 80mm. Hardware multi-modelo prohibido sin checklist; falta decidir amplitud de la matriz pública. |
| OD-PP-09 | Definir soporte público general. | `CLOSED WITH CONDITION` | Operations / Commercial | NH-POL-SUP-001 (CLIENT-READY). | Objetivos no-SLA, canales WhatsApp + soporte@nhilospos.com, cobertura L–S 8:00–20:00 Managua. Condición de publicación: unificar canales de contacto según DR-0. |
| OD-PP-10 | Definir recepción y seguimiento de demos. | `OPEN` | Commercial / Web | Flujo y requerimientos de recepción de demos formalizados. | Pendiente asignación del receptor web/comercial responsable del seguimiento de demos. |
| OD-PP-11 | Aprobar privacidad y tratamiento del formulario. | `PARTIALLY RESOLVED` | Legal / Engineering | NH-POL-DAT-001 (CLIENT-READY, datos de cliente). | Aviso de datos de cliente aprobado. Requerida adenda de privacidad específica para el formulario de contacto antes de publicar. |
| OD-PP-12 | Validar consistencia final con homepage v1.1. | `OPEN` | Content / Product | Contraste condicionado a disponibilidad del documento upstream. | Gate E bloqueado hasta que el documento homepage v1.1 esté disponible para revisión cruzada y cierre editorial. |

&nbsp;

---

# 20\. Definition of Done

La página puede pasar a diseño/implementación cuando:

- [x] las 13 secciones conservan el orden contractual (12 originales + Loyalty & Promotions añadida como Section 13, con renumeración de las secciones de cierre del documento);  
- [x] cada bloque respeta Situación → Comportamiento → Efecto;  
- [x] los claims funcionales tienen evidencia o permanecen bloqueados — el registro existe y todo claim sin evidencia verificada permanece bloqueado; la verificación claim por claim es prerrequisito de publicación, no de esta lista;  
- [x] continuidad describe escenarios concretos y sus límites — escenarios y topología single-terminal Q80 documentados; la evidencia de pruebas es materia de Gate B;  
- [x] las superficies POS y backoffice están diferenciadas;  
- [x] roles y permisos no se presentan de forma especulativa — solo se comunican Cajero / Supervisor / Owner (modelo de 3 roles conforme a NH-MAN-DSH-001 §8); el cuarto rol de la matriz CD-15 (Mesero) pertenece al escenario de restaurante full-service y queda excluido del alcance público del perfil SOHO retail-food;  
- [ ] cada captura corresponde a una versión identificada — pendiente capturas finales post-remediación y aprobación del media register (OD-PP-06, Gate D);  
- [x] implementación, hardware y soporte no generan compromisos no aprobados — copy restringido al playbook cerrado (OD-PP-07), al perfil Q80 verificado (OD-PP-08) y a NH-POL-SUP-001;  
- [x] las FAQs responden preguntas reales y no contradicen el copy principal;  
- [ ] la demo tiene un flujo funcional y responsable de seguimiento — flujo definido, receptor web/comercial sin asignar (OD-PP-10);  
- [ ] privacidad y accesibilidad han sido revisadas — aviso de datos de cliente CLIENT-READY; falta adenda de privacidad del formulario y revisión final de accesibilidad (OD-PP-11, Gate C/E);  
- [ ] se completaron los publication gates aplicables — estado actual de Gates A–E en §22.3;  
- [x] existe un registro de claims con responsables y fecha de aprobación — el registro y sus campos obligatorios están definidos; las entradas quedan sujetas a la verificación de claims.

Los ítems marcados `[x]` corresponden a cierre editorial/estructural verificado en la auditoría del contrato. Los ítems `[ ]` son gate-dependent y se rigen por el estado de Gates A–E y por las decisiones OD-PP registradas en §19.

---

# 21\. Final Content Contract

La página profunda de NHILOS POS debe demostrar el producto desde la operación real: qué situación atiende, qué hace el sistema y qué efecto observable produce. Su función no es maximizar la cantidad de funcionalidades anunciadas, sino reducir la incertidumbre del visitante y facilitar una evaluación informada.

La página no debe vender como disponible lo que solo está diseñado, planificado o probado en un contexto distinto. La continuidad debe explicarse con límites. El control debe describirse con datos y permisos reales. La implementación y el soporte deben corresponder al alcance comercial vigente. La galería debe mostrar el producto que el visitante realmente puede recibir.

> **Contrato narrativo:** situación reconocible → comportamiento verificable → efecto operativo comprensible.

**Version:** `1.1`  
**Status:** `APPROVED / AUTHORITATIVE CONTENT CONTRACT — PUBLICATION GATED`  
**Publication authority:** `NOT GRANTED`

---

# 22\. Audit & Promotion Record

**Audit:** `CONTENT-CONTRACT AUDIT — CLOSED WITH PUBLICATION BLOCKERS`  
**Reviewed version:** `1.0`  
**Promoted version:** `1.1`  
**Date:** `2026-10-02`

## 22.1 Findings and corrective actions

| ID | Finding | Correction / disposition | Closure status |
| :---- | :---- | :---- | :---- |
| AA-01 | La relación con la homepage se presentaba como derivación ya confirmada, pero el documento upstream no estuvo disponible para contraste durante esta revisión. | Se cambió la declaración de autoridad: la homepage queda como referencia prevista y su consistencia pasa explícitamente al Gate E y a OD-PP-12. | `CLOSED — wording corrected; cross-check pending` |
| AA-02 | La existencia de requisitos o diseños podía confundirse con disponibilidad productiva. | Se reafirma que PRDs, roadmap, prototipos y pruebas aisladas no bastan para aprobar claims; Gate A exige versión pública y workflow demostrable. | `CLOSED — control explicit` |
| AA-03 | La narrativa de continuidad podía interpretarse como garantía general. | Se conserva el enfoque por escenarios, límites y topologías; toda afirmación queda condicionada a matriz y pruebas vigentes. | `CLOSED — publication evidence pending` |
| AA-04 | Podía confundirse la superficie POS con backoffice, dashboard o capacidades futuras. | Se mantiene la diferenciación por superficie como requisito explícito de DoD y de las verificaciones de producto. | `CLOSED — validation evidence pending` |
| AA-05 | La compatibilidad de hardware no estaba respaldada por una matriz pública completa. | Se prohíben claims generales y se mantiene OD-PP-08 como dependencia previa a publicar compatibilidad concreta. | `CLOSED — publication evidence pending` |
| AA-06 | Implementación y soporte podían crear compromisos comerciales no aprobados. | Se condicionan alcance, entregables, canales, cobertura y SLA al modelo comercial/operativo aprobado. | `CLOSED — commercial approval pending` |
| AA-07 | No existe un expediente de evidencia completo para cada claim. | Se formalizan los campos obligatorios del registro y se mantiene bloqueada la publicación de claims no aprobados. | `CLOSED — evidence collection pending` |
| AA-08 | Faltaba separar el cierre editorial del permiso de publicación. | Se establece la promoción del contrato como decisión independiente y se conserva `Publication authority: NOT GRANTED`. | `CLOSED` |
| AA-09 | Las decisiones OD-PP-01 a OD-PP-12 carecían de trazabilidad de estado, evidencia y resolución detallada, impidiendo distinguir cierres reales de pendientes. | Se expande la tabla de §19 con columnas Status, Owner, Evidence / Concrete Artifact Linkage y Detailed Resolution, vinculando cada decisión a artefactos del repositorio (NH-SA-0001, NH-SO-0001, NH-MAN-DSH-001, NH-AUD-POS-001, OP-01/OP-07, CD-05/06/14/15, NH-CHK-HW-001, NH-POL-SUP-001, NH-POL-DAT-001, readiness §14). | `CLOSED — evidence integrated` |
| AA-10 | La Definition of Done no distinguía ítems editoriales/estructurales verificados de condiciones gate-dependent, lo que permitía leer la lista como bloqueo total o como aprobación total. | Se actualiza §20: los ítems de cierre editorial/estructural verificado quedan marcados `[x]` y los gate-dependent permanecen `[ ]` con referencia explícita a su OD-PP y gate correspondiente. | `CLOSED — delineation applied` |
| AA-11 | El estado de las vistas administrativas y su frescura no contaba con artefacto de referencia, dejando Gate A y la sección de dashboard sin sustento verificable. | Inventario de vistas y contrato de frescura del Owner Dashboard establecidos en NH-MAN-DSH-001 §2–§9; OD-PP-04 pasa a `CLOSED`. | `CLOSED — artifact published` |
| AA-12 | La lista de blockers residuales no especificaba el estado exacto de cierre de las OD-PP, el estado de Gates A–E ni el prerrequisito de verificación de claims, y carecía de disposición formal de autoridad de publicación. | Se reescribe §22.3 con el estado de cierre exacto de OD-PP-01 a OD-PP-12, el estado por gate (A–E), el prerrequisito de verificación de claims y la declaración final de autoridad de publicación. | `CLOSED — disposition formalized` |

&nbsp;

## 22.2 Promotion decision

Se promueve este documento a:

> **Version 1.1 — APPROVED / AUTHORITATIVE CONTENT CONTRACT FOR NHILOS POS PRODUCT PAGE**

La aprobación cubre la arquitectura narrativa, el orden de las doce secciones, los criterios editoriales, el modelo de claims, las restricciones de contenido y los gates de publicación. No certifica que cada funcionalidad descrita esté disponible, ni aprueba capturas, compatibilidad, soporte, condiciones comerciales, privacidad o consistencia final con la homepage.

En la revisión posterior del registro de auditoría se verificó el cierre parcial del conjunto de decisiones OD-PP contra artefactos del repositorio: OD-PP-04 y OD-PP-07 `CLOSED`, OD-PP-09 `CLOSED WITH CONDITION` (unificación de canales DR-0), siete decisiones `PARTIALLY RESOLVED` con evidencia vinculada (OD-PP-01/02/03/05/06/08/11) y dos `OPEN` (OD-PP-10, OD-PP-12 / Gate E). Esta reconciliación se registra en §19 y §22.3 y no modifica el alcance de la aprobación: la promoción sigue siendo una decisión editorial independiente del permiso de publicación, que permanece `NOT GRANTED`.

## 22.3 Residual publication blockers

Los siguientes elementos permanecen abiertos y no deben interpretarse como defectos del contrato aprobado; son condiciones de salida a producción. Esta sección es la disposición formal de cierre vigente y sustituye a la lista genérica de la versión 1.0 del registro.

### Estado de cierre de las decisiones OD-PP

| Estado | Decisiones |
| :---- | :---- |
| `CLOSED` | OD-PP-04 (vistas y frescura del dashboard, NH-MAN-DSH-001 §2–§9); OD-PP-07 (playbook de implementación, OP-01 + OP-07 + CD-07/08/09/10 + NH-SO-0001 §4/§6 + readiness §14). |
| `CLOSED WITH CONDITION` | OD-PP-09 (soporte público según NH-POL-SUP-001; condición de publicación: unificación de canales de contacto DR-0). |
| `PARTIALLY RESOLVED` | OD-PP-01 (scope congelado, build `1.0.1+6`); OD-PP-02 (workflows evidenciados, capturas sujetas a remediación PX); OD-PP-03 (topología single-terminal Q80; multi-device excluido); OD-PP-05 (3 roles publicados; cuarto rol de CD-15 excluido del alcance público SOHO retail-food); OD-PP-06 (17 capturas ADB con provenance; media register pendiente); OD-PP-08 (perfil Q80/iPOS Android 12 80mm verificado); OD-PP-11 (aviso de datos CLIENT-READY; adenda de privacidad del formulario requerida). |
| `OPEN` | OD-PP-10 (receptor web/comercial de demos sin asignar); OD-PP-12 / Gate E (documento homepage v1.1 upstream pendiente). |

### Estado de los publication gates

| Gate | Estado | Condición pendiente |
| :---- | :---- | :---- |
| Gate A — Product truth | `CONDITIONALLY ADVANCED` | Scope y workflows con evidencia (NH-SO-0001, NH-AUD-POS-001); falta verificación claim por claim del registro y capturas post-remediación PX. |
| Gate B — Operational truth | `CONDITIONALLY ADVANCED` | Topología, implementación y go-live con playbook cerrado (OD-PP-07); soporte cerrado con condición (OD-PP-09: unificación de canales DR-0). |
| Gate C — Commercial and legal truth | `CONDITIONALLY ADVANCED` | Privacidad de datos de cliente CLIENT-READY (NH-POL-DAT-001); falta adenda de privacidad del formulario de contacto (OD-PP-11). |
| Gate D — Evidence and media | `BLOCKED` | Capturas con provenance existentes, pero media register sin aprobar y capturas finales post-remediación sin ejecutar (OD-PP-06). |
| Gate E — Website consistency | `BLOCKED` | Contraste contra homepage v1.1 condicionado a la disponibilidad del documento upstream (OD-PP-12); revisión final de responsive y accesibilidad pendiente. |

### Prerrequisito de verificación de claims

Ningún claim del registro (§16) puede publicarse sin verificación registrada con versión/build, escenario, responsable, estado y fecha. Los claims sin evidencia permanecen bloqueados; el registro con responsables y fecha de aprobación es prerrequisito de Gate A y Gate D, y su cumplimiento se auditará contra la versión publicada del producto (`1.0.1+6` o posterior).

### Disposición final de autoridad de publicación

La autoridad de publicación permanece `NOT GRANTED`. La página solo puede pasar a producción cuando:

1. las condiciones de OD-PP-09 (unificación de canales DR-0) y OD-PP-11 (adenda de privacidad del formulario) estén cerradas;  
2. el media register esté aprobado con capturas post-remediación (OD-PP-06, Gate D);  
3. el receptor de demos esté asignado (OD-PP-10);  
4. el contraste contra homepage v1.1 esté ejecutado y documentado (OD-PP-12, Gate E);  
5. la verificación de claims del registro esté completa; y  
6. los Gates A–E hayan pasado formalmente.

Mientras alguna de estas condiciones permanezca abierta, este documento permanece como el contrato de contenido vigente, no como un permiso de publicación. Su rol está asignado en `nhilos_branding_document_governance_v1.0.md`.

---

# Anexo A — Matriz de Trazabilidad de Claims (Product Page → OD-02)

**Propósito.** La regla de gobernanza `G-04` (`nhilos_branding_document_governance_v1.0.md`, §Reglas) exige que todo claim técnico publicado cite un ID de claim del OD-02 (`product_claim_audit_od02_v1.3.md`), que es la autoridad de claims de la cadena. Los Claim IDs de esta página (`PP-*`, `PC-*`, `CW-*`, `CT-*`, `CV-*`, `RL-*`, `GL-*`, `IM-*`, `HC-*`, `SP-*`, `DM-*`, `LY-*`) son **IDs de slot de contenido** que anclan una aserción dentro de una sección; los IDs del OD-02 (`PC-OFF-*`, `PC-FISC-*`, `PC-PAY-*`, `PC-INV-*`, `PC-HW-*`, `PC-SEC-*`, `PC-DASH-*`, `PC-ONB-*`, `PC-LOY-*`) son **IDs de capacidad técnica**. No existe correspondencia 1:1 entre ambos universos: esta matriz registra, para cada claim de la página, el/los IDs del OD-02 que lo respaldan técnicamente, o declara explícitamente que no hay base. Ningún claim `RESPALDADO` puede publicarse sin citar su ID OD-02; ningún claim `SIN BASE OD-02` puede publicarse como capacidad técnica sin resolver previamente su anclaje (ver sub-sección siguiente).

| Claim ID | Sección | Assertion (resumen) | OD-02 ID(s) | Tipo | Estado |
| :---- | :---- | :---- | :---- | :---- | :---- |
| PP-001 | §3 Product Promise | Punto de venta para registrar operaciones comerciales. | PC-OFF-01, PC-OFF-02 | TÉCNICO | RESPALDADO |
| PP-002 | §3 Product Promise | Relaciona el registro de venta con capacidades operativas asociadas. | N/A | MARKETING | MARKETING |
| PP-003 | §3 Product Promise | El flujo permite trabajar con claridad. | N/A | MARKETING | MARKETING |
| PP-004 | §3 Product Promise | La promesa de continuidad aplica a escenarios soportados, no de forma absoluta. | N/A | MARKETING | MARKETING |
| PC-001 | §4 Product in Context | Contempla escenarios de atención en mostrador. | PC-OFF-01 | TÉCNICO | RESPALDADO |
| PC-002 | §4 Product in Context | Contempla cuentas abiertas o mesas en modalidades soportadas. | N/A | TÉCNICO | SIN BASE OD-02 |
| PC-003 | §4 Product in Context | Las ventas pueden relacionarse con movimientos de inventario configurados. | PC-INV-01, PC-INV-04 | TÉCNICO | RESPALDADO |
| PC-004 | §4 Product in Context | La experiencia mostrada corresponde a la versión vigente. | N/A | MARKETING | MARKETING |
| CW-001 | §5 Core Workflows | Permite seleccionar productos y construir una cuenta. | PC-OFF-01, PC-OFF-02 | TÉCNICO | RESPALDADO |
| CW-002 | §5 Core Workflows | El flujo puede incluir modificadores configurados. | N/A | TÉCNICO | SIN BASE OD-02 |
| CW-003 | §5 Core Workflows | Registra pagos con los métodos disponibles. | PC-PAY-01, PC-PAY-04, PC-PAY-06 | TÉCNICO | RESPALDADO |
| CW-004 | §5 Core Workflows | El esquema de tarjeta puede requerir confirmación manual posterior al datáfono. | PC-PAY-01 | TÉCNICO | RESPALDADO |
| CW-005 | §5 Core Workflows | Existen cuentas abiertas/retención en modalidades soportadas. | N/A | TÉCNICO | SIN BASE OD-02 |
| CW-006 | §5 Core Workflows | Existen superficies de consulta para información operativa. | PC-DASH-01, PC-DASH-02, PC-DASH-03, PC-DASH-04 | TÉCNICO | RESPALDADO |
| CT-001 | §6 Continuity | Enfoque offline-first en los escenarios definidos. | PC-OFF-01, PC-OFF-02 | TÉCNICO | RESPALDADO |
| CT-002 | §6 Continuity | Determinadas operaciones pueden continuar localmente durante una desconexión soportada. | PC-OFF-01 | TÉCNICO | RESPALDADO |
| CT-003 | §6 Continuity | Existe sincronización posterior de información pendiente. | PC-OFF-03 | TÉCNICO | RESPALDADO |
| CT-004 | §6 Continuity | El comportamiento depende del escenario soportado. | N/A | MARKETING | MARKETING |
| CT-005 | §6 Continuity | El usuario conoce los límites y estados pendientes relevantes. | N/A | TÉCNICO | SIN BASE OD-02 |
| CV-001 | §7 Control / Visibility | Registra información de ventas consultable. | PC-OFF-02, PC-DASH-01, PC-DASH-04 | TÉCNICO | RESPALDADO |
| CV-002 | §7 Control / Visibility | Existen capacidades de inventario y consulta de movimientos. | PC-INV-02, PC-INV-03, PC-INV-05, PC-DASH-04 | TÉCNICO | RESPALDADO |
| CV-003 | §7 Control / Visibility | Determinadas acciones pueden quedar registradas en bitácora. | PC-SEC-02, PC-SEC-03 | TÉCNICO | RESPALDADO |
| CV-004 | §7 Control / Visibility | La información presentada refleja su frescura y alcance. | PC-DASH-02 | TÉCNICO | RESPALDADO |
| CV-005 | §7 Control / Visibility | Los indicadores y términos públicos tienen semántica aprobada. | N/A | MARKETING | MARKETING |
| RL-001 | §8 Roles | El POS soporta tareas de venta y cobro. | PC-OFF-01, PC-PAY-01, PC-PAY-04 | TÉCNICO | RESPALDADO |
| RL-002 | §8 Roles | Existen permisos diferenciados para acciones específicas. | PC-SEC-02 | TÉCNICO | RESPALDADO |
| RL-003 | §8 Roles | Existen superficies de consulta para responsables del negocio. | PC-DASH-01, PC-DASH-02, PC-DASH-03, PC-DASH-04 | TÉCNICO | RESPALDADO |
| RL-004 | §8 Roles | Las capacidades mostradas corresponden a los permisos reales. | N/A | MARKETING | MARKETING |
| GL-001 | §9 Gallery | Las capturas corresponden al producto vigente. | N/A | MARKETING | MARKETING |
| GL-002 | §9 Gallery | Cada imagen representa el workflow indicado. | N/A | MARKETING | MARKETING |
| GL-003 | §9 Gallery | Los datos visibles están autorizados y contextualizados. | N/A | MARKETING | MARKETING |
| GL-004 | §9 Gallery | Los estados y cifras no fueron alterados de forma engañosa. | N/A | MARKETING | MARKETING |
| IM-001 | §10 Implementation | NHILOS cuenta con un proceso de implementación. | PC-ONB-03 | TÉCNICO | RESPALDADO |
| IM-002 | §10 Implementation | La implementación contempla preparación y verificación. | PC-ONB-01, PC-ONB-03 | TÉCNICO | RESPALDADO |
| IM-003 | §10 Implementation | La capacitación forma parte del alcance cuando así se acuerda. | N/A | MARKETING | MARKETING |
| IM-004 | §10 Implementation | El go-live depende de criterios definidos. | PC-ONB-03 | TÉCNICO | RESPALDADO |
| IM-005 | §10 Implementation | Los tiempos y entregables publicados reflejan compromisos vigentes. | N/A | MARKETING | MARKETING |
| HC-001 | §11 Hardware / Compatibility | Tiene combinaciones de hardware soportadas. | PC-HW-01, PC-HW-02, PC-HW-03 | TÉCNICO | RESPALDADO |
| HC-002 | §11 Hardware / Compatibility | El dispositivo mostrado corresponde a una configuración probada. | N/A | MARKETING | MARKETING |
| HC-003 | §11 Hardware / Compatibility | Los periféricos indicados funcionan en el escenario descrito. | PC-HW-01, PC-HW-02 | TÉCNICO | RESPALDADO |
| HC-004 | §11 Hardware / Compatibility | Los requisitos y límites se comunican antes de la implementación. | N/A | MARKETING | MARKETING |
| SP-001 | §12 Support | Existe un canal/proceso de soporte para clientes cubiertos. | N/A | MARKETING | MARKETING |
| SP-002 | §12 Support | El cliente puede conocer el alcance del servicio aplicable. | N/A | MARKETING | MARKETING |
| SP-003 | §12 Support | El proceso contempla seguimiento de incidentes. | N/A | MARKETING | MARKETING |
| SP-004 | §12 Support | Horarios y compromisos publicados son contractualmente válidos. | N/A | MARKETING | MARKETING |
| DM-001 | §14 Demo CTA | El visitante puede solicitar una demo. | N/A | MARKETING | MARKETING |
| DM-002 | §14 Demo CTA | La demo se prepara según el contexto compartido. | N/A | MARKETING | MARKETING |
| DM-003 | §14 Demo CTA | La información del formulario se trata conforme a la política publicada. | N/A | MARKETING | MARKETING |
| DM-004 | §14 Demo CTA | Los mensajes de confirmación reflejan el estado real del envío. | N/A | MARKETING | MARKETING |
| LY-001 | §15 Loyalty & Promotions | Acumulación automática de puntos por venta guardada localmente, offline. | PC-LOY-01 | TÉCNICO | RESPALDADO |
| LY-002 | §15 Loyalty & Promotions | Canje de puntos como descuento en mostrador con salvaguardas, iniciado por el operador. | PC-LOY-02 | TÉCNICO | RESPALDADO |
| LY-003 | §15 Loyalty & Promotions | Sincronización idempotente de transacciones de puntos; duplicados no cuentan doble. | PC-LOY-03 | TÉCNICO | RESPALDADO |
| LY-004 | §15 Loyalty & Promotions | Identificación del cliente por QR, código, teléfono o nombre, totalmente offline. | PC-LOY-04 | TÉCNICO | RESPALDADO |
| LY-005 | §15 Loyalty & Promotions | Promociones aplicadas de forma automática y determinista en el POS, administradas centralmente. | PC-LOY-05 | TÉCNICO | RESPALDADO |
| LY-006 | §15 Loyalty & Promotions | Configuración de programas/recompensas, ajuste de puntos con actor y motivo, economía profit-aware. | PC-LOY-06 | TÉCNICO | RESPALDADO |

Notas de la matriz:

- PP-004 y CT-004 son enunciados de acotación de promesa (promise framing): no afirman capacidad técnica; el límite que referencian está declarado en el OD-02 como limitación de `PC-OFF-01` (LIM-01), no como claim autónomo.
- `PC-003`/`CV-002` heredan la limitación de LIM-05: la deducción de insumos aplica solo a productos `COMPOUND` con receta publicada.
- Los claims `MARKETING` con OD-02 `N/A` no afirman capacidad técnica del producto; si en revisión posterior se reformularan como capacidades, deberán re-ingresar a esta matriz con anclaje OD-02.

## Claims sin base en el OD-02

Los siguientes claims afirman una capacidad técnica sin ningún claim del OD-02 que la respalde. Su resolución **está pendiente** y no se decide unilateralmente en este anexo:

- **PC-002** — Cuentas abiertas o mesas en modalidades soportadas. *Recomendación (pendiente de resolución):* `PC-PAY-05` (Split Bill) acredita la existencia de órdenes abiertas de salón, pero no cubre atómicamente la retención, recuperación y concurrencia de cuentas; o bien se extiende el OD-02 con un claim atómico de retención de cuentas abiertas, o el claim se retira de publicación hasta ese anclaje.
- **CW-002** — El flujo puede incluir modificadores configurados. *Recomendación (pendiente de resolución):* ningún claim del OD-02 audita grupos de modificadores y sus reglas; o bien se extiende el OD-02 con un claim atómico de modificadores configurables, o el workflow de personalización se retira de publicación.
- **CW-005** — Existen cuentas abiertas/retención en modalidades soportadas. *Recomendación (pendiente de resolución):* misma disposition que `PC-002` (extensión del OD-02 o retiro de publicación).
- **CT-005** — El usuario conoce los límites y estados pendientes relevantes. *Recomendación (pendiente de resolución):* la visibilidad de estados pendientes en el POS no está auditada en el OD-02; o bien se extiende el OD-02 con un claim atómico de transparencia de estados en el POS, o el claim se re-enfoca al lado dashboard re-anclándolo a `PC-DASH-02` (frescura de sincronización), o se retira de publicación.
---

**Final disposition:** `CONTENT CONTRACT APPROVED — PUBLICATION BLOCKED UNTIL GATES PASS`.
