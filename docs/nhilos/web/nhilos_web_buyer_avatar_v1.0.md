# NHILOS — Buyer Avatar para la Web

## Control del documento

| Campo | Valor |
|---|---|
| Documento | `nhilos_web_buyer_avatar_v1.0.md` |
| Versión | 1.4 |
| Estado | WORKING DRAFT — pendiente de validación con ventas, producto y datos |
| Owner | Founder / Marketing |
| Audiencia | Founder, Marketing, Web, Ventas, Customer Success, agencias y redactores |
| Propósito | Definir el comprador ideal de la web pública de NHILOS y convertir esa definición en decisiones de mensaje, SEO, páginas y CTAs |
| Fuente principal | Métricas de Instagram, Facebook y TikTok de los primeros 3 días de publicación; contexto de producto NHILOS POS |
| Fecha de captura | 2026-11-16 |
| Próxima revisión | Después de 10 entrevistas o 2–3 semanas de pruebas de contenido |
| Alcance | Web pública y contenido orgánico. No define precios finales ni sustituye revisión legal/contable |

### Documentos relacionados

- [Oportunidades de keywords para la web](./nhilos_web_keyword_opportunities_v1.0.md)
- [Análisis de keyword ideas](./nhilos_web_keyword_ideas_analysis_v1.0.md)
- [Dataset limpio de Keyword Planner](./nhilos_web_keyword_planner_historical_v1.0.csv)
- [Guía para Keyword Planner](./nhilos_web_keyword_planner_guide_v1.0.md)
- [Seeds para Keyword Planner](./nhilos_web_keyword_planner_seeds_v1.0.txt)
- [Principios de experiencia de marca NHILOS](../nhilos_brand_experience_principles_v1.0.md)
- [Estándar de experiencia NHILOS POS](../nhilos_pos_experience_standard_v1.0.md)
- [Estándar de experiencia de backoffice](../nhilos_backoffice_experience_standard_v1.0.md)
- [Artboard actual de la web](../../../design/nhilos-web-foundation/04-sintesis-hibrida.html)
- [Marco normativo de inventario](../../inventario_marco_normativo.md)
- [Reglas del proyecto](../../../AGENTS.md)

---

## 1. Resumen ejecutivo

El comprador principal de la web de NHILOS **no es el espectador promedio de TikTok**. Es el **dueño-operador de un food park, restaurante de alta rotación o comercio de mostrador en Nicaragua** (miscelánea, tienda, café sin cocina) que ya vende, tiene entre 1 y 4 locales y vive apagando incendios operativos. El eje común no es el rubro sino la necesidad: **venta local-first con el nivel de control que cada negocio elija** — desde ventas y métricas simples (productos de reventa, sin recetas) hasta recetas, insumos, BOM y kardex completo. El control de producción es opcional, no la identidad del producto.

TikTok está funcionando como canal de descubrimiento: mucho alcance frío, poca retención y casi ningún dato de conversión. La web debe capturar la intención que ese contenido despierta, no limitarse a repetir trends.

### Decisiones rectoras

1. **Comprador:** dueño/socio de 28–45 años, con negocio en marcha y dolor operativo real — gastronomía (food park, restaurante, cafetería) o comercio de reventa (miscelánea, tienda, mostrador).
2. **Usuario:** cajero, mesero o encargado de 18–30 años; le importa velocidad y facilidad, no el ROI.
3. **Influenciador:** contador o administrador; puede acelerar o bloquear la compra.
4. **Cuña SEO:** DGI/VET, POS sin internet, inventario/merma y food park/multilocal. Con el reposicionamiento (2026-11-16): también POS para tienda/miscelánea/reventa — el producto cubre ambos modos (`ProductType.SIMPLE` y `COMPOUND`/`PREPARED`); keywords retail reabiertas a evaluación con evidencia de Planner.
5. **Regla de evidencia:** no publicar claims de DGI, offline, multi-sucursal o inventario que no sean demostrables. En DGI la precisión es doble: NHILOS garantiza la **mecánica normativa** de la DT 09-2007 (consecutivo inalterable, anulación con motivo auditado, trazabilidad); la **autorización formal** (carta, código y numeración autorizada) la posee cada cliente contribuyente. NHILOS no está registrado como empresa ni posee autorización DGI.
6. **Anti-encasillamiento:** el copy habla del espectro (negocio, mostrador, gastronomía), no solo de restaurantes; el control detallado se presenta como opcional y activable, no como requisito.

---

## 2. Evidencia y límites

### 2.1 Datos fuente: Instagram y Facebook

| Día | Vistas | Espectadores | Tiempo promedio | Omisión | Me gusta | Reposts | Guardados | Nuevos seguidores | IG / FB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 28 | 7 | 2 s | 85.7% | 2 | 1 | 0 | 0 | 9 / 19 |
| 2 | 25 | 14 | 8 s | 43.8% | 2 | 3 | 1 | 1 | 21 / 4 |
| 3 | 44 | 17 | 2 s | 85% | 1 | 1 | 0 | 0 | 25 / 19 |

Orígenes y audiencia:

- Día 1: Feed 55.6%, Reels 44.4%; 55.6% seguidores y 44.4% no seguidores.
- Día 2: Feed 42.9%, Reels 38.1%, Explorar 4.8%, Perfil 4.8%; 52.4% seguidores y 47.6% no seguidores.
- Día 3: Reels 48%, Historias 24%, Feed 24%, Explorar 4%; 48% seguidores y 52% no seguidores.

### 2.2 Datos fuente: TikTok

| Día | Vistas | Tiempo total | Promedio | Completion | Likes | Shares | Saves | No seguidores | Nuevos / recurrentes | Hombres / mujeres |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 538 | 44m 10s | 4.6 s | 1.89% | 9 | 2 | 1 | 98% | 56% / 44% | 79% / 21% |
| 2 | 48 | 5m 17s | 6.0 s | 1.89% | 3 | 1 | 1 | 91% | 47% / 53% | n/d |
| 3 | 527 | 34m 13s | 4.0 s | 1.77% | 19 | 1 | 1 | 98% | 83% / 17% | 81% / 19% |

Contexto adicional:

- Día 1: 16% del video visto; 98.6% Nicaragua, 0.7% EE. UU., 0.3% España, 0.2% Costa Rica, 0.2% Guatemala.
- Día 1, edades: 18–24 = 38%, 25–35 = 42%, 35–44 = 13%, 45–54 = 5%, 55+ = 2%.
- Día 1, tráfico: Para ti 96.8%, perfil 1.2%, otras 1.0%, buscar 0.7%, mensajes directos 0.3%.
- Día 3: 393 espectadores; tráfico Para ti 97.8%, perfil 1.4%, buscar 0.4%, otras 0.4%; 98.8% Nicaragua.
- Búsquedas Día 1: `nhilosapp` 66.7%; `redencion anula en la VET Nicaragua` 33.3%.
- Me gusta Día 1: mayoría en 0:00; 11% en 0:03; 11% en 0:06. Día 3: mayoría en 0:01.

### 2.3 Lectura correcta de los datos

- **No se puede concluir que el algoritmo “castigó” el alcance.** 538 → 527 vistas es alcance estable. Lo que cayó fue la retención: 4.6 s → 4.0 s y completion 1.89% → 1.77%.
- **El Día 2 de Instagram/Facebook es la mejor señal creativa:** 8 s de promedio, 43.8% de omisión, guardados y reposts. Hay que diseccionar ese clip y repetir su estructura, no solo su tema.
- **El Día 2 de TikTok tiene mejor retención con muestra pequeña:** 48 vistas y 6 s. No es un triunfo de alcance; es una hipótesis de retención.
- **El embudo es frío:** 98% no seguidores y 1.8% de completion indican descubrimiento, no demanda calificada.
- **La muestra es insuficiente:** 25–48 vistas y pocas búsquedas no permiten conclusiones estructurales. Generan hipótesis, no certezas.
- **El sesgo de género y edad es de distribución, no del mercado:** 79–81% hombres de 18–34 puede incluir empleados y curiosos. El comprador puede ser mayor y de otro perfil.
- **Falta duración del video y datos de conversión:** sin duración no se puede interpretar bien el completion; sin clics a demo/WhatsApp no se puede medir intención real.

### 2.4 Implicaciones para la web

- La web debe capturar búsquedas con intención, no solo replicar contenido social.
- La home debe hablarle al dueño; las páginas de producto pueden hablarle al usuario.
- El contador necesita contenido propio porque puede bloquear la decisión.
- El Día 2 de IG/FB debe convertirse en formato repetible: hook claro, demostración, promesa concreta y CTA.

---

## 3. Roles de decisión

| Rol | Quién es | Qué le importa | Implicación web |
|---|---|---|---|
| Comprador | Dueño/socio de 28–45 años | ROI, riesgo DGI, control, tranquilidad | Home, precios, casos, demo |
| Usuario | Cajero, mesero o encargado de 18–30 años | Velocidad, facilidad, que no lo hagan quedar mal | Páginas de producto, onboarding, soporte |
| Influenciador | Contador o administrador | Validez fiscal, datos limpios, conciliación | Página DGI/VET, reportes, exportaciones |
| Bloqueador | Proveedor actual, miedo al cambio, contrato | Costo de migración, riesgo operativo | Comparativas, garantías, implementación |

**Error a evitar:** escribirle solo al usuario y esperar que firme el cheque. El usuario usa el sistema; el dueño paga; el contador valida.

---

## 4. Avatar primario: El Dueño Operador

### 4.1 Perfil demográfico

- **Edad:** 28–45. El usuario típico del sistema es 18–30.
- **Sexo:** hombre o mujer. El alcance actual es 79–81% hombres, pero no debe convertirse en filtro de mercado.
- **Ubicación:** Nicaragua, principalmente Managua y ciudades con food parks o alta rotación gastronómica. 98% del alcance está en el país.
- **Situación del negocio:** food park de 3–10 puestos o restaurante/cafetería/bar de alta rotación con 1–4 locales. Entre 10 y 40 empleados. Ventas 7 días. POS fiscal viejo o facturación manual. Inventario en Excel o cuaderno. Contador externo. Internet inestable.
- **Poder adquisitivo:** clase media/emergente. Puede pagar alquiler, planilla, contador, hardware básico y una suscripción mensual de dos dígitos en USD; no es enterprise ni un proyecto de USD 10k. Decide por ROI.
- **Hipótesis de pago a validar:** USD 30–90 al mes por local, hardware aparte. Validar con 10 entrevistas antes de fijar precios.
- **No es:** el emprendedor que aún no abre, la cadena grande con departamento de IT, el turista, el empleado que solo ve TikTok.

### 4.2 Escena típica

> Sábado, 12:30 p. m. Hay fila de 15 personas. Se cae el Wi-Fi. La cajera reinicia la tablet. El dueño está en otro local y no sabe cuánto se vendió ni si la caja cuadró.

Ese es el momento que la web debe resolver.

### 4.3 Qué quiere conseguir (deseos)

- Facturar sin miedo a la DGI: “que no me multen, que no me clausuren”.
- Que la operación no se detenga cuando se cae el internet.
- Saber si gana de verdad, no solo cuánto entra a caja.
- Controlar merma, fugas, propinas y empleados.
- Atender rápido en hora pico y no perder pedidos.
- Ver todos sus locales desde el teléfono.
- Dejar el cuaderno y el Excel; verse formal ante clientes, bancos y DGI.
- Crecer a otra sucursal sin duplicar el caos.
- Que su contador reciba datos limpios y no tenga que perseguirlo.

### 4.4 Qué le frena o le preocupa (miedos)

- **Miedo a la DGI:** “¿y si me multan por una factura mal anulada o por no emitir?”.
- **Miedo a la clausura:** “¿y si llega una inspección y no tengo todo en orden?”.
- **Miedo al costo:** “¿cuánto me va a salir y qué me cobran después?”.
- **Miedo a la complejidad:** “no soy técnico, no tengo tiempo”.
- **Miedo a la caída:** “¿y si se va la luz o el internet en hora pico?”.
- **Miedo al equipo:** “mis muchachos no lo aprenden” o “me roban”.
- **Miedo a migrar:** “tengo todo en Excel/cuaderno”.
- **Miedo al proveedor:** “¿y si desaparecen y quedo amarrado?”.
- **Miedo a que no sea para food park:** propinas, puestos, cocina, para llevar, merma.
- **Miedo a que el contador lo rechace.**
- **Miedo a no recuperar la inversión.**

### 4.5 Objeciones y respuestas de contenido

| Objeción | Respuesta de contenido |
|---|---|
| “Ya facturo en la VET.” | La VET te ayuda a cumplir; no te dice si el food park gana, si te roban o si la merma se comió el margen. No pelees contra la VET: intégrate. |
| “Ya tengo POS.” | ¿Funciona sin internet? ¿Controla recetas y merma? ¿Te da soporte local? |
| “Mi negocio es pequeño.” | Más razón: una fuga de 5% te borra el margen. |
| “Mi contador lo maneja.” | Tu contador no está en la hora pico; dale datos limpios y evidencia. |
| “Es caro.” | El costo real no es la mensualidad; es la venta perdida, la merma y la multa. |
| “No tengo tiempo.” | Implementación acompañada y capacitación; no un proyecto de seis meses. |
| “Déjame pensarlo.” | No hay urgencia hasta que llega la multa o se cae el internet. |

### 4.6 Cómo habla y qué vocabulario usa

**Vocabulario operativo:**

- factura, VET, DGI, caja, cuadre, cierre, merma, inventario, receta, propina, comandera, puesto, local, sucursal, hora pico, para llevar, mesero, cocina, planilla, contador.

**Lo que no dice:**

- RaaS, multi-tenant, omnicanal, transformación digital, ecosistema, sinergia.

**Frases textuales:**

- “Que me cuadre la caja.”
- “Que no se caiga.”
- “Que no me multen.”
- “Que me controle el inventario.”
- “Que sirva para varios locales.”
- “Que sea fácil para mis muchachos.”

**Preguntas en WhatsApp:**

- “¿Funciona sin internet?”
- “¿Sirve para la DGI?”
- “¿Cuánto al mes?”
- “¿Me lo instalan?”
- “¿Capacitan a mi gente?”
- “¿Sirve para varios locales?”
- “¿Qué pasa si se cae?”

### 4.7 Búsquedas y vocabulario de Google

| Intención | Búsquedas | Página objetivo |
|---|---|---|
| DGI/VET | “cómo anular una factura en la VET Nicaragua”, “factura electrónica para restaurante Nicaragua”, “multas DGI por no facturar”, “sistema de facturación DGI Nicaragua” | `/facturacion-dgi/`, `/facturacion-dgi/como-anular-factura-vet/` |
| POS/offline | “POS para restaurante Nicaragua”, “sistema POS que funcione sin internet”, “programa para cuadrar caja de restaurante” | `/software-pos/sin-internet/`, `/software-pos/restaurantes/` |
| Inventario/merma | “control de inventario para restaurante”, “cómo controlar la merma en un restaurante”, “sistema de inventario para comida” | `/inventario/restaurantes/`, `/recursos/merma/` |
| Food park/multilocal | “software para food park”, “sistema para food court Managua”, “sistema para varias sucursales Nicaragua” | `/software-pos/food-parks/`, `/software-pos/multisucursal/` |
| Precio/comparativa | “cuánto cuesta un sistema POS en Nicaragua”, “mejor sistema de facturación para negocio pequeño Nicaragua”, “POS vs Excel” | `/precios/`, `/comparativas/` |
| Marca | “nhilos app”, “nhilos POS”, “nhilos Nicaragua” | `/` |

**Nota:** las búsquedas de DGI/VET pueden atraer contadores y administradores, no solo dueños. Esa página debe tener CTA suave y contenido educativo; la página de food park y POS offline debe tener CTA comercial.

### 4.8 Qué le haría elegir NHILOS

No compites solo contra otro POS; compites contra el statu quo: Excel, cuaderno, POS fiscal viejo, miedo a la DGI y “mi contador lo hace”.

**Tres banderas:**

1. **No te multan:** facturación con secuencia, anulación trazable y evidencia.
2. **No paras:** si se cae el internet, la operación sigue.
3. **No te roban:** caja, inventario, recetas, merma y propinas bajo control.

**Diferenciadores:**

- Hecho para food parks y alta rotación, no un POS genérico.
- DGI sin drama: nada se borra; todo queda auditado.
- Offline real: venta local y sincronización posterior.
- Control de caja, inventario, recetas, merma y propinas.
- Multi-local: todos los locales desde el teléfono.
- Soporte local en español, por WhatsApp, con alguien que entiende la operación.
- Implementación acompañada: migración, capacitación y prueba con el menú real.
- Precio claro, sin letra chica.
- Prueba real: demo con el menú, caso de food park, piloto documentado.

| Alternativa | Lo que promete | Brecha | Ángulo NHILOS |
|---|---|---|---|
| Excel/cuaderno | Flexibilidad y bajo costo | Sin control, sin evidencia, sin DGI | Control y auditoría |
| POS genérico | Cobrar rápido | No entiende food park, propinas, merma ni offline | Especialización gastronómica |
| Sistema cloud | Centralización | Depende del internet | Continuidad local-first |
| Proveedor grande | Marca y respaldo | Soporte lejano y genérico | Soporte local humano |
| Contador | Confianza y cumplimiento | No está en la operación diaria | Datos limpios para el contador |

---

## 5. Mensajes web

### 5.1 Promesa central

> Para dueños de food parks y restaurantes en Nicaragua que ya venden pero viven apagando incendios: NHILOS les da facturación con correlativo inalterable y anulación trazable sin miedo a la DGI, operación offline y control de caja, inventario y merma en un solo sistema, con soporte local.

### 5.2 Home

La H1 actual del artboard es:

> Nunca dejas de vender. El POS que sigue cuando falla el internet.

Es una H1 fuerte de continuidad. Se mantiene hasta tener evidencia para un test. Para SEO y conversión, el subhead y las páginas internas deben nombrar al dueño, DGI, food park y merma.

**H1 alternativa a testear:**

> Tu food park no debería detenerse cuando se cae el internet.

**Subhead recomendado:**

> Factura sin miedo, controla caja e inventario y sigue vendiendo offline. Hecho para food parks y restaurantes de alta rotación en Nicaragua.

### 5.3 CTAs

- “Quiero una demo con mi menú.”
- “Diagnóstico de 15 minutos.”
- “Calcula tu merma mensual.”
- “Habla con alguien que entiende food parks.”

Evitar el “Contáctanos” genérico.

### 5.4 Tono

- Directo, concreto y sin jerga.
- Tuteo, como el resto de la web actual.
- Hablar de resultados: vender, cuadrar, facturar, controlar, seguir operando.
- Mostrar evidencia y límites; no prometer magia.

### 5.5 Palabras para usar y evitar

| Usar | Evitar |
|---|---|
| factura, caja, cuadre, merma, inventario, receta, propina | RaaS, multi-tenant, omnicanal |
| sin internet, offline, local-first | transformación digital, ecosistema, sinergia |
| food park, puesto, local, sucursal | “solución integral” sin sustento |
| DGI, VET, DT 09-2007, correlativo | “cero multas”; “sistema autorizado por la DGI”; “facturación autorizada” como claim propio de NHILOS |
| soporte local, implementación acompañada | “automatización total” |

---

## 6. Mapa SEO vigente

> La fuente de verdad para URLs, keywords principales y fases es la [arquitectura web y grupos transaccionales](./nhilos_web_seo_architecture_v1.0.md) v1.2. Este resumen solo alinea al avatar con esa arquitectura.

### P0 — Primera ola (10 páginas de campaña + home)

- `/` — home: promesa condicionada, demo y confianza.
- `/software-pos/` — hub POS: `sistema POS Nicaragua`.
- `/software-pos/restaurantes/` — `sistema POS para restaurante`.
- `/software-pos/food-parks/` — avatar: `software para food park`.
- `/software-pos/sin-internet/` — diferenciador: `sistema POS sin internet para restaurante`.
- `/facturacion-dgi/` — hub fiscal: `sistema de facturación DGI en Nicaragua`.
- `/facturacion-dgi/restaurantes/` — `software de facturación DGI para restaurantes`.
- `/inventario/` — hub: `sistema de inventario Nicaragua`.
- `/inventario/restaurantes/` — `sistema de inventario para restaurante`.
- `/precios/` — cotización según operación.
- `/demo/` — demo con datos etiquetados.

### P1 — Segunda ola

- `/software-pos/caja/` — cierre y arqueo.
- `/software-pos/bares/` — POS para bar.
- `/software-pos/comida-rapida/` — QSR y mostrador.
- `/software-pos/hardware/` — kit y terminal.
- `/software-pos/facturacion-dgi/` — POS + DGI.
- `/comparativas/` — comparación honesta.
- `/implementacion/` — alcance real de instalación.

### P2 — Tercera ola

- `/software-pos/multisucursal/`
- `/facturacion-dgi/cafeterias/`
- `/facturacion-dgi/como-anular-factura-vet/`
- `/inventario/food-parks/`
- `/recursos/merma/`
- `/recursos/caja/`
- `/recursos/costeo-recetas/`
- `/casos/` — bloqueado hasta tener casos reales.

### Reglas de contenido

- Una página = una intención de búsqueda.
- Responder la pregunta en los primeros 100–150 palabras.
- Cada página debe declarar: keyword, objeción, prueba, CTA y enlaces internos.
- No canibalizar: DGI/VET, POS offline, inventario, food park, QSR y precios son clusters separados.
- No escribir 50 artículos genéricos; escribir primero las 10 páginas P0 de campaña que cierran las objeciones principales.
- No crear páginas para “gratis”, Excel, PDF, facturación electrónica ni marcas competidoras.

---

## 7. Reglas de evidencia y claims

- **DGI:** usar “cumple DT 09-2007” solo si el flujo es demostrable y hay evidencia. No prometer “cero multas”. Precisión obligatoria: NHILOS garantiza la mecánica normativa (consecutivo inalterable, anulación con motivo formal, trazabilidad); la autorización DGI del sistema —carta, código y numeración autorizada— la posee el cliente contribuyente, no NHILOS. Nunca escribir “facturación autorizada por la DGI” como capacidad de NHILOS ni “factura electrónica”.
- **Offline:** usar “sigue vendiendo sin internet” solo si la venta local y la sincronización están resueltas y probadas.
- **Multi-sucursal:** no prometerlo hasta que esté disponible y demostrado.
- **Inventario y valoración:** cualquier claim debe alinearse con [el marco normativo de inventario](../../inventario_marco_normativo.md) y declarar los requisitos `R-01`..`R-07` que toque.
- **Casos:** no inventar clientes, métricas ni logos. Si no hay caso público, usar un piloto documentado.
- **DGI/VET:** el contenido educativo debe ser revisado por un contador. No dar asesoría legal a ciegas.
- **UI:** no usar mockups ficticios como si fueran producto real; la web actual ya se apoya en capturas reales.

---

## 8. Riesgos y validación

| Riesgo | Mitigación |
|---|---|
| Sobreajustar el avatar a 3 días de datos | Validar con 2–3 semanas y 10 entrevistas |
| Confundir alcance con demanda | Medir clics a demo, WhatsApp, llamadas y solicitudes |
| Prometer capacidades no demostrables | Crear una biblioteca de evidencia por claim |
| Sesgo de género/edad del alcance | Probar contenido de dueño y medir 28–45 |
| El contador bloquea la compra | Crear contenido específico para contadores |
| Canibalización SEO | Una intención por página y enlaces internos claros |
| Dependencia de TikTok | Usar la web y el SEO para capturar intención |

### Plan de validación

1. Entrevistar a 5 dueños de food park, 3 restaurantes y 2 contadores.
2. Probar 3 líneas de contenido durante 2–3 semanas: DGI/VET, POS offline y merma.
3. Medir guardados, visitas al perfil, clics a demo, WhatsApp y llamadas; no solo vistas.
4. Validar el rango de precio y la disposición de pago.
5. Actualizar este documento con hallazgos y decisiones.

---

## 9. Próximos documentos

- `nhilos_web_messaging_v1.0.md` — mensajes por página y por objeción.
- [nhilos_web_seo_architecture_v1.0.md](./nhilos_web_seo_architecture_v1.0.md) — arquitectura de URLs, keywords y enlazado interno.
- `nhilos_web_page_briefs_v1.0.md` — briefs de las 10 páginas P0.
- `nhilos_web_content_inventory_v1.0.md` — inventario de contenido existente y gaps.
- `nhilos_web_analytics_v1.0.md` — eventos, KPIs y dashboard de intención.

---

## 10. Change log

| Versión | Fecha | Cambio | Autor |
|---|---|---|---|
| 1.0 | 2026-11-16 | Documento inicial: avatar, evidencia, objeciones, mensajes, mapa SEO y reglas de claims | Equipo NHILOS |
| 1.1 | 2026-11-16 | Mapa SEO inicial alineado a la arquitectura y grupos transaccionales | Equipo NHILOS |
| 1.2 | 2026-11-16 | Mapa SEO actualizado a arquitectura v1.2: 10 P0, QSR y lectura fit-first | Equipo NHILOS |
| 1.3 | 2026-11-16 | Precisión fiscal en decisiones rectoras, promesa central y reglas de claims: la autorización DGI es del contribuyente; NHILOS garantiza solo la mecánica DT 09-2007 | Equipo NHILOS |
| 1.4 | 2026-11-16 | Reposicionamiento ampliado: comprador abarca gastronomía y comercio de reventa (miscelánea, tienda, mostrador); eje = venta local-first con control a la medida; keywords retail reabiertas a evaluación | Equipo NHILOS |

---

## Anexo A — Glosario

- **DGI:** Dirección General de Ingresos.
- **VET:** Ventanilla Electrónica Tributaria.
- **DT 09-2007:** Disposición Técnica de facturación de la DGI.
- **POS:** punto de venta.
- **Food park:** plaza gastronómica con varios puestos o marcas.
- **Merma:** pérdida de producto por desperdicio, vencimiento, robo o error de inventario.
- **RaaS:** Retail-as-a-Service. Término interno; no usar en copy público.
