# NHILOS POS — Terminal Experience Standard

**Document:** `nhilos_pos_experience_standard_v1.0.md`
**Version:** 1.0
**Status:** APPROVED / AUTHORITATIVE EXPERIENCE STANDARD FOR NHILOS POS TERMINAL
**Date:** 2026-10-02
**Scope:** Todas las superficies de la aplicación NHILOS POS en terminal: acceso y PIN, catálogo, carrito, cobro y facturación, historial de ventas, detalle de factura, anulación DGI, control de caja y arqueo, KDS (monitor de cocina), impresión térmica, periféricos, sincronización offline y navegación módulo a módulo.
**Primary purpose:** Servir como filtro universal de auditoría, estándar de implementación y Definition of Done para cada módulo del POS.
**Intended users:** Product, Design, Frontend (Flutter), Backend, QA, revisores y agentes de implementación/auditoría de IA.

**Hardware de referencia:** MIRAY Q80 / iPOS (Android 12, pantalla táctil 800x1280 vertical, impresora térmica 80 mm, gaveta de efectivo, escáner de código de barras/QR).

**Autoridad aguas arriba:**
- `nhilos_brand_experience_principles_v1.0.md` (Parte B: NHILOS POS Expression)
- `nhilos_backoffice_experience_standard_v1.0.md` (paridad estructural §0–§62)
- PRDs de módulo aprobados / Architecture Specs / Acceptance Plans
- `AGENTS.md` del monorepo: Offline-First o Muerte (SQLite como fuente de verdad), cumplimiento DGI (Disposición Técnica 09-2007: las facturas no se eliminan, solo se anulan con `is_canceled` y numeración secuencial obligatoria), aislamiento multi-tenant.

**Referencia únicamente, no autoridad de POS:**
- Briefs de marketing del sitio web, cuando un principio sirva como disciplina de experiencia pero no redefina comportamiento de producto.

---

# 0. Contrato de autoridad y conflictos

Este documento gobierna **cómo se expresa el estándar NHILOS en la terminal POS**.

No inventa ni reemplaza comportamiento de dominio.

Para cada módulo auditado, el agente debe trabajar con dos autoridades simultáneamente:

```text
AUTORIDAD DE PRODUCTO DEL MÓDULO
PRD / Arquitectura / Aceptación
        +
AUTORIDAD DE EXPERIENCIA NHILOS
Brand Experience / POS Terminal Standard
        ↓
MÓDULO IMPLEMENTADO
```

## 0.1 Reglas de conflicto

Cuando las autoridades parezcan entrar en conflicto:

### La verdad de producto gana a la conveniencia visual

Nunca cambiar solo para que la interfaz sea más limpia:

- la semántica financiera (vuelto, multimoneda, tipos de cambio);
- el comportamiento fiscal DGI (numeración secuencial, anulación con motivo, `is_canceled`, no-eliminación);
- la contabilidad de inventario;
- los permisos y las jerarquías de autorización;
- la seguridad (PIN de supervisor, auditoría);
- la verdad de sincronización (SQLite fuente de verdad, la nube espejo eventualmente consistente);
- las garantías de auditoría;
- el ciclo de vida del dominio;
- la política de acciones destructivas.

### Los no-negociables de marca ganan a la conveniencia de implementación

Un atajo de implementación no justifica:

- copy engañoso;
- controles inaccesibles;
- dark patterns;
- falsa certeza ("Venta completada" cuando el ticket no se emitió);
- repetición innecesaria;
- navegación sin salida;
- ocultar condiciones materiales (colas sin sincronizar, papel agotado, periférico desconectado).

### La experiencia no reescribe silenciosamente el Producto

Si el estándar sugiere una mejor interacción pero un PRD aprobado exige explícitamente otro comportamiento:

> reportar `AUTHORITY_CONFLICT`.

No modificar silenciosamente el contrato de producto.

### Los tokens de diseño no son semántica de producto

El sistema visual vigente (Navy/Deep Teal, Green, neutrales, Inter) es expresión operativa de NHILOS POS y input de alta autoridad (Brand §22), salvo que una spec de expresión de producto aprobada más nueva reemplace deliberadamente un patrón.

---

# 1. El estándar NHILOS POS

La terminal debe sentirse como software construido por una compañía que:

- entendió la operación de barra y caja;
- preparó el contexto antes de la hora pico;
- redujo el trabajo innecesario del cajero;
- comunicó con precisión;
- manejó la incertidumbre con honestidad (offline, sincronización, periféricos);
- anticipó el siguiente paso útil;
- eliminó lo que no ayudaba;
- verificó la promesa central antes de pulir.

La reacción objetivo no es:

> "Qué aplicación tan lujosa."

Es:

> **"Aquí pensaron en los detalles."**

Y progresivamente:

> **"Esto se siente NHILOS."**

La Product Essence de NHILOS POS (Brand §19) gobierna toda decisión:

> **"Cuidamos la operación."**

Y su traducción humana (Brand §21):

> **"NHILOS POS cuida a las personas que cuidan la operación."**

---

# 2. Fórmula operativa

Toda experiencia de la terminal se evalúa en este orden:

```text
CORE PROMISE (la venta se realiza y la verdad fiscal/operativa es exacta)
    ↓
PRECISIÓN (cálculos de vuelto, multimoneda y stock sin margen de duda)
    ↓
FIABILIDAD (Continuidad Operativa: offline-first real; si el Wi-Fi cae, nada se detiene)
    ↓
CUIDADO (respeto por la identidad del comercio y la dignidad del operador)
    ↓
TIEMPO (cero toques innecesarios en hora pico; velocidad de cobro)
    ↓
SOBRIEDAD (paleta unificada, calma visual, cero arcoíris)
    ↓
CONSISTENCIA (mismos componentes, radios y tipografías en toda la app)
    ↓
+1 (gestos memorables que elevan la experiencia de cobro)
```

Un escalón posterior nunca compensa la falla de uno anterior.

Un +1 hermoso sobre un cobro incorrecto, inseguro o confuso es un fracaso.

---

# 3. Qué significa "lujo" en NHILOS POS

La "luxurización" es un origen estratégico interno, no un estilo visual ni un claim público.

En la terminal significa:

> **Elevar el valor real y percibido mediante precisión, atención, anticipación, criterio y restricción.**

## 3.1 Dirección visual y disciplina creativa (Brand §23)

> **"No queremos que NHILOS POS parezca caro. Queremos que parezca cuidado."**

Referencia creativa:

> **70% sobriedad / 20% producto / 10% gesto memorable (+1)**

No es una fórmula matemática. Es una disciplina creativa: la gran mayoría de la pantalla es calma estructurada; el producto ocupa el centro; como máximo un gesto memorable por experiencia clave.

## 3.2 El lujo SÍ es

- tipografía tabular: los montos nunca "bailan" al cambiar cifras;
- espacio para el impacto táctil: targets generosos y seguros;
- tratamiento del contexto: una cafetería de especialidad proyecta elegancia cafetera, nunca iconografía genérica de comida rápida;
- transiciones instantáneas (<50 ms de respuesta al toque): la velocidad es respeto por la fila;
- estados silenciosos vs. alertas reales: cuando todo marcha bien el sistema es discreto; cuando hay una excepción (ticket sin sincronizar, papel agotado), la señal es inequívoca y orienta la solución;
- preservar la venta bajo cualquier interrupción;
- lenguaje que el operador de negocio entiende sin capacitación extra.

## 3.3 El lujo NO es

- más tarjetas;
- glassmorphism;
- negro/dorado;
- clichés visuales "premium";
- animación lenta;
- densidad asfixiante (siete filas de selectores comprimidos en la pantalla de cobro);
- diálogos de confirmación para acciones rutinarias y reversibles;
- interacciones custom que reducen familiaridad;
- ocultar complejidad que es material;
- comportamiento "mágico" que no se puede explicar.

---

# 4. Core Promise First — compuerta universal de release

Ninguna pantalla se considera conforme con el estándar NHILOS hasta que su trabajo principal sea confiable.

Para cualquier pantalla preguntar:

> **¿Cuál es el único trabajo por el que el operador llegó aquí?**

Ejemplos:

```text
Acceso / PIN
→ identificar al operador y entregarle su caja de forma segura

Catálogo
→ marcar un pedido con velocidad y sin ambigüedad de producto

Carrito / Cobro
→ completar la venta con la verdad fiscal exacta y el vuelto correcto

Historial
→ encontrar e inspeccionar la verdad de una venta emitida

Anulación
→ anular conforme a DGI con motivo formal y secuencia inalterada

Control de Caja
→ abrir, controlar y cerrar el turno con arqueo ciego confiable

KDS
→ mostrar la fila de preparación con el estado real de cada comanda

Sincronización
→ proteger cada venta local y reflejarla en la nube sin duplicar
```

El trabajo exacto debe provenir de la autoridad de producto del módulo.

## 4.1 Blockers de Core Promise en POS

Un módulo falla inmediatamente si su flujo principal:

- produce información de negocio incorrecta (totales, vuelto, stock, impuestos);
- permite acceso no autorizado (caja, anulación, cierre Z sin permiso);
- oculta un efecto colateral material (venta emitida pero sin imprimir, cola sin sincronizar);
- pierde trabajo del operador innecesariamente (carrito sin facturar descartado, conteo de arqueo borrado);
- hace ambigua una acción irreversible (anulación DGI);
- dirige al operador al objeto de negocio equivocado;
- exige reconstruir manualmente contexto que el sistema ya conoce;
- convierte dato desconocido/parcial en un valor con apariencia válida (teórico de caja donde va el conteo físico);
- contradice el PRD del módulo;
- expone una acción crítica inaccesible (objetivo táctil imposible en hora pico).

---

# 5. Sistema de veredictos de auditoría

Este estándar **no** usa una nota numérica como compuerta de release.

Usa disposiciones respaldadas por evidencia.

## 5.1 Severidad de hallazgos

### `BLOCKER`

El release no puede pasar.

Usar para:

- fuga de seguridad/permisos (caja o anulación accesibles sin autorización);
- verdad incorrecta de dinero/impuesto/inventario;
- acción destructiva sin la protección requerida (anulación DGI sin motivo o sin PIN de supervisor);
- pérdida de datos (carrito sin facturar descartado, cola de sincronización destruida);
- flujo crítico inaccesible;
- falsa certeza con impacto material de negocio ("Venta completada" cuando la emisión fiscal falló);
- comportamiento del módulo que contradice el contrato autoritativo de producto.

### `REQUIRED`

Debe corregirse para la aceptación de Experiencia NHILOS.

Ejemplos:

- navegación genérica que pierde contexto conocido;
- recuperación de error pobre;
- input repetido innecesariamente;
- estado vacío importante sin guía;
- filtros o búsqueda inconsistentes;
- acción ambigua;
- feedback de estado ausente;
- problema mayor de jerarquía/ruido;
- violación de identidad visual del sistema de diseño (marrones, morados, arcoíris) que degrade la sobriedad;
- toasts o diálogos que cubren carrito, teclado o vuelto.

### `REFINEMENT`

Corrección de calidad importante pero que no rompe la promesa central.

Ejemplos:

- copy redundante;
- contenedor visual innecesario;
- etiqueta de botón demasiado genérica;
- pulido de jerarquía;
- inconsistencia de espaciado/tipografía;
- ausencia de números tabulares en un campo secundario.

### `+1 OPPORTUNITY`

Mejora útil y sostenible por encima del baseline.

No es un fracaso si está ausente, salvo que un contrato de módulo aprobado ya la exija.

## 5.2 Vocabulario de estado de requisitos

Cada criterio recibe exactamente uno:

```text
PASS
FAIL
PARTIAL
NOT_EVIDENCED
N/A
AUTHORITY_CONFLICT
```

`NOT_EVIDENCED` no equivale a PASS.

---

# 6. Protocolo de auditoría del agente POS

Todo agente de módulo POS ejecuta el mismo protocolo.

## Fase A — Autoridad

Identificar:

- PRD del módulo;
- Architecture Spec del módulo;
- Acceptance Plan si existe;
- contratos cross-domain relevantes (DGI, sincronización, multi-tenant);
- este Estándar de Experiencia POS;
- patrones vigentes del sistema de diseño.

No auditar solo desde capturas cuando existe autoridad de código/producto.

## Fase B — Inventario de superficies

Listar todas las superficies del módulo:

- rutas/pantallas;
- tabs y modales;
- listas y grillas;
- detalles;
- formularios y keypads;
- estados vacíos;
- estados de error;
- variantes por permiso (cajero vs. encargado vs. propietario);
- estados offline/online;
- puntos de entrada desde otros módulos.

## Fase C — Trabajos críticos

Para cada superficie definir:

```text
USUARIO
TRABAJO
INPUT
RESULTADO ESPERADO
RIESGO SI SALE MAL
SIGUIENTE ACCIÓN PROBABLE
```

## Fase D — Pase de evidencia

Inspeccionar comportamiento implementado.

La evidencia puede incluir:

- código fuente (Flutter);
- definiciones de rutas;
- capturas directas del hardware vía ADB;
- comportamiento en runtime;
- tests;
- DTOs/modelos Floor;
- permisos;
- documentación de producto.

Nunca inventar lo que la UI "probablemente" hace.

## Fase E — Pase de estándar

Auditar cada sección aplicable de este documento.

## Fase F — Hallazgos

Producir hallazgos respaldados por evidencia con:

```text
ID
Severidad
Sección del estándar
Superficie
Comportamiento actual
Comportamiento esperado
Evidencia
Corrección
Test de aceptación
```

## Fase G — Pase +1

Solo después de entender los hallazgos de Core Promise / REQUIRED.

Identificar mejoras +1 útiles que:

- reduzcan repetición;
- preserven contexto;
- clarifiquen la siguiente acción;
- reduzcan ansiedad del operador;
- mejoren la recuperación;
- anticipen una necesidad real (háptica, sonora, papel, offline).

## Fase H — Veredicto del módulo

Devolver:

```text
READY
READY_AFTER_REQUIRED_FIXES
NOT_READY
BLOCKED_BY_PRODUCT_DECISION
BLOCKED_BY_MISSING_EVIDENCE
```

---

# 7. Anatomía universal de la pantalla POS

Toda pantalla principal de la terminal debe hacer comprensibles rápidamente cinco cosas.

## 7.1 ¿Dónde estoy?

El título/estado de navegación identifica el módulo y la sub-superficie actual (Venta, Historial, Caja, KDS, Configuración).

## 7.2 ¿Qué puedo hacer aquí?

La acción primaria es visible sin competir con múltiples CTAs de igual peso. En Venta es `COBRAR`; en Historial es buscar/inspeccionar; en Caja es controlar el turno.

## 7.3 ¿Qué estoy viendo?

El alcance del dato es explícito:

- turno y caja activos;
- rango o momento (fecha/hora de la lista);
- filtro/estado activo;
- moneda de referencia (C$ y equivalencia USD cuando aplique);
- pestaña/contexto activo.

## 7.4 ¿Qué necesita mi atención?

Las excepciones son distinguibles de la información normal: tickets sin sincronizar, papel agotado, periférico desconectado, turno por cerrar.

## 7.5 ¿Qué pasa después?

Las acciones y destinos son predecibles: cobrar lleva al modal de cobro; tocar una factura lleva a su detalle; anular muestra motivo DGI y confirmación proporcionada.

---

# 8. Jerarquía de información

Usar tres niveles de prioridad.

## P0 — Trabajo primario

Lo que la pantalla existe para lograr.

Debe dominar la jerarquía visual.

En cobro: el monto a cobrar y el vuelto. En venta: el catálogo y el acceso al carrito. En KDS: la comanda y su tiempo transcurrido.

## P1 — Contexto de apoyo

Información necesaria para completar o entender el P0.

Ejemplos: equivalencia USD con tipo de cambio, método de pago, resumen de ítems del carrito, cajero y hora en el historial.

## P2 — Secundario / ocasional

Útil pero sin permitirse competir constantemente con el P0.

Ejemplos: buzzer/pager, notas de cliente, metadatos técnicos.

El anti-patrón común es promover a P0 todas las capacidades disponibles porque la implementación ya existe.

---

# 9. Navegación con preservación de contexto

## 9.1 Principio universal

> **Si el sistema ya conoce el contexto, el operador no debe tener que reconstruirlo.**

El contexto puede incluir:

- turno y caja activos;
- cliente asignado;
- método de pago en curso;
- monto recibido ya tecleado;
- filtro/búsqueda del historial;
- producto o categoría consultada;
- comanda seleccionada en KDS;
- estado de sincronización;
- ruta de retorno.

## 9.2 Comportamiento requerido

Una interacción rica en contexto debe navegar a un destino rico en contexto.

Bien:

```text
Historial
→ factura #000007
→ Detalle de factura #000007 completo
```

Mal:

```text
Historial
→ tocar factura
→ lista genérica de productos de la venta
→ reconstruir el contexto mentalmente
```

El mismo rige dentro de todo el POS:

```text
Detalle de producto
→ "Ver movimiento de stock"
→ Kardex ya filtrado a ese producto
```

## 9.3 Los enlaces contextuales son contratos

No exponer un CTA profundo hasta que su destino pueda consumir el contexto.

## 9.4 Estado primero

Los filtros y listas con significado deben sobrevivir idealmente a:

- refresco;
- atrás/adelante;
- reconexión de la app tras un crash.

No colocar todo el estado de navegación en memoria transitoria invisible.

---

# 10. Navegación hacia atrás y Guardián del Botón Atrás de Android

El operador debe poder investigar y volver sin perder su trabajo.

## 10.1 Preservar cuando sea práctico

- filtros y búsqueda del historial;
- página de la lista;
- carrito y sus cantidades;
- monto recibido en el modal de cobro;
- conteo físico en curso del arqueo;
- pestaña activa;
- origen de retorno.

## 10.2 Guardián del botón atrás de Android (regla de oro)

El botón físico/gesture back de Android **nunca** descarta trabajo sin protección:

- con un **carrito sin facturar**, atrás no vacía el carrito ni cierra la app: muestra confirmación explícita ("¿Descartar venta con N ítems?") o mueve la venta a `EN ESPERA`;
- con una **venta pendiente de sincronización**, atrás jamás interrumpe la cola;
- con un **conteo de arqueo en curso**, atrás advierte antes de perder el conteo;
- con un **monto ya tecleado en cobro**, atrás vuelve un paso conservando lo ingresado cuando sea válido;
- en la pantalla inicial sin trabajo en curso, atrás puede salir con la confirmación estándar de Android.

Perder un carrito sin facturar por pulsación accidental de atrás es un **BLOCKER** (pérdida de datos, §5.1).

## 10.3 No resetear al estado genérico

No volver a la primera página genérica salvo que la validez de los datos haya cambiado.

---

# 11. Drawer y navegación global

La navegación existe para orientar, no para anunciar funcionalidades.

Requisitos:

- la ruta activa es inequívoca;
- las etiquetas de grupo son estables;
- los módulos no se mueven arbitrariamente entre sesiones;
- los badges indican estado accionable (cola de sincronización), no decoración;
- la visibilidad de navegación sigue al permiso (un cajero no ve Administración);
- el permiso oculto no deja rutas muertas;
- el nombre de cada módulo usa el lenguaje del producto (Control de Caja, no "Cash Management");
- el rol del operador es visible en la navegación (quién está en caja).

No crear una etiqueta nueva solo porque una funcionalidad necesita novedad visual.

---

# 12. Listas y tablas de datos

En la terminal, las listas son herramientas de decisión bajo presión: historial de facturas, catálogo, comandas del KDS.

## 12.1 Una lista debe responder

- ¿qué objetos estoy viendo?
- ¿cuál es su estado relevante?
- ¿cómo encuentro uno?
- ¿cómo acoto el conjunto?
- ¿qué puedo hacer con uno?
- ¿qué puedo hacer con varios?

## 12.2 Riqueza contextual de las filas

Cada fila del historial de ventas debe permitir decidir sin abrir:

- número de factura (`#000007`);
- hora y cajero (`21:43 · Maxwell O.`);
- resumen de ítems (`1x Cappuccino 12oz, 1x Americano`);
- método de pago (`Efectivo`);
- total a la derecha con números tabulares (`C$ 225.00`);
- estado (`ANULADA` con tratamiento visual propio, §26).

Una fila de números planos sin resumen de productos ni cajero obliga a abrir facturas a ciegas: `FAIL / REQUIRED`.

## 12.3 Alineación numérica

Los valores financieros/tabulares usan números tabulares y formato decimal/moneda consistente (§34).

## 12.4 Comportamiento del toque en fila

Si el toque abre el detalle:

- el estado presionado lo comunica;
- los botones internos no producen doble navegación ambigua;
- el área de toque de la fila completa es generosa (>=48 dp de alto).

## 12.5 Acciones de fila

Preferir un número pequeño de acciones frecuentes directas.

Las acciones raras pueden vivir en un menú de overflow.

La acción destructiva (anular) no se ubica junto a acciones frecuentes seguras sin separación visual.

## 12.6 Identidad de producto: eliminación del "Síndrome de la Hamburguesa"

**Regla:** ningún producto de cafetería, repostería o bar muestra una hamburguesa salvo que sea una hamburguesa real.

El fallback universal genérico degrada la identidad del comercio y viola Cuidado (Brand §21).

**Sistema de fallback elegante de 2 niveles:**

1. **Nivel 1 — Iconografía de categoría:** si no hay imagen, usar glifos vectoriales sobrios según la categoría configurada:
   - *Café Caliente / Espresso / Latte:* taza de café minimalista;
   - *Café Helado / Bebidas Frías:* vaso alto con hielo;
   - *Repostería / Panadería:* croissant o pan artesanal;
   - *Comida / Desayuno:* plato o cubiertos estilizados.
2. **Nivel 2 — Monograma tipográfico:** fondo pastel muy suave del color de categoría con las iniciales del producto (ej. `ED` para *Espresso Doble*, `C12` para *Cappuccino 12oz*).

El resolver es **dinámico**: se alimenta de la categoría configurada por el comercio, nunca de un ícono único en código. Si la categoría no tiene glifo asignado, caer al monograma, nunca al ícono genérico de comida.

Los distintivos promocionales (badges tipo `2x1`) se posicionan flotantes en la esquina superior derecha, con tipografía limpia en mayúsculas y esquinas de 4 dp, sin tapar información del producto.

---

# 13. Búsqueda

La búsqueda debe reflejar cómo el operador conoce el objeto.

Ejemplos: nombre de producto; código/SKU; número de factura; nombre de cliente; RUC; usuario.

La autoridad del módulo decide los campos soportados.

## 13.1 Reglas de búsqueda

- feedback inmediato;
- resultado vacío claro;
- preservar la consulta al ir al detalle y volver;
- el término de búsqueda permanece visible;
- limpiar es fácil;
- sin criterios "inteligentes" invisibles que sorprendan al operador.

## 13.2 Sin resultados vs. sin datos

Son cosas diferentes.

### Sin datos

> No existen objetos.

Puede necesitar CTA de creación/onboarding.

### Sin resultados

> Existen objetos, pero la búsqueda/filtro no devolvió ninguno.

Debe mostrar:

- filtro/consulta activo;
- acción de limpiar/reset.

---

# 14. Filtros

Los filtros son parte del modelo mental del operador.

## 14.1 Estado visible

El operador debe saber que hay filtros activos.

Usar: chips, controles explícitos, conteo, resumen.

## 14.2 Reset

Ofrecer siempre una forma predecible de resetear los filtros aplicados.

## 14.3 Persistencia

Los filtros razonables de lista sobreviven a la navegación detalle/volver (§10).

## 14.4 Deep linking

Si otro módulo envía al operador con un filtro contextual, ese filtro debe representarse visiblemente.

No crear "filtrado misterioso".

---

# 15. Ordenamiento y paginación

## Ordenamiento

- el orden activo es visible;
- la dirección es visible;
- el orden por defecto corresponde al trabajo operativo primario (historial: más reciente primero);
- el orden debe ser determinable donde sea posible.

## Paginación / scroll

En listas largas (catálogos de cientos de productos, historial de miles de facturas):

- comunicar la posición cuando aporte (`Mostrando X–Y de Z` o indicador de scroll);
- no hacer adivinar al operador si existen más datos;
- al cambiar filtros, resetear la posición cuando sea necesario;
- no dejar al operador silenciosamente en una página alta vacía.

---

# 16. Acciones masivas

Las acciones masivas solo aparecen cuando existe selección (ej. mover varias comandas a listas, marcar varias ventas para reimprimir).

Antes de ejecutar:

- mostrar conteo de objetos;
- mostrar acción;
- mostrar consecuencias materiales;
- requerir confirmación según el riesgo.

Ejemplo:

> `Reimprimir 3 facturas`

no:

> `Confirmar acción`

Después de ejecutar comunicar:

- conteo exitoso;
- conteo fallido;
- siguiente acción si fue parcial (ej. 2 impresas, 1 sin papel).

Nunca colapsar una operación masiva parcialmente fallida en un toast genérico de éxito.

---

# 17. Formularios — baseline

Los formularios de la terminal (producto rápido, datos de cliente, notas, configuración de turno) deben reducir incertidumbre, no solo recolectar campos.

## 17.1 Layout

- una columna para formularios simples;
- secciones para formularios largos;
- footer de acción fijo cuando el formulario hace scroll material.

## 17.2 Etiquetas

Las etiquetas permanecen visibles.

No depender de placeholders como etiquetas.

## 17.3 Campos requeridos

El comportamiento requerido/opcional es explícito.

No sorprender al enviar con requisitos ocultos.

## 17.4 Texto de ayuda

El texto de ayuda existe cuando previene un error probable.

No explicar campos obvios solo para llenar espacio vertical.

## 17.5 Campos gobernados

Cuando el sistema ya mantiene un catálogo para un valor (unidades, monedas, categorías, clientes recurrentes), el formulario ofrece el selector gobernado en lugar de texto libre.

El texto libre para un valor gobernado produce la deriva de vocabulario que el catálogo existe para prevenir. Si el catálogo está vacío, guiar al usuario a poblarlo; no caer silenciosamente a texto libre.

---

# 18. Validación numérica y teclados (keypads)

La precisión numérica es la expresión más visible de Precisión en el POS.

## 18.1 Validación de montos

- validar en el momento correcto (al confirmar, no gritando mientras se teclea);
- el monto recibido menor al total en efectivo no es un "error": es un estado intermedio; el vuelto simplemente no se muestra hasta cubrir el total;
- separador decimal consistente (punto) y máximo de decimales según moneda (2 para C$/USD);
- no aceptar entrada que produzca overflow o valores absurdos sin explicación.

## 18.2 Ergonomía del keypad

En modales de cobro y PIN:

1. **Teclas de al menos 72 dp de alto**, con espaciado (*gap*) mínimo de 8 dp para evitar pulsaciones erróneas;
2. teclas numéricas (0-9) en fondo blanco con borde neutro;
3. tecla de borrado `⌫`: fondo gris neutro (`#F1F5F9`), ícono de retroceso claro (`#475569`) — **nunca marrón** (`#795548`) ni rojo;
4. tecla `C` (limpiar todo): mismo estilo gris neutro con texto sobrio — el rojo se reserva para acciones destructivas reales (§23);
5. feedback de pulsación inmediato (ripple/háptico leve).

El keypad "clean slate" (blanco + slate + teal) es el único estilo aprobado. Botones marrones o rojos decorativos en el teclado producen falsas señales de peligro y violan Sobriedad: `FAIL / REQUIRED`.

## 18.3 Targets táctiles generales

- mínimo 48 x 48 dp para botones secundarios e íconos;
- botón principal de cobro: altura mínima de **56 dp**, ocupando entre el 70% y el 100% del ancho del modal;
- separación suficiente entre acciones críticas (cobrar) y acciones de riesgo (anular) para evitar pulsaciones cruzadas con dedos húmedos.

---

# 19. Guardado y guardas contra doble envío

El operador siempre debe saber si la venta/dato quedó guardado.

## 19.1 Al guardar

- deshabilitar el envío duplicado apropiadamente: la guarda anti doble-toque es **obligatoria** en cobro y anulación;
- preservar el ancho del botón al deshabilitar;
- exponer progreso sin bloquear contexto seguro no relacionado.

## 19.2 Guarda anti-factura-duplicada

La protección de doble envío no es solo visual: la emisión de factura debe ser idempotente a nivel de dato (un intento de cobro repetido no genera una segunda factura con número nuevo). Si el sistema detecta un posible doble envío, no duplica: informa.

Una factura duplicada por doble toque es **BLOCKER** (verdad fiscal e inventario incorrectos).

## 19.3 Éxito

El feedback de éxito dice qué pasó.

Preferir:

> `Venta registrada · Ticket #000007`

sobre:

> `Éxito`

## 19.4 Guardar y continuar

Donde los flujos crean registros repetidos naturalmente (venta rápida consecutiva), evaluar un +1 sostenible:

- Cobrar;
- Cobrar y repetir último pedido;

solo si genuinamente ahorra tiempo en hora pico.

No añadir variantes especulativamente.

---

# 20. Estado sucio / trabajo sin guardar

Si la navegación descartaría ediciones significativas:

- advertir antes de perderlas;
- explicar qué se perderá;
- ofrecer quedarse/salir;
- para el carrito, ofrecer `EN ESPERA` como tercera vía (§10.2).

No preguntar cuando nada significativo cambió.

Si ocurre un error recuperable del servidor o de la impresora:

> preservar el estado del formulario/carrito.

Perder trabajo correctamente ingresado por un error transitorio es un fracaso de experiencia NHILOS. Un fallo de impresión no invalida la venta: la venta vive en SQLite (§35); la impresión se reintenta.

---

# 21. Flujos de creación

Una pantalla de creación debe responder:

- ¿qué estoy creando?
- ¿qué es requerido?
- ¿qué pasará después de la creación?
- ¿puede afectar otras áreas inmediatamente (stock, catálogo del KDS)?
- ¿está activo inmediatamente o en borrador?

Evitar un formulario cuyo ciclo de vida solo se descubre tras enviar.

---

# 22. Flujos de edición

Editar debe dejar claro el alcance.

Ejemplos:

- editar el producto actual;
- editar una venta en espera;
- editar configuración activa del turno.

Cuando los cambios tengan implicaciones históricas:

> explicar si los registros viejos se preservan.

No implicar que editar configuración reescribe verdad histórica si no lo hace. Los registros fiscales emitidos nunca se "editan": se anulan (§23).

---

# 23. Acciones destructivas y DGI

El riesgo debe ser proporcional a la confirmación.

## 23.1 Anulación de factura (Void / `is_canceled`)

Conforme a DGI DT 09-2007 y al contrato offline-first:

- **las facturas jamás se eliminan**: solo se anulan (`is_canceled`);
- **la secuencia es inmutable**: anular no renumera ni reutiliza el correlativo;
- el diálogo de anulación exige **motivo formal DGI** mediante radio buttons grandes: *Error de captura*, *Cliente desiste*, *Ticket duplicado*, *Otro*;
- si se elige *Otro*, el detalle es obligatorio;
- el botón de anulación permanece bloqueado hasta seleccionar un motivo válido;
- la anulación exige **PIN de supervisor/encargado** (§33);
- el botón usa verbo explícito y color de peligro: `Anular factura #000007`, nunca `Aceptar` ni `Continuar`;
- la confirmación comunica: objeto, consecuencia (la factura queda marcada ANULADA y visible en el historial), reversibilidad (no reversible desde el POS) y alcance.

Anular sin motivo, sin PIN, o con efecto sobre la secuencia es **BLOCKER**.

## 23.2 Otras acciones destructivas

- `Cerrar Turno (Corte Z)` en rojo ceremonial de confirmación, con consecuencias explícitas;
- descartar venta en espera: confirmación proporcionada;
- vaciar carrito: solo con confirmación o vía `EN ESPERA`.

## 23.3 No sobre-confirmar acciones inofensivas

Demasiados diálogos enseñan a los operadores a pulsar diálogos sin leer. Marcar productos, ajustar cantidades y consultas de corte X no requieren confirmación.

## 23.4 Confirmación tipeada

Reservarla para acciones materialmente destructivas donde añade seguridad real. No usar fricción teatral para ediciones ordinarias.

---

# 24. Pantallas de detalle de factura

El detalle de factura no es un volcado de base de datos.

Prioriza:

1. identidad (número de factura, serie, fecha/hora);
2. estado actual (EMITIDA / ANULADA);
3. hechos operativos primarios (ítems, cantidades, precios, subtotal, impuestos, total, moneda y equivalencia);
4. objetos relacionados (cliente, método de pago, caja/turno, cajero);
5. historial/auditoría donde corresponda (motivo de anulación, supervisor autorizante);
6. acciones (`Reimprimir ticket`, `Anular factura` según permiso).

## 24.1 Navegación relacionada

Los objetos relacionados enlazan profundo con contexto:

```text
Factura → Cliente
Factura → Pago
Factura → Reimpresión de ticket
Factura → Motivo de anulación (si aplica)
```

Solo cuando la autoridad de producto permita la relación.

## 24.2 Verdad en pantalla = verdad en papel

El detalle en pantalla debe coincidir 1:1 con el ticket de 80 mm (§45.1): mismas líneas, mismos totales, mismo orden. Toda divergencia entre pantalla y papel es **BLOCKER** (falsa certeza fiscal).

---

# 25. Tabs y controles segmentados

Los tabs representan vistas hermanas estables del mismo contexto (ej. Cobro: Efectivo / Tarjeta / Transferencia-QR).

No usar tabs para esconder páginas no relacionadas.

Requisitos:

- el tab activo es obvio;
- el estado del tab sobrevive a interrupciones razonables del flujo;
- los tabs ocultos por permiso no dejan huecos inexplicables;
- las etiquetas usan terminología del operador.

---

# 26. Estados, badges y chips

Los estados deben comunicar significado de negocio.

No crear colores de badge por decoración.

Un estado neutral de ciclo de vida no es una excepción: `INACTIVO` con color de peligro reporta un estado tranquilo como problema.

Cada estado requiere:

- texto;
- color semántico si es útil;
- vocabulario consistente entre módulos.

Evitar sinónimos para el mismo estado de ciclo de vida:

```text
Activa
Habilitada
On
Vigente
```

Elegir un término aprobado por el dominio.

## 26.1 Facturas anuladas

La factura ANULADA se distingue con matiz sutil rojizo en la fila y etiqueta `ANULADA` en rojo intenso `#DC2626`, sin gritar: el estado es visible sin convertir el historial en una alarma.

## 26.2 Variantes de alerta

Las alertas inline siguen la misma disciplina que los badges: cada alerta lleva variante semántica — éxito, advertencia, peligro, info — renderizada con distinción perceptible (tinte, borde o ícono), no con estilo neutro por defecto. Una alerta cuyo estado no se percibe no comunica estado.

---

# 27. Vocabulario de estados

La terminal debe distinguir estos conceptos de forma consistente:

```text
ACTIVA
INACTIVA
BORRADOR
EN ESPERA
PENDIENTE (sincronización)
PROCESANDO
COMPLETADA
PARCIAL
NO DISPONIBLE
DESCONOCIDO
FALLIDA
ANULADA (VOID)
```

Solo usar estados que realmente pertenezcan al dominio relevante.

Nunca usar:

- `COMPLETADA` cuando la verdad del dato no es demostrable (ej. impresión fallida);
- `0` como reemplazo de no disponible;
- `inactiva` cuando el objeto realmente está vencido;
- `error` cuando el estado es meramente pendiente.

---

# 28. Carga (loading)

La carga debe preservar la orientación.

## 28.1 Carga de pantalla

Preferir skeleton/carga local donde la estructura de la pantalla es conocida. En POS, lo ideal es no mostrar carga de página completa: la terminal trabaja contra SQLite local.

## 28.2 Carga parcial

No bloquear la pantalla completa mientras una petición secundaria independiente está cargando (ej. catálogo de promociones contra la nube).

## 28.3 Refetch

Cuando el dato válido permanece visible:

> mostrar `Actualizando…` o equivalente.

Evitar el reset de pantalla completa.

## 28.4 Formularios

No auto-refrescar datos bajo ediciones activas de forma que destruya trabajo o cambie el significado.

---

# 29. Estados vacíos

Todo estado vacío pertenece a una de cuatro clases.

## Vacío de primer uso

Nada creado todavía (caja sin abrir, catálogo sin sincronizar).

Explicar:

- qué pertenece aquí;
- por qué importa;
- siguiente acción (`Abrir caja`, `Sincronizar catálogo`).

## Vacío válido

Ejemplo:

> sin anulaciones en el periodo.

Mantenerlo tranquilo.

Sin ilustración celebratoria grande.

## Vacío filtrado

Mostrar el filtro activo y la acción de limpiar.

## Vacío por permiso

Generalmente omitir las superficies inaccesibles en lugar de renderizar cascarones vacíos.

---

# 30. Estados de error

Un error NHILOS intenta responder las cuatro preguntas de marca (Brand §25):

1. ¿qué pasó?
2. ¿qué impacto tiene?
3. ¿qué puedo hacer ahora?
4. ¿qué hará el sistema después?

Ejemplo:

En lugar de:

> `Error 401.`

Preferir una explicación humana y contextual, **solo cuando técnicamente sea correcta**:

> `La sincronización se reintentará automáticamente. Tus ventas locales están protegidas.`

## 30.1 Preservar contexto

Los errores no deben limpiar innecesariamente:

- carrito;
- formularios;
- conteo de arqueo;
- filtros;
- entidad seleccionada;
- datos seguros ya cargados.

## 30.2 Reintentar

Ofrecer reintento solo cuando reintentar pueda ayudar de verdad.

## 30.3 Detalle técnico

Los IDs/códigos crudos pueden estar disponibles en un área de detalle de soporte, no como copy primario del operador.

---

# 31. Feedback de éxito

El éxito debe ser calmado.

Evitar confeti o modales de éxito sobredimensionados para operaciones rutinarias.

Ejemplos:

> `Venta registrada · #000007`

> `Factura anulada`

> `Turno cerrado · Corte Z impreso`

Si la siguiente acción probable es obvia, proveerla (`Reimprimir`, `Nueva venta`).

Un estado de éxito no debe convertirse en un callejón sin salida.

---

# 32. Toasts y snackbars

Usar toasts/snackbars para confirmación/información transitoria.

## 32.1 Posicionamiento

**Regla crítica de terminal:** un toast o snackbar **nunca cubre**:

- el carrito o su barra flotante inferior;
- el teclado numérico en uso;
- el monto y el vuelto en el modal de cobro;
- la comanda activa en el KDS.

Posicionar en zona segura superior o lateral libre, o usar feedback dentro del propio modal.

Un toast que tapa el vuelto en el momento del cobro es `FAIL / REQUIRED`.

## 32.2 Contenido

- no usar toasts para información que el operador deba retener para completar una tarea;
- los errores que requieren acción permanecen visibles hasta resolverse/descartarse apropiadamente;
- no apilar muchos toasts de una sola operación: agregarlos;
- auto-descarte generoso en hora pico; el tiempo de lectura mínimo garantizado no sacrifica velocidad de flujo.

---

# 33. Permisos y overrides de supervisor

El diseño de permisos tiene tres capas.

## Servidor/backend

Autoridad enforcement definitiva (la capa local de la app también valida; la nube re-valida al sincronizar).

## Query/acción del frontend

No solicitar ni ejecutar lo que el usuario no puede acceder.

## Presentación

No tentar con información sensible:

- falso cero;
- valor difuminado;
- placeholder;
- dato oculto por CSS/opacidad.

## 33.1 Matriz de operador

- **Cajero:** vender, cobrar, consultar historial propio del turno, corte X según política;
- **Encargado/Supervisor:** anular facturas, cerrar turno Z, abrir gaveta manualmente, aplicar descuentos según política;
- **Propietario:** configuración, administración de usuarios, reportes completos.

## 33.2 Overrides de supervisor

Los overrides (anulación, descuento fuera de política, apertura manual de gaveta, cierre Z) exigen:

- PIN de supervisor en modal con keypad de 72 dp (§18.2);
- identidad del supervisor registrada en el evento de auditoría;
- fallar cerrado: sin conectividad o sin supervisor registrado, la acción crítica no se ejecuta "para no bloquear".

## 33.3 Composición consciente del permiso

Cuando un componente completo no es útil sin el permiso:

> omitirlo y refluir.

No dejar espacio muerto.

## 33.4 Deshabilitado vs. oculto

Usar controles deshabilitados cuando:

- la acción existe en el contexto del operador;
- entender por qué no está disponible es útil (con explicación).

Usar controles ocultos cuando:

- exponer la capacidad no añade contexto útil;
- el operador no debe interactuar con ella en absoluto.

Documentar decisiones significativas por módulo.

---

# 34. Datos sensibles y financieros

Los valores de negocio sensibles deben permanecer precisos.

Reglas:

- moneda consistente: Córdobas como moneda de facturación primaria; el USD se expresa como equivalencia comercial con tipo de cambio visible (`$6.14 USD · TC 36.62`);
- decimales consistentes (2) y separador estable;
- los valores históricos permanecen históricos;
- los montos no cambian por configuración actual (el total de una venta de ayer no se recalcula con el TC de hoy);
- `—` significa no disponible/desconocido, jamás cero;
- los datos enmascarados/editados son explícitos;
- las restricciones por permiso ocurren antes de la serialización donde sea requerido.

## 34.1 Números tabulares obligatorios

Todo monto, precio, cantidad y vuelto usa tipografía de ancho fijo (`FontFeature.tabularFigures()` en Flutter) para que los dígitos nunca bailen al teclear o cambiar cifras.

El vuelto se muestra con claridad inmediata: caja con verde esmeralda suave (`#ECFDF5`), borde `#10B981`, texto `Vuelto: C$ 275.00` en tipografía masiva (~24 sp), y el total visualmente ~30% mayor que el subtotal en el carrito.

---

# 35. Frescura / sincronización / invariantes Offline-First SQLite

Este es el corazón de la Continuidad Operativa (Brand §20): **diseñamos para la realidad, no para el escenario perfecto.**

## 35.1 Fuente de verdad

- **SQLite local es la fuente de verdad.** Una venta es válida y definitiva cuando está comprometida localmente;
- la nube es un espejo eventualmente consistente;
- sin Wi-Fi el cajero sigue cobrando sin bloqueo ni alertas invasivas.

## 35.2 Durabilidad de la cola

- cada venta local genera un registro en la cola de sincronización/outbox de forma transaccional junto a la venta;
- la cola sobrevive al cierre de la app, al crash y al reinicio del dispositivo;
- el contador de tickets pendientes es visible y honesto (§5.1: no ocultar condiciones materiales).

## 35.3 Idempotencia del outbox

- cada reintento de sincronización no duplica: el servidor deduplica por identificador único del ticket (client UUID + correlativo local);
- un reintento jamás genera una segunda factura con número nuevo;
- los conflictos de sincronización se reportan y quedan en estado visible, nunca se resuelven silenciosamente descartando datos.

## 35.4 Señal calmada de estado offline

Cuando no hay internet, el ícono de nube no muestra un error rojo alarmante: muestra una **nube ámbar serena** (`#D97706`) con el contador de tickets en cola y la leyenda:

> **"Venta local protegida"**

El ámbar comunica "protegido, pendiente", no "catástrofe". Rojo se reserva para pérdida real o riesgo de pérdida.

## 35.5 Frescura honesta

Toda vista que dependa de sincronización no debe implicar certeza más allá de la evidencia.

No usar:

- timestamp de refresco de pantalla;
- timestamp de generación de reporte;
- último evento de negocio;

como sustituto de completitud de sincronización.

Cuando es parcial:

> explicar qué parte está afectada.

---

# 36. Operaciones de larga duración

Para sincronizaciones masivas, generación de reportes, cierres de turno con impresión u otros procesos largos:

- acusar el inicio;
- mostrar progreso cuando sea conocible;
- distinguir encolado/en curso/completado/fallido;
- preservar la navegación cuando sea seguro;
- permitir volver después si la arquitectura lo soporta;
- proveer resumen de resultado/error;
- evitar porcentajes de progreso falsos.

---

# 37. Recepción de catálogo y configuración

El POS recibe catálogo, precios, promociones y configuración desde el backoffice. La recepción es el análogo POS de los flujos de importación:

- identificar qué se está actualizando y desde cuándo;
- validar sin destruir trabajo local (una venta en curso no se corrompe por un refresco de catálogo);
- distinguir error de nivel de sincronización de error de nivel de ítem;
- preservar información de error accionable;
- si la aceptación es parcial (ítems con error de validación), hacer explícita la frontera aceptado/rechazado.

No obligar a resincronizar el catálogo completo solo para descubrir el siguiente error de un ítem a la vez.

---

# 38. Fechas y horas

El despliegue de fecha/hora debe reflejar el significado del negocio.

Requisitos:

- usar la zona horaria autorizada por producto;
- clarificar el periodo seleccionado;
- incluir la fecha cuando una hora podría referir a otro día (historial de turnos anteriores);
- distinguir creado/ocurrido/efectivo/actualizado cuando sea materialmente diferente;
- evitar texto relativo ambiguo para historia auditable.

Ejemplo:

Mal:

> `10:52 p. m.`

cuando el reporte es de otro día.

Mejor:

> `25 sep, 10:52 p. m.`

---

# 39. Microcopy estándar

El copy del POS NHILOS es:

- claro;
- directo;
- preciso;
- calmado;
- mínimamente ornamental;
- técnico solo cuando sea necesario;
- en el idioma del operador (español; roles consistentes: `Propietario`, `Cajero`).

## 39.1 Botones

Usar verbos.

Preferir:

- `Cobrar`
- `Guardar cambios`
- `Anular factura`
- `Ver movimientos`
- `Cerrar turno`

Evitar genéricos:

- `OK`
- `Aceptar`
- `Ver`
- `Continuar`

cuando la acción/destino puede nombrarse con más precisión.

## 39.2 Descripciones

No explicar lo que el encabezado ya dice.

## 39.3 Advertencias

Enunciar la consecuencia.

Evitar lenguaje de miedo.

## 39.4 Términos técnicos

Usar solo cuando el operador se beneficia.

No exponer vocabulario de implementación porque existe en el código del backend.

---

# 40. Defaults humanos

Los defaults deben ahorrar tiempo sin crear supuestos ocultos.

Un buen default es:

- común;
- seguro;
- comprensible;
- reversible cuando sea posible.

En cobro: los **botones rápidos de billetes se calculan dinámicamente** según el total (si el total es C$ 225, ofrecer C$ 225, C$ 300, C$ 500, C$ 1000). Este default anticipa el flujo real de caja y es el ejemplo canónico de +1 útil.

Un default peligroso es:

- destructivo;
- silenciosamente financiero;
- sensible al permiso;
- oculto;
- difícil de detectar después.

No usar "smart defaults" donde el sistema no puede explicar la inferencia.

Un default no debe satisfacer silenciosamente un campo requerido: cuando el sistema pre-llena un valor requerido, el usuario confirma por omisión en lugar de decidir. Los campos de gobernanza requeridos deben iniciar vacíos — o exigir confirmación explícita — para que la decisión siga siendo del usuario (ej. motivo de anulación, tipo de documento).

---

# 41. Divulgación progresiva

Mostrar complejidad cuando el operador la necesite.

Patrón común:

```text
RESUMEN
→ DETALLE
→ PROFUNDIDAD TÉCNICA/AUDITORÍA
```

No forzar la representación más técnica en la primera vista.

Tampoco esconder limitaciones materiales detrás de una sección avanzada.

Ejemplo: el buzzer/pager es una tarjeta colapsable o un campo discreto de una línea con ícono de campana neutro — no un borde amarillo alarmante en la pantalla de cobro.

---

# 42. Restricción visual

La expresión visual vigente de NHILOS POS usa:

- Navy / Deep Teal;
- Green (esmeralda);
- neutrales (Slate);
- Inter;
- jerarquía clara;
- layout estructurado;
- estados accesibles.

Este estándar no declara estos tokens como identidad corporativa universal de NHILOS (Brand §22): son expresión vigente del producto e input de alta autoridad para el futuro Brand Identity System.

## 42.1 Paleta cromática unificada

| Token | Valor Hex | Uso en POS |
|---|---|---|
| **Fondo principal** | `#F8FAFC` (Slate 50) | Fondo neutro y limpio de toda la aplicación. |
| **Superficie / Cards** | `#FFFFFF` | Tarjetas de productos, modales y listas. |
| **Bordes estructurales** | `#E2E8F0` (Slate 200) | Delimitación sutil sin ruido visual. |
| **Texto primario** | `#0F172A` (Slate 900) | Títulos, precios, vueltos. |
| **Texto secundario** | `#64748B` (Slate 500) | Subtítulos, categorías, contexto. |
| **Brand Primary / Acción** | `#1E3A40` / `#0F292E` (Deep Teal / Navy) | Botones primarios (`COBRAR`, `VER CARRITO`). |
| **Éxito / Vuelto** | `#059669` (Emerald 600) | Vuelto a entregar, caja cuadrada. |
| **Peligro / Anulación** | `#DC2626` (Red 600) | `ANULAR`, facturas anuladas. Solo peligro real. |
| **Advertencia / Offline** | `#D97706` (Amber 600) | Tickets pendientes de sincronización, avisos calmados. |

> **PROHIBICIÓN EXPRESA:** quedan desterrados los botones marrones (`#795548`) en el teclado numérico de borrado y las barras superiores moradas (`#3949AB`) en control de caja. La interfaz responde a una única identidad coherente.

## 42.2 Color

El color comunica estado/prioridad.

No colorear cada métrica.

## 42.3 Cards

Una card agrupa una idea con significado.

No envolver cada campo en una card.

## 42.4 Bordes

Usar para estructura.

Evitar páginas que se ven como hojas de cálculo de cajas salvo que el contenido realmente sea tabular.

## 42.5 Sombras

Usar el sistema de elevación establecido (barra flotante del carrito: `elevation: 8`).

No aumentar sombra/profundidad para señalar "premium".

## 42.6 Espaciado

Más separación entre ideas distintas; agrupación más estrecha dentro de una idea.

## 42.7 Tipografía

- jerarquía antes que decoración;
- valores numéricos con números tabulares;
- IDs técnicos pueden usar el estilo mono aprobado;
- las etiquetas permanecen legibles;
- familia Inter compartida con toda la suite (incluido el KDS oscuro);
- radios estandarizados: **12 dp** para tarjetas y modales, **8 dp** para botones y chips, **4 dp** para badges.

---

# 43. Filtro "lujo por restricción"

Antes de añadir cualquier elemento de UI preguntar:

> ¿Esto mejora materialmente comprensión, orientación, evidencia, acción, recuperación o memorabilidad?

Si no:

> eliminarlo.

Antes de eliminar un elemento preguntar:

> ¿Su ausencia esconde una condición material o hace la tarea más difícil?

Si sí:

> conservarlo o rediseñarlo.

La restricción no es minimalismo por el minimalismo.

---

# 44. Animación y movimiento

El movimiento está permitido cuando:

- explica;
- orienta;
- confirma;
- da tactilidad sutil.

El movimiento no está permitido para:

- probar presupuesto;
- fabricar percepción premium;
- retrasar el acceso al contenido;
- oscurecer cambios de estado;
- afectar a usuarios con movimiento reducido.

El éxito rutinario de CRUD no necesita animación de celebración.

En POS: transiciones instantáneas (<50 ms), ripple inmediato, sin animaciones entre pasos de cobro que retrasen la fila.

---

# 45. Hardware y periféricos (Brand §26)

El hardware también expresa el estándar NHILOS POS.

## 45.1 Ticket térmico de 80 mm — spec de layout

El ticket es un documento fiscal y de marca. Su estructura obligatoria:

```text
┌────────────────────────────────────┐
│ [LOGO monocromo si está configurado│
│  — altura máxima acotada]          │
│ Nombre comercial del negocio       │
│ RUC / NIT                          │
│ Dirección · Teléfono               │
│────────────────────────────────────│
│ Factura #000007   (correlativo)    │
│ Fecha · Hora · Caja · Turno        │
│ Cajero                             │
│ Cliente / RUC (si aplica)          │
│────────────────────────────────────│
│ ZONA MONOSPACIO:                   │
│ 2x Cappuccino 12oz      C$ 180.00  │
│ 1x Americano             C$ 45.00  │
│  (cantidad x nombre … alineación  │
│   derecha de montos, tabular)      │
│────────────────────────────────────│
│ Subtotal                C$ 225.00  │
│ Descuentos              C$   0.00  │
│ Impuestos (desglose DGI)           │
│ TOTAL                   C$ 225.00  │
│────────────────────────────────────│
│ Efectivo                 C$ 500.00 │
│ Vuelto                   C$ 275.00 │
│ (equivalencia USD de referencia     │
│  cuando aplique)                   │
│────────────────────────────────────│
│ [QR de verificación fiscal          │
│  cuando el contrato de producto     │
│  lo requiera]                       │
│────────────────────────────────────│
│ Mensaje de pie (gracias / leyenda   │
│  fiscal del negocio)                │
└────────────────────────────────────┘
```

Reglas de impresión:

- la zona de ítems usa fuente monoespaciada con montos alineados a la derecha;
- los campos fiscales DGI exigidos por DT 09-2007 están presentes y legibles;
- el corte es **corte parcial ESC/POS** (nunca corte total que desprenda el ticket antes de tiempo ni corte a mitad del QR);
- el QR no se imprime cortado ni deformado;
- la distribución en pantalla del comprobante (Corte X/Z y detalle) coincide 1:1 con el orden de líneas del papel (§49).

## 45.2 Papel agotado (out-of-paper)

- detectar el estado del papel antes y durante la impresión;
- la venta **nunca depende de la impresión para ser válida** (ya vive en SQLite, §35);
- ante falta de papel: señal ámbar inequívoca y accionable (`Papel agotado — reponer y reintentar`), nunca un error rojo catastrófico;
- el ticket queda encolado y es reimprimible desde el detalle de factura;
- las ventas afectadas quedan marcadas como emitidas-sin-imprimir hasta resolver; ese estado es visible en la superficie de excepciones (§7.4).

Vender sin registrar o marcar "completada" una venta cuyo ticket nunca salió es **BLOCKER** (falsa certeza fiscal).

## 45.3 Gaveta de efectivo (cash drawer)

- la gaveta se abre automáticamente al completar una **venta en efectivo** (kick al imprimir);
- la **apertura manual** exige permiso de supervisor (§33.2) con PIN y queda registrada como **evento de auditoría** (quién, cuándo, desde qué pantalla);
- la gaveta no se abre en ventas con tarjeta salvo que la política del comercio lo permita explícitamente;
- el estado de la gaveta es visible en la superficie de caja.

## 45.4 Escáner de código de barras / QR

- el escáner actúa como input de búsqueda de producto: escanear agrega o localiza el ítem sin tocar;
- manejo de foco correcto: la inyección del escáner no dispara doble agregado ni navegación accidental;
- un código desconocido produce feedback claro ("Código no reconocido") y no un agregado silencioso de basura;
- el escaneo funciona en modo offline (consulta al catálogo local SQLite).

## 45.5 Reconexión de periféricos

- el estado de impresora, gaveta y escáner es visible en un solo lugar (superficie de caja/configuración rápida);
- reintentos automáticos con backoff; sin diálogos modales de error en bucle;
- señal calmada ámbar por periférico desconectado, con acción clara (`Reintentar`, `Revisar cable`);
- la venta y la cola jamás se bloquean por un periférico caído.

## 45.6 Lenguaje de hardware

No llamar **"homologado"** a un equipo sin autoridad real para hacerlo (Brand §26, No-negociables: no prometer algo no verificado).

Usar:

> **compatible / verificado por NHILOS**

cuando corresponda, y solo cuando exista la verificación real.

---

# 46. Accesibilidad en terminales táctiles

La accesibilidad es parte de Cuidado.

Mínimo en la terminal:

- soporte TalkBack: todo control crítico tiene etiqueta accesible; el flujo de cobro es completable con lector de pantalla;
- contraste conforme a **WCAG AAA** en texto crítico de operación (montos, vuelto, estados) y mínimo AA en el resto;
- objetivos táctiles >=48 dp, **56 dp para la acción de cobro**, 72 dp en teclas de keypad (§18);
- el color nunca es la única señal (estado textual + color; `ANULADA` es texto, no solo rojo);
- iconos con nombre accesible;
- errores asociados programáticamente al campo (`aria`/semántica Flutter equivalente);
- movimiento reducido respetado;
- legible en condiciones reales de barra: sol, reflejos, ángulos de apoyo del soporte.

Una pantalla que se ve refinada pero excluye a un operador con capacidad reducida no cumple el estándar NHILOS.

---

# 47. Performance y latencia

El performance es calidad percibida. En la fila, la velocidad es respeto.

Una superficie NHILOS POS:

- responde al toque en **<50 ms** (feedback inmediato, ripple/háptico);
- cold start razonable y anunciado: la app abre sobre el último operador/estado válido sin reconstrucciones lentas visibles;
- consultas contra SQLite local: sin loaders de página completa para datos locales;
- carga datos secundarios (nube) de forma independiente y sin bloquear;
- evita layout shift (los números tabulares ayudan aquí);
- impresión térmica: la latencia de impresión nunca bloquea la interfaz más allá de lo necesario para confirmar; la impresión fallida no congela el flujo de venta;
- muestra progreso honesto.

No añadir un +1 cuyo costo técnico empeore la interacción central.

---

# 48. Consistencia

La consistencia reduce el costo de aprendizaje del operador y del capacitador.

Auditar:

- etiquetas y ubicación de botones;
- comportamiento de listas;
- búsqueda/filtros;
- paginación/scroll;
- acciones de diálogo;
- formatos de fecha/moneda;
- vocabulario de estados;
- campos gobernados por catálogo;
- toasts;
- estados vacíos;
- confirmaciones destructivas;
- comportamiento de atrás/breadcrumb;
- paleta y radios entre módulos (catálogo, cobro, caja, KDS).

Un módulo puede ser único en comportamiento de dominio.

No debe ser único en comportamiento de interacción básica sin una razón. El KDS, aunque use tema oscuro intencional para reducir fatiga visual, comparte familia tipográfica (Inter), radios (12 dp) e iconografía con toda la suite.

---

# 49. NHILOS +1 — patrones universales

Un +1 debe ser:

- útil;
- intencional;
- relevante;
- natural;
- sostenible;
- no compensatorio.

## +1.1 El contexto viaja

Los deep links preservan la pregunta del operador.

## +1.2 Estado de lista recordado

Detalle/atrás regresa al mismo contexto significativo de lista.

## +1.3 Defaults preparados

Valores comunes seguros ya seleccionados cuando la evidencia lo soporta (botones de billetes dinámicos, §40).

## +1.4 Siguiente paso claro

Los estados de éxito/vacío/error apuntan a la siguiente acción útil.

## +1.5 La recuperación de error preserva el trabajo

Un fallo transitorio no borra un carrito ni un conteo.

## +1.6 Explicar impacto

Las advertencias/errores dicen qué está afectado, no solo qué falló.

## +1.7 Vista previa útil

Antes de comprometer una acción material, mostrar su efecto significativo cuando sea viable.

## +1.8 Cero input repetido

Reutilizar la información ya conocida de la tarea actual.

## +1.9 Creación contextual

Ejemplo: desde la categoría del catálogo, crear un producto preseleccionando la categoría.

## +1.10 Vistas relacionadas contextuales

Ejemplo: producto → ver su movimiento de stock, no el kardex genérico.

## +1.11 Ruta de retorno inteligente

Tras una investigación profunda, volver preserva el contexto de trabajo original.

## +1.12 Copy útil sobre dependencia de tooltips

La información crítica es visible.

## +1.13 Estados saludables silenciosos

La normalidad consume menos atención que las excepciones.

## +1.14 Claridad de éxito parcial

Las operaciones masivas/sync explican qué se logró y qué queda pendiente.

## +1.15 Gestos memorables de POS (los cuatro canónicos)

1. **Feedback háptico táctil:** pulso de vibración corto y firme al confirmar el cobro en la terminal física (`HapticFeedback.mediumImpact()` o equivalente);
2. **Confirmación sonora sutil:** sonido suave y discreto al imprimir el ticket exitosamente;
3. **Resiliencia visual offline:** nube ámbar serena con contador de cola y la leyenda *"Venta local protegida"* (§35.4);
4. **Papel idéntico a pantalla:** la distribución visual del Corte Z (y del detalle de factura) en pantalla coincide 1:1 con el orden de líneas del ticket de 80 mm.

Estos gestos trascienden lo funcional y generan orgullo en el cliente — siempre después de que el Core Promise pase.

---

# 50. Registro de anti-patrones (contexto terminal)

## AP-01 — Destino genérico

Contexto accionable navega a una lista genérica sin filtro.

`FAIL / REQUIRED`

## AP-02 — Desconocido como cero

Ejemplo POS: teórico de caja donde va el conteo físico; `0` tickets sincronizados cuando la sync nunca corrió.

`BLOCKER` cuando afecta interpretación material del negocio.

## AP-03 — Decoración como valor percibido

Más tratamiento visual sin más comprensión.

`FAIL / REFINEMENT`

## AP-04 — Cada sección en una card

`FAIL / REFINEMENT`

## AP-05 — Ruido en estado saludable

Estados normales compiten con excepciones accionables.

`FAIL / REQUIRED` cuando compromete superficies de decisión.

## AP-06 — Copy genérico

`Ver`, `Aceptar`, `Error`, `Procesado`.

`FAIL / REQUIRED o REFINEMENT` según el riesgo.

## AP-07 — Reset tras el detalle

El operador pierde contexto de lista/búsqueda/filtro sin necesidad.

`FAIL / REQUIRED`

## AP-08 — Pérdida de datos del formulario tras fallo recuperable

Carrito descartado, conteo de arqueo borrado, monto tecleado perdido por un toast/toque accidental.

`BLOCKER` para flujos materiales.

## AP-09 — Permiso por CSS

Valor sensible solicitado/serializado y meramente oculto visualmente.

`BLOCKER`

## AP-10 — Error como código técnico

Error HTTP/base de datos crudo como explicación primaria en la terminal.

`FAIL / REQUIRED`

## AP-11 — Fatiga de confirmación

Diálogos para cambios rutinarios (marcar, ajustar cantidad, corte X).

`FAIL / REFINEMENT`

## AP-12 — Ambigüedad destructiva

El botón `Aceptar` ejecuta anulación DGI.

`BLOCKER / REQUIRED` según la consecuencia.

## AP-13 — Filtro invisible

Filtro contextual activo que el operador no puede ver (por qué el dataset está acotado).

`FAIL / REQUIRED`

## AP-14 — Volcado de tabla

Cada campo de la base de datos se vuelve columna o fila de detalle.

`FAIL / REFINEMENT`

## AP-15 — Volcado de funcionalidades

Toda capacidad compite al mismo nivel jerárquico en la pantalla de cobro.

`FAIL / REQUIRED`

## AP-16 — Lujo falso

Dark/glow/animación/ornamento para fabricar estatus (gold, glassmorphism, clichés premium).

`FAIL / REFINEMENT`

## AP-17 — Callejón sin salida deshabilitado

Un control deshabilitado no explica la razón cuando esta importa materialmente (anulación bloqueada sin decir qué falta).

`FAIL / REQUIRED`

## AP-18 — Callejón sin salida de éxito

La venta culmina y el operador no es guiado al siguiente paso obvio (reimprimir, nueva venta).

`+1 OPPORTUNITY / REQUIRED` si el flujo no puede continuar.

## AP-19 — Efecto colateral oculto

Un cambio impacta otros datos/flujos (catálogo actualizado rompe comandas abiertas) y la UI no lo explica.

`BLOCKER o REQUIRED`

## AP-20 — Vocabulario inconsistente

El mismo estado/acción recibe nombres distintos entre módulos sin razón de dominio.

`FAIL / REQUIRED`

## AP-POS-01 — Síndrome de la Hamburguesa

Fallback iconográfico genérico (hamburguesa) para productos que no lo son. Viola la identidad del comercio (§12.6).

`FAIL / REQUIRED`

## AP-POS-02 — Arcoíris cromático

Marrones, morados, amarillos chillones y azules conviviendo fuera del sistema de diseño (keypad marrón, AppBar morada).

`FAIL / REQUIRED`

## AP-POS-03 — Toast sobre el flujo

Un snackbar cubre carrito, keypad o vuelto en el momento crítico.

`FAIL / REQUIRED`

## AP-POS-04 — Back destructivo

El botón atrás de Android descarta carrito, conteo o cobro sin protección (§10.2).

`BLOCKER`

---

# 51. Dimensiones de auditoría de módulo POS

Toda auditoría de módulo debe cubrir estas dimensiones.

| ID | Dimensión | Pregunta central |
|---|---|---|
| EX-01 | Core Promise | ¿El operador completa la venta y el sistema dice la verdad fiscal? |
| EX-02 | Verdad de Producto | ¿El comportamiento de UI coincide con PRD/semántica de dominio y DGI? |
| EX-03 | Precisión | ¿Etiquetas/datos/acciones pueden malinterpretarse? ¿Vuelto y multimoneda son inequívocos? |
| EX-04 | Navegación | ¿El contexto viaja entre superficies relevantes? |
| EX-05 | Encontrabilidad | ¿Se encuentran objetos mediante búsqueda/filtro/orden apropiados? |
| EX-06 | Formularios | ¿Los flujos de entrada/edición y keypads son claros, seguros y recuperables? |
| EX-07 | Acciones | ¿Consecuencias, riesgo y feedback son claros? |
| EX-08 | Estados | ¿Estados de carga/vacío/error/parcial/éxito son intencionales? |
| EX-09 | Permisos | ¿La autorización es correcta de extremo a extremo (PIN de supervisor, roles)? |
| EX-10 | Tiempo | ¿Se eliminan pasos/input/contexto repetidos en hora pico? |
| EX-11 | Sobriedad | ¿Se eliminó la UI innecesaria? ¿70/20/10 se respeta? |
| EX-12 | Consistencia | ¿Usa los patrones establecidos de la suite POS? |
| EX-13 | Microcopy | ¿El lenguaje es preciso, calmado y accionable? |
| EX-14 | Accesibilidad | ¿El flujo crítico puede completarse de forma accesible (TalkBack, contraste, targets)? |
| EX-15 | Hardware | ¿Impresión, gaveta, escáner y reconexión se comportan según §45? |
| EX-16 | Performance | ¿El comportamiento técnico soporta la calidad percibida (<50 ms, cold start, impresión)? |
| EX-17 | Continuidad Offline | ¿Si el Wi-Fi cae, todo sigue funcionando y la verdad se preserva? |
| EX-18 | +1 | ¿Existe una oportunidad de mejora sostenible y útil? |
| EX-19 | Evidencia | ¿Cada claim de PASS/FAIL puede demostrarse? |

---

# 52. Output requerido de auditoría de módulo POS

Cada agente debe producir:

```text
# <MÓDULO> — Auditoría de Experiencia NHILOS POS

Versión:
Fecha:
Auditor:
Autoridad del módulo:
Pantallas/superficies revisadas:
Evidencia revisada:

## 1. Trabajo del módulo
...

## 2. Inventario de superficies
...

## 3. Matriz de cobertura de experiencia
EX-01 ... EX-19

## 4. Hallazgos
PX-001 ...
PX-002 ...

## 5. Mapa de navegación/contexto
origen → destino → contexto preservado

## 6. Cobertura de estados
carga / vacío / sin-resultados / error / parcial / éxito / permiso / offline

## 7. Cobertura de hardware
impresión / papel / gaveta / escáner / reconexión / offline

## 8. Oportunidades +1
...

## 9. Correcciones requeridas
...

## 10. Refinamientos diferidos
...

## 11. Tests de aceptación
...

## 12. Veredicto
READY | READY_AFTER_REQUIRED_FIXES | NOT_READY | BLOCKED...
```

---

# 53. Plantilla de hallazgo

```text
ID: PX-###
Severidad: BLOCKER | REQUIRED | REFINEMENT | +1 OPPORTUNITY
Estado: OPEN
Estándar: §<sección>
Superficie:
Autoridad:

ACTUAL
<lo que la implementación hace>

ESPERADO
<lo que el estándar/contrato de producto requiere>

POR QUÉ IMPORTA
<core promise / precisión / cuidado / tiempo / sobriedad / +1>

EVIDENCIA
<archivo/código/captura ADB/runtime/test>

CORRECCIÓN
<cambio acotado recomendado>

ACEPTACIÓN
<test observable>

DEPENDENCIAS
<si aplica>
```

---

# 54. Definition of Done de módulo POS

Un módulo está **NHILOS Experience Ready** solo cuando:

## Autoridad

- [ ] La autoridad de producto está identificada.
- [ ] No existe contradicción producto/experiencia sin resolver.
- [ ] Los claims materiales están evidenciados.

## Promesa central

- [ ] Los trabajos primarios se ejecutan correctamente.
- [ ] No queda ningún BLOCKER abierto.
- [ ] Los estados parciales/desconocidos materiales son honestos.

## Navegación

- [ ] Los drill-downs importantes preservan contexto.
- [ ] No quedan callejones sin salida genéricos.
- [ ] Lista/detalle/atrás preserva el estado de trabajo útil.
- [ ] El botón atrás de Android nunca descarta carrito, conteo ni cobro sin protección.

## Listas/datos

- [ ] La búsqueda coincide con identificadores reconocibles por el operador.
- [ ] Los filtros son visibles/resetables.
- [ ] El ordenamiento es comprensible.
- [ ] La paginación/conteo es clara.
- [ ] Las columnas/campos de fila son intencionales y con riqueza contextual.
- [ ] La identidad de producto respeta la categoría del comercio (sin Síndrome de la Hamburguesa).

## Formularios/keypads

- [ ] Etiquetas/requisitos claros.
- [ ] Los campos gobernados usan el catálogo compartido, no texto libre.
- [ ] La validación es accionable.
- [ ] Los errores de servidor preservan el trabajo donde sea posible.
- [ ] La pérdida por estado sucio está protegida.
- [ ] El feedback de guardado es explícito.
- [ ] Teclas de keypad >=72 dp con gap >=8 dp, estilo clean slate (sin marrones/rojos).
- [ ] Targets táctiles >=48 dp y cobro >=56 dp.

## Acciones

- [ ] La acción primaria es clara y dominante.
- [ ] Las acciones destructivas explican consecuencia.
- [ ] La anulación DGI exige motivo formal + PIN de supervisor y preserva la secuencia.
- [ ] La guarda anti doble envío está activa en cobro y anulación.
- [ ] El éxito tiene el siguiente paso apropiado.
- [ ] No hay efecto colateral material oculto.

## Estados

- [ ] Existe estado de carga.
- [ ] Existe estado vacío de primer uso donde aplique.
- [ ] Sin-resultados difiere de sin-datos.
- [ ] Los errores explican impacto/recuperación (4 preguntas de §30).
- [ ] El estado de permiso es intencional.
- [ ] Los estados parcial/no disponible/desconocido nunca se vuelven cero.

## Permisos/seguridad

- [ ] El backend es autoridad.
- [ ] Los datos no autorizados no se solicitan/exponen innecesariamente.
- [ ] La composición de UI coincide con el permiso.
- [ ] El acceso directo permanece protegido.
- [ ] Todo override de supervisor queda auditado.

## Finanzas y fiscal

- [ ] Números tabulares en todo monto.
- [ ] Moneda y decimales consistentes; equivalencia USD con TC visible.
- [ ] La secuencia de facturación es inmutable; solo anulación con `is_canceled`.

## Continuidad Offline

- [ ] SQLite es fuente de verdad; la venta no depende de red ni de impresión.
- [ ] La cola de sincronización sobrevive crash/reinicio.
- [ ] El outbox es idempotente (sin facturas duplicadas).
- [ ] La señal offline es ámbar calmada con contador y leyenda.

## Hardware

- [ ] El ticket 80 mm cumple la spec §45.1 con corte parcial ESC/POS.
- [ ] El estado sin papel es accionable y el ticket es reimprimible.
- [ ] Gaveta: kick en efectivo, apertura manual con permiso + auditoría.
- [ ] Escáner integrado sin dobles inyecciones.
- [ ] Reconexión de periféricos calmada y visible.
- [ ] Lenguaje "compatible/verificado por NHILOS", nunca "homologado" sin verificación.

## Marca / Lujo

- [ ] Sin tratamiento de lujo falso.
- [ ] Jerarquía visual contenida (70/20/10).
- [ ] La normalidad es más silenciosa que las excepciones.
- [ ] Repetición/fricción deliberadamente reducida.
- [ ] La pantalla se siente preparada, no decorada.
- [ ] Paleta unificada; cero marrones/morados fuera del sistema.

## +1

- [ ] El Core Promise pasa antes del trabajo +1.
- [ ] Al menos un +1 significativo fue evaluado.
- [ ] El +1 implementado es útil y sostenible.
- [ ] El +1 no añade fricción material.

## Accesibilidad

- [ ] TalkBack cubre el flujo crítico.
- [ ] Contraste AAA en texto operativo crítico (AA mínimo en el resto).
- [ ] Iconos interactivos con nombre accesible.
- [ ] Errores asociados programáticamente.
- [ ] El color no es la única señal.
- [ ] Movimiento reducido respetado.

## Performance

- [ ] Respuesta al toque <50 ms.
- [ ] Sin loaders de página completa para datos locales.
- [ ] Cold start razonable.
- [ ] La impresión no bloquea el flujo de venta.
- [ ] El performance no contradice materialmente la experiencia.

## Evidencia

- [ ] Todo hallazgo BLOCKER/REQUIRED corregido tiene test de aceptación/recibo de evidencia.
- [ ] Los ítems `NOT_EVIDENCED` no cuentan como PASS.
- [ ] El veredicto final es explícito.

---

# 55. Registro de cobertura de toda la terminal

Mantener un registro después de las auditorías individuales.

Plantilla:

| Módulo | Versión de auditoría | Core Promise | Correcciones requeridas | Blockers | +1 revisado | Estado final |
|---|---|---|---:|---:|---|---|
| Acceso / PIN | — | — | — | — | — | — |
| Catálogo / Venta | — | — | — | — | — | — |
| Carrito / Cobro | — | — | — | — | — | — |
| Historial / Facturación | — | — | — | — | — | — |
| Anulación DGI | — | — | — | — | — | — |
| Control de Caja / Arqueo | — | — | — | — | — | — |
| KDS (Cocina/Barra) | — | — | — | — | — | — |
| Sincronización / Offline | — | — | — | — | — | — |
| Hardware / Impresión | — | — | — | — | — | — |
| Otro | — | — | — | — | — | — |

El registro es seguimiento, no autoridad sobre el alcance del módulo.

Solo incluir módulos que realmente existan en el build auditado.

---

# 56. Pase de consistencia entre módulos

Después de que las auditorías individuales pasen, ejecutar un pase final de terminal.

El objetivo es detectar problemas que ningún agente de módulo aislado puede ver.

Auditar:

- el mismo estado nombrado diferente;
- la misma acción ubicada diferente;
- monedas/fechas inconsistentes;
- búsqueda que se comporta diferente sin razón;
- mismatch de persistencia de filtros;
- patrones de confirmación destructiva diferentes;
- copy de vacío/error diferente;
- comportamiento de permisos desigual;
- deep links que fallan en los límites de módulo;
- navegación activa inconsistente;
- capacidades duplicadas;
- inconsistencias de ruta de retorno;
- divergencias de paleta entre módulos (catálogo vs. caja vs. KDS).

Un módulo puede pasar individualmente y la terminal igual fallar por consistencia.

---

# 57. Guardarraíles del agente

El agente de auditoría **no** debe:

- implementar antes de completar el inventario de evidencia salvo pedido explícito;
- inventar comportamiento de producto faltante;
- marcar gusto subjetivo como BLOCKER;
- rediseñar módulos completos cuando una corrección quirúrgica resuelve el problema;
- añadir capacidades nuevas solo para crear un +1;
- cambiar reglas de dominio bajo una justificación de experiencia;
- declarar PASS solo desde documentación cuando se requiere evidencia de implementación;
- declarar PASS de formularios/consistencia sin verificar si existe un catálogo compartido para campos de texto libre;
- remover información importante solo para lograr minimalismo;
- usar comportamiento de competidores como autoridad sobre contratos de producto NHILOS;
- comprometer la verdad fiscal, offline o de permisos para conseguir una UI más limpia.

El agente debe:

- preferir correcciones quirúrgicas;
- preservar el comportamiento de dominio que funciona;
- trazar cada recomendación a Verdad de Producto o a este Estándar;
- distinguir defecto actual de refinamiento opcional;
- proponer +1 solo después de que el baseline esté sano.

---

# 58. Prompt de agente de módulo listo para usar

Usar el siguiente prompt para cada auditoría independiente de módulo POS.

```text
Estás auditando el módulo NHILOS POS: <MÓDULO>.

AUTORIDADES
1. Leer `nhilos_pos_experience_standard_v1.0.md` completo.
2. Leer el PRD aprobado, Architecture Spec y Acceptance Plan del módulo si existen.
3. Leer la implementación actual relevante (Flutter) y el sistema de diseño vigente.
4. Si las autoridades entran en conflicto, reportar AUTHORITY_CONFLICT.
   No elegir ni reescribir silenciosamente la semántica del producto.

MISIÓN
Auditar la implementación real actual contra el Estándar de Experiencia POS NHILOS.

Este es primero un pase de evidencia.
No implementar hasta que la matriz de auditoría y los hallazgos estén completos,
salvo instrucción explícita.

COBERTURA OBLIGATORIA
- inventariar todas las rutas/pantallas/estados del módulo;
- identificar los trabajos primarios del operador;
- auditar EX-01 a EX-19;
- inspeccionar navegación contextual hacia y desde el módulo;
- inspeccionar búsqueda/filtro/orden/scroll;
- inspeccionar flujos de creación/edición/detalle y keypads;
- inspeccionar estados de carga, vacío, sin-resultados, error, parcial,
  permiso, offline y éxito;
- inspeccionar acciones destructivas y masivas (anulación DGI, corte Z);
- inspeccionar autorización server-side más presentación frontend
  (PIN de supervisor, roles);
- inspeccionar ergonomía táctil (48/56/72 dp) y accesibilidad (TalkBack, contraste);
- inspeccionar hardware: impresión 80 mm, papel, gaveta, escáner, reconexión;
- inspeccionar continuidad offline: SQLite, cola, outbox idempotente, nube ámbar;
- identificar repetición/ruido innecesario;
- identificar oportunidades +1 sostenibles solo después de revisar el Core Promise.

HALLAZGOS
Para cada problema usar:
ID
Severidad: BLOCKER | REQUIRED | REFINEMENT | +1 OPPORTUNITY
Sección del estándar
Superficie
Actual
Esperado
Por qué importa
Evidencia
Corrección
Test de aceptación
Dependencias

REGLAS
- NOT_EVIDENCED no es PASS.
- Desconocido/parcial nunca es cero.
- No crear UI de lujo falso.
- No usar +1 para compensar un Core Promise roto.
- El contexto conocido por el sistema no se re-ingresa manualmente.
- El botón atrás de Android nunca descarta carrito, conteo o cobro sin protección.
- La anulación DGI exige motivo formal + PIN de supervisor y preserva la secuencia.
- La venta nunca depende de la red ni de la impresión para ser válida.
- Preferir corrección quirúrgica sobre rediseño.
- La verdad de producto, seguridad, permisos y las invariantes fiscales y
  contables nunca se cambian por conveniencia visual.

OUTPUT
Crear `<modulo>_nhilos_pos_experience_audit_v0.1.md` con:
1. autoridad/evidencia;
2. inventario de superficies;
3. trabajos del módulo;
4. matriz EX-01 → EX-19;
5. hallazgos;
6. mapa de navegación contextual;
7. cobertura de estados;
8. cobertura de hardware;
9. oportunidades +1;
10. correcciones requeridas;
11. tests de aceptación;
12. veredicto final.

VEREDICTO FINAL
READY
READY_AFTER_REQUIRED_FIXES
NOT_READY
BLOCKED_BY_PRODUCT_DECISION
BLOCKED_BY_MISSING_EVIDENCE
```

---

# 59. Secuencia de aceptación POS

Ejecución recomendada:

```text
1. CONGELAR AUTORIDAD DEL MÓDULO
        ↓
2. AUDITORÍA DE EXPERIENCIA DEL MÓDULO
        ↓
3. CORREGIR BLOCKERS
        ↓
4. CORREGIR HALLAZGOS REQUIRED
        ↓
5. RE-AUDITAR
        ↓
6. APLICAR +1 APROBADOS
        ↓
7. ACEPTACIÓN DEL MÓDULO
        ↓
8. SIGUIENTE MÓDULO
        ↓
9. PASE DE CONSISTENCIA ENTRE MÓDULOS
        ↓
10. ACEPTACIÓN COMPLETA DE EXPERIENCIA POS
```

No empezar restyleando globalmente la app.

El estándar es comportamental antes que decorativo.

---

# 60. Definition of Done de todo el POS

La terminal NHILOS POS completa alcanza **Cobertura de Experiencia NHILOS** cuando:

- [ ] cada módulo de producción tiene una auditoría de módulo respaldada por evidencia;
- [ ] cada módulo auditado identifica su autoridad de producto;
- [ ] no queda ningún BLOCKER abierto;
- [ ] todos los hallazgos REQUIRED están cerrados o diferidos explícitamente por autoridad aprobada;
- [ ] la navegación contextual funciona a través de los límites de módulo;
- [ ] los drill-downs genéricos sin salida están eliminados;
- [ ] el estado importante de lista sobrevive a investigación/retorno;
- [ ] el botón atrás de Android protege carrito, conteo y cobro en toda la app;
- [ ] búsqueda/filtro/lista se comportan coherentemente;
- [ ] la anulación DGI exige motivo + PIN y la secuencia es inmutable en toda la app;
- [ ] el comportamiento de formularios protege el trabajo del operador;
- [ ] las acciones destructivas son proporcionalmente seguras;
- [ ] los permisos se aplican de extremo a extremo con auditoría de overrides;
- [ ] las incógnitas financieras/operacionales nunca aparecen como ceros válidos;
- [ ] los estados de carga/vacío/error/parcial son intencionales;
- [ ] SQLite es fuente de verdad, la cola sobrevive reinicios y el outbox es idempotente;
- [ ] el ticket de 80 mm cumple la spec §45.1 en todos los flujos que imprimen;
- [ ] gaveta, escáner y reconexión se comportan según §45;
- [ ] la microcopy es clara, precisa y calmada;
- [ ] el estado saludable es más silencioso que las excepciones;
- [ ] la paleta está unificada: cero marrones/morados fuera del sistema, cero Síndrome de la Hamburguesa;
- [ ] la jerarquía visual sigue la restricción, no la densidad de funcionalidades (70/20/10);
- [ ] el baseline de accesibilidad (TalkBack, contraste, targets) pasa en los flujos críticos;
- [ ] el performance (<50 ms, cold start, impresión) no socava la interacción;
- [ ] cada módulo evaluó al menos una oportunidad +1 significativa;
- [ ] los patrones +1 implementados son útiles y sostenibles;
- [ ] el pase de consistencia entre módulos está completo;
- [ ] el registro de cobertura final contiene estado explícito para cada módulo de producción.

---

# 61. North Star

La terminal no debe sentirse como una colección de pantallas construidas en momentos distintos.

Debe sentirse que una compañía pensó la operación.

El operador debe experimentar progresivamente:

```text
SÉ DÓNDE ESTOY
        ↓
ENTIENDO LO QUE ESTOY VIENDO
        ↓
SÉ QUÉ NECESITA MI ATENCIÓN
        ↓
SÉ QUÉ PASARÁ SI ACTÚO
        ↓
EL SISTEMA RECUERDA MI CONTEXTO
        ↓
NO REPITO TRABAJO INNECESARIAMENTE
        ↓
CUANDO ALGO FALLA, PUEDO RECUPERAR
        ↓
MI VENTA ESTÁ PROTEGIDA, HAY WI-FI O NO
        ↓
EL DETALLE SE SIENTE INTENCIONAL
```

Ese es el estándar.

---

# 62. Regla operativa final

```text
NO DECORAR PARA PARECER VALIOSOS
            ↓
CUMPLIR LA PROMESA CENTRAL
(VENDER Y DECIR LA VERDAD FISCAL)
            ↓
DECIR EXACTAMENTE LO QUE OCURRE
(ONLINE, OFFLINE, IMPRESO, SIN PAPEL)
            ↓
CONSERVAR EL CONTEXTO
(NUNCA DESCARTAR CARRITO NI CONTEO)
            ↓
REDUCIR TRABAJO INNECESARIO
(CERO TOQUES DE MÁS EN HORA PICO)
            ↓
ANTICIPAR EL SIGUIENTE PASO
            ↓
HACER SILENCIOSO LO NORMAL
            ↓
HACER CLARO LO IMPORTANTE
            ↓
+1 CUANDO APORTA
```

> **NHILOS no hace más para aparentar valor. Hace mejor lo que importa.**
