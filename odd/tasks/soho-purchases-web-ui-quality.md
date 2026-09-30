# SOHO — Compras en web + Fixes UI/UX + Amendment del standard NHILOS

## Goal
1. Dar al dueño la gestión de compras desde la web (industria: Square/Toast/Lightspeed/Shopify/Odoo ponen alta de compra + costo + historial casi exclusivamente en web; nuestro caso estaba invertido).
2. Corregir los hallazgos UI/UX/quality reportados: alertas sin color, UoM digitadas en vez de selector del catálogo, factor de conversión, campos requeridos que se salvan solo con nombre, badge Inactivo con paleta destructive.
3. Agregar al standard y al template los criterios faltantes (verificando antes cuáles ya existían y no se ejercitaron).

## Decisiones del fundador (2026-09-30)
- **Compras**: alta manual en web + historial (NO ciclo PO completo). Recibir mercadería física sigue en el POS.
- **Alertas**: alcance = nuestras 3 pantallas (Insumos, Compras, Importar menú), con variantes semánticas success/warning/danger/info al estilo industria, respetando NHILOS standard y system design (el componente `Badge` ya tiene success/warning/info; `Alert` solo tiene default|destructive).

## Status (2026-09-30)
- [x] Slice 1 — Compras web: issue #712, PR #713 MERGED (bd40a82e), CI verde en main
- [x] Slice 2 — Alertas variantes (success/warning/info) + badge Inactivo → secondary
- [x] Slice 3 — UoM desde catálogo UOM + requeridos reales sin defaults "UN"
- [x] Slice 4 — Amendment standard §17.5/§26.1/§40/§48/§54/§57 + template (solo inserciones)
- [x] Slice 5 — gentle-ai-verify APPROVE WITH NOTES → 4 findings cerrados (messageLocale ES sin UUID, ## 26.1, previewKey honesto, shadcn Select) + e2e device 21/21

## Follow-ups de field testing (founder, 2026-09-30 post-release)
- [ ] BUG (bloqueante): preview CPP muestra `id should not be empty. id must be a string` al digitar N° de factura → causa raíz: preview route valida con `PurchaseDocumentDto` (id @IsNotEmpty) pero el form manual no envía id (server-side uuid al commit). Fix en curso en branch `fix/soho-purchase-preview-feedback`: PreviewPurchaseDto sin id.
- [ ] Mejora: presets de factor de conversión en form de insumos (§40 human defaults — pares UoM comunes, reversible, nunca auto-aplicado). En curso en la misma rama.
- [ ] Feature: página de gestión de proveedores (hoy solo visibles desde el select del form de compras) — listar/buscar/editar/desactivar; falta `PUT /inventory/suppliers/:id` en backend. Pendiente de delegar.

## Pendientes explícitos (no deuda oculta)
- Sync POS→cloud de proveedores (selector web arranca vacío con alta inline)
- Validación de alta de compra en dispositivo físico SOHO
- Residuos pre-existentes: `correctPurchase`/preview messages en inglés con UUID (rutas humanas viejas); ~488 throws en inglés repo-wide
- Interacción visual Radix Select/dialog no verificada en navegador (tests de comportamiento ✓)

## Slices
- [x] Slice 1 — Compras web: `GET /suppliers` + `POST /inventory/purchases/manual` (humano, OWNER/MANAGER, reutiliza `recordPurchase` con todo su camino SERIALIZABLE/kardex/CPP/unique-invoice) + form de alta en pestaña Compras con selects (proveedor/insumo) y preview de CPP (+1.7). Tests backend + FE. **Done 2026-09-30 — ver 'Evidence — Slice 1 implementación'.**
- [ ] Slice 2 — Alertas variantes semánticas: extender componente `Alert` (default|destructive|success|warning|info) y aplicar en las 3 pantallas (wizard éxito→success/errores→destructive; insumos banner→danger; compras truncación→warning/error→danger). Badge Inactivo: destructive→neutro (§42.1/§26).
- [ ] Slice 3 — Form insumos: UoM compra/consumo como `Select` desde `useCatalogValues("UOM")` (pool único, ver `catalog-type.ts`), vacío inicial + guía si el catálogo está vacío (seedCatalogDefaults existe); factor requerido >0 con blur; quitar defaults "UN" que satisfacían requeridos silenciosamente (§17.3).
- [ ] Slice 4 — Standard/Template amendment: verificar qué criterios ya existen vs faltan; candidatos: catálogos gobernados → selector nativo (§17/§48), defaults no satisfacen requeridos (§17.3), variantes semánticas de alertas (§42.1), badge estado vs excepción (§26).
- [ ] Slice 5 — Verificación (verify) + suites + PR.

## Evidence
- Research industria 2026-09-30: matriz Square/Toast/Lightspeed/Shopify/Odoo — crear PO y editar costo = web exclusivo (5/5 y 4/5); recibir stock = split web/POS; historial = web exclusivo.
- Código: `POST /inventory/purchases` es device-only; ya existen `POST /inventory/purchase` (preview humano) y `POST /inventory/purchases/:id/correction` (humano) — falta el alta humana y `GET /suppliers`.
- `catalog-type.ts:11-17`: UOM es el pool único (purchase UOM incluido); `useSeedCatalogDefaults` existe en dashboard; sin seed en migraciones.
- `alert.tsx` solo tiene default|destructive; `badge.tsx` ya tiene success/warning/info.

## Evidence — Slice 1 implementación (2026-09-30)

### ⚠️ Supplier gap: proveedores POS-local NO llegan a la cloud (limitación conocida)

- La tabla `suppliers` (cloud) **no tiene seed** en migraciones y **no existe sincronización POS→cloud de proveedores**: el POS siembra 4 proveedores locales en `apps/pos_app` (`database_seeder.dart`) que viven solo en su SQLite.
- Consecuencia: las compras ya registradas por el POS contra esos ids de proveedor locales **no pueden existir** en la cloud (`InventoryPurchaseService.recordPurchase` lanza `NotFoundException` si el proveedor no existe con ese `tenant_id`), y el selector de proveedor del dashboard arranca vacío.
- Por eso el Slice 1 incluye gestión de proveedores en web (`GET/POST /inventory/suppliers`): los proveedores creados desde el dashboard son filas cloud nuevas y solo esas pueden respaldar compras web. **Sincronizar los proveedores locales del POS es trabajo separado** (fuera de alcance aquí; no se tocó el POS).

### Rutas agregadas (backend, todas humanas: `AuthGuard + RolesGuard`, `@Roles(OWNER, MANAGER)`, tenant vía `GetTenantId`)

- `GET /inventory/suppliers` — lista de proveedores activos del tenant (`InventoryPurchaseService.listSuppliers`, transacción tenant-bound con RLS).
- `POST /inventory/suppliers` — alta de proveedor (`CreateSupplierDto`: `name` requerido; `phone`, `contactPerson`, `creditTerms` opcionales, espejo de columnas de la entidad `Supplier`).
- `POST /inventory/purchases/manual` — alta manual de compra: genera `id` server-side (`randomUUID`) y delega SIN cambios en `recordPurchase` (SERIALIZABLE + unique supplier+invoice + kardex `ENTRADA_COMPRA` + batch tracking + CPP). No se duplicó lógica.
- El controller ya estaba clasificado 'human' con overrides device explícitos en `test/support/route-transport-registry.ts` — las 3 rutas nuevas no tocaron el registry (spec verde: 15/15).

### DTOs (`dto/purchase-manual.dto.ts` — `ManualPurchaseDto`, espejo estricto de las reglas de `PurchaseDocumentDto`)

- `insumoId`, `supplierId`, `invoiceNumber`: string no vacío (trim).
- `quantity`, `unitCost`: número estrictamente positivo (`@Min(0.0001)`, igual que el contrato device — la calculadora de CPP no acepta 0).
- `currency`: `NIO|USD`; `invoiceDate`, `entryTimestamp`: ISO date strings.
- `bcnRate`: requerido cuando `currency=USD` en modo explícito (`@Min(0.0001)`); `fxRateMode: explicit|official` opcional.
- Batch (opcionales, exigidos por el backend para perecederos): `lotCode`, `receivedDate`, `expirationDate`.

### Preview que bloquea el submit (§49 +1.7)

Condición exacta de habilitación del submit en `purchases-form.tsx`:
`canSubmit = !validationError && !previewLoading && (preview !== null || previewAcked)`
- `previewPayload` se construye solo con proveedor + insumo + cantidad>0 + costo>0 + factura + fecha (+ tasa BCN>0 si USD); cualquier cambio de inputs invalida preview y el ack.
- El preview vive llama a la ruta humana existente `POST /inventory/purchase` y muestra "costo actual → costo proyectado" (CPP C$ anterior → C$ proyectado, stock y tasa BCN).
- Si el preview falla, el submit solo se habilita con un checkbox explícito "Registrar la compra sin verificación de costo proyectado" (nunca submit a ciegas).

### Tests modificados y por qué (2)

- `"states that authoring remains on the POS"` → `"offers the manual web-entry flow while physical receiving stays on the POS"`: el copy del footer decía que el alta era exclusiva del POS, lo cual es falso desde la decisión del fundador 2026-09-30 (mentiría §39).
- `"shows the POS-authoring empty state"` → el empty state ahora ofrece el botón "Registrar compra" en vez de derivar al POS.
- Los demás tests existentes (clear, truncación AT-01, retry AT-10, factura distinta AT-07, subtítulo R2, tabs AT-08, BX-014) pasan sin cambios.

## Slice 4 — Standard/Template amendment (2026-09-30)

Autoridad: instrucción explícita del fundador (2026-09-30) de incorporar los gaps del trabajo SOHO al standard NHILOS y al template de auditoría. Edición quirúrgica, sin renumerar secciones, en inglés (idioma de ambos docs).

### Clasificación de candidatos

| # | Candidato | Veredicto | Dónde |
|---|---|---|---|
| 1 | Vocabulario gobernado (catálogo) → selector en vez de free text | ADDED — no existía regla: §17 sin catálogos; lista de auditoría §48 sin "existing catalogs" | Standard §17.5 (nuevo) + bullet en lista §48; Template §14 (checklist "Governed fields") + fila en §28 |
| 2 | Default prellenado que satisface silenciosamente un campo requerido | PARTIALLY COVERED — §17.3 y §40 lo implicaban pero no nombraban el mecanismo (confirmar por omisión) | Standard §40 (1 oración); Template §23 Human defaults (checkbox) |
| 3 | Variantes semánticas de alertas (success/warning/danger/info) | ADDED — §26 cubría badges, §32 uso de toasts, §42.1 una línea; la superficie alert no tenía variante definida | Standard §26.1 (nuevo); Template §24 (tabla "Alert and notification variants") |
| 4 | Badge: estado vs excepción (INACTIVE en destructive) | COVERED-BUT-AMBIGUOUS — §26 prohibía color decorativo pero no impedía leer INACTIVE como excepción; 1 oración concreta | Standard §26 (1 oración); Template §17 checklist State vocabulary (checkbox) |
| 5 | Guardrail §57: verificar catálogos existentes antes de aceptar free text | ADDED — ningún guardrail cubría el fallo de proceso (EX-12 PASS sin verificar uso de catálogo) | Standard §57 (bullet must-not); Template Appendix A (checkbox) |
| 6 | Otros gaps (preview-gated submit, alta de proveedor inline, ack de override) | COVERED — §49 +1.7 ya exige preview útil pre-commit; alta contextual ya en §21; el ack explícito es caso de estados honestos. Sin adición (§57: no agregar capacidades por añadidura) | — |

### Texto agregado (verbatim, por archivo)

**`nhilos_backoffice_experience_standard_v1.0.md`:**
- §17.5 (nuevo): "When the system already maintains a catalog or registry for a value (units of measure, currencies, categories, suppliers), the form must offer the governed selector instead of free text." + "If the catalog is empty, guide the user to populate it; do not fall back silently to free text."
- §26: "A neutral lifecycle state is not an exception: `INACTIVE` styled with danger color misreports a quiet state as a problem."
- §26.1 (nuevo): "each alert carries a semantic variant — success, warning, danger, info — rendered with perceptible visual distinction (tint, border or icon), not default neutral styling." + "An alert whose state cannot be perceived does not communicate state."
- §40: "A default must not silently satisfy a required field: when the system pre-fills a required value, the user confirms by omission instead of deciding. Required governance fields should start empty — or demand explicit confirmation — so the decision remains the user's."
- §48 (lista): `- catalog-governed fields;`
- §54 DoD Forms: `- [ ] Catalog-governed fields use the shared catalog, not free text.`
- §57 (must not): `- declare a form or consistency PASS without checking whether a shared catalog exists for free-text entry fields;`

**`nhilos_backoffice_module_audit_template_v2.1.md`:**
- Header: línea "Amendments" (2026-09-30, versión permanece v2.1).
- §14: checklist "Governed fields (§17.5)" (tabla por superficie).
- §17 State vocabulary: `- [ ] Neutral lifecycle states (e.g. INACTIVE) not styled with danger color (§26)`.
- §23 Human defaults: `- [ ] No default silently satisfies a required field (§40) — required governance fields start empty or require explicit confirmation`.
- §24: tabla "Alert and notification variants (§26.1)".
- §28 Consistency: fila `Catalog-governed fields use shared catalog (§17.5)`.
- §35 DoD Forms: `- [ ] Catalog-governed fields use the shared catalog, not free text (§17.5)`.
- Appendix A Must NOT: `- [ ] Declare a form or consistency PASS without checking whether a shared catalog exists for free-text entry fields`.

### Nota honesta — fallo de proceso registrado

La auditoría SOHO (`docs/audits/nhilos-inventory-surfaces-audit-v1.md`) marcó EX-12/§48 como PARTIAL por otros ítems y trató la consistencia de formularios como adecuada sin verificar que los campos UoM usaran el catálogo compartido (`catalog-type.ts`, pool único incl. purchase UOM) en vez de free text con default "UN". El guardrail agregado a §57 y la fila §28 del template existen precisamente para que una auditoría futura no pueda declarar PASS sin ese chequeo. Lección: la cobertura del template era 100% nominal, pero ningún criterio nombraba catálogos gobernados, así que el gap era real del standard, no solo del proceso — por eso se agregó regla (§17.5) Y guardrail de proceso (§57).

## Auditoría POS↔WEB de completitud (2026-09-30)

### Método

Inventario POS desde la capa UI (`apps/pos_app/lib/ui/features/**`, `lib/presentation/features/**`, view models) y servicios (`lib/data/services/**`); inventario web desde rutas (`apps/owner_dashboard/src/app/router.tsx`) y páginas/tabs (`src/features/**/*-page.tsx`, `*-tab.tsx`); verificación de rutas backend con grep de decorators `@Get/@Post/@Put/@Patch/@Delete` + `@Roles(` en `apps/admin_backend/src/modules/**`. Heurística office-vs-floor (evidencia Square/Toast/Lightspeed/Shopify/Odoo, matriz del 2026-09-30): master data, costos, historia y configuración = web; recepción física, impresión y conteo en piso = POS (web-exclusivo en 4/5–5/5 de los productos).

### Tabla maestra

| Capacidad POS (evidencia archivo) | Estado web | Clasificación | Evidencia web / ruta backend | Notas |
|---|---|---|---|---|
| Venta/checkout: multi-pago, multi-moneda (BCN), propinas, descuento manual, exención IVA (`sale_view.dart`, `multi_currency_checkout_dialog.dart`, `sale_view_model.dart:841,718,1203`) | No aplica (operación en piso) | POS-OK | Web solo reporta: `sales-page.tsx` (payment mix), `tips-summary.tsx` | Registrar en web tendría doble captura |
| Void/anulación de factura (`sales_history_view.dart:379-400`, `sales_permissions.dart` D-15) | EXISTS | EXISTS | `credit-notes-tab.tsx` + `POST /sales/credit-notes` (`admin-invoices.controller.ts:68`) | Cumple DGI: no delete, solo NC |
| Reimpresión con reason codes (`sales_history_view.dart:351-400`) | No aplica | POS-OK | — | Imprimir = piso |
| Historial de ventas (`sales_history_view.dart`) | EXISTS | EXISTS | `sales-page.tsx` tabs (resumen/hora/productos/cajeros) + `GET /sales/invoices` (`admin-invoices.controller.ts:103`) | Web más rico que POS |
| Tickets en espera hold/recall (`sale_view_model.dart:956,990`) | No aplica | POS-OK | — | Estado efímero de piso |
| Split bill (`split_bill_dialog.dart`) | No aplica | POS-OK | — | — |
| Mesas y áreas: layout + config (`table_layout_view.dart`, `restaurant_area.dart`) | PARTIAL | WEB-SHOULD (config) / POS-OK (layout en piso) | Ruta existe: `POST /fulfillment/topology/revisions`, `GET current` (`fulfillment-topology.controller.ts:37-52`); sin UI web (grep `areas\|tables\|mesas` en `src/features` sin matches) | La config de áreas/mesas es master data de oficina; el armado de mesas en piso es POS |
| Cocina / KDS (`kitchen_display_view.dart`) | No aplica | POS-OK | — | Pantalla de piso por diseño |
| Promociones: aplicar + toggle activo (`sale_view_model.dart:882,890`) | EXISTS | EXISTS (con caveat sync) | CRUD web completo `promotions-page.tsx` + `promotions.controller.ts` (GET/POST/PATCH/DELETE) | ⚠️ El toggle POS escribe solo en DAO local (`promotionDao.setPromotionActive`, sale_view_model.dart:891); sync cloud→POS existe (`sync_service.dart:3433-3451`), POS→cloud del toggle no evidenciado — riesgo split-brain |
| Caja: abrir/cerrar turno con blind count (`cash_shift_view_model.dart:197,354`) | EXISTS (solo lectura) | POS-OK | `cash-page.tsx` lista con filtros + `GET /sales/cash-shifts` (`cash-shift.controller.ts:41`) | Dinero físico = piso; historial en web ✓ |
| Movimientos de caja (`cash_movement_dialog.dart`) | EXISTS (solo lectura) | POS-OK | `POST :shiftId/movements` (`cash-shift.controller.ts:77`) via sync | — |
| Reportes X/Z (`x_report_dialog.dart`, `z_report_dialog.dart`) | EXISTS | EXISTS | `fiscal-page.tsx` (resumen mensual, exportaciones) | Web cubre la lectura fiscal |
| Conciliación de vouchers datafono (`card_voucher_reconciliation_dialog.dart`) | EXISTS (solo lectura) | POS-OK | `GET /card-reconciliation-summary` (`card-reconciliation-summary.controller.ts:30`) consumido por `dashboard/use-attention-signals.ts` | Lote físico se concilia en POS |
| Insumos CRUD (`insumo_view_model.dart:161`) | EXISTS | EXISTS | `insumos-tab.tsx` (crear/editar/desactivar, `useCreateInsumo/useUpdateInsumo`) + `insumo.controller.ts` GET/POST/PUT | — |
| Conversiones UoM CRUD (`insumo_view_model.dart:151,156`) | PARTIAL | WEB-SHOULD | Form web tiene factor de conversión del insumo (`insumos-tab.tsx:84`), pero CRUD del pool de conversiones por insumo no evidenciado en web (grep `conversion` solo matches del form) | Ver BXW-003 |
| Productos CRUD + options (`insumo_view_model.dart:215,258`) | EXISTS | EXISTS | `product-page.tsx` (crear/editar/desactivar, tabs SIMPLE/…, `catalog.controller.ts`) | Options editor POS (`item_options_editor.dart`) sin equivalente visible en `product-page.tsx` (grep `option` sin matches) — verificar antes de dar por cerrado |
| Proveedores CRUD (`supplier_view_model.dart:16,26`) | PARTIAL | WEB-SHOULD | Rutas `GET/POST /inventory/suppliers` (`inventory-movement.controller.ts:258-274`); `PUT :id` falta; UI web solo select dentro de `purchases-form.tsx`; hooks `useSuppliers/useCreateSupplier` existen sin página | Ver BXW-001 y 'Follow-ups de field testing' |
| Almacenes CRUD (`warehouse_view_model.dart:16,26`) | MISSING | DECISION | Sin controller de warehouses en backend (grep `warehouse` solo como campo en `insumo.controller.ts:106` y filtro en `inventory-reports.controller.ts:55`); compras POS embeben `warehouseId/Name` como strings (`sync_service.dart:1679-1680`) | Ver BXW-004 |
| Compras: alta con tasa BCN, FIFO, anti-duplicado (`purchase_view_model.dart:138,302,393`) | EXISTS | EXISTS | `purchases-tab.tsx` (historial) + `purchases-form.tsx` (alta manual con preview CPP) + `GET/POST /inventory/purchases`, `POST /inventory/purchases/manual` | Merged PR #713 |
| Corrección de compras (`purchase_view_model.dart`) | PARTIAL | DECISION | Ruta existe: `POST /inventory/purchases/:id/correction` (`inventory-movement.controller.ts:326`); UI web de corrección no evidenciada (kardex aprueba correcciones de kardex, no de compra) | Ver BXW-008 |
| Conteos físicos: iniciar/grabar (`physical_count_view_model.dart:79,121`) | No aplica | POS-OK | `POST /inventory/count-sessions` solo sync (`inventory-movement.controller.ts:373`) | Contar es físico |
| Conteos: solicitar/aprobar/postear (`physical_count_view_model.dart:169-200`) | MISSING | DECISION | Sin ruta humana de aprobación de conteos (grep `count` en controllers: solo sync); `regularization.controller.ts` tiene `GET pending` + `POST approve` para regularizaciones | Aprobar ajustes de inventario es trabajo de oficina — ver BXW-005 |
| Mermas: registro (`shrinkage_view_model.dart:75,118`) | No aplica (alta) / EXISTS (visibilidad) | POS-OK | `POST /inventory/shrinkage` device; visibilidad web via `CogsTab` y kardex | Merma ocurre en piso |
| Producción: cerrar orden + etiqueta (`production_order_view_model.dart:120,258`) | MISSING (visibilidad) | POS-OK | `POST /inventory/production-orders/close` solo sync (`inventory-movement.controller.ts:394`) | Producción es física; visibilidad web futura, no parity |
| Recetas: publicar versión + comparar (`recipe_view_model.dart:193,220`) | EXISTS | EXISTS | `recipes-page.tsx` (recetas + sugerencias, `RecipeForm.tsx`) + `POST /inventory/recipes/versions` (`inventory-movement.controller.ts:416`) | — |
| Kardex + aprobación de correcciones (`kardex_view.dart`) | EXISTS | EXISTS | `kardex-page.tsx` + `approve-correction-dialog.tsx`; `regularization.controller.ts` `GET pending`/`POST approve` | Web más fuerte que POS |
| Alertas de stock (`stock_alerts_view_model.dart:97`) | EXISTS (solo lectura) | PARTIAL | `AlertsTab` en `inventory-page.tsx:315` (`useAlerts`) | Lectura ✓ |
| Alertas forenses: ack/resolve (`forensic_alert_view_model.dart:47,63`) | MISSING | DECISION | Rutas parciales existen (`regularization.controller.ts:61 approve`, `remediation.controller.ts:47 sale-inventory`); UI web no evidenciada (grep `forensic` solo en `audit/types.ts` y `dashboard-api.ts`) | Resolver alertas de fraude es decisión de dueño — ver BXW-006 |
| Reportes: valorización + COGS (`inventory_valuation_view.dart`, `cogs_report_view.dart`) | EXISTS | EXISTS | `ValuationTab` + `CogsTab` (`inventory-page.tsx:62,140`) + `inventory-reports.controller.ts` (`@Roles(OWNER, MANAGER)`) | — |
| Clientes: identificar, express create, redimir (`sale_view_model.dart:265,515,527,275`) | No aplica | POS-OK | — | Captura en piso |
| Gestión de clientes web | EXISTS (PARCIAL) | EXISTS | `customer-loyalty-profile.tsx` (búsqueda `useCustomers`, perfil, ajuste de puntos `POST :id/points/adjust`, `customers.controller.ts:67`); CRUD completo backend existe (`POST/PATCH/DELETE`, `customers.controller.ts:83-104`); alta/edición en UI web no evidenciada | Ver BXW-009 |
| Programas y recompensas de lealtad | EXISTS | EXISTS | `loyalty-page.tsx` (crear/editar/activar/desactivar programas y recompensas, `reward-profit-aware-dialog.tsx`) + `loyalty.controller.ts` | Web-exclusivo, POS consume ✓ |
| Usuarios: crear, PIN, activar/desactivar (`user_management_view_model.dart:36-46`) | EXISTS | EXISTS | `users-page.tsx` + `user-dialog.tsx` (PIN incl., línea 187) + `user-permissions-dialog.tsx`; `users.controller.ts` GET/POST/PUT/DELETE + permisos | — |
| Supervisor override (`supervisor_override_modal.dart`) | No aplica | POS-OK | — | Piso |
| Bitácora de auditoría (`audit_log_view_model.dart:62`) | EXISTS | EXISTS | `audit-page.tsx` (filtros severidad/fecha/usuario) + `audit.controller.ts` | — |
| Perfil de negocio: régimen fiscal, modo operación, modo FX (`business_profile_view_model.dart:67-102`) | PARTIAL | WEB-SHOULD | Régimen: `onboarding/fiscal-setup-form.tsx:212` + `fiscal-setup.controller.ts` ✓. Modo operación (`TenantOperationMode`) y modo FX de checkout: sin UI web (grep `operationMode\|fxMode\|checkout` en `src/features/settings` sin matches) | Config de oficina por definición — ver BXW-007 |
| Hardware/impresora: driver, papel, logo, auto-print, test (`hardware_settings_view_model.dart:57-208`) | No aplica | POS-OK | — | Device-local por diseño |
| Terminal identity / activation / link (`config/activation/`, `auth/link_terminal_view.dart`) | No aplica | POS-OK | — | Device-local |
| Reporte DGI por sesión (`dgi_report_view.dart`) | EXISTS | EXISTS | `fiscal-page.tsx` (resumen, anulaciones, secuencia, exportaciones/libro de ventas) | — |
| Estado de sync (`cloud_sync_status_badge.dart`, `sync_service.dart`) | EXISTS | EXISTS | `dashboard/use-sync-freshness.ts` + `sync-health.controller.ts` | — |
| Fiscal inbox / contingencia (`fiscal_inbox_handler.dart`, `fiscal_projection_repair_service.dart`) | No aplica | POS-OK | Web ve consecuencias en secuencia fiscal (`fiscal-page.tsx` tab "Auditoría Secuencia") | Reparación de proyecciones es device |
| **Web-exclusivo sin contraparte POS** (no es gap de parity): dashboard KPIs, menu-qr, onboarding/setup-center, bulk/menu import, industry templates | N-A | N-A | `dashboard-page.tsx`, `menu-qr-page.tsx`, `onboarding-page.tsx`, `settings-page.tsx` tabs | Listado para completitud |

Tally: 41 filas — EXISTS 17 · POS-OK 15 · PARTIAL 5 · MISSING 2 · DECISION 2 (las filas PARTIAL/MISSING cruzan con WEB-SHOULD o DECISION según la nota).

### Hallazgos priorizados (WEB-SHOULD + DECISION)

- **BXW-001 — Gestión de proveedores en web (lista, editar, desactivar).** Qué falta: página propia; hoy el dueño solo ve proveedores en el select del form de compras y no puede editar ni desactivar. Por qué al web: master data de oficina — alta/edición de proveedores es web-exclusivo en 5/5 productos de la matriz industria. Backend: `GET/POST /inventory/suppliers` existen; **`PUT /inventory/suppliers/:id` falta** (route-missing). Esfuerzo: **M**. Dependencias: sync POS→cloud de proveedores ya documentado en 'Pendientes explícitos' — sin él, split-brain entre proveedores POS-locales (seed `database_seeder.dart`) y cloud. Go-live SOHO: **sí** (ya está en 'Follow-ups de field testing').
- **BXW-002 — Configuración de mesas/áreas desde web.** Qué falta: UI para editar áreas/mesas; hoy solo revisión de topología desde POS y `POST /fulfillment/topology/revisions` sin UI. Por qué al web: config del local = oficina (Lightspeed/Odoo gestionan floor plan en backoffice). Backend: **route-exists** (`fulfillment-topology.controller.ts`). Esfuerzo: **M**. Dependencias: revisar publicación de revisiones a terminales. Go-live: post-go-live (modo restaurante).
- **BXW-003 — CRUD de conversiones UoM por insumo en web.** Qué falta: gestionar el pool de conversiones (no solo el factor del form actual) desde el dashboard. Por qué al web: catálogo de unidades = master data. Backend: por confirmar (el `@Put(':id')` de `insumo.controller.ts` puede cubrirlo; verificar DTO). Esfuerzo: **S**. Dependencias: presets del follow-up del fundador (§40) comparten este form. Go-live: **sí** (S, barato).
- **BXW-004 — Almacenes.** Qué falta: web CRUD y rutas backend; POS tiene CRUD local (`warehouse_view_model.dart`) que no tiene espejo cloud. Por qué al web: master data, PERO si SOHO es mono-almacén el gap es teórico. Backend: **route-missing**. Esfuerzo: **S–M**. Dependencias: sync de entidades de almacén (hoy solo strings embebidos en compras, `sync_service.dart:1679`). Go-live: **DECISION del fundador** (¿multi-almacén en alcance SOHO?).
- **BXW-005 — Aprobación de conteos/ajustes desde web.** Qué falta: el flujo request→approve→post de conteos vive 100% en POS; el dueño no puede aprobar un ajuste de inventario desde la oficina. Por qué al web: la aprobación es decisión gerencial, el conteo físico es POS (Square/Lightspeed separan count en piso de approve en web). Backend: **route-missing** para conteos (solo sync `POST count-sessions`); `regularization.approve` cubre regularizaciones, no sesiones de conteo. Esfuerzo: **M**. Dependencias: definir si approve web crea movimiento o cierra sesión. Go-live: post-go-live.
- **BXW-006 — Resolución de alertas forenses desde web.** Qué falta: ack/resolve web; el dashboard solo las agrega como señales de atención. Por qué al web: investigar fraude es trabajo de dueño con tiempo, no de piso. Backend: **route-exists parcial** (`regularization approve`, `remediation sale-inventory`) — falta mapeo UI→rutas. Esfuerzo: **S–M**. Go-live: post-go-live.
- **BXW-007 — Perfil de negocio completo en web (modo operación, modo FX checkout).** Qué falta: solo el régimen fiscal DGI está en onboarding web; el modo de operación y el modo FX del checkout se cambian solo desde el POS (`business_profile_view_model.dart:75-102`). Por qué al web: política de precios/impuestos del negocio = oficina; además evita que el cambio de FX requiera el dispositivo. Backend: **route-exists** (onboarding `fiscal-setup.controller.ts`; verificar si cubre estos campos). Esfuerzo: **S**. Go-live: **sí** (checkout USD/NIO es realidad NIC).
- **BXW-008 — UI web de corrección de compras.** Qué falta: la ruta `POST /inventory/purchases/:id/correction` existe pero no tiene UI; la corrección hoy exige ir al kardex o al dispositivo. Backend: **route-exists**. Esfuerzo: **S**. Go-live: post-go-live (la ruta humana ya existe como escape).
- **BXW-009 — Alta/edición de clientes desde web (DECISION).** Qué falta: el backend tiene CRUD completo (`customers.controller.ts`) pero la UI web solo busca y ajusta puntos; ¿debe el dueño crear clientes desde la oficina? Por qué al web: CRM/master data — pero la captura en piso (express create) ya cubre el caso SOHO. Esfuerzo: **S**. Go-live: post-go-live; decidir.

### Out of scope / POS-OK (no re-litigar)

Venta y checkout (multi-pago, multi-moneda, propinas, descuentos, exención), void en piso con sus permission gates, reimpresión, hold tickets, split bill, layout de mesas en piso, KDS de cocina, apertura/cierre de turno y movimientos de caja con dinero físico, conciliación física de vouchers, conteo y merma y producción en su captura física, identificación/express-create/redención de clientes en piso, supervisor override, hardware/impresora, terminal identity/activation, fiscal inbox/contingencia, y toda capacidad web-exclusiva sin contraparte POS (dashboard, menu-qr, onboarding, imports, templates).

### Known-in-progress

No se duplica lo ya registrado: la página de proveedores (con `PUT /inventory/suppliers/:id` faltante) está en 'Follow-ups de field testing', y las compras web + sus dependencias de sync (incl. el split-brain de proveedores POS-locales) están en 'Pendientes explícitos' y 'Evidence — Slice 1 implementación' de este mismo documento. PR de compras: #713 merged.

### Honestidad de verificación

Ausencia web confirmada por: grep de `supplier\|warehouse\|forensic\|conversion\|operationMode\|fxMode\|areas\|tables\|mesas` sobre `apps/owner_dashboard/src/features` y revisión de páginas/tabs listadas en `router.tsx`. Dos verificaciones quedaron sin resolución y su evidencia resolvería: (1) si el toggle de promociones del POS llega a la cloud (no se encontró push en `sale_view_model.dart` ni en `sync_service.dart` en la pasada actual); (2) si el DTO de `PUT /insumos/:id` cubre conversiones UoM (define si BXW-003 es S o M).
