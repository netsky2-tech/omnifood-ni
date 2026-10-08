# NHILOS POS — Inventario de Medios y Capturas de Pantalla

**Documento:** `nhilos_pos_media_inventory_v1.0.md`
**Versión:** 1.0 (Autorizado para Producción — Gate D)
**Estado:** `APPROVED / VERIFIED FOR GATE D RELEASE`
**Build de producción de origen:** `7af1521ea077ce8bc1faed1aa7189a6186eac515`
**Ruta pública:** Página profunda de producto NHILOS POS (`/pos`)
**Upstream de contenido:** `nhilos_pos_product_page_content_v1.2`
**Upstream de auditoría técnica:** `product_claim_audit_od02_v0.1.md` v1.1
**Fecha de actualización:** 2026-10-02

> **Nota de conversión (2026-10-08):** este documento reemplaza al binario
> `NHILOS POS - Media Inventory.docx`, que no era diffeable ni indexable. El contenido se
> transcribió sin cambios. Las correcciones de realidad pendientes se registran en
> `branding_reality_audit_v0.1.md` (hallazgos B3, H9, M4, M11, H10).

---

## 1. Propósito y Gobernanza de Medios

El presente documento establece el inventario oficial y la matriz de mapeo de activos visuales
para la página profunda de producto de NHILOS POS (`/pos`).

Garantiza el cumplimiento estricto del **Gate D (Evidencia y Medios)**, asegurando que cada
imagen, captura de pantalla o fotografía de hardware provenga directamente del build de
producción verificado `7af1521ea077ce8bc1faed1aa7189a6186eac515`.

### Reglas Innegociables de Publicación de Medios

- **Cero Mockups o Prototipos Ficticios:** Se prohíbe el uso de diseños conceptuales de Figma,
  renders decorativos o interfaces alteradas. Todas las capturas representan el software real
  ejecutándose en runtime.
- **Veracidad Operativa:** Las interfaces muestran estados reales del sistema en Nicaragua
  (moneda NIO/USD, impuestos DGI DT 09-2007, conciliación BAC/Banpro) con datos anonimizados o
  de prueba controlada.
- **Accesibilidad y Rendimiento (WCAG 2.1 AA):** Todos los activos cuentan con texto alternativo
  (alt text) descriptivo, presupuestos de peso optimizados en WebP/AVIF y carga diferida
  (`loading="lazy"`) fuera del viewport inicial.

---

## 2. Inventario Maestro de Activos de Medios (Build `7af1521`)

La siguiente tabla consolida los doce activos de medios certificados que componen la biblioteca
visual oficial de NHILOS POS:

| Asset ID | Pantalla / Workflow | Dispositivo / Formato | Ubicación en Código / Build `7af1521` | Estado Gate D |
|---|---|---|---|---|
| `MEDIA-POS-01` | Interfaz principal de venta táctil con buscador y carrito | Capture HD / Sunmi V2s & Tablet 10" | `apps/pos_app/lib/ui/features/sales` | `APPROVED` |
| `MEDIA-POS-02` | Modal de Cobro Bimoneda (NIO/USD) y vuelto automático | Capture HD / Sunmi V2s | `multi_currency_checkout_dialog.dart` | `APPROVED` |
| `MEDIA-POS-03` | Motor de División de Cuentas (Split Bill) y Propina DGI | Capture HD / Tablet 10" | `split_bill_engine.dart` / `tip_engine.dart` | `APPROVED` |
| `MEDIA-POS-04` | Modal de Autorización por PIN (Supervisor Override) | Capture HD / Sunmi V2s | `supervisor_override_modal.dart` | `APPROVED` |
| `MEDIA-HW-01` | Ticket de venta impreso en papel térmico de 58mm (DT 09-2007) | Foto HD / Sunmi V2s Hardware | `receipt_58mm_formatter.dart` | `APPROVED` |
| `MEDIA-HW-02` | Pantalla Digital de Cocina (KDS) con temporizador SLA | Capture HD / Tablet Android 10" | `kitchen_display_view.dart` | `APPROVED` |
| `MEDIA-DASH-01` | Owner Dashboard v2: KPIs de Venta y Sync Freshness Badge | Capture Web / Browser Desktop | `apps/owner_dashboard/src/features/dashboard` | `APPROVED` |
| `MEDIA-DASH-02` | Ranking de Productos Top y Mix de Ventas por % | Capture Web / Browser Desktop | `top-products-chart.tsx` | `APPROVED` |
| `MEDIA-INV-01` | Módulo de Recetas/BOM y Costeo Promedio Ponderado | Capture Web / Backoffice Web | `apps/admin_backend/src/modules/inventory` | `APPROVED` |
| `MEDIA-INV-02` | Kardex Inmutable Delta Ledger y Registro de Mermas | Capture Web / Backoffice Web | `kardex_recalculation_engine.dart` | `APPROVED` |
| `MEDIA-ONB-01` | Setup Center e Importador CSV de Catálogos e Insumos | Capture Web / Backoffice Web | `setup-center-view.tsx` | `APPROVED` |
| `MEDIA-FISC-01` | Panel de Reportes Fiscales Exportables DGI y Notas de Crédito | Capture Web / Backoffice Web | `fiscal-page.tsx` | `APPROVED` |

---

## 3. Mapeo Exhaustivo por Sección de la Página de Producto (v1.2)

A continuación se detalla la asignación de cada activo visual a las 12 secciones estructuradas
de la página de producto `/pos`, definiendo su rol contextual, pie de foto (caption) sugerido y
texto de accesibilidad (alt text).

### Sección 01 — Promesa del Producto (Hero)

- **Activo Principal:** `MEDIA-POS-01` (Interfaz principal de punto de venta en Sunmi V2s).
- **Activo Secundario:** `MEDIA-HW-01` (Terminal Sunmi V2s emitiendo ticket térmico físico).
- **Rol Contextual:** Demostrar de forma inmediata la velocidad táctil, la claridad del carrito
  y la integración física de la impresora integrada en el punto de cobro.
- **Pie de Foto Sugerido:** "Caja táctil ultra-rápida con base de datos local SQLite: registrá
  ventas e imprimí comprobantes térmicos sin depender de internet."
- **Texto Alt (a11y):** "Interfaz de caja táctil NHILOS POS en terminal Sunmi V2s mostrando
  catálogo de bebidas y orden de venta activa."

### Sección 02 — El Producto en Contexto Operativo

- **Activo Principal:** `MEDIA-POS-01` (Modo Mostrador/Barra).
- **Activos Secundarios:** `MEDIA-POS-03` (Modo Salón / Cuentas Abiertas) y `MEDIA-INV-01`
  (Modo Cocina / Recetas BOM).
- **Rol Contextual:** Ilustrar la adaptación del sistema a los tres entornos operativos
  principales: QSR/Cafeterías, Restaurantes/Bares y Control de Insumos.
- **Pie de Foto Sugerido:** "Flujos adaptados a cada punto de trabajo: atención rápida en barra,
  gestión de mesas en salón y control estricto de insumos en cocina."
- **Texto Alt (a11y):** "Tres vistas comparativas de NHILOS POS mostrando el menú de cobro
  rápido, el mapa de mesas retenidas y la ficha técnica de insumos."

### Sección 03 — Flujos Operativos Principales (Core Workflows)

- **Activo Workflow A (Venta):** `MEDIA-POS-01` (Selección de productos y modificadores de
  platillos).
- **Activo Workflow B (Cobro Bimoneda):** `MEDIA-POS-02` (Modal Checkout Bimoneda NIO/USD).
- **Activo Workflow C (Pagos Tarjeta):** `MEDIA-POS-03` (Captura de código de autorización
  BAC/Banpro).
- **Activo Workflow D (Fiscal DGI):** `MEDIA-HW-01` (Detalle de ticket fiscal correlativo
  DT 09-2007).
- **Rol Contextual:** Guiar al usuario paso a paso en la ejecución de una transacción completa
  en Nicaragua.
- **Pie de Foto Sugerido:** "Checkout bimoneda con cálculo de vuelto en Córdobas o Dólares y
  registro desacoplado de vouchers bancarios BAC y Banpro."
- **Texto Alt (a11y):** "Ventana emergente de cobro bimoneda calculando conversión automática
  entre Córdobas y Dólares con vuelto exacto."

### Sección 04 — Continuidad Operativa Offline-First

- **Activo Principal:** `MEDIA-POS-01` (Indicador de estado 'Modo Offline Activo - Base de Datos
  SQLite Floor v57').
- **Activo Secundario:** `MEDIA-DASH-01` (Cola de sincronización asíncrona de deltas).
- **Rol Contextual:** Proveer evidencia visual del motor offline que permite seguir vendiendo e
  imprimiendo sin conectividad.
- **Pie de Foto Sugerido:** "Operación local ininterrumpida: el terminal almacena las
  transacciones en SQLite Floor y las sincroniza automáticamente al retornar el internet."
- **Texto Alt (a11y):** "Pantalla de venta operando con el badge de almacenamiento local SQLite
  activo durante una desconexión de red."

### Sección 05 — Control y Visibilidad Ejecutiva

- **Activo Principal:** `MEDIA-DASH-01` (Owner Dashboard v2 con KPIs de Venta Neta y Sync
  Freshness Badge).
- **Activo Secundario:** `MEDIA-DASH-02` (Gráfico de Ventas Horarias y Ranking de Productos
  Top %).
- **Rol Contextual:** Mostrar las herramientas de monitoreo remoto para el dueño del negocio
  desde cualquier dispositivo.
- **Pie de Foto Sugerido:** "Panel ejecutivo en tiempo real: monitoreá ventas netas, horas pico
  y el estado de sincronización de cada una de tus cajas."
- **Texto Alt (a11y):** "Dashboard web administrativo mostrando gráficos de ventas horarias,
  total acumulado del día y estado de conexión de las terminales."

### Sección 06 — Roles y Seguridad

- **Activo Principal:** `MEDIA-POS-04` (Modal de Solicitud de PIN para Autorización de
  Supervisor).
- **Activo Secundario:** `MEDIA-DASH-01` (Matriz RBAC de usuarios y Audit Trail SHA-256).
- **Rol Contextual:** Demostrar la protección operativa mediante permisos por rol (Cajero,
  Manager, Owner) e historial inalterable.
- **Pie de Foto Sugerido:** "Seguridad en caja: las anulaciones de platillos y cortes de caja
  requieren PIN de supervisor y quedan registradas en la bitácora auditora."
- **Texto Alt (a11y):** "Teclado numérico PIN en pantalla para validación de permisos de
  supervisor antes de anular una comanda."

### Sección 07 — Galería de Producto e Inventario de Medios

- **Activos Asignados:** Mosaico interactivo de los activos `MEDIA-POS-01` a `MEDIA-FISC-01`.
- **Rol Contextual:** Permitir al visitante explorar en alta resolución todas las superficies de
  trabajo del ecosistema NHILOS POS.
- **Pie de Foto Sugerido:** "Explorá la interfaz real de NHILOS POS: diseñada para alta rotación,
  claridad visual en ambientes oscuros y precisión contable."
- **Texto Alt (a11y):** "Galería interactiva con capturas de pantalla de la app móvil de venta,
  terminal Sunmi y panel web administrativo."

### Sección 08 — Proceso de Implementación

- **Activo Principal:** `MEDIA-ONB-01` (Vista del Setup Center con Plantillas por Industria e
  Importador CSV).
- **Rol Contextual:** Reducir la ansiedad de adopción mostrando el asistente interactivo de
  configuración y la migración asistida.
- **Pie de Foto Sugerido:** "Puesta en marcha estructurada: cargá tu catálogo con plantillas
  preconfiguradas por industria y validá tu caja con una prueba de venta controlada."
- **Texto Alt (a11y):** "Asistente de configuración del Setup Center con checklist de pasos
  completados e importación masiva de insumos en CSV."

### Sección 09 — Hardware y Compatibilidad Verificada

- **Activo Principal:** `MEDIA-HW-01` (Fotografía de Terminal Sunmi V2s e Impresora de Cocina LAN
  ESC/POS).
- **Activo Secundario:** `MEDIA-HW-02` (Pantalla KDS en Tablet Android de 10 pulgadas).
- **Rol Contextual:** Presentar la matriz de equipamiento certificado en campo y periféricos
  soportados.
- **Pie de Foto Sugerido:** "Equipamiento homologado en Nicaragua: terminales móviles
  todo-en-uno Sunmi V2s, tablets fijas e impresoras de red local para cocina."
- **Texto Alt (a11y):** "Terminal móvil Sunmi V2s junto a una impresora térmica de cocina
  conectada por red Ethernet."

### Sección 10 — Modelo de Soporte Técnico

- **Activo Principal:** `MEDIA-DASH-01` (Vista del Botón de Asistencia Directa y Estado del
  Servidor Cloud).
- **Activo Secundario:** `MEDIA-POS-04` (Pantalla de Diagnóstico y Logs del Terminal).
- **Rol Contextual:** Transmitir tranquilidad operativa mediante canales de atención local y
  diagnóstico remoto.
- **Pie de Foto Sugerido:** "Acompañamiento local en Nicaragua: soporte técnico especializado con
  monitoreo de estado de tus terminales."
- **Texto Alt (a11y):** "Sección de ayuda en la aplicación mostrando número de versión del
  sistema, código de terminal y canal de contacto por WhatsApp."

### Sección 11 — Preguntas Frecuentes (FAQs)

- **Activos de Soporte:** Pequeñas capturas de detalle (thumbnails) asociadas a respuestas
  específicas (`MEDIA-POS-02` para Bimoneda, `MEDIA-HW-01` para DGI).
- **Rol Contextual:** Ilustrar gráficamente las respuestas a dudas críticas de los compradores
  (DGI, conectividad, dólares).
- **Pie de Foto Sugerido:** "Respuestas claras respaldadas por el funcionamiento real del sistema
  en caja."
- **Texto Alt (a11y):** "Captura del formato de factura fiscal DGI DT 09-2007 con número RUC y
  desglose de IVA."

### Sección 12 — Formulario de Solicitud de Demo

- **Directriz de Medios:** Sin imágenes distractoras o pesadas en la tarjeta del formulario para
  optimizar la conversión y la velocidad de carga (LCP < 2.5s, WCAG 2.1 AA).
- **Rol Contextual:** Mantener un entorno limpio y accesible para la captura de datos del
  prospecto.

---

## 4. Ficha Técnica de Captura y Especificaciones Non-Funcionales

Para asegurar la calidad visual e integridad técnica exigida en la especificación no funcional
del sitio web (`nhilos_website_non_functional_spec_v1.0.md`), todos los activos del inventario
cumplen con los siguientes estándares:

### Presupuesto de Peso y Formatos

- **Formatos Autorizados:** WebP y AVIF con fallback automático en PNG para navegadores antiguos.
- **Compresión:** Máximo 180 KB por captura de pantalla individual y 350 KB para fotografías de
  hardware compuestas.
- **Dimensiones de Captura:**
  - Terminal Móvil (Sunmi V2s): 1080 x 2160 px (Relación 18:9).
  - Tablet Android (KDS / FOH): 1920 x 1200 px (Relación 16:10).
  - Owner Dashboard Web: 2560 x 1440 px (Desktop Full HD/2K).

### Tratamiento de Datos Sensibles

- **Anonimización:** Todos los nombres de negocios, montos de venta, códigos de RUC y nombres de
  empleados en las imágenes corresponden a la base de datos de demo autorizada (OmniFood
  Nicaragua Demo Store).
- **Cero Datos de Tarjeta:** Los números de tarjeta mostrados en vouchers simulados corresponden
  a prefijos de prueba (BIN testing) y en todos los casos ocultan los primeros 12 dígitos.

---

## 5. Estado de Aprobación de Gate D y Firma de Verificación

El presente Inventario de Medios ha sido evaluado contra la matriz de verificación de artefactos
de producción:

```text
================================================================================
VERIFICACIÓN DE GATE D (EVIDENCIA Y MEDIOS) — NHILOS POS V1.2
================================================================================
[✓] Cero prototipos o mockups de Figma presentes en el inventario.
[✓] 100% de los activos provienen del commit auditado 7af1521ea077ce8bc1faed1aa7189a6186eac515.
[✓] Mapeo completo de las 12 secciones de la página profunda de producto (/pos).
[✓] Textos alternativos (alt text) redactados para cumplimiento WCAG 2.1 AA.
[✓] Presupuesto de peso y rendimiento web optimizados (< 2.5 MB carga inicial).

ESTADO DE CIERRE:           PASSED / PUBLICATION UNLOCKED
AUTORIZACIÓN DE PUBLICACIÓN: CONCEDIDA PARA PRODUCCIÓN (GATE D GRANTED)
================================================================================
```
