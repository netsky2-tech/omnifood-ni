# NHILOS — Brief de Identidad de Marca

**Documento:** `nhilos_brand_identity_brief_v0.1.md`
**Versión:** 0.1
**Estado:** `FOR DESIGN — INPUT DOCUMENT`
**Autoridad de origen:** `nhilos_brand_experience_principles_v1.0.md` (§1, §2, §5, §6, §13, §14, §22, §23, §24, §29, §41, §48)
**Produce:** `nhilos_brand_identity_system.md` — el sistema que el diseñador entrega. La constitución lo prevé como derivación futura (árbol documental del anexo D) y lo deja **explícitamente diferido**: v1.0 se aprueba sin requerir que esté diseñado (§47 `BR-D01`, §48). No hay mandato pendiente; es decisión del cliente completar la marca.
**Gobernanza:** `nhilos_branding_document_governance_v1.0.md`
**Fecha:** 2026-10-08

---

## 0. Cómo usar este brief

Este documento **no diseña nada**. Define el problema, las restricciones y los criterios de
evaluación para que el diseñador tome las decisiones de oficio.

- **Lo que el diseñador decide:** construcción del mark, paleta, tipografía, iconografía, retícula,
  dirección fotográfica y las piezas del sistema.
- **Lo que este brief fija:** qué debe comunicar la marca, qué no puede comunicar nunca, en qué
  soportes tiene que funcionar y cómo se evalúa la entrega.
- **Lo que este brief no es:** autoridad de marca. La autoridad es la constitución. Si algo acá la
  contradice, gana la constitución.

**Estado de las decisiones de identidad:** ninguna está tomada. El mark actual está en uso y se
evalúa más abajo como insumo, no como base obligatoria.

---

## 1. Objetivo y entregable

**Objetivo.** Dotar a NHILOS de un sistema de identidad que funcione como **lenguaje**, no como
conjunto de piezas sueltas: reproducible por un tercero, coherente entre la marca madre y sus
productos, y aplicable a los soportes reales donde la marca vive (web, app, ticket térmico,
hardware, presentaciones).

**Entregable principal.** `nhilos_brand_identity_system.md`, que debe contener, como mínimo:

1. Construcción del mark: geometría, retícula de construcción, proporciones, versión principal.
2. Variantes: horizontal, vertical, isotipo solo, monocromo, negativo, versiones de un color.
3. Lockups con producto (`NHILOS` + `NHILOS POS`) según la arquitectura de marca.
4. Zona de resguardo, tamaño mínimo por soporte, usos incorrectos con ejemplos.
5. Paleta: colores de marca con sus valores (HEX, RGB, CMYK, Pantone cuando aplique), proporción de
   uso y reglas de contraste.
6. Tipografía: familia para marca y para producto, escala, pesos, y licenciamiento verificado.
7. Iconografía: sistema, trazo, retícula, familias de íconos.
8. Dirección de imagen y fotografía.
9. Retícula y principios de layout para superficies de marketing.
10. Derivaciones: favicon, ícono de app, imagen de terminal bloqueada, sello/marca de agua para
    capturas.
11. **Master tokens** y reglas de expresión por producto (estructura exigida en §22 de la
    constitución, ver §9 de este brief).

---

## 2. El núcleo de marca (recapitulado, no reeditado)

Todo lo de esta sección está **APPROVED** en la constitución. No se rediscute acá.

```text
PURPOSE        Conectar y simplificar la operación de los negocios mediante un
               ecosistema de productos que integran procesos, automatizan tareas
               y ayudan a las personas a trabajar con mayor productividad,
               claridad y control.

BRAND ESSENCE  Conectar para hacer que el negocio funcione mejor.

SLOGAN         Conectamos los hilos de tu negocio.
```

**El slogan es la metáfora central de la marca.** `NHILOS` es "hilos" con N. La identidad visual
tiene un trabajo concreto: hacer visible **la conexión de hilos**, no decorarla.

**Arquitectura (no negociable).** `NHILOS` es la marca madre y la compañía. `NHILOS POS` es el
producto actual. `NHILOS Conta`, `NHILOS ERP` y futuras líneas están previstas, no aprobadas.

**Principios maestros** (§5): Precisión · Cuidado · Sobriedad · Fiabilidad · Ecosystem by Design.

**Personalidad** (§6): Seguro · Sereno · Preciso · Atento · Sofisticado · Cercano · Técnico cuando
hace falta.

**Dirección visual declarada** (§23):

> *"No queremos que NHILOS POS parezca caro. Queremos que parezca cuidado."*
> **70% sobriedad / 20% producto / 10% gesto memorable**.

**Dirección fotográfica declarada** (§24): negocio real, personas reales, producto real, hardware
real, contexto operativo. Evitar stock genérico, poses corporativas, composiciones falsas e
imágenes sobreproducidas.

**La marca no es** (§7): arrogante, elitista, pretenciosa, ruidosa, excéntrica, agresiva en ventas,
"startup que vive de hype", ni una marca que necesita decir que es premium.

---

## 3. Restricciones no negociables

Estas son condiciones de aceptación. Una propuesta que viole cualquiera de ellas se rechaza sin
evaluar su mérito estético.

| # | Restricción | Origen |
|---|---|---|
| `R-01` | **Prohibido autodescribirse como premium, lujo, exclusivo o equivalente.** El cuidado se demuestra, no se declara. | §13.12, §7 |
| `R-02` | **Sobriedad como mecanismo, no como estilo.** 70/20/10 es disciplina: el 70% del peso visual es aire y estructura, no ornamento. | §5.3, §23 |
| `R-03` | **Una sola marca con productos, no sub-marcas.** Nada de nombres nuevos por módulo ni "NHILOS POS by NHILOS". | §1.2, §1.3 |
| `R-04` | **"Nada debe existir únicamente para colocar el logo."** Si un elemento visual no aporta comprensión, orientación o acción, se elimina. | §41 |
| `R-05` | **Tiene que funcionar en monocromo y en baja resolución.** El mark se imprime en ticket térmico y se procesa a 1 bit. Un mark con líneas finas de color desaparece ahí. | `PC-HW-01` (58 mm), `receipt_layout_formatter.dart`, `thermal_logo_processor.dart` |
| `R-06` | **Tiene que funcionar a 16×16 px** como favicon y a tamaño de ícono de app, sin perder lectura. | Requisito de derivación |
| `R-07` | **Tiene que funcionar sobre las dos superficies de producto:** fondo claro del backoffice y fondo oscuro del KDS. | `nhilos_tokens.dart`, estándar POS |
| `R-08` | **Contraste verificable:** 4.5:1 para texto, 3:1 para elementos de UI (WCAG 2.1 AA). Ninguna combinación de marca puede incumplirlo. | `nhilos_website_non_functional_spec_v1.0.md` |
| `R-09` | **No romper los tokens de producto vigentes** sin declarar migración. La paleta de marca debe reconciliarse con `nhilos_tokens.dart` o proponer explícitamente el cambio y su costo. | `nhilos_tokens.dart` |
| `R-10` | **Nada de imágenes literales de tecnología:** servidores, nubes, engranajes, candados, gráficos de barras ascendentes, siluetas de manos apretadas, ni genéricos de stock. | §7, §24, §5.3 |
| `R-11` | **"No empezar hablando de nosotros."** La propuesta abre por el cliente, su contexto y su problema; NHILOS aparece después. | §29 |

**Nota de trazabilidad (`G-04`):** `R-05` describe una **condición de diseño**, no un claim. El
producto sí imprime en 58 mm (registrado como `PC-HW-01`) y el código también genera layouts de
80 mm (`receipt_layout_formatter.dart`, `format80mm()`), pero **esa capacidad de 80 mm no tiene
fila propia en el registro de claims**. Queda reportada al dueño de claims: el brief no puede
crear claims, y la copia pública no debe afirmar anchuras sin fila de respaldo.

### Sobre el estado de la propiedad del nombre

No existe registro de búsqueda de antecedentes marcarios ni de reserva del nombre. **Se recomienda
hacerla antes de invertir en la construcción final del mark.** El costo de una búsqueda es
irrisorio al lado del costo de un rebranding con clientes activos. No bloquea la exploración
conceptual; sí bloquea la producción de piezas finales y el registro de activos.

---

## 4. Estado actual verificable (el punto de partida real)

Lo que existe hoy, medido en el repositorio:

| Activo | Estado | Ruta |
|---|---|---|
| Logo en uso | Existe. `N` navy con tratamiento de aguja e hilo, divisor vertical, "POS" apilado. PNG 2161×2161 RGBA. | `apps/owner_dashboard/public/logo.png` |
| Favicon del dashboard | **Es el logo y está bien.** `index.html` carga `/favicon.png`, byte-idéntico a `logo.png`. | `apps/owner_dashboard/index.html`, `public/favicon.png` |
| Ícono huérfano | Existe un `favicon.svg` (violeta y celeste: `#863bff`, `#7e14ff`, `#47bfff`, `#ede6ff`), residuo de scaffolding, que **ninguna página referencia**. No contamina hoy; evidencia que no hay gobierno de íconos. | `apps/owner_dashboard/public/favicon.svg` |
| Paleta de producto | Implementada con tokens: `brandPrimary #1E3A40` (deep teal), `brandNavy #0F292E`, semánticos success/warning/danger. Radios 12/8/4 dp. | `apps/pos_app/lib/ui/design_system/nhilos_tokens.dart` |
| Tipografía de producto | **Inter**, compartida por toda la suite, incluido el KDS oscuro. | Estándar POS §42.7 |
| Paleta documentada | Aprobada: `#F8FAFC` `#FFFFFF` `#E2E8F0` `#0F172A` `#64748B` `#1E3A40` `#0F292E` `#059669` `#DC2626` `#D97706`. **Prohibidos expresamente:** `#795548` (marrón) y `#3949AB` (morado). | Estándar POS §42.1 |
| Sistema de identidad | **No existe.** | — |
| Guía verbal separada | **No existe.** El contenido de §14 de la constitución es hoy la autoridad. | — |
| Especificaciones de expresión por producto | **No existen.** | — |
| Fotografía propia | No hay fotografía de marca. Existen 33 capturas de pantalla del producto, la mayoría anteriores a la remediación UX vigente. | `docs/nhilos/manuals/images/` |

**Deriva detectada, y es una sola:** el verde del hilo del logo (`#00BE84` / `#03BD85`) no
corresponde a ningún color de la paleta documentada ni de los tokens. Es exactamente la falla que un
sistema de identidad existe para impedir. El `favicon.svg` huérfano es un síntoma menor del mismo
vacío: sin sistema, los activos sueltos se acumulan.

---

## 5. Evaluación del mark actual (sugerencia al diseñador, no prescripción)

El cliente dejó abierta la decisión: **si el mark requiere mejoras se sugiere; si no, se deja tal
cual.** Esta es la evaluación.

### Lo que el mark actual acierta

**La idea central es correcta y es propia.** El trazo del `N` se convierte en hilo. Eso no es
decoración: es el slogan hecho forma. `NHILOS` = hilos. La marca ya tiene su metáfora encarnada, y
la encontró sola.

**El apilado `N` + `POS` comunica bien la relación marca madre / producto**, que es exactamente la
arquitectura declarada en §1.2.

**La paleta base es sobria y coherente con §23** — navy profundo y un acento, nada más.

### Dónde el mark actual falla, con evidencia

1. **La aguja es el punto débil, y el diseñador tiene razón por una razón mejor de la que dio.** La
   aguja es un **instrumento**, no un significado. La marca dice *conectar*; la aguja dice
   *coser*. Y el `N` ya carga la metáfora del hilo: la aguja es redundante y agrega literalidad.
2. **El mark es frágil en los dos soportes donde la marca realmente va a vivir.** Los hilos verdes
   son líneas finas de color. El ticket térmico es monocromo y de baja resolución física: el
   procesador de logo lo reduce a 1 bit (`thermal_logo_processor.dart`), y ahí las líneas finas
   desaparecen o se empastan y el divisor verde se pierde. A **16×16 px** como favicon, el mismo
   problema. Viola `R-05` y `R-06`.
3. **Depende del color para leerse.** Si se pasa a un color plano, la relación `N`–hilo se
   desarma. Viola la exigencia de `R-05` y debilita `R-07`.

**Conclusión sugerida:** la idea del hilo se conserva; **la construcción debe rehacerse** para
sobrevivir monocromo, miniatura y baja resolución. No es un pedido de rediseño por gusto: es que el
mark actual no pasa las condiciones de aceptación que la marca necesita.

---

## 6. Direcciones a explorar

**Se requiere explorar al menos tres direcciones antes de decidir.** No se acepta una única
propuesta. El objetivo es elegir con alternativas sobre la mesa, no validar una intuición.

### D1 — El hilo que se anuda *(recomendada)*

**Idea:** el `N` como nudo, enlace o cruce de hilos. Dos o más trazos que se entrelazan y, al
entrelazarse, sostienen.

**Qué comunica:** conexión intencional. Un nudo es trabajo hecho a propósito, con criterio, que
resiste. Alinea con *"conectar para hacer que el negocio funcione mejor"* y con Fiabilidad.

**Riesgo:** puede caer en lo genérico de "nudo/infinito" si no se construye con geometría propia.

**Fortaleza técnica:** un nudo de trazos gruesos sobrevive monocromo, miniatura e impresión térmica.

### D2 — La red *(propuesta del diseñador: telaraña)*

**Idea:** sustituir la aguja por una **red de telaraña** que une y mantiene juntos los procesos del
negocio y las partes de la aplicación.

**Qué comunica bien:** red, ecosistema, interconexión, estructura que se sostiene por sus uniones.
Es coherente con `Ecosystem by Design` (§5.5) y con un ecosistema de productos. Geométricamente es
radial, escalable y sobrio: buenos atributos para un mark.

**Riesgos que el brief está obligado a dejar por escrito antes de que se explore:**

| Riesgo | Detalle |
|---|---|
| **Connotación de abandono** | En español, "telaraña" evoca descuido y lugar abandonado (*"esa bodega está llena de telarañas"*). Es lo opuesto al Cuidado (§5.2) y a la Sobriedad (§5.3). |
| **Connotación de trampa** | La telaraña es un instrumento de depredador: existe para atrapar. Una marca de software para negocios no quiere decir "te atrapo". |
| **"Enredado" = confuso** | *Enredarse* y *enredar* significan complicar. El propósito de la marca menciona **claridad** como valor explícito. El riesgo es decir lo contrario de lo que se quiere decir. |
| **Fragilidad** | Una telaraña se destruye al primer contacto. La marca promete Fiabilidad (§5.4). |
| **Cliché de categoría** | La red es el recurso más usado del software empresarial: riesgo alto de parecerse a una marca de infraestructura o de ciberseguridad. |

**Recomendación sobre D2:** explorarla en serio, porque la intuición del diseñador —*una red que
mantiene junto lo que está separado*— **es la lectura correcta del negocio**. El riesgo no está en
la idea de red, está en su literalización arácnida. Si se explora, hacerlo **desde la estructura de
red** (malla, retícula, urdimbre) y no desde la telaraña como objeto.

### D3 — El tejido *(la misma familia, sin el riesgo)*

**Idea:** el lado constructivo de la misma metáfora. Urdimbre y trama, un telar, una malla tensada,
una trenza. Hilos que se sostienen mutuamente **porque están tejidos**, no porque estén pegados.

**Qué comunica:** estructura, oficio, resistencia, orden. Es la lectura del hilo que aporta algo:
no el instrumento (aguja) ni la trampa (telaraña), sino **la construcción**.

**Nota de vocabulario:** *"tejido"* y *"telar"* en español connotan oficio y solidez. *"Telaraña"*
connota lo contrario. La diferencia entre las dos direcciones es una sola palabra, y esa palabra
decide el significado.

### Lo que las tres comparten

Las tres conservan el hallazgo central del mark actual: **el hilo es la marca**. Ninguna introduce
un símbolo ajeno a la metáfora declarada. Eso es un límite deliberado: la identidad no debe
inventar un significado nuevo, debe hacer visible el que ya existe.

---

## 7. Criterios de aceptación

Una propuesta de identidad se acepta cuando:

1. **Se lee sin color.** En negro puro, sin medias tintas, se reconoce la marca.
2. **Sobrevive a 16 px y a impresión térmica.** Favicon y ticket, verificados con impresión de
   prueba o simulación fiel a 1 bit.
3. **Aporta significado, no decoración.** Cada elemento puede defenderse con una frase que conecte
   con el propósito, la esencia o un principio. Si no, se elimina (`R-04`).
4. **Cumple las restricciones `R-01`..`R-11`** sin excepciones.
5. **Es aplicable por un tercero** sin consultar al diseñador: la guía alcanza para que otro
   reproduzca la marca correctamente.
6. **Respeta la arquitectura de marca**: se ve claramente que `NHILOS POS` es un producto de
   `NHILOS`, y se puede extender a un producto futuro sin rediseñar.
7. **Sobrevive el test del silencio:** al sacarle todo, queda algo reconocible. Ese es el 10% de
   gesto memorable de §23.

---

## 8. Restricciones de aplicación al producto

La identidad no termina en la web. Debe convivir con lo que ya está implementado.

- **Paleta:** debe reconciliarse con `nhilos_tokens.dart` (`brandPrimary #1E3A40`, `brandNavy
  #0F292E`, semánticos y neutrales). Si la identidad propone otra paleta, debe declarar el plan de
  migración y qué pasa con los tokens semánticos de estado, que son de producto y no de marca.
- **Tipografía:** Inter ya es la familia de producto en toda la suite, incluido el KDS. Si se
  propone otra, debe justificarse y declarar el impacto de migración.
- **KDS:** superficie oscura, alto contraste, uso a distancia. El mark y la paleta deben funcionar
  ahí (verificar contraste, `R-08`).
- **Ticket térmico:** monocromo y de baja resolución física (el logo se procesa a 1 bit). El mark
  impreso debe ser legible y no consumir ancho útil de la factura (`R-05`).
- **Favicon y app icon:** deben derivar del mismo sistema, no inventarse aparte. Hoy el dashboard
  acierta (`favicon.png` es el logo), pero convive con un `favicon.svg` huérfano de otro origen. El
  sistema debe dejar un único origen de íconos y prohibir activos sueltos en las carpetas públicas.

---

## 9. Estructura técnica requerida

La constitución §22 establece esta jerarquía para el futuro sistema. La identidad debe entregarse en esta forma:

```text
NHILOS MASTER TOKENS          (color, tipografía, radios, espaciado, sombras, motion)
        ↓
PRODUCT EXPRESSION RULES      (qué puede variar por producto y qué no)
        ↓
NHILOS POS  ·  NHILOS Conta ·  NHILOS ERP
```

**Master tokens** son la fuente única. **Las reglas de expresión** definen qué se hereda sin
cambios y qué puede ajustarse por producto (por ejemplo, el KDS oscuro). Hoy los tokens existen
solo para POS; el sistema debe expresarlos como marca madre y derivar POS como primera expresión.

---

## 10. Decisiones que el cliente debe tomar antes de que empiece la producción

1. **Búsqueda de antecedentes marcarios** del nombre `NHILOS` (recomendada antes de las piezas
   finales).
2. **Soportes prioritarios:** ¿la identidad se diseña pensando primero en web, en producto o en
   venta presencial? Cambia la jerarquía de decisiones.
3. **Alcance del sistema hoy:** ¿se diseña para el ecosistema futuro (`Conta`, `ERP`) o se
   documenta solo la extensibilidad?
4. **Fotografía:** ¿se produce fotografía propia de negocio real desde ahora, o la fase 1 usa solo
   producto y tipografía? §24 pide negocio real; producirla toma tiempo y presupuesto.
5. **Idioma del sistema:** la marca se comunica en español de Nicaragua (`es-NI`). ¿La documentación
   del sistema se entrega en español, en inglés o en ambos?

---

## 11. Fuera de alcance de este brief

- Diseño de las páginas web comerciales (eso es el paquete de inicio de diseño, documento aparte).
- Diseño de UI de producto (gobernado por `nhilos_pos_experience_standard_v1.0.md` y
  `nhilos_backoffice_experience_standard_v1.0.md`).
- Arquitectura de marca y naming (ya definidos en la constitución §1).
- Constitución legal de la compañía, registro marcario y contratos (decisión del cliente,
  posterior).
- Contenido y copy: ya existen contratos de contenido aprobados para la homepage y la página de
  producto.

---

## 12. Qué NO hacer

- No proponer autodescripción como premium, lujo o exclusividad (`R-01`).
- No crear sub-marcas ni nombres por módulo (`R-03`).
- No usar imágenes literales de tecnología ni stock genérico (`R-10`).
- No entregar el mark dependiente del color para ser legible (`R-05`, `R-07`).
- No diseñar piezas sueltas sin el sistema que las gobierna.
- No introducir un símbolo ajeno a la metáfora del hilo declarada en el slogan.
- No dejar el favicon y el app icon fuera del sistema.
