# NHILOS POS — Website Product Marketing Brief

**Documento:** `nhilos_website_product_marketing_brief_v1.0.md`  
**Versión:** 1.0 (Autorizado para Producción)  
**Estado:** `APPROVED / READY FOR WEBSITE IA PROMOTION & COPYWRITING`  
**Upstream Authority:** `nhilos_brand_experience_principles_v1.0.md` (v1.0) → `product_claim_audit_od02_v1.3.md` (v1.3, `CLOSED / VERIFIED / RE-ANCHORED`), según la cadena de `nhilos_branding_document_governance_v1.0.md`
**NHILOS +1:** Este documento honra el principio `NHILOS +1` (`nhilos_brand_experience_principles_v1.0.md` [NHILOS +1](../nhilos_brand_experience_principles_v1.0.md#11-nhilos-1)): la demo se prepara y comienza por la operación del propio prospecto (ver Regla de Oro y Sección 5.1).  
  
**Downstream Gate:** `nhilos_website_information_architecture_content_wireframe_v1.0.md` — dueño de la navegación y las rutas; consume los mensajes de este Brief (ver `nhilos_branding_document_governance_v1.0.md` [Control de cambios](nhilos_branding_document_governance_v1.0.md#6-control-de-cambios))  
**Audiencia:** Product Marketing, Copywriters, UI/UX Designers, Frontend Engineers  
**Mercado objetivo principal:** Nicaragua (Gastronomía, Cafeterías, Food Parks, Bares y Retail de alta rotación)  
**Fecha:** 2026-09-26  

---

## 1. Visión y Resumen Ejecutivo

**NHILOS POS** es el sistema de punto de venta táctico y gestión operativa diseñado específicamente para las realidades de conectividad y fiscalidad de Nicaragua.

A diferencia de los sistemas tradicionales en la nube que se congelan cuando el internet falla, o los sistemas locales obsoletos que no ofrecen visibilidad remota al dueño, NHILOS POS combina una **arquitectura local offline-first** (SQLite en caja) con un **panel administrativo web en la nube** (PostgreSQL con aislamiento estricto RLS y dashboard ejecutivo en tiempo real).

### Regla de Oro del Copywriting
> **Solo comunicamos lo que el código ya sabe hacer.**  
> Cada afirmación en el sitio web debe estar respaldada por la auditoría técnica de claims **OD-02 v1.3** (`product_claim_audit_od02_v1.3.md`). No sobreprometemos tecnología experimental ni vendemos intenciones de roadmap.

---

## 2. Pilares de Posicionamiento y Propuesta de Valor (Auditoría OD-02 v1.3)

Los seis pilares innegociables del producto, verificados contra código real:

### 1. Offline-First Táctico en Caja: la venta sigue cuando se cae el internet (`OD-02-R03`)
- **Problema del cliente:** Cuando el proveedor de internet se cae en Managua o en departamentos, el comercio pierde ventas, genera filas o tiene que recurrir al papel y lápiz.
- **NHILOS POS:** El terminal corre una base de datos local completa (SQLite Floor). Vende, emite tickets correlativos, calcula impuestos, descuenta recetas y autentica por PIN sin depender de ningún servidor externo.
- **Wording normativo endurecido:** *“Cobrá, facturá e imprimí en tu punto de venta local, aunque se caiga el internet. Cuando regrese la conexión, tus ventas e inventarios sincronizan automáticamente con la nube.”*
- **Delimitación explícita:** El terminal debe estar previamente enrolado y con su catálogo local hidratado. El enrolamiento inicial y la actualización remota de precios requieren conectividad.

### 2. Cumplimiento Fiscal DGI Nicaragua (DT 09-2007) (`OD-02-R02`)
- **Problema del cliente:** El riesgo de multas o auditorías de la DGI por saltos en la numeración correlativa o alteración de registros.
- **NHILOS POS:** Implementación rigurosa de la Disposición Técnica 09-2007 para Sistemas Computarizados de Facturación. Consecutivos progresivos inalterables, prohibición física de borrado de facturas y anulación supervisada únicamente mediante Notas de Crédito.
- **Wording normativo condicionado:** *"Emisión de facturas correlativas conforme a la Disposición Técnica DGI 09-2007 para Sistemas Computarizados de Facturación: numeración consecutiva e inalterable, con prefijo y folio inicial configurados previamente según la autorización de la DGI."* (`OD-02` PC-FISC-01/PC-FISC-02; claim delimitado, no una garantía absoluta de cumplimiento.)
- **Delimitación explícita:** Requiere parametrización inicial del folio inicial y serie autorizada por la DGI. No es facturación electrónica en línea con transmisión XML en vivo.

### 3. Costeo y Deducción Automática por Receta (BOM)
- **Problema del cliente:** El dueño no sabe cuánto le cuesta producir un café o una hamburguesa ni cuándo se fuga materia prima.
- **NHILOS POS:** Descuento automático de insumos en tiempo real por cada producto compuesto vendido (`COMPOUND`), cálculo de Costo Promedio Ponderado (CPP) con cada factura de compra y Kardex inmutable basado en deltas cronológicos.
- **Promesa verificada:** *“Cada venta descuenta exactamente los insumos de tu receta. Conocé tu margen bruto y costo real al instante.”*

### 4. Arqueo y Finanzas Bimoneda (NIO / USD)
- **Problema del cliente:** En Nicaragua el cliente paga en dólares o córdobas, o combina efectivo y tarjeta. El cajero pierde tiempo con calculadoras y descuadra la caja.
- **NHILOS POS:** Checkout bimoneda nativo con tipo de cambio oficial BCN (para cálculo fiscal) y comercial (para proteger el margen de caja). División de cuentas (Split Bill) exacta, conciliación diaria de vouchers BAC/Banpro y control de propina voluntaria sin gravar IVA (DGI INV-16.1).
- **Promesa verificada:** *“Cobrá en Córdobas o Dólares con cálculo de vuelto automático. Conciliá vouchers de tarjetas BAC y Banpro en minutos al cerrar tu turno.”*

### 5. Control Ejecutivo Remoto para el Dueño (Dashboard V2)
- **Problema del cliente:** El dueño necesita estar presente en el local para saber qué ocurre, o recibe reportes estáticos al final del mes.
- **NHILOS POS:** Panel web moderno con métricas clave de venta neta, horas pico, ticket promedio, participación de productos top y un indicador visual de frescura de sincronización para saber si cada terminal está al día.
- **Promesa verificada:** *“Monitoreá tus ventas, productos más vendidos y estado de tus cajas desde cualquier dispositivo con internet.”*

### 6. Lealtad y Promociones con límites declarados (`PC-LOY-01..06`)
- **Problema del cliente:** Los comercios de alta rotación quieren fidelizar clientes, pero los sistemas de lealtad tradicionales dependen de tarjetas plásticas, servidores en línea o reglas que nadie opera en el mostrador.
- **NHILOS POS:** El cliente se identifica en caja por QR, código, teléfono o búsqueda por nombre — todo offline — y acumula puntos automáticamente en cada venta guardada localmente (`PC-LOY-01`, `PC-LOY-04`). Los puntos se canjean como descuento en mostrador con salvaguardas: mínimo de puntos, validación de saldo y descuento nunca mayor al total de la orden, siempre iniciado por el operador (`PC-LOY-02`). Las transacciones de puntos sincronizan a la nube de forma idempotente: los duplicados no cuentan doble (`PC-LOY-03`). Las promociones (buy-X-get-Y free, porcentaje, monto fijo, combo) se aplican solas y de forma determinista en el POS, administradas centralmente (`PC-LOY-05`). El dueño configura programas y recompensas, ajusta puntos con actor y motivo, y ve la economía de cada recompensa (`PC-LOY-06`).
- **Wording normativo condicionado:** *"Tus clientes acumulan puntos en cada venta, incluso sin internet, y los canjean como descuento en caja con reglas claras; las promociones se aplican solas y el dueño ve la economía de cada recompensa."*
- **Delimitación explícita:** La acumulación requiere cliente seleccionado y venta guardada localmente; la tasa es plana y no sigue reglas de programa. El canje siempre es operado por el cajero y el beneficio del catálogo de recompensas no se aplica al total del carrito. La nube es eventualmente consistente (deriva de redondeo de hasta 0.5 punto por transacción; sin paridad exacta de saldo en tiempo real). Las promociones requieren estar activas localmente y no están ligadas a las reglas de puntos. La configuración requiere rol `OWNER`/`MANAGER`.

---

## 3. Delimitación de Producto y Anti-Posicionamiento (Blocklist D5)

Para proteger la credibilidad de la marca y cumplir el registro de bloqueos **D5 de OD-02 v1.3**, el sitio web **NUNCA DEBE AFIRMAR**:

| Copy Prohibido (Anti-Claim) | Razón Técnica | Copy Correcto Autorizado |
|---|---|---|
| *"Facturación electrónica DGI en línea con envío de XML firmado en tiempo real"* | Corresponde al Bloque 19 futuro. En producción se opera con DT 09-2007 (Sistemas Computarizados) (`OD-02-R02`). | *“Cumplimiento riguroso de Sistemas Computarizados de Facturación según la Disposición Técnica DGI 09-2007.”* |
| *"Validación en tiempo real contra el padrón activo de la DGI"* | No existe API pública de consulta en vivo del padrón DGI en Nicaragua (`OD-02-R02`). | *“Validación sintáctica y algorítmica de Cédula y RUC nicaragüense para prevenir errores en caja.”* |
| *"Integración electrónica automática con datáfonos BAC/Banpro por cable o software"* | No existe API electrónica con terminales bancarias en Nicaragua; el flujo es manual desacoplado con captura de código. | *“Registro rápido y conciliación de vouchers de tarjetas de crédito y débito de todos los bancos nacionales (BAC, Banpro).”* |
| *"Red inalámbrica multi-mesero que se comunica sin internet ni servidor"* | El broker LAN peer-to-peer sin nube (Bloque 18) está en roadmap. Los pedidos multi-terminal sincronizan vía nube (`OD-02-R03`). | *“Terminales autónomos y ágiles diseñados para alta rotación y sincronización en la nube.”* |
| *"Conexión directa a balanzas de pesaje continuo"* | No hay drivers de balanza serial implementados en el código auditado. | Enfocar en unidades, porciones y recetas estandarizadas. |
| *"Tus clientes ganan puntos según reglas de programa, estampitas o niveles"* | La tasa de acumulación es plana; no existen reglas de programa, sellos, expiración ni tiers (`PC-LOY-01`, blocklist [Definición](../nhilos_brand_experience_principles_v1.0.md#41-definición) de OD-02). | *"Acumulación simple y transparente en cada venta, sin tarjetas plásticas."* |
| *"Recompensas canjeadas que se descuentan solas del total"* | El beneficio del catálogo de recompensas no se aplica al carrito en el POS; el canje es un descuento iniciado por el operador (`PC-LOY-02`). | *"Canje de puntos como descuento en caja, con mínimo, validación de saldo y tope al total de la orden."* |
| *"Saldo de puntos idéntico en tiempo real entre caja y nube"* | Consistencia eventual; deriva de redondeo de hasta 0.5 punto por transacción y sin test de paridad round-trip (`PC-LOY-03`). | *"Sincronización idempotente de puntos: los duplicados no cuentan doble."* |
| *"Campañas de lealtad, portal del consumidor, dashboards de KPIs de loyalty o expiración de puntos"* | No existen en código: ni campañas, ni portal, ni KPIs de loyalty, ni expiración, ni acumulación automática en la nube desde tickets ([Definición](../nhilos_brand_experience_principles_v1.0.md#41-definición) de OD-02). | Configuración de programas, recompensas y ajustes con actor y motivo desde el Owner Dashboard (`PC-LOY-06`). |

---

## 4. Perfiles de Cliente y Propuesta por Segmento

### Segmento A: Cafeterías de Especialidad y Panaderías
- **Dolor principal:** Fugas de leche, café en grano, jarabes y empaques; lentitud al cobrar en horas pico de la mañana.
- **Gancho:** Deducción de insumos por receta (BOM) en productos `COMPOUND` con receta publicada (`OD-02` PC-INV-01) y cobro en el terminal Sunmi V2s con impresora térmica integrada (`OD-02` LIM-06). No se declara ningún tiempo de impresión medido ni cifra de velocidad: no existe evidencia de referencia en el repositorio.

### Segmento B: Food Parks y Locales de Comida Rápida (QSR)
- **Dolor principal:** Conexión Wi-Fi inestable en espacios abiertos, clientes que pagan mixto (efectivo + tarjeta), necesidad de KDS en cocina.
- **Gancho:** Operación offline táctica en caja, pantalla de cocina (KDS) con colores de alerta de tiempo y cierre de caja sin descuadres.

### Segmento C: Restaurantes y Bares
- **Dolor principal:** División de cuentas complejas entre amigos, gestión de mesas, propina del 10% y anulación fraudulenta de comandas.
- **Gancho:** Split bill exacto, control de propina legal DGI INV-16.1, mapa de mesas y supervisión estricta por PIN para anular platos.

---

## 5. Mensajes por Capacidad del Sitio Web (sin prescripción de rutas)

**Regla de enrutamiento (`G-02` / `N-03`):** Este Brief asigna **mensajes por capacidad**, no rutas.
Ninguna sección de este documento prescribe rutas, sitemap ni navegación de primer nivel: toda
decisión de rutas y navegación pertenece a `nhilos_website_information_architecture_content_wireframe_v1.0.md`
(paso 4 de la cadena, dueño de la navegación según `nhilos_branding_document_governance_v1.0.md` [Control de cambios](nhilos_branding_document_governance_v1.0.md#6-control-de-cambios)).
Las capacidades de esta sección se argumentan como bloques de contenido dentro de las páginas
profundas que la IA defina; ninguna es un destino de navegación de primer nivel.

### 5.1 Homepage
- **Hero Title:** El punto de venta que sigue operando cuando se cae el internet. Diseñado para Nicaragua.
- **Hero Subtitle:** Cobrá sin internet en tu caja, cumplí con la DGI (DT 09-2007), controlá tus recetas y monitoreá tus ventas en tiempo real desde cualquier lugar.
- **CTA Principal:** Solicitar una demo.
- **Sección de Prueba:** Base de datos SQLite local en terminales Sunmi V2s.
- **Social Proof / Credenciales:** Hecho para el comercio local: bimoneda (NIO/USD), conciliación BAC/Banpro y soporte en Nicaragua.

### 5.2 Capacidad: Punto de Venta FOH
- **Foco:** Rapidez táctil, interfaz oscura de alto contraste, buscador rápido de productos, modificadores de platos/bebidas.
- **Módulos destacados:**
  - Modo Offline Táctico (base de datos local SQLite Floor en el terminal).
  - Cobro Bimoneda (Córdobas y Dólares con tipos de cambio independientes).
  - Impresión térmica integrada 58mm y tickets de comanda por red local.
  - División de cuentas (Split Bill) y propina voluntaria.

### 5.3 Capacidad: Inventario, Recetas y BOH
- **Foco:** Rentabilidad real y eliminación de mermas invisibles.
- **Módulos destacados:**
  - Deducción automática por receta (BOM).
  - Costeo Promedio Ponderado (CPP) automático con cada compra.
  - Kardex inmutable con tolerancia a stock negativo y regularización posterior.
  - Control de mermas y órdenes de producción de pre-elaborados.

### 5.4 Capacidad: Cumplimiento Fiscal DGI
- **Foco:** Tranquilidad legal y contable bajo normativa DT 09-2007.
- **Módulos destacados:**
  - Disposición Técnica DGI 09-2007 para Sistemas Computarizados de Facturación.
  - Consecutivos correlativos inalterables y sin saltos de folio.
  - Notas de crédito obligatorias para anulación (cero borrado de facturas).
  - Validación sintáctica de RUC y Cédula nicaragüense.
  - Exportación de reportes limpios para tu contador.

### 5.5 Capacidad: Hardware Compatible
- **Foco:** Un perfil de equipamiento verificado, con límites declarados (`OD-02` PC-HW-01..03, LIM-06). No se afirma “certificado en campo” de forma genérica.
- **Equipos destacados:**
  - **Sunmi V2s:** Terminal móvil todo-en-uno con impresora térmica integrada de 58mm, cámara lectora de códigos y batería de larga duración. *Works when:* terminal Android con Sunmi OS vía Platform Channels de Android. *Does not work when:* impresoras domésticas USB o hardware sin checklist de verificación.
  - **Impresión térmica de 80mm:** Layouts térmicos de 80mm (iPOS / Nyx / Q80) soportados por `apps/pos_app/lib/domain/services/printer/receipt_layout_formatter.dart` (`format80mm()`), junto al formato de 58mm (`format58mm()`) del Sunmi V2s.
  - **Impresoras de Cocina:** Compatibilidad con ticketeras de red local ESC/POS (LAN/Ethernet, driver `ESCPOS_NETWORK`) para barra y cocina. *Works when:* impresora ESC/POS estándar con IP estática fija en la misma subred. *Does not work when:* red local sin IP fija o impresoras no ESC/POS.
  - **Tablets Android:** Soporte para tablets táctiles estándar en barra o punto fijo, incluida la pantalla de cocina (KDS) (`kitchen_display_view.dart`).

### 5.6 Capacidad: Owner Dashboard
- **Foco:** Control sin estar metido en la cocina.
- **Módulos destacados:**
  - Venta neta consolidada y horas de mayor flujo de clientes.
  - Ranking de productos más vendidos y su porcentaje de contribución.
  - Monitor de frescura (Sync Freshness Badge) para ver terminales conectados.
  - Histórico de turnos y arqueos X/Z de caja, y conciliación manual de vouchers de tarjetas BAC/Banpro con un ítem de atención de vouchers pendientes. No existe conciliación bancaria automática: la conciliación de vouchers es manual y desacoplada (`OD-02` PC-PAY-02, LIM-02).

---

## 6. Guía de Vocabulario y Tono de Comunicación

### Tono de Voz
- **Profesional, directo y transparente:** Hablamos el lenguaje del dueño de negocio gastronómico y comercial. Sin tecnicismos vacíos ni falsas promesas.
- **Realista y empático:** Entendemos que el Wi-Fi falla, que los bancos no tienen APIs abiertas para POS en el país y que la DGI no perdona errores.

### Glosario Aprobado vs Prohibido
| Usar Siempre | No Usar / Prohibido |
|---|---|
| “Operación offline-first en terminal local” | “Nube mágica sin conexión en todo lugar” |
| “Normativa DGI DT 09-2007 (Sistemas Computarizados)” | “Factura Electrónica DGI en línea / Transmisión XML” |
| “Validación sintáctica oficial de RUC y Cédula” | “Conectado en vivo a la base de la DGI” |
| “Conciliación ágil de vouchers BAC y Banpro” | “Datáfono integrado automáticamente por software” |
| “Deducción de insumos por receta (BOM)” | “Inventario infinito automático” |
| “Terminal Sunmi V2s con impresora térmica” | “Cualquier impresora de casa USB” |
| “Notas de crédito supervisadas por supervisor” | “Eliminar facturas con un clic” |

---

## 7. Próxima Acción y Fuente Autoritativa

Según `nhilos_branding_document_governance_v1.0.md`, este Brief es el paso 3 de la cadena de autoridad: selecciona claims admisibles definidos por el OD-02 (`product_claim_audit_od02_v1.3.md`) y no inventa claims. Con esto se desbloquea:
1. La reconciliación y promoción del wireframe de arquitectura de información (`nhilos_website_information_architecture_content_wireframe_v1.0.md`).
2. El inicio de la redacción final de textos (copywriting) para cada página del sitio web.
