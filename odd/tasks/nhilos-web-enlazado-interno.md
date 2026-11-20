# Enlazado interno: sacar a las hijas del aislamiento

La arquitectura SEO se definió, las nueve páginas se publicaron… y dos de ellas solo existen por URL. Ningún enlace roto; el defecto es el contrario.

## Diagnóstico medido (2026-11-20)

| Ruta | Enlaces entrantes |
|---|---|
| `/` | 8 |
| `/software-pos/` | 7 |
| `/precios/` | 7 |
| `/facturacion-dgi/` | 6 |
| `/inventario/` | 5 |
| `/demo/` | 4 |
| `/software-pos/sin-internet/` | 2 |
| `/software-pos/restaurantes/` | 1 (viene de food-parks) |
| **`/software-pos/food-parks/`** | **0 — huérfana** |

- **Enlaces rotos: ninguno.** Todos los destinos internos existen.
- **El footer del home usa anclas** (`#inicio`, `#precios`, `#faq`); las otras ocho usan rutas. El del home se quedó en la estructura anterior a la arquitectura de páginas.
- **Las tarjetas de segmento del home no enlazan**: solo llevan a `#precios`, `#faq`, `#demo`.
- **El hub no menciona `food-parks`** ni `comida-rapida`, `bares`, `multisucursal`.
- Los briefs §5.6 y §6.6 mandaban enlaces entrantes desde la home y desde el hub. Nunca se escribieron.

## Specs

**S1 — Ninguna huérfana.** Toda ruta publicada recibe al menos un enlace desde `/` y uno desde `/software-pos/`. La home y el hub son las dos puertas.

**S2 — Home: las tarjetas de segmento enlazan a su página.** Food parks → `/software-pos/food-parks/` con anchor `software para food park`. Restaurantes → `/software-pos/restaurantes/` con anchor `sistema POS para restaurante`. Cafeterías no tiene página: se queda como texto, **sin enlace inventado** y sin prometer que existirá.

**S3 — Hub: bloque de segmentos con las dos hijas**, más las que existan. Las rutas no publicadas se nombran como texto plano, nunca como enlace.

**S4 — Footer único para las nueve páginas.** Mismo conjunto de enlaces, con rutas reales (no anclas), agrupado: **Producto** (Inicio, Software POS, Sin internet, Precios, Facturación DGI, Inventario), **Segmentos** (Restaurantes, Food parks), **Contacto** (WhatsApp, demo). El footer del home deja de usar `#anclas` y pasa al mismo esquema. Se conservan los `utm_medium` por página en el enlace de WhatsApp.

**S5 — Guardia de clase, en las nueve suites o en una compartida:** (a) todo `href` interno de una página publicada resuelve a una ruta publicada; (b) el footer de cada página contiene **todas** las rutas publicadas; (c) ninguna página queda sin enlace entrante desde `/` y desde el hub. Probada en rojo borrando un enlace del footer de una página.

**S6 — Sin regresión visual.** Tokens existentes, estructura y bandas del footer intactas a 390 y 1440. No se agregan secciones nuevas al footer: se corrige lo que hay.

## Tasks

| ID | Specs | Trabajo |
|---|---|---|
| T1 | S2 | Home: tarjetas de segmento con enlace y anchor correctos |
| T2 | S3 | Hub: bloque de segmentos con las dos hijas |
| T3 | S4 | Footer único en las nueve páginas, con rutas reales |
| T4 | S5 | Guardia de enlazado en rojo y luego verde |
| T5 | S6 | Verificación: 9 suites, build, móvil, enlaces en vivo |

## Log

- **L1.** Fundador, verbatim: *"la página «/» osea el home, no tiene la re estructuración de la arquitectura web seo, todas las páginas que hemos creado solo se pueden acceder mediante URL, igual el footer está desactualizado, los enlaces también, veamos que no haya enlaces rotos en ningún lugar."*
- **L2.** Diagnóstico: cero enlaces rotos, dos huérfanas (`food-parks` con 0, `restaurantes` con 1).
- **L3.** El footer del home quedó en la estructura anterior: anclas internas en vez de rutas.

## Segunda ronda: el menú superior (2026-11-20, fundador)

**Verbatim:** *"El footer lo veo bien, contiene todos los enlaces a las páginas creadas, con 6 en producto y 2 más en segmentos. Aparte de contacto que tiene la demo y whatsapp directo. Pero a nivel de menú navegacional, esa estructura no la tenemos. O sea desde la home no puedo llegar a esos enlaces si no fuera por los enlaces directos internos o el footer."*

**Diagnóstico medido:** el footer quedó unificado; **el header no**, y es distinto en cada página:

| Página | Menú superior actual |
|---|---|
| home | Producto · Precios · FAQ · Solicitar una demo — **anclas locales**, no rutas |
| hub | Dos formas de vender · Preguntas clave · FAQ · Solicitar una demo — **anclas locales** |
| restaurantes, food-parks | Software POS · Precios · Facturación DGI · Inventario · Solicitar una demo |

Las dos primeras siguen en la estructura anterior a la arquitectura; las nuevas ya usan rutas. El resultado: desde la home no se llega a ninguna página publicada por el menú.

**S7 — Un menú, el mismo en las nueve páginas, con la arquitectura del footer.** Dos grupos desplegables y el CTA:
- **Producto ▾**: Software POS · Sin internet · Precios · Facturación DGI · Inventario
- **Segmentos ▾**: Restaurantes · Food parks
- **Solicitar una demo** (CTA, no desplegable)

Se implementa con `<details>`/`<summary>`: funciona sin JavaScript, es accesible por teclado y no agrega estado que mantener. Los estilos viven en `assets/site.css`, una sola vez, no copiados en nueve bloques.

**S8 — En móvil, el menú existente.** `site.js` ya maneja `.mobile-menu-btn` con `#siteNav` (abre/cierra, `aria-expanded`, Escape, cierre al navegar). Los dos grupos deben funcionar dentro de ese panel sin JS nuevo. **No se toca `site.js`**: si algo no se puede resolver con `<details>` y el toggle existente, se reporta, no se improvisa.

**S9 — Guardia de clase:** (a) las nueve páginas tienen el mismo menú, comparado normalizado; (b) el menú contiene las nueve rutas publicadas; (c) ninguna página usa anclas locales en el menú superior (la home y el hub son las que las tenían); (d) el botón móvil y `#siteNav` siguen presentes. Probada en rojo contra el estado actual: la home y el hub deben fallar por usar anclas.

**S10 — Sin regresión:** el header actual mantiene su comportamiento de scroll (`is-scrolled`), el menú no rompe el layout a 390, 768, 1024 ni 1440, y el CTA conserva su `data-event` y `utm_medium` por página.
