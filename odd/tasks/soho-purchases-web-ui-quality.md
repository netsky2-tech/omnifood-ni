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
