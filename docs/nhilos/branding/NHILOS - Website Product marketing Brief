# NHILOS POS — Website Product Marketing Brief

**Documento:** `nhilos_website_product_marketing_brief_v1.0.md`  
**Versión:** 1.0 (Autorizado para Producción)  
**Estado:** `APPROVED / READY FOR WEBSITE IA PROMOTION & COPYWRITING`  
**Upstream Authority:** `product_claim_audit_od02_v0.1.md` v1.1 (`CLOSED / VERIFIED / RECONCILED`)  
**Downstream Gate:** Reconciliación de `nhilos_website_information_architecture_content_wireframe_v0.2.md` → `v1.0`  
**Audiencia:** Product Marketing, Copywriters, UI/UX Designers, Frontend Engineers  
**Mercado objetivo principal:** Nicaragua (Gastronomía, Cafeterías, Food Parks, Bares y Retail de alta rotación)  
**Fecha:** 2026-09-26  

---

## 1. Visión y Resumen Ejecutivo

**NHILOS POS** es el sistema de punto de venta táctico y gestión operativa diseñado específicamente para las realidades de conectividad y fiscalidad de Nicaragua.

A diferencia de los sistemas tradicionales en la nube que se congelan cuando el internet falla, o los sistemas locales obsoletos que no ofrecen visibilidad remota al dueño, NHILOS combina una **arquitectura local offline-first** (SQLite en caja) con un **panel administrativo web en la nube** (PostgreSQL con aislamiento estricto RLS y dashboard ejecutivo en tiempo real).

### Regla de Oro del Copywriting
> **Solo comunicamos lo que el código ya sabe hacer.**  
> Cada afirmación en el sitio web debe estar respaldada por la auditoría técnica de claims **OD-02 v1.1**. No sobreprometemos tecnología experimental ni vendemos intenciones de roadmap.

---

## 2. Pilares de Posicionamiento y Propuesta de Valor (Auditoría OD-02 v1.1)

Los cinco pilares innegociables del producto, verificados contra código real:

### 1. Offline-First Táctico en Caja: Tu venta nunca se frena (`OD-02-R03`)
- **Problema del cliente:** Cuando el proveedor de internet se cae en Managua o en departamentos, el comercio pierde ventas, genera filas o tiene que recurrir al papel y lápiz.
- **Solución NHILOS:** El terminal corre una base de datos local completa (SQLite Floor). Vende, emite tickets correlativos, calcula impuestos, descuenta recetas y autentica por PIN sin depender de ningún servidor externo.
- **Wording normativo endurecido:** *“Cobrá, facturá e imprimí siempre en tu punto de venta local, incluso si se cae el internet. Cuando regrese la conexión, tus ventas e inventarios sincronizan automáticamente con la nube.”*
- **Delimitación explícita:** El terminal debe estar previamente enrolado y con su catálogo local hidratado. El enrolamiento inicial y la actualización remota de precios requieren conectividad.

### 2. Cumplimiento Fiscal DGI Nicaragua (DT 09-2007) (`OD-02-R02`)
- **Problema del cliente:** Miedo a multas o auditorías de la DGI por saltos en la numeración correlativa o alteración de registros.
- **Solución NHILOS:** Implementación rigurosa de la Disposición Técnica 09-2007 para Sistemas Computarizados de Facturación. Consecutivos progresivos inalterables, prohibición física de borrado de facturas y anulación supervisada únicamente mediante Notas de Crédito.
- **Wording normativo condicionado:** *“Cumplimiento garantizado con la Disposición Técnica DGI 09-2007 para Sistemas Computarizados de Facturación: consecutivos correlativos inalterables, facturas inmutables y validación algorítmica de Cédula y RUC.”*
- **Delimitación explícita:** Requiere parametrización inicial del folio inicial y serie autorizada por la DGI. No es facturación electrónica en línea con transmisión XML en vivo.

### 3. Costeo y Deducción Automática por Receta (BOM)
- **Problema del cliente:** El dueño no sabe cuánto le cuesta producir un café o una hamburguesa ni cuándo se fuga materia prima.
- **Solución NHILOS:** Descuento automático de insumos en tiempo real por cada producto compuesto vendido (`COMPOUND`), cálculo de Costo Promedio Ponderado (CPP) con cada factura de compra y Kardex inmutable basado en deltas cronológicos.
- **Promesa verificada:** *“Cada venta descuenta exactamente los insumos de tu receta. Conocé tu margen bruto y costo real al instante.”*

### 4. Arqueo y Finanzas Bimoneda Blindadas (NIO / USD)
- **Problema del cliente:** En Nicaragua el cliente paga en dólares o córdobas, o combina efectivo y tarjeta. El cajero pierde tiempo con calculadoras y descuadra la caja.
- **Solución NHILOS:** Checkout bimoneda nativo con tipo de cambio oficial BCN (para cálculo fiscal) y comercial (para proteger el margen de caja). División de cuentas (Split Bill) exacta, conciliación diaria de vouchers BAC/Banpro y control de propina voluntaria sin gravar IVA (DGI INV-16.1).
- **Promesa verificada:** *“Cobrá en Córdobas o Dólares con cálculo de vuelto automático. Conciliá vouchers de tarjetas BAC y Banpro en minutos al cerrar tu turno.”*

### 5. Control Ejecutivo Remoto para el Dueño (Dashboard V2)
- **Problema del cliente:** El dueño vive esclavizado en el local o recibe reportes estáticos al final del mes.
- **Solución NHILOS:** Panel web moderno con métricas clave de venta neta, horas pico, ticket promedio, participación de productos top y un indicador visual de frescura de sincronización para saber si cada terminal está al día.
- **Promesa verificada:** *“Monitoreá tus ventas, productos más vendidos y estado de tus cajas desde cualquier dispositivo con internet.”*

---

## 3. Delimitación de Producto y Anti-Posicionamiento (Blocklist D5)

Para proteger la credibilidad de la marca y cumplir el registro de bloqueos **D5 de OD-02 v1.1**, el sitio web **NUNCA DEBE AFIRMAR**:

| Copy Prohibido (Anti-Claim) | Razón Técnica | Copy Correcto Autorizado |
|---|---|---|
| *"Facturación electrónica DGI en línea con envío de XML firmado en tiempo real"* | Corresponde al Bloque 19 futuro. En producción se opera con DT 09-2007 (Sistemas Computarizados) (`OD-02-R02`). | *“Cumplimiento riguroso de Sistemas Computarizados de Facturación según la Disposición Técnica DGI 09-2007.”* |
| *"Validación en tiempo real contra el padrón activo de la DGI"* | No existe API pública de consulta en vivo del padrón DGI en Nicaragua (`OD-02-R02`). | *“Validación sintáctica y algorítmica de Cédula y RUC nicaragüense para prevenir errores en caja.”* |
| *"Integración electrónica automática con datáfonos BAC/Banpro por cable o software"* | No existe API electrónica con terminales bancarias en Nicaragua; el flujo es manual desacoplado con captura de código. | *“Registro rápido y conciliación de vouchers de tarjetas de crédito y débito de todos los bancos nacionales (BAC, Banpro).”* |
| *"Red inalámbrica multi-mesero que se comunica sin internet ni servidor"* | El broker LAN peer-to-peer sin nube (Bloque 18) está en roadmap. Los pedidos multi-terminal sincronizan vía nube (`OD-02-R03`). | *“Terminales autónomos y ágiles diseñados para alta rotación y sincronización en la nube.”* |
| *"Conexión directa a balanzas de pesaje continuo"* | No hay drivers de balanza serial implementados en el código auditado. | Enfocar en unidades, porciones y recetas estandarizadas. |

---

## 4. Perfiles de Cliente y Propuesta por Segmento

### Segmento A: Cafeterías de Especialidad y Panaderías
- **Dolor principal:** Fugas de leche, café en grano, jarabes y empaques; lentitud al cobrar en horas pico de la mañana.
- **Gancho:** Control milimétrico de receta por onza/gramo y cobro ultra-rápido en terminal Sunmi con ticket impreso en 2 segundos.

### Segmento B: Food Parks y Locales de Comida Rápida (QSR)
- **Dolor principal:** Conexión Wi-Fi inestable en espacios abiertos, clientes que pagan mixto (efectivo + tarjeta), necesidad de KDS en cocina.
- **Gancho:** Operación offline táctica en caja, pantalla de cocina (KDS) con colores de alerta de tiempo y cierre de caja sin descuadres.

### Segmento C: Restaurantes y Bares
- **Dolor principal:** División de cuentas complejas entre amigos, gestión de mesas, propina del 10% y anulación fraudulenta de comandas.
- **Gancho:** Split bill exacto, control de propina legal DGI INV-16.1, mapa de mesas y supervisión estricta por PIN para anular platos.

---

## 5. Arquitectura del Sitio Web y Mensajes por Página

### 5.1 Homepage (`/`)
- **Hero Title:** El sistema de punto de venta que nunca se frena. Diseñado para Nicaragua.
- **Hero Subtitle:** Cobrá sin internet en tu caja, cumplí con la DGI (DT 09-2007), controlá tus recetas y monitoreá tus ventas en tiempo real desde cualquier lugar.
- **CTA Principal:** Agendá una Demostración Operativa.
- **Sección de Prueba:** Base de datos SQLite local en terminales Sunmi V2s.
- **Social Proof / Credenciales:** Hecho para el comercio local: bimoneda (NIO/USD), conciliación BAC/Banpro y soporte en Nicaragua.

### 5.2 Producto: Punto de Venta FOH (`/pos`)
- **Foco:** Rapidez táctil, interfaz oscura de alto contraste, buscador rápido de productos, modificadores de platos/bebidas.
- **Módulos destacados:**
  - Modo Offline Táctico (Floor SQLite v57).
  - Cobro Bimoneda (Córdobas y Dólares con tipos de cambio independientes).
  - Impresión térmica integrada 58mm y tickets de comanda por red local.
  - División de cuentas (Split Bill) y propina voluntaria.

### 5.3 Producto: Inventario, Recetas y BOH (`/inventario`)
- **Foco:** Rentabilidad real y eliminación de mermas invisibles.
- **Módulos destacados:**
  - Deducción automática por receta (BOM).
  - Costeo Promedio Ponderado (CPP) automático con cada compra.
  - Kardex inmutable con tolerancia a stock negativo y regularización posterior.
  - Control de mermas y órdenes de producción de pre-elaborados.

### 5.4 Producto: Cumplimiento Fiscal DGI (`/fiscal`)
- **Foco:** Tranquilidad legal y contable bajo normativa DT 09-2007.
- **Módulos destacados:**
  - Disposición Técnica DGI 09-2007 para Sistemas Computarizados de Facturación.
  - Consecutivos correlativos inalterables y sin saltos de folio.
  - Notas de crédito obligatorias para anulación (cero borrado de facturas).
  - Validación sintáctica de RUC y Cédula nicaragüense.
  - Exportación de reportes limpios para tu contador.

### 5.5 Hardware Compatible (`/hardware`)
- **Foco:** Equipamiento probado y certificado en campo.
- **Equipos destacados:**
  - **Sunmi V2s:** Terminal móvil todo-en-uno con impresora térmica integrada de 58mm, cámara lectora de códigos y batería de larga duración.
  - **Impresoras de Cocina:** Compatibilidad con ticketeras de red local ESC/POS (LAN/Ethernet) para barra y cocina.
  - **Tablets Android:** Soporte para tablets táctiles estándar en barra o punto fijo.

### 5.6 Dueños: Owner Dashboard (`/dashboard`)
- **Foco:** Control sin estar metido en la cocina.
- **Módulos destacados:**
  - Venta neta consolidada y horas de mayor flujo de clientes.
  - Ranking de productos más vendidos y su porcentaje de contribución.
  - Monitor de frescura (Sync Freshness Badge) para ver terminales conectados.
  - Histórico de turnos, arqueos X/Z y conciliaciones bancarias.

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

Este documento se ratifica como la **fuente autoritativa única** derivada de la auditoría **OD-02 v1.1**. Con esto se desbloquea:
1. La reconciliación y promoción del wireframe de arquitectura de información (`nhilos_website_information_architecture_content_wireframe_v0.2.md` → `v1.0`).
2. El inicio de la redacción final de textos (copywriting) para cada página del sitio web.
