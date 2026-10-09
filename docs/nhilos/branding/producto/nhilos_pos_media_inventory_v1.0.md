# NHILOS POS — Inventario de Medios y Capturas de Pantalla

**Documento:** `nhilos_pos_media_inventory_v1.0.md`
**Versión:** 1.0 (Evidencia revalidada — Gate D parcial)
**Estado:** `CONTENIDO APROBADO / GATE D PARCIAL — 1 VIGENTE · 1 OBSOLETA · 6 A REVERIFICAR · 6 FALTANTES`
**Build anclado vigente:** `b4b5ad27`
**Evidencia de origen:** capturas ADB del `2026-10-02` sobre terminal `MIRAY Q80 / iPOS`, en `docs/nhilos/manuals/images/` (`NH-AUD-POS-001`). Build de la captura original: `7af1521ea077ce8bc1faed1aa7189a6186eac515` (SUPERSEDED). La revalidación contra el build anclado está documentada en [Registro de documentos](../gobernanza/nhilos_branding_document_governance_v1.0.md#5-registro-de-documentos), según `G-09` de `nhilos_branding_document_governance_v1.0.md`.
**Ruta pública:** Página profunda de producto NHILOS POS (`/pos`)
**Upstream de contenido:** `nhilos_pos_product_page_content_v1.1.md`
**Upstream de auditoría técnica:** `product_claim_audit_od02_v1.3.md`
**Fecha de actualización:** 2026-10-08 (revalidación de evidencia ejecutada; captura original 2026-10-02)

> **Nota de conversión (2026-10-08):** este documento reemplaza al binario
> `NHILOS POS - Media Inventory.docx`, que no era diffeable ni indexable. El contenido se
> transcribió sin cambios. Las correcciones de realidad pendientes se registran en
> `branding_reality_audit_v0.1.md` (hallazgos B3, H9, M4, M11, H10).

> **Advertencia de revalidación (G-09):** los activos de medios de este inventario fueron
> capturados el `2026-10-02` sobre un terminal `MIRAY Q80 / iPOS`, cuando el build de referencia
> era `7af1521`. El build anclado vigente es `b4b5ad27` (2026-10-08) e incluye cambios que
> alteraron superficies capturadas. La revalidación está documentada en [Revalidación de Medios contra el Build Anclado (`b4b5ad27`)](#5-revalidación-de-medios-contra-el-build-anclado-b4b5ad27) y el estado resultante
> de Gate D en [Estado de Aprobación de Gate D y Firma de Verificación](#6-estado-de-aprobación-de-gate-d-y-firma-de-verificación): ningún activo puede publicarse sin estar `VIGENTE` y convertido a WebP/AVIF.

---

## 1. Propósito y Gobernanza de Medios

El presente documento establece el inventario oficial y la matriz de mapeo de activos visuales
para la página profunda de producto de NHILOS POS (`/pos`).

Garantiza el cumplimiento estricto del **Gate D (Evidencia y Medios)**, exigiendo que cada
imagen, captura de pantalla o fotografía de hardware provenga del build anclado vigente
(`b4b5ad27`). Los activos listados a continuación se capturaron en el build histórico
`7af1521ea077ce8bc1faed1aa7189a6186eac515` y permanecen en estado `REVALIDATION REQUIRED`:
deben re-capturarse o re-verificarse contra `b4b5ad27` antes de cualquier publicación.

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

## 2. Inventario Maestro de Activos de Medios (Build anclado `b4b5ad27`)

La siguiente tabla consolida los activos de medios que componen la biblioteca visual oficial de
NHILOS POS. La columna **Evidencia existente** apunta al archivo real que hoy respalda el activo
en el repositorio; el **Veredicto** es el resultado de la revalidación documentada en [Revalidación de Medios contra el Build Anclado (`b4b5ad27`)](#5-revalidación-de-medios-contra-el-build-anclado-b4b5ad27).

| Asset ID | Pantalla / Workflow | Evidencia existente (`docs/nhilos/manuals/images/`) | Ubicación en Código (`b4b5ad27`) | Veredicto |
|---|---|---|---|---|
| `MEDIA-POS-01` | Interfaz principal de venta táctil con buscador y carrito | `pos_03_catalogo_soho.png`, `pos_04_carrito_barra.png`, `pos_05_detalle_carrito.png` | `apps/pos_app/lib/ui/features/sales` | `REQUIERE REVERIFICACIÓN` |
| `MEDIA-POS-02` | Modal de Cobro Bimoneda (NIO/USD) y vuelto automático | `pos_06_pantalla_cobro.png`, `pos_07_cobro_efectivo_vuelto.png`, `pos_08_cobro_dolares.png` | `multi_currency_checkout_dialog.dart` | `OBSOLETA` |
| `MEDIA-POS-03` | División de cuentas (Split Bill) y propina | sin captura del diálogo de división | `split_bill_engine.dart` / `tip_engine.dart` | `FALTANTE` |
| `MEDIA-POS-04` | Autorización de supervisor (override por PIN) | `pos_13_dialogo_anular_factura.png`, `pos_16_cierre_turno_corte_z.png` | `supervisor_override_modal.dart` | `REQUIERE REVERIFICACIÓN` |
| `MEDIA-POS-05` | Retención de cuentas abiertas y mapa de mesas | `pos_05a_carrito_en_espera.png`, `pos_05b_lista_cuentas_abiertas.png`, `pos_05c_dialogo_abandonar_cuenta.png`, `pos_05d_editar_cuenta_abierta.png` | `apps/pos_app/lib/ui/features/sales/tables/table_layout_view.dart`, `apps/pos_app/lib/domain/services/sales/table_order_service.dart` | `REQUIERE REVERIFICACIÓN` |
| `MEDIA-HW-01` | Ticket de venta impreso en papel térmico (DT 09-2007) | sin fotografía de ticket impreso | `apps/pos_app/lib/domain/services/printer/receipt_layout_formatter.dart` (58 mm y 80 mm) | `FALTANTE` |
| `MEDIA-HW-02` | Pantalla Digital de Cocina (KDS) con temporizador SLA | `pos_11_kds_pantalla_cocina.png` | `kitchen_display_view.dart` | `REQUIERE REVERIFICACIÓN` |
| `MEDIA-DASH-01` | Owner Dashboard v2: KPIs de Venta y Sync Freshness Badge | `dsh_02_kpis_ventas.png` | `apps/owner_dashboard/src/features/dashboard` | `REQUIERE REVERIFICACIÓN` |
| `MEDIA-DASH-02` | Ranking de Productos Top y Mix de Ventas por % | `dsh_02_kpis_ventas.png` (verificar que el ranking sea legible en el encuadre) | `top-products-chart.tsx` | `REQUIERE REVERIFICACIÓN` |
| `MEDIA-INV-01` | Módulo de Recetas/BOM y Costeo Promedio Ponderado | sin captura | `apps/admin_backend/src/modules/inventory` | `FALTANTE` |
| `MEDIA-INV-02` | Kardex Inmutable Delta Ledger y Registro de Mermas | sin captura | `kardex_recalculation_engine.dart` | `FALTANTE` |
| `MEDIA-ONB-01` | Setup Center e Importador CSV de Catálogos e Insumos | sin captura | `setup-center-view.tsx` | `FALTANTE` |
| `MEDIA-FISC-01` | Panel de Reportes Fiscales Exportables DGI y Notas de Crédito | `dsh_06_fiscal.png` | `fiscal-page.tsx` | `VIGENTE` |
| `MEDIA-LOY-01` | Identificación de cliente y saldo de puntos en caja (QR `NHL1:{code}`, código, teléfono o nombre) y canje de puntos como descuento | sin captura | `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` (panel de loyalty y canje), `apps/pos_app/lib/domain/services/sales/customer_identification_service.dart` | `FALTANTE` |

### Evidencia existente sin activo asignado

La biblioteca de capturas contiene evidencia real que este inventario todavía no asigna a ningún
activo. No se descarta: se registra para que la decisión de asignación sea explícita.

| Captura | Superficie | Observación |
|---|---|---|
| `pos_05e_modal_modificadores.png`, `pos_05f_carrito_con_modificadores.png` | Modificadores en el ticket | Respaldan `PC-FOH-02` / `CW-002`; el inventario aún no define un activo de modificadores en caja. |
| `dsh_07_modificadores_grupos.png`, `dsh_08_modificadores_categoria.png`, `dsh_09_crear_grupo_modificador.png` | Administración de modificadores en backoffice | Mismo caso, lado backoffice. |
| `pos_09_menu_lateral.png`, `pos_10_historial_ventas.png`, `pos_12_detalle_factura_acciones.png`, `pos_13_dialogo_anular_factura.png` | Consulta, historial y anulación | Respaldan `PC-PAY-02` / `PC-SEC-02` / `PC-SEC-03`; sin activo dedicado. |
| `pos_14_control_caja_turnos.png`, `pos_15_lectura_parcial_corte_x.png`, `pos_16_cierre_turno_corte_z.png`, `pos_16b_bloqueo_corte_z_cuentas.png` | Caja, turnos y cortes X/Z | Respaldan `PC-PAY-02`; sin activo dedicado. |
| `dsh_01_login.png`, `dsh_03_historial_comprobantes.png`, `dsh_04_catalogo_productos.png`, `dsh_05_sesiones_caja.png` | Backoffice: login, historial, catálogo, sesiones de caja | Sin activo dedicado. |
| `pos_01_admin_login.png`, `pos_01_seleccionar_usuario.png`, `pos_02_login_pin.png` | Acceso al terminal | Sin activo dedicado; `pos_01_admin_login.png` no está referenciada por el manual vigente y requiere clasificación. |

---

## 3. Mapeo Exhaustivo por Sección de la Página de Producto (v1.1)

A continuación se detalla la asignación de cada activo visual a las 14 secciones estructuradas
(12 originales + Loyalty & Promotions [Loyalty & Promotions](nhilos_pos_product_page_content_v1.1.md#15-section-13--loyalty--promotions) + Cumplimiento Fiscal DGI [Cumplimiento Fiscal DGI (DT 09-2007)](nhilos_pos_product_page_content_v1.1.md#16-section-14--cumplimiento-fiscal-dgi-dt-09-2007) de `nhilos_pos_product_page_content_v1.1.md`)
de la página de producto `/pos`, con los títulos exactos del contrato de contenido,
definiendo su rol contextual, pie de foto (caption) sugerido y
texto de accesibilidad (alt text).

> **Cómo leer esta sección.** Los textos describen el activo **previsto** para cada sección del
> contrato de contenido, no piezas ya publicables. Las referencias a dispositivo deben leerse
> según [Ficha Técnica de Captura y Especificaciones Non-Funcionales](#4-ficha-técnica-de-captura-y-especificaciones-non-funcionales): el terminal que produjo la evidencia es `MIRAY Q80 / iPOS`; Sunmi V2s es una
> plataforma soportada por el código, no el dispositivo de captura. Todo activo marcado
> `OBSOLETA`, `REQUIERE REVERIFICACIÓN` o `FALTANTE` en [Inventario Maestro de Activos de Medios (Build anclado `b4b5ad27`)](#2-inventario-maestro-de-activos-de-medios-build-anclado-b4b5ad27) **no está disponible hoy**: sus pies de
> foto y alt text son objetivos de captura, no copia publicable.

### Sección 01 — Product Promise

- **Activo Principal:** `MEDIA-POS-01` (Interfaz principal de punto de venta en el terminal verificado).
- **Activo Secundario:** `MEDIA-HW-01` (**`FALTANTE`** — sin captura; terminal del perfil verificado emitiendo ticket térmico físico).
- **Rol Contextual:** Demostrar de forma inmediata la velocidad táctil, la claridad del carrito
  y la integración física de la impresora integrada en el punto de cobro.
- **Pie de Foto Sugerido:** "Caja táctil ultra-rápida con base de datos local SQLite: registrá
  ventas e imprimí comprobantes térmicos sin depender de internet."
- **Texto Alt (a11y):** "Interfaz de caja táctil NHILOS POS en terminal Sunmi V2s mostrando
  catálogo de bebidas y orden de venta activa."

### Sección 02 — Product in Context

- **Activo Principal:** `MEDIA-POS-01` (Modo Mostrador/Barra).
- **Activos Secundarios:** `MEDIA-POS-03` (Modo Salón / Cuentas Abiertas) y `MEDIA-INV-01`
  (Modo Cocina / Recetas BOM).
- **Rol Contextual:** Ilustrar la adaptación del sistema a los tres entornos operativos
  principales: QSR/Cafeterías, Restaurantes/Bares y Control de Insumos.
- **Pie de Foto Sugerido:** "Flujos adaptados a cada punto de trabajo: atención rápida en barra,
  gestión de mesas en salón y control estricto de insumos en cocina."
- **Texto Alt (a11y):** "Tres vistas comparativas de NHILOS POS mostrando el menú de cobro
  rápido, el mapa de mesas retenidas y la ficha técnica de insumos."

### Sección 03 — Core Workflows

- **Activo Workflow A (Venta):** `MEDIA-POS-01` (Selección de productos y modificadores de
  platillos).
- **Activo Workflow B (Cobro Bimoneda):** `MEDIA-POS-02` (Modal Checkout Bimoneda NIO/USD).
- **Activo Workflow C (Pagos Tarjeta):** `MEDIA-POS-03` (Captura de código de autorización
  BAC/Banpro).
- **Activo Workflow D (Mantener una cuenta abierta):** sin activo capturado. La superficie de
  retención de cuentas y mapa de mesas (`table_layout_view.dart`, `table_order_service.dart`)
  requiere una captura nueva; ver `MEDIA-POS-05` en [Inventario Maestro de Activos de Medios (Build anclado `b4b5ad27`)](#2-inventario-maestro-de-activos-de-medios-build-anclado-b4b5ad27).
- **Activo Workflow E (Consultar información operativa):** `MEDIA-DASH-01` (Superficies de
  consulta operativa del terminal).
- **Rol Contextual:** Guiar al usuario paso a paso en la ejecución de una transacción completa
  en Nicaragua.
- **Pie de Foto Sugerido:** "Checkout bimoneda con cálculo de vuelto en Córdobas o Dólares y
  registro desacoplado de vouchers bancarios BAC y Banpro."
- **Texto Alt (a11y):** "Ventana emergente de cobro bimoneda calculando conversión automática
  entre Córdobas y Dólares con vuelto exacto."

### Sección 04 — Continuity

- **Activo Principal:** `MEDIA-POS-01` (Badge de estado de sincronización mostrando
  el texto real de UI "Sin conexión (Offline) - N pendientes",
  `cloud_sync_status_badge.dart:179`; el esquema local vigente es SQLite Floor v65,
  `app_database.dart`, `@Database(version: 65)`).
- **Activo Secundario:** `MEDIA-DASH-01` (Cola de sincronización asíncrona de deltas).
- **Rol Contextual:** Proveer evidencia visual del motor offline que permite seguir vendiendo e
  imprimiendo sin conectividad.
- **Pie de Foto Sugerido:** "Operación local ininterrumpida: el terminal almacena las
  transacciones en SQLite Floor y las sincroniza automáticamente al retornar el internet."
- **Texto Alt (a11y):** "Pantalla de venta operando con el badge de estado de sincronización
  'Sin conexión (Offline) - N pendientes' durante una desconexión de red, mostrando el
  contador de documentos pendientes de sincronizar."

### Sección 05 — Control / Visibility

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

### Sección 06 — Roles

- **Activo Principal:** `MEDIA-POS-04` (Modal de Solicitud de PIN para Autorización de
  Supervisor).
- **Activo Secundario:** `MEDIA-DASH-01` (Matriz RBAC de usuarios y Audit Trail SHA-256).
- **Rol Contextual:** Demostrar la protección operativa mediante permisos por rol e historial
  inalterable. El código define cuatro roles (`OWNER`, `MANAGER`, `CASHIER`, `WAITER`;
  `apps/pos_app/lib/domain/models/user.dart` y `apps/admin_backend/src/modules/identity/security/user-role.enum.ts`);
  el supervisor es una capacidad de autorización, no un rol. La página pública presenta tres
  personas (Cajero / Supervisor / Owner) por decisión deliberada registrada como `OD-PP-05`
  en el Product Page Content: el cuarto rol de la matriz (Mesero) queda excluido del alcance
  público. Ninguna de las dos representaciones contradice a la otra.
- **Pie de Foto Sugerido:** "Seguridad en caja: el corte de caja, la apertura manual de gaveta,
  el descuento manual y la autorización de varianza de producción requieren PIN de supervisor
  y quedan registrados en la bitácora auditora. La anulación de facturas no se realiza con
  PIN: es una guarda de política que solo admite facturas propias, del turno abierto y de la
  fecha actual (`void_decision.dart`)."
- **Texto Alt (a11y):** "Teclado numérico PIN en pantalla para la autorización de supervisor
  antes de un corte de caja, una apertura de gaveta o un descuento manual."

### Sección 07 — Gallery

- **Activos Asignados:** Mosaico interactivo de los activos `MEDIA-POS-01` a `MEDIA-FISC-01`.
- **Rol Contextual:** Permitir al visitante explorar en alta resolución todas las superficies de
  trabajo del ecosistema NHILOS POS.
- **Pie de Foto Sugerido:** "Explorá la interfaz real de NHILOS POS: diseñada para alta rotación,
  claridad visual en ambientes oscuros y precisión contable."
- **Texto Alt (a11y):** "Galería interactiva con capturas de pantalla de la app móvil de venta,
  terminal Sunmi y panel web administrativo."

### Sección 08 — Implementation

- **Activo Principal:** `MEDIA-ONB-01` (Vista del Setup Center con Plantillas por Industria e
  Importador CSV).
- **Rol Contextual:** Reducir la ansiedad de adopción mostrando el asistente interactivo de
  configuración y la migración asistida.
- **Pie de Foto Sugerido:** "Puesta en marcha estructurada: cargá tu catálogo con plantillas
  preconfiguradas por industria y validá tu caja con una prueba de venta controlada."
- **Texto Alt (a11y):** "Asistente de configuración del Setup Center con checklist de pasos
  completados e importación masiva de insumos en CSV."

### Sección 09 — Hardware / Compatibility

- **Activo Principal:** `MEDIA-HW-01` (**`FALTANTE`** — sin captura; fotografía de terminal e impresora de cocina LAN
  ESC/POS).
- **Activo Secundario:** `MEDIA-HW-02` (Pantalla KDS en Tablet Android de 10 pulgadas).
- **Rol Contextual:** Presentar el perfil de equipamiento verificado y periféricos soportados.
- **Nota de Formatos de Impresión:** el perfil incluye la impresora térmica integrada de 58mm
  del Sunmi V2s y los layouts térmicos de 80mm (iPOS / Nyx / Q80) soportados por
  `receipt_layout_formatter.dart` (`format58mm()` / `format80mm()`), además de ticketeras
  LAN ESC/POS (driver `ESCPOS_NETWORK`) y el KDS en tablets Android (`kitchen_display_view.dart`).
  Límites declarados (`OD-02` PC-HW-01..03, LIM-06): la impresión embebida aplica a terminales
  Android con Sunmi OS; la impresión externa requiere impresoras ESC/POS estándar con IP fija
  en la red local.
- **Pie de Foto Sugerido:** "Equipamiento verificado en Nicaragua: terminales móviles
  todo-en-uno Sunmi V2s con impresora térmica integrada (58mm), soporte de layouts de 80mm
  (iPOS / Nyx / Q80), tablets fijas e impresoras de red local para cocina."
- **Texto Alt (a11y):** "Terminal móvil Sunmi V2s junto a una impresora térmica de cocina
  conectada por red Ethernet."

### Sección 10 — Support

- **Activo Principal:** `MEDIA-DASH-01` (Vista del Botón de Asistencia Directa y Estado del
  Servidor Cloud).
- **Activo Secundario:** `MEDIA-POS-04` (Pantalla de Diagnóstico y Logs del Terminal).
- **Rol Contextual:** Transmitir tranquilidad operativa mediante canales de atención local y
  diagnóstico remoto.
- **Pie de Foto Sugerido:** "Acompañamiento local en Nicaragua: soporte técnico especializado con
  monitoreo de estado de tus terminales."
- **Texto Alt (a11y):** "Sección de ayuda en la aplicación mostrando número de versión del
  sistema, código de terminal y canal de contacto por WhatsApp."

### Sección 11 — FAQs

- **Activos de Soporte:** Pequeñas capturas de detalle (thumbnails) asociadas a respuestas
  específicas (`MEDIA-POS-02` para Bimoneda, `MEDIA-HW-01` para DGI).
- **Rol Contextual:** Ilustrar gráficamente las respuestas a dudas críticas de los compradores
  (DGI, conectividad, dólares).
- **Pie de Foto Sugerido:** "Respuestas claras respaldadas por el funcionamiento real del sistema
  en caja."
- **Texto Alt (a11y):** "Captura del formato de factura fiscal DGI DT 09-2007 con número RUC y
  desglose de IVA."

### Sección 12 — Demo CTA

- **Directriz de Medios:** Sin imágenes distractoras o pesadas en la tarjeta del formulario para
  optimizar la conversión y la velocidad de carga (LCP < 2.5s, WCAG 2.1 AA).
- **Rol Contextual:** Mantener un entorno limpio y accesible para la captura de datos del
  prospecto.

### Sección 13 — Loyalty & Promotions ([Loyalty & Promotions](nhilos_pos_product_page_content_v1.1.md#15-section-13--loyalty--promotions) del contrato de contenido)
- **Activo Principal:** `MEDIA-LOY-01` (Identificación de cliente y saldo de puntos en caja con
  QR `NHL1:{code}`; **pendiente de captura, no aprobado**).
- **Rol Contextual:** Demostrar la identificación offline del cliente y el canje de puntos como
  descuento con salvaguardas (mínimo, saldo y tope al total), dentro del flujo de venta.
- **Pie de Foto Sugerido:** "Identificás al cliente por QR, código, teléfono o nombre, y los
  puntos se canjean como descuento con reglas visibles, sin detener la caja."
- **Texto Alt (a11y):** "Pantalla de venta NHILOS POS mostrando la identificación del cliente y
  su saldo de puntos durante el cobro."
- **Estado Gate D:** `PENDING CAPTURE` — la captura debe ejecutarse contra el build anclado
  vigente (`b4b5ad27`) y pasar Gate D antes de cualquier publicación. Ninguna imagen de esta
  superficie existe aún; no se marca ningún activo como aprobado.
- **Claims respaldados (OD-02):** `PC-LOY-01..06` vía `LY-001..LY-006` del contrato de contenido.

### Sección 14 — Cumplimiento Fiscal DGI (DT 09-2007) ([Cumplimiento Fiscal DGI (DT 09-2007)](nhilos_pos_product_page_content_v1.1.md#16-section-14--cumplimiento-fiscal-dgi-dt-09-2007) del contrato de contenido)

- **Activo Principal:** `MEDIA-HW-01` (**`FALTANTE`** — sin captura; ticket fiscal impreso en papel térmico con
  correlativo DT 09-2007).
- **Activo Secundario:** `MEDIA-FISC-01` (Panel de reportes fiscales exportables y notas de
  crédito en el backoffice web).
- **Rol Contextual:** Demostrar que la emisión fiscal es correlativa e inalterable, que la
  anulación solo ocurre por nota de crédito supervisada, y que el negocio obtiene sus reportes
  fiscales exportables.
- **Pie de Foto Sugerido:** "Comprobante fiscal con numeración correlativa e inalterable, y
  reportes fiscales exportables desde el panel administrativo."
- **Texto Alt (a11y):** "Ticket térmico de NHILOS POS mostrando la numeración correlativa y el
  desglose de impuestos, junto al panel de reportes fiscales del backoffice."
- **Restricción de medios:** ninguna captura de esta sección puede sugerir facturación
  electrónica en línea ni transmisión de XML firmado; esa capacidad no está implementada.
- **Claims respaldados (OD-02):** `PC-FISC-01..03` vía `FI-001..FI-003` del contrato de
  contenido.

---

## 4. Ficha Técnica de Captura y Especificaciones Non-Funcionales

Para asegurar la calidad visual e integridad técnica exigida en la especificación no funcional
del sitio web (`nhilos_website_non_functional_spec_v1.0.md`), todos los activos del inventario
cumplen con los siguientes estándares:

### Dispositivo de captura y procedencia real

La biblioteca de 33 PNG en `docs/nhilos/manuals/images/` **no proviene de un solo dispositivo** y no
coincide con el que este documento declaraba:

| Grupo | Resolución | Archivos | Dispositivo |
|---|---|---|---|
| POS terminal | `800 x 1280` | 16 | **`MIRAY Q80 / iPOS`** — Android 12, impresora térmica **80 mm**, gaveta de efectivo y escáner. Fuente: `docs/nhilos/audits/pos_experience_audit_v1.0.md` (`NH-AUD-POS-001`, 2026-10-02) y `docs/nhilos/manuals/nhilos_pos_user_manual_v0.1.md`. |
| POS terminal (segundo grupo) | `1080 x 2316` | 8 | **No documentado.** Corresponde a `pos_05a`–`pos_05f`, `pos_15` y `pos_16b`. Son capturas de terminal, pero el repositorio no registra en qué dispositivo se tomaron. No se declara un dispositivo sin evidencia. |
| Backoffice web | `1440 x 900` | 9 | Capturas de navegador (no son capturas de hardware por ADB). |

Dimensiones medidas sobre los archivos. Las que este documento declaraba antes
(`1080 x 2160` para Sunmi V2s y `2560 x 1440` para desktop) no tenían fuente en el repositorio
y no correspondían a ningún archivo real.

**Sunmi V2s:** es una plataforma soportada por el código (`printer_config_service.dart`, driver
`SUNMI_V2S`), pero no aparece como dispositivo de captura en ninguna parte de la evidencia.

### Fechas de captura observadas

Fechas tomadas del commit que agregó cada archivo:

| Fecha | Archivos | Superficie |
|---|---|---|
| `2026-10-02` | 17 `pos_*` + 6 `dsh_*` | Sesión documentada por `NH-AUD-POS-001`: las 17 capturas ADB de hardware. Las 6 `dsh_*` son de navegador. |
| `2026-10-06` | `pos_05a`–`pos_05d`, `pos_16b` | Ciclo de vida de cuentas abiertas y bloqueo de Corte Z. |
| `2026-10-07` | `pos_05e`, `pos_05f`, `dsh_07`–`dsh_09` | Modificadores en caja y en backoffice. |

### Formatos y peso real de la evidencia

- Los 33 archivos están en **PNG**. Deben convertirse a WebP/AVIF con fallback PNG antes de
  publicarse, según la especificación no funcional.
- Peso total de la biblioteca: ~3.5 MB. La mayoría entre 60 y 170 KB; dos superan los 180 KB
  (`pos_16b_bloqueo_corte_z_cuentas.png` 214 KB, `pos_15_lectura_parcial_corte_x.png` 210 KB) y
  requieren compresión al convertirse.
- La especificación no funcional **no define un presupuesto de peso por imagen**; define una
  carga inicial máxima de página. Por eso no se declara un tope por captura.

### Tratamiento de Datos Sensibles

- **Anonimización:** Todos los nombres de negocios, montos de venta, códigos de RUC y nombres de
  empleados en las imágenes corresponden a la base de datos de demo autorizada (OmniFood
  Nicaragua Demo Store).
- **Cero Datos de Tarjeta:** Los números de tarjeta mostrados en vouchers simulados corresponden
  a prefijos de prueba (BIN testing) y en todos los casos ocultan los primeros 12 dígitos.

---

## 5. Revalidación de Medios contra el Build Anclado (`b4b5ad27`)

**Fecha de revalidación:** 2026-10-08
**Estado:** **DIFERIDA** — la revalidación de capturas se ejecutará contra el build final, no contra
el anclaje provisional. Motivo: hay una línea de trabajo en curso (auditoría P3 de descuentos y
promociones e2e) que cambia comportamiento publicado de lealtad, promociones, modificadores y
descuentos, y por lo tanto también las superficies capturadas. Ver
`nhilos_branding_document_governance_v1.0.md` [Estado de anclaje y obligación de re-anclaje](../gobernanza/nhilos_branding_document_governance_v1.0.md#7-estado-de-anclaje-y-obligación-de-re-anclaje). Capturar ahora obligaría a recapturar después.
Lo que sigue sí se ejecutó: la auditoría de la evidencia existente, su procedencia, sus
dimensiones reales y la ventana de cambio por superficie.
**Método:** auditoría read-only del contenido del repositorio (33 capturas en
`docs/nhilos/manuals/images/`, sus manuales de referencia y la auditoría de experiencia de
terminal). No se ejecutó captura nueva ni se requirió hardware.
### Punto de partida corregido

Este documento asumía que no existían capturas y que había que producirlas todas. Eso era falso:
el repositorio contiene 33 capturas reales, referenciadas por los manuales de POS y de Owner
Dashboard. Pero **tampoco se puede asumir que estén vigentes**. La biblioteca se capturó entre el
`2026-10-02` y el `2026-10-07`, y el build siguió cambiando hasta el `2026-10-08` (remediación UX
Nivel 1/2/3). La revalidación no es "existe o no existe", sino **"sigue siendo cierta contra el
build anclado"**.

### Método: ventana de cambio por superficie

Para cada activo se comparó la fecha de su captura contra los commits que tocaron esa misma
superficie entre esa fecha y `b4b5ad27`. Si la superficie cambió después de la captura, la captura
no puede declararse vigente sin una verificación visual.

| Superficie | Cambios posteriores a la captura más reciente |
|---|---|
| POS venta y carrito (`ui/features/sales/`) | `2026-10-06 15:32`, `2026-10-07 14:15`, `2026-10-07 17:49`, `2026-10-08 09:28`, `2026-10-08 14:13` |
| POS KDS (`ui/features/kitchen/`) | `2026-10-07 17:49` |
| POS caja y turnos (`ui/features/cash/`) | `2026-10-03`, `2026-10-06 15:15`, `2026-10-06 15:32`, `2026-10-08 14:12` |
| Dashboard: badge de frescura de sync | `2026-10-03 14:39`, `2026-10-08 09:15`, `2026-10-08 10:58` |
| Dashboard: KPI strip y top-products | **sin cambios** desde la captura |
| Dashboard: panel fiscal | **sin cambios** desde la captura |

Dato decisivo: las capturas de POS más recientes son del `2026-10-07 14:53`, y `ui/features/sales/`
cambió ese mismo día a las `17:49` y otra vez el `2026-10-08`. Es decir, **ninguna captura del POS
es posterior al último cambio de la superficie que muestra**.

### Veredictos

| Veredicto | Activos | Significado |
|---|---|---|
| `VIGENTE` (1) | `MEDIA-FISC-01` | Su superficie no cambió desde la captura. Publicable una vez convertida a WebP/AVIF. |
| `OBSOLETA` (1) | `MEDIA-POS-02` | La captura **contradice** el build anclado: falta UI que hoy existe. |
| `REQUIERE REVERIFICACIÓN` (6) | `MEDIA-POS-01`, `MEDIA-POS-04`, `MEDIA-POS-05`, `MEDIA-HW-02`, `MEDIA-DASH-01`, `MEDIA-DASH-02` | Existe captura y la superficie cambió después de tomarla. Necesita una comparación visual contra el build anclado; puede resultar vigente o requerir recaptura. |
| `FALTANTE` (6) | `MEDIA-POS-03`, `MEDIA-HW-01`, `MEDIA-INV-01`, `MEDIA-INV-02`, `MEDIA-ONB-01`, `MEDIA-LOY-01` | No existe ninguna captura de esa superficie. |

### Evidencia de la obsolescencia de `MEDIA-POS-02`

- Capturas afectadas: `pos_06_pantalla_cobro.png`, `pos_07_cobro_efectivo_vuelto.png`,
  `pos_08_cobro_dolares.png`, agregadas el **2026-10-02**.
- El build anclado `b4b5ad27` contiene los campos **`Nombre Cliente`** y
  **`RUC / Cédula (Opcional)`** en
  `apps/pos_app/lib/ui/features/sales/widgets/multi_currency_checkout_dialog.dart`
  (líneas 507 y 535), incorporados el **2026-10-07** (merges `26fa162c`, `8858d6c1`, `9cd6dd9c`).
- La captura de la pantalla de cobro es **cinco días anterior** al cambio que alteró esa misma
  pantalla. Publicarla mostraría una UI que ya no corresponde al build vigente.

### Reclasificación de `MEDIA-HW-01`

El activo se describía como "ticket impreso en papel térmico de **58 mm**". El terminal verificado
imprime **80 mm** y el código soporta ambas anchuras
(`apps/pos_app/lib/domain/services/printer/receipt_layout_formatter.dart`). Se reclasificó a
"ticket impreso en papel térmico" y se marcó `FALTANTE`: no existe fotografía de un ticket impreso.

### Qué falta para cerrar cada clase

1. **`OBSOLETA`** → recapturar la pantalla de cobro contra `b4b5ad27`, mostrando los campos
   fiscales nuevos.
2. **`REQUIERE REVERIFICACIÓN`** → comparar visualmente cada captura contra el build anclado. Es
   trabajo de verificación, no necesariamente de recaptura.
3. **`FALTANTE`** → capturar seis superficies: diálogo de división de cuenta, ticket impreso,
   recetas/BOM y costeo, kardex y mermas, Setup Center con importación CSV, y loyalty en caja.
4. **Todos** → convertir de PNG a WebP/AVIF con fallback PNG, comprimir los dos archivos que
   superan los 180 KB, y redactar el alt text definitivo por activo.

---

## 6. Estado de Aprobación de Gate D y Firma de Verificación

El cierre original de Gate D quedó obsoleto y se restituye con su estado real. El veredicto **no es
uniforme**: hay evidencia vigente, evidencia que contradice el build, evidencia sin verificar y
superficies sin evidencia.

```text
================================================================================
VERIFICACIÓN DE GATE D (EVIDENCIA Y MEDIOS) — NHILOS POS
================================================================================
[✓] Cero prototipos o mockups de Figma: la evidencia existente son capturas
    reales del producto (17 por ADB, NH-AUD-POS-001; 9 de navegador).
[✓] Existe evidencia real para 8 de 14 activos.
[✓] MEDIA-FISC-01 vigente: su superficie no cambió desde la captura.
[✗] MEDIA-POS-02 (pantalla de cobro): la captura del 2026-10-02 es anterior al
    cambio de facturación con nombre del 2026-10-07 y contradice el build.
[?] 6 activos REQUIEREN REVERIFICACIÓN: sus superficies cambiaron después de la
    captura (venta, autorización, cuentas abiertas, KDS, KPIs, ranking).
[✗] 6 activos sin ninguna captura: MEDIA-POS-03, MEDIA-HW-01, MEDIA-INV-01,
    MEDIA-INV-02, MEDIA-ONB-01, MEDIA-LOY-01.
[✗] Toda la biblioteca está en PNG; falta la conversión a WebP/AVIF con fallback
    exigida por la especificación no funcional.
[✓] Mapeo de las 14 secciones contra nhilos_pos_product_page_content_v1.1.md.
[✓] Dispositivo y resoluciones corregidos a la medición real de los archivos,
    con procedencia fechada por commit.

ESTADO DE CIERRE:            GATE D NO SUPERADO — PARCIAL
REVALIDACIÓN DE CAPTURAS:    DIFERIDA hasta el build final de la línea P3 en curso
AUTORIZACIÓN DE PUBLICACIÓN: habilitada solo para MEDIA-FISC-01 una vez convertido
en WebP/AVIF con alt text. Bloqueada para MEDIA-POS-02 (obsoleta), para los 6
activos faltantes y para los 6 que requieren reverificación. No existe ningún
sello de "PUBLICATION UNLOCKED".
================================================================================
```
