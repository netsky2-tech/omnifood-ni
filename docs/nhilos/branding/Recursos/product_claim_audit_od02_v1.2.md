# NHILOS — Product Claim Audit / OD-02

**Documento:** `product_claim_audit_od02_v1.2.md`  
**Versión:** 1.2 (Reconciliación Normativa + Re-anclaje)  
**Estado:** `CLOSED / VERIFIED / RE-ANCHORED`  
**Gate:** OD-02 — Product Claim Inventory  
**Scope:** NHILOS POS public website  
**Upstream authority:** `nhilos_brand_experience_principles_v1.0.md` (v1.0)  
**Downstream:** `nhilos_website_product_marketing_brief_v1.0.md` (v1.0) → `nhilos_website_information_architecture_content_wireframe_v1.0.md`  
**Gobernanza de cadena:** según `nhilos_branding_document_governance_v1.0.md` (§3), este documento es la autoridad de claims y el Marketing Brief es downstream de él.  
**Fecha de reconciliación:** 2026-10-08  
**Reconciliation resolutions:** `OD-02-R01` (Claim count 34), `OD-02-R02` (Fiscal conditioning), `OD-02-R03` (Hardened offline wording)  

---

# 1. Propósito

Cerrar **OD-02 — Product Claim Inventory** mediante una auditoría basada en el **producto realmente implementado** en el repositorio `omnifood-ni`, erradicando el futureware y separando la intención de marketing del comportamiento real del software.

1. La redacción del **Website Product Marketing Brief v1.0**, que según `nhilos_branding_document_governance_v1.0.md` es downstream de este documento.

> **Regla principal verificada:** el producto real tiene precedencia sobre cualquier claim de marketing.

---

# 2. Dependency Contract

OD-02 queda formalmente **CLOSED / VERIFIED / RECONCILED** bajo la cadena verificable:
```text
WEBSITE CLAIM (Marketing)
    ↓
PRODUCT BEHAVIOR (Audited Domain)
    ↓
CODE / RUNTIME EVIDENCE (E3 + E4)
    ↓
EXACT SCOPE & HARDENED BOUNDARIES (works_when / does_not_work_when)
    ↓
MATERIAL LIMITATIONS (LIM-01 .. LIM-06)
    ↓
PUBLIC CLAIM STATUS (Allowlist D4 vs Blocklist D5)
    ↓
AUTHORITATIVE INPUT FOR IA v1.0 RECONCILIATION
```

---

# 3. Codebase Provenance & Boundaries

## 3.1 Repository Snapshot
```text
repository:       netsky2-tech/omnifood-ni (NHILOS POS)
branch/tag:       origin/main
commit_sha:       b4b5ad27 (re-anclaje 2026-10-08; auditoría original 7af1521ea077ce8bc1faed1aa7189a6186eac515, 2026-09-26)
audit_date:       2026-10-08
environment:      Production-grade Local Monorepo
components:
  - POS Mobile / Terminal (Flutter 3.x, Dart, SQLite Floor v65)
  - Admin Backend API (NestJS, TypeScript, TypeORM, PostgreSQL RLS)
  - Owner Dashboard Web (React 19, TypeScript, Vite, TailwindCSS)
```

## 3.2 Codebase Boundaries Verificados
- **POS Application (`apps/pos_app`):** Aplicación de punto de venta táctica, offline-first. SQLite Floor local como fuente de verdad. Emisión de tickets, cálculo de impuestos, control de turnos, arqueos, comanda a cocina, KDS e impresión térmica.
- **Backend API (`apps/admin_backend`):** Servicios de sincronización de deltas, consolidación de compras, costeo promedio ponderado (CPP), recálculo de Kardex, control multi-inquilino (RLS) y reportes ejecutivos/fiscales.
- **Owner Dashboard (`apps/owner_dashboard`):** Panel web administrativo para dueños. Visualización de KPIs de venta neta, ventas horarias, ticket promedio, mix de pagos, frescura de sincronización (badge), catálogos, recetas y usuarios.
- **Hardware Integrations:** Driver nativo Android para terminales Sunmi V2s (impresora térmica 58mm integrada), adaptadores genéricos ESC/POS de red local (IP) y soporte iMin/iPOS.

---

# 4. Primary Audit Matrix (D1) — 34 Claims Auditados (`OD-02-R01`)

| ID | Claim | Class | Scope | Code Evidence | Test Evidence | Limitations | Technical Status | Public Status | Website Treatment |
|---|---|---|---|---|---|---|---|---|---|
| **PC-OFF-01** | Operación de caja offline-first en terminal local previamente hidratado | `CONTINUITY` | FOH / POS Checkout | `apps/pos_app/lib/domain/usecases/inventory/process_sale_inventory_use_case.dart`, `apps/pos_app/lib/data/daos/sales/invoice_dao.dart` | `apps/pos_app/test/integration/activation_offline_sale_e2e_test.dart` | Aplica a venta, cobro, ticket y receta sobre terminal enrolado con catálogo local en SQLite. Enrolamiento y cambios de catálogo requieren internet (`OD-02-R03`). | `VERIFIED_RUNTIME` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-OFF-02** | Base de datos local SQLite (Floor) como fuente de verdad en caja | `CONTINUITY` | FOH Local Storage | `apps/pos_app/lib/data/database/app_database.dart`, `migrations.dart` (v65) | `apps/pos_app/test/data/database/sales_database_test.dart` | Ninguna para la operación táctica de caja individual. | `VERIFIED_RUNTIME` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-OFF-03** | Sincronización asíncrona bidireccional por deltas con detección de red | `CONTINUITY` | Sync Layer | `apps/pos_app/lib/data/services/sync_service.dart`, `apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts`, `apps/admin_backend/src/modules/sales/controllers/sync-batch.controller.ts` | `apps/pos_app/test/data/services/sync_service_test.dart`, `sync_service_reconnect_test.dart` | Los datos en la nube son eventualmente consistentes; encolamiento local con backoff exponencial. | `VERIFIED_RUNTIME` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-OFF-04** | Autenticación de personal offline mediante PIN cifrado (BCrypt) | `SECURITY` | POS Access | `apps/pos_app/lib/data/services/local_auth_service.dart`, `apps/pos_app/lib/ui/widgets/pin_pad.dart` | `apps/pos_app/test/data/services/local_auth_service_test.dart`, `phase1_rbac_override_integration_test.dart` | El empleado debe haber iniciado sesión online al menos una vez para hidratar el hash local. | `VERIFIED_RUNTIME` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-OFF-05** | Red local inalámbrica multi-terminal sin internet (LAN Broker / mDNS) | `CONTINUITY` | Multi-device FOH | `docs/plans/master_execution_roadmap.md` Bloque 18 (shelf huérfano en pubspec.lock, sin broker en lib) | Ninguna en runtime | No implementado. Requiere sincronización vía nube si hay múltiples terminales. | `NOT_IMPLEMENTED` | `PROPOSED` | `DO_NOT_CLAIM / FUTUREWARE` |
| **PC-FISC-01** | Consecutivos fiscales correlativos inalterables (DGI DT 09-2007) | `FISCAL / COMPLIANCE` | Invoicing | `apps/pos_app/lib/data/services/sales/dgi_numbering_service_impl.dart`, `invoice_dao.dart` | `apps/pos_app/test/data/services/sales/dgi_numbering_service_impl_test.dart` | Requiere configuración previa del prefijo y folio inicial autorizado por la DGI bajo DT 09-2007 (`OD-02-R02`). | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-FISC-02** | Inmutabilidad de facturas; anulación exclusiva vía Nota de Crédito con supervisión | `FISCAL / COMPLIANCE` | Invoicing Audit | `apps/pos_app/lib/data/daos/sales/invoice_dao.dart` (cero DELETEs; flag `is_canceled`), `void_decision.dart` | `apps/pos_app/test/presentation/features/sales/sale_history_credit_note_feedback_test.dart` | DT 09-2007: Las facturas nunca se eliminan físicamente; requieren PIN de supervisor y generan evento inmutable (`OD-02-R02`). | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-FISC-03** | Validación sintáctica formal de Cédula y RUC nicaragüense | `FISCAL / COMPLIANCE` | Customer Validation | `apps/pos_app/lib/core/utils/nicaragua_fiscal_validator.dart` | `apps/pos_app/test/core/utils/nicaragua_fiscal_validator_test.dart` | Valida algoritmo y formato sintáctico oficial; NO consulta el padrón DGI online en vivo (`OD-02-R02`). | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-FISC-04** | Facturación electrónica DGI en tiempo real con XML firmado y CUFE | `FISCAL / COMPLIANCE` | Electronic Invoice | `docs/plans/master_execution_roadmap.md` Bloque 19 | Ninguna | No implementado. El sistema es para Sistemas Computarizados de Facturación (DT 09-2007), no FE online (`OD-02-R02`). | `NOT_IMPLEMENTED` | `SUPERSEDED` | `DO_NOT_CLAIM / FUTUREWARE` |
| **PC-PAY-01** | Cobro con tarjetas BAC y Banpro en flujo manual desacoplado | `PAYMENT` | Checkout / Terminal | `apps/pos_app/lib/data/adapters/terminals/manual_standalone_terminal_adapter.dart`, `card_payment_orchestrator.dart` | `apps/pos_app/test/domain/services/sales/card_payment_orchestrator_test.dart` | Flujo desacoplado: el cajero opera el datáfono físico y digita código de autorización y últimos 4 dígitos. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-PAY-02** | Arqueo de caja, corte X/Z y conciliación de lotes de vouchers bancarios | `PAYMENT` | Cash Management | `apps/pos_app/lib/ui/features/cash/card_voucher_reconciliation_view_model.dart`, `batch_settlement.dart` | `apps/pos_app/test/ui/features/cash/card_voucher_reconciliation_dialog_test.dart` | Conciliación manual contra vouchers físicos antes del cierre de turno. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-PAY-03** | Integración electrónica directa por API / BLE con datáfonos bancarios | `PAYMENT` | Hardware Integration | `apps/pos_app/lib/data/adapters/terminals/local_network_terminal_adapter.dart` (stub/mock) | Ninguna contra hardware bancario real | No existe conexión directa por cable o Bluetooth a terminales bancarias en Nicaragua. | `NOT_IMPLEMENTED` | `PROPOSED` | `DO_NOT_CLAIM / FUTUREWARE` |
| **PC-PAY-04** | Cobro bimoneda nativo (NIO/USD) con desacoplamiento de tipo de cambio oficial BCN y comercial | `PAYMENT` | Multicurrency | `apps/pos_app/lib/domain/services/sales/currency_checkout_calculator.dart`, `multi_currency_checkout_dialog.dart` | `apps/pos_app/test/domain/services/sales/currency_checkout_calculator_test.dart` | El vuelto se entrega en la moneda seleccionada (típicamente NIO) según configuración de caja. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-PAY-05** | División de cuenta (Split Bill) por comensales o formas de pago mixtas | `PAYMENT` | Checkout | `apps/pos_app/lib/domain/services/sales/split_bill_engine.dart`, `split_bill_dialog.dart` | `apps/pos_app/test/domain/services/sales/split_bill_engine_test.dart` | Aplica a cuentas de salón y órdenes abiertas; valida cuadre exacto de centavos. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-PAY-06** | Captura y liquidación de propina voluntaria (10%) sin gravar IVA | `PAYMENT` | Tipping | `apps/pos_app/lib/domain/services/sales/tip_engine.dart`, `apps/admin_backend/src/migrations/1809470000000-AddTipsToInvoices.ts` | `apps/pos_app/test/domain/services/sales/tip_engine_test.dart` | Cumplimiento DGI INV-16.1 (la propina no forma parte de la base imponible del IVA). | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-INV-01** | Descuento automático de insumos en tiempo real por receta (BOM) al vender | `FUNCTIONAL` | Inventory / BOM | `apps/pos_app/lib/domain/usecases/inventory/process_sale_inventory_use_case.dart`, `authority_hydration_service.dart` | `apps/pos_app/test/domain/usecases/inventory/process_sale_inventory_use_case_test.dart` | Exclusivo de productos tipo `COMPOUND` con receta publicada. Ventas sin receta no descuentan insumo (WU11). | `VERIFIED_RUNTIME` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-INV-02** | Kardex inmutable basado en deltas incrementales procesados cronológicamente | `DATA / VISIBILITY` | Kardex Engine | `apps/pos_app/lib/domain/services/inventory/kardex_recalculation_engine.dart`, `apps/admin_backend/src/modules/inventory/inventory-movement.service.ts` | `apps/pos_app/test/kardex_retrocalculation_e2e_integration_test.dart` | Los movimientos son inmutables; correcciones se efectúan mediante nuevos movimientos de ajuste. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-INV-03** | Costeo Promedio Ponderado (CPP) automático al asentar facturas de compra | `FUNCTIONAL` | Cost Accounting | `apps/admin_backend/src/modules/inventory/services/inventory-purchase.service.ts`, `movement_engine_impl.dart` | `apps/admin_backend/src/modules/inventory/inventory-purchase.service.spec.ts` | Requiere registrar compras con costo unitario y cantidad recibida válida. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-INV-04** | Tolerancia a stock negativo en offline con recálculo retrospectivo y alertas | `CONTINUITY` | Inventory Resilience | `apps/pos_app/lib/domain/services/inventory/negative_stock_regularization_service.dart`, `forensic_alert_dao.dart` | `apps/pos_app/test/domain/services/inventory/negative_stock_regularization_service_test.dart` | La venta no se detiene si falta stock teórico; genera alerta forense para auditoría física. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-INV-05** | Registro formal de mermas y ajustes por rotura, derrame o vencimiento | `FUNCTIONAL` | Inventory Loss | `apps/pos_app/lib/ui/features/inventory/shrinkage/shrinkage_view.dart`, `merma_taxonomy.dart` | `apps/pos_app/test/ui/features/inventory/shrinkage/shrinkage_view_test.dart` | Requiere selección de motivo dentro de la taxonomía del sistema. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-INV-06** | Órdenes de producción y pre-elaboración batch para sub-recetas de cocina | `WORKFLOW` | Production | `apps/pos_app/lib/ui/features/inventory/production/production_order_view.dart`, `apps/admin_backend/src/modules/inventory/entities/production-order.entity.ts` | `apps/pos_app/test/ui/features/inventory/production/production_flow_e2e_test.dart` | Descuenta insumos base e incrementa el stock del insumo pre-elaborado en almacén. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-HW-01** | Impresión térmica nativa 58mm en terminal Sunmi V2s (Android Platform Channel) | `INTEGRATION` | Hardware POS | `apps/pos_app/lib/data/adapters/printer/sunmi_printer_adapter.dart`, `receipt_58mm_formatter.dart` | `apps/pos_app/test/data/adapters/printer/sunmi_printer_adapter_test.dart`, `sunmi_v2s_checkout_print_flow_e2e_test.dart` | Diseñado específicamente para Sunmi V2s y terminales con impresora integrada Sunmi OS. | `VERIFIED_RUNTIME` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-HW-02** | Impresión de tickets de cocina y barra por red local (LAN/IP) vía ESC/POS | `INTEGRATION` | Kitchen Printing | `apps/pos_app/lib/domain/services/printer/esc_pos_builder.dart`, `printer_config.dart` | `apps/pos_app/test/domain/services/config/printer_config_service_test.dart` | Requiere que la ticketera tenga IP estática fija en la misma subred Wi-Fi/Ethernet. | `IMPLEMENTED_WITH_LIMITATIONS` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-HW-03** | Pantalla de cocina digital (KDS) con semáforo SLA de tiempos de preparación | `WORKFLOW` | Kitchen Display | `apps/pos_app/lib/ui/features/kitchen/kitchen_display_view.dart`, `kitchen_order_service.dart` | `apps/pos_app/test/ui/features/kitchen/kitchen_restaurant_flow_e2e_test.dart` | Opera en la aplicación; el ruteo entre múltiples tablets independientes requiere sync en la nube o terminal único. | `IMPLEMENTED_WITH_LIMITATIONS` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-SEC-01** | Aislamiento multi-inquilino estricto en la nube mediante PostgreSQL Row-Level Security (RLS) | `SECURITY` | Multi-Tenant Cloud | `apps/admin_backend/src/migrations/1808000000000-RepairTenantTopologyRevisions.db.spec.ts`, `product.service.ts` (`set_config('app.tenant_id')`) | `apps/admin_backend/src/modules/inventory/product.service.db.spec.ts` | Requiere que toda consulta pase por la sesión transaccional con contexto de inquilino fijado. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-SEC-02** | Control de acceso basado en roles (RBAC) con supervisión de anulaciones | `SECURITY` | Access Control | `apps/pos_app/lib/ui/features/identity/supervisor_override_modal.dart`, `apps/admin_backend/src/modules/identity/entities/security-profile.entity.ts` | `apps/pos_app/test/integration/phase1_rbac_override_integration_test.dart` | Roles estándar: Owner, Manager, Cashier, Waiter. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-SEC-03** | Pista de auditoría inmutable forense con hash SHA-256 encadenado (Audit v3) | `SECURITY` | Audit Trail | `apps/pos_app/lib/core/audit/v3/canonicalizer.dart`, `sha256.dart`, `frame.dart` | `apps/pos_app/test/core/audit/v3/conformance_runner.dart`, `audit_atomic_append_test.dart` | Garantiza detección matemática de cualquier alteración en la base de datos local SQLite. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-DASH-01** | Dashboard web ejecutivo para dueños con KPIs de venta neta, horas pico y pagos | `DATA / VISIBILITY` | Owner Dashboard | `apps/owner_dashboard/src/features/dashboard/dashboard-page.tsx`, `kpi-strip.tsx` | `apps/owner_dashboard/src/__tests__/dashboard-v2-acceptance.spec.tsx` | Requiere acceso web a internet para consultar el API cloud. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-DASH-02** | Monitor visual de frescura de sincronización (Sync Freshness Badge) en tiempo real | `DATA / VISIBILITY` | Operational Status | `apps/owner_dashboard/src/components/freshness-badge.tsx`, `use-sync-freshness.ts` | `apps/owner_dashboard/src/__tests__/dashboard-v2-freshness.spec.tsx` | Informa al dueño si los datos mostrados están al día o si hay terminales con sync retrasado. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-DASH-03** | Ranking de productos top con participación calculada sobre la venta neta del periodo | `DATA / VISIBILITY` | Analytics | `apps/owner_dashboard/src/features/dashboard/top-products-chart.tsx`, `chart-domain.ts` | `apps/owner_dashboard/src/__tests__/dashboard-v2-charts.spec.tsx` | El porcentaje de participación se calcula contra el total de ventas netas del periodo (corrección WU6). | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-DASH-04** | Exportación de reportes de ventas, notas de crédito y cumplimiento DGI | `DATA / VISIBILITY` | Reporting | `apps/owner_dashboard/src/features/fiscal/fiscal-page.tsx`, `apps/admin_backend/src/modules/sales/services/sales-reports.service.ts` | `apps/owner_dashboard/src/__tests__/w4-fiscal.test.tsx` | Filtros por rango de fecha, turno y estado fiscal. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-ONB-01** | Plantillas de catálogo preconfiguradas por industria (Cafetería, Food Park, Restaurante, Retail) | `WORKFLOW` | Onboarding | `apps/admin_backend/src/modules/onboarding/entities/industry-template.entity.ts`, `industry-templates-list.tsx` | `apps/admin_backend/src/modules/onboarding/industry-template.e2e-spec.ts` | Permite arrancar un comercio con catálogo base, insumos y recetas sugeridas. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |
| **PC-ONB-02** | Importación asistida de catálogos e insumos desde archivos CSV | `WORKFLOW` | Data Ingestion | `apps/owner_dashboard/src/features/settings/bulk-import-wizard.tsx` | `apps/owner_dashboard/src/__tests__/onboarding-legacy-guardrails.test.tsx` | El archivo debe ceñirse a las columnas de la plantilla oficial de insumos/productos. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED_WITH_LIMITATION` |
| **PC-ONB-03** | Setup Center con checklist interactivo y prueba de venta controlada de activación | `OPERATIONAL` | Provisioning | `apps/owner_dashboard/src/features/onboarding/setup-center-view.tsx`, `activation_controlled_sale_runner.dart` | `apps/owner_dashboard/src/__tests__/setup-center-view.test.tsx`, `activation_lifecycle_m6_closure_e2e_test.dart` | Valida que el terminal imprimió ticket, generó folio DGI y sincronizó antes de operar. | `VERIFIED_BY_TEST` | `APPROVED_WEBSITE` | `PUBLIC_APPROVED` |

---

# 5. Limitation Register (D3)

1. **LIM-01 (Offline First Boundary — `OD-02-R03`):** El funcionamiento offline aplica estrictamente a la venta en caja, retención de comandas, cobro en efectivo/voucher desacoplado, impresión y deducción de recetas sobre el terminal individual ya aprovisionado y con catálogo hidratado en SQLite. El enrolamiento inicial del dispositivo, la primera descarga de catálogo/precios, los cambios de usuarios y la consolidación de métricas al dashboard web central requieren conexión a internet. No existe sincronización peer-to-peer en red local cerrada sin internet entre múltiples terminales.
2. **LIM-02 (Datáfonos Bancarios Desacoplados):** En Nicaragua no existe integración electrónica directa vía API/Bluetooth/cable a los datáfonos de BAC Credomatic ni Banpro. El cajero pasa la tarjeta en la terminal física bancaria y digita en NHILOS los últimos 4 dígitos y el número de autorización para fines de cuadre de caja y auditoría.
3. **LIM-03 (Normativa Fiscal DGI — `OD-02-R02`):** El sistema implementa estrictamente la normativa de **Sistemas Computarizados de Facturación según la Disposición Técnica DGI 09-2007** (numeración correlativa obligatoria, inmutabilidad, no borrado de facturas y anulación mediante Notas de Crédito supervisadas). **No existe Facturación Electrónica en línea (XML firmado digitalmente con PKCS#12 y CUFE transmitido a la DGI en vivo)**, ya que eso corresponde al Bloque 19 futuro. Además, la validación de Cédula/RUC es sintáctica formal y no efectúa consultas en tiempo real al padrón en línea de la DGI.
4. **LIM-04 (Topología Multi-Dispositivo):** El KDS y la recepción de pedidos operan de forma nativa en cada terminal local y se consolidan en el Dashboard a través de la nube. La sincronización multi-terminal satélite sin internet (LAN Broker / mDNS) está planificada para el Bloque 18 y no debe prometerse como capacidad actual disponible.
5. **LIM-05 (Recetas y Deducción de Insumos):** Solo los productos configurados con tipo `COMPOUND` y que cuenten con una versión de receta activa y publicada descuentan insumos del inventario automáticamente. Los productos tipo `SIMPLE` descuentan stock de producto terminado por unidad. Ventas de productos sin mapeo explícito de insumos quedan registradas como venta pero no costeadas en el Kardex (`APPLIED_NO_INVENTORY_IMPACT`).
6. **LIM-06 (Hardware de Impresión Soportado):** La impresión térmica embebida está optimizada y certificada para terminales móviles Android con Sunmi OS (como Sunmi V2s) mediante Platform Channels de Android. La impresión en impresoras térmicas externas de cocina/barra requiere dispositivos ESC/POS estándar conectados a la red local con dirección IP fija.

---

# 6. Website Claim Allowlist (D4)

Claims rigurosamente autorizados y condicionados para el Website de Marketing de NHILOS POS:

### Propuesta de Valor y Continuidad Operativa (`OD-02-R03`)
- ✅ **"Cobrá, facturá e imprimí en tu punto de venta, aunque se caiga el internet."** (Respaldado por PC-OFF-01 y PC-OFF-02; condicionado al terminal enrolado y con catálogo local hidratado).
- ✅ **"Base de datos local en cada terminal: la caja sigue operando sin depender de respuestas de la nube."** (PC-OFF-02).
- ✅ **"Sincronización automática en segundo plano cuando la conexión a internet regresa."** (PC-OFF-03).
- ✅ **"Control de acceso y cambio de cajero instantáneo por PIN en el terminal sin internet."** (PC-OFF-04).

### Fiscalidad y DGI Nicaragua (`OD-02-R02`)
- ✅ **"Emisión de facturas correlativas conforme a la DT 09-2007 para Sistemas Computarizados de Facturación: numeración consecutiva e inalterable, con prefijo y folio inicial configurados previamente según la autorización de la DGI."** (PC-FISC-01 y PC-FISC-02; condicionado a la parametrización inicial del prefijo y folio autorizados por la DGI).
- ✅ **"Consecutivos fiscales correlativos y ordenados, sin saltos de folio ni riesgos de duplicación."** (PC-FISC-01; condicionado a parametrización inicial del folio autorizado).
- ✅ **"Inmutabilidad total: cero borrado de facturas; anulaciones supervisadas exclusivamente mediante Notas de Crédito."** (PC-FISC-02).
- ✅ **"Validación algorítmica de Cédula y RUC nicaragüense (Personas Naturales y Jurídicas) para evitar errores tipográficos."** (PC-FISC-03).

### Pagos y Caja
- ✅ **"Cobro bimoneda nativo en Córdobas (NIO) y Dólares (USD) con cálculo de vuelto automático."** (PC-PAY-04).
- ✅ **"Doble tipo de cambio: oficial (BCN) para impuestos y comercial para proteger tu margen de caja."** (PC-PAY-04).
- ✅ **"Control y conciliación diaria de vouchers de tarjetas bancarias (BAC y Banpro)."** (PC-PAY-01 y PC-PAY-02; flujo desacoplado).
- ✅ **"División de cuentas (Split Bill) flexible entre comensales o combinando efectivo y tarjeta."** (PC-PAY-05).
- ✅ **"Gestión de propina voluntaria (10%) sin afectar la base imponible del IVA (DGI INV-16.1)."** (PC-PAY-06).

### Inventario y Costeo
- ✅ **"Deducción automática de materias primas por receta (BOM) en cada café, plato o bebida vendida."** (PC-INV-01).
- ✅ **"Kardex inmutable y costeo promedio ponderado (CPP) automático al asentar compras de insumos."** (PC-INV-02 y PC-INV-03).
- ✅ **"Tolerancia a stock negativo: tu operación no se detiene en horas pico y el sistema regulariza los movimientos al cuadrar."** (PC-INV-04).
- ✅ **"Control de mermas clasificadas y órdenes de producción batch para pre-elaborados de cocina."** (PC-INV-05 y PC-INV-06).

### Hardware y Dashboard Web
- ✅ **"Compatible con terminales móviles Sunmi V2s con impresora térmica de 58mm integrada."** (PC-HW-01).
- ✅ **"Soporte de impresoras térmicas de cocina y barra por red local (LAN/IP)."** (PC-HW-02).
- ✅ **"Pantalla digital de cocina (KDS) con alerta visual de tiempos de preparación por color."** (PC-HW-03).
- ✅ **"Panel web para dueños con métricas en tiempo real de ventas netas, horas pico y productos top."** (PC-DASH-01 y PC-DASH-03).
- ✅ **"Monitor de frescura: comprobá al instante si tus cajas están sincronizadas con la nube."** (PC-DASH-02).

---

# 7. Website Claim Blocklist / Do Not Claim (D5)

Claims estrictamente **PROHIBIDOS** en la comunicación pública:

| Claim Prohibido | Motivo Técnico de Bloqueo |
|---|---|
| ❌ *"Facturación Electrónica en línea con firma digital XML y envío automático a la DGI"* | Corresponde al Bloque 19 del roadmap futuro. En producción se cumple la DT 09-2007 (Sistemas Computarizados), no transmisión XML/CUFE en tiempo real (`OD-02-R02`). |
| ❌ *"Integración electrónica automática con datáfonos BAC/Banpro por cable o Bluetooth"* | No existe API bancaria integrada en hardware en Nicaragua. El flujo es manual desacoplado con captura de código de voucher. |
| ❌ *"Red local inalámbrica que conecta meseros y cocina 100% sin internet ni nube"* | El broker mDNS/WebSocket local embebido es el Bloque 18 (no implementado). Los dispositivos sincronizan vía nube (`OD-02-R03`). |
| ❌ *"Validación en tiempo real contra la base de datos de contribuyentes activos de la DGI"* | No existe API pública de consulta en vivo del padrón de la DGI en Nicaragua; la validación es sintáctica y algorítmica (`OD-02-R02`). |
| ❌ *"Conexión directa a balanzas electrónicas de peso y escáneres seriales"* | No existe soporte en código para drivers de balanzas o lectores seriales de pesaje continuo. |

---

# 8. Proof Backlog (D6)

Funcionalidades implementadas en código que requieren evidencia visual antes de publicarse en la web:
1. **PB-01:** Capturas de pantalla reales en alta resolución del KDS operando en pantalla de 10 pulgadas.
2. **PB-02:** Video/GIF de demostración del checkout bimoneda NIO/USD en terminal Sunmi V2s imprimiendo ticket.
3. **PB-03:** Fotografía/Caso de estudio del proceso de conciliación de lote de vouchers BAC al cerrar turno (Reporte Z).
4. **PB-04:** Evidencia de exportación del reporte fiscal en PDF/Excel para contadores externos.

---

# 9. Superseded / Futureware Register (D7)

- **FW-01 (Bloque 18 Roadmap):** LAN Broker local embebido para comandeo satélite inalámbrico sin router ni nube.
- **FW-02 (Bloque 19 Roadmap):** Factura Electrónica DGI Nicaragua con firma PKCS#12, CUFE y código QR tributario.
- **FW-03:** Conexión BLE a terminales de pago inalámbricas mPOS.
- **FW-04:** Enlace de balanzas electrónicas por puerto RS232 / USB HID.

---

# 10. Exit Criteria Sign-off

- [x] El codebase auditado está identificado por commit/versión (`b4b5ad27`, re-anclaje 2026-10-08).
- [x] Se construyó el universo completo de claims candidatos (**34 claims analizados**, resolución `OD-02-R01`).
- [x] Claims compuestos fueron desagregados en claims unitarios atómicos.
- [x] Claims funcionales relevantes tienen evidencia concreta de implementación en código (E3).
- [x] Claims relevantes tienen tests automatizados verificables (E4).
- [x] Integraciones críticas (impresión, pagos, fiscal) tienen evidencia específica de adaptadores.
- [x] Limitaciones materiales están documentadas y formalizadas (LIM-01 a LIM-06).
- [x] Claims fiscales condicionados a DT 09-2007 (Sistemas Computarizados) y validación sintáctica (`OD-02-R02`).
- [x] Claims de continuidad operativa endurecidos a la caja individual hidratada (`OD-02-R03`).
- [x] Futureware fue rigurosamente separado y catalogado (FW-01 a FW-04).
- [x] La matriz primaria `claim → scope → code → test → limitation → status` está completa.
- [x] Existe una Allowlist oficial de claims autorizados para copy público (D4).
- [x] Existe una Blocklist explícita de claims prohibidos (D5).
- [x] Gate OD-02 marcado formalmente como **CLOSED / VERIFIED / RECONCILED**.

---

# 11. Autoridad Downstream

Según la cadena de autoridad de `nhilos_branding_document_governance_v1.0.md` (§3), este documento versión 1.2 es la **autoridad de claims** del set. Los documentos downstream que consumen sus claims admisibles son:
1. `nhilos_website_product_marketing_brief_v1.0.md`
2. `nhilos_website_information_architecture_content_wireframe_v1.0.md`

---

# Reconciliación v1.2 — Re-anclaje a b4b5ad27

Resultado headline: de los 34 claims auditados, **30 sin cambio, 3 con deriva, 0 ya no sostenibles** tras 575 commits (`7af1521…` → `b4b5ad27`, 2026-10-08).

| # | Corrección | Antes | Después |
|---|---|---|---|
| R-1 | Re-anclaje del build de procedencia | `7af1521ea077ce8bc1faed1aa7189a6186eac515` (2026-09-26) | `b4b5ad27` (`origin/main`, 2026-10-08) |
| R-2 | Evidencia muerta de `PC-OFF-03` | `apps/admin_backend/src/modules/inventory/inventory-sync.service.ts` (inexistente) | `apps/admin_backend/src/modules/sales/services/inbound-sync.service.ts` + `apps/admin_backend/src/modules/sales/controllers/sync-batch.controller.ts` |
| R-3 | Evidencia muerta de `PC-PAY-06` | `apps/admin_backend/src/migrations/1809200000000-AddInvoiceTipColumns.ts` (inexistente) | `apps/admin_backend/src/migrations/1809470000000-AddTipsToInvoices.ts` |
| R-4 | Versión de esquema local | SQLite Floor v57 | SQLite Floor **v65** (`apps/pos_app/lib/data/database/app_database.dart`, `@Database(version: 65)`); corregido en §3.1, en la celda de evidencia de `PC-OFF-02` y en este registro |

**Claims con deriva (comportamiento verificado contra `b4b5ad27`):**

| Claim | Nueva evidencia | Nota |
|---|---|---|
| `PC-OFF-03` | `modules/sales/services/inbound-sync.service.ts` + `controllers/sync-batch.controller.ts` | Comportamiento ampliado con transporte por dispositivo y `apps/admin_backend/src/modules/identity/guards/sync-transport.guard.ts`; el claim se mantiene |
| `PC-PAY-06` | `src/migrations/1809470000000-AddTipsToInvoices.ts` | Migración renombrada; comportamiento intacto |
| `PC-DASH-02` | `apps/owner_dashboard/src/features/dashboard/use-sync-freshness.ts` | Hook reubicado; comportamiento intacto y ampliado con badge `PARTIAL` para huecos históricos |

> **Nota de precisión KPI:** `PC-DASH-01` y `PC-DASH-03` no deben sobredeclarar precisión en el copy: el ticket promedio está acotado al ticket, el denominador de participación de top-products está etiquetado, y los números no probados fueron retirados.

---

# Índice inverso — Claims publicados que citan cada claim del OD-02

**Propósito.** Trazabilidad inversa exigida por `G-04` (`nhilos_branding_document_governance_v1.0.md`): para cada claim técnico del OD-02, qué Claim IDs de la página de producto (`nhilos_pos_product_page_content_v1.1.md`, Anexo A) lo citan como respaldo. Los Claim IDs de la página son IDs de slot de contenido, no IDs de capacidad técnica; no existe correspondencia 1:1. Un claim `huérfano` no es defecto por sí solo: si su estado público es `APPROVED_WEBSITE`, la omisión indica un hueco de cobertura de la página; si es `DO_NOT_CLAIM / FUTUREWARE`, la omisión es la conducta correcta.

| OD-02 ID | Product Page Claim IDs que lo citan | Estado (citado / huérfano) |
| :---- | :---- | :---- |
| PC-OFF-01 | PP-001, PC-001, CW-001, CT-001, CT-002, RL-001 | citado |
| PC-OFF-02 | PP-001, CW-001, CT-001, CV-001 | citado |
| PC-OFF-03 | CT-003 | citado |
| PC-OFF-04 | — | huérfano |
| PC-OFF-05 | — | huérfano (futureware, no debe citarse) |
| PC-FISC-01 | — | huérfano |
| PC-FISC-02 | — | huérfano |
| PC-FISC-03 | — | huérfano |
| PC-FISC-04 | — | huérfano (futureware, no debe citarse) |
| PC-PAY-01 | CW-003, CW-004, RL-001 | citado |
| PC-PAY-02 | — | huérfano |
| PC-PAY-03 | — | huérfano (futureware, no debe citarse) |
| PC-PAY-04 | CW-003, RL-001 | citado |
| PC-PAY-05 | — | huérfano |
| PC-PAY-06 | CW-003 | citado |
| PC-INV-01 | PC-003 | citado |
| PC-INV-02 | CV-002 | citado |
| PC-INV-03 | CV-002 | citado |
| PC-INV-04 | PC-003 | citado |
| PC-INV-05 | CV-002 | citado |
| PC-INV-06 | — | huérfano |
| PC-HW-01 | HC-001, HC-003 | citado |
| PC-HW-02 | HC-001, HC-003 | citado |
| PC-HW-03 | HC-001 | citado |
| PC-SEC-01 | — | huérfano |
| PC-SEC-02 | CV-003, RL-002 | citado |
| PC-SEC-03 | CV-003 | citado |
| PC-DASH-01 | CW-006, CV-001, RL-003 | citado |
| PC-DASH-02 | CW-006, CV-004, RL-003 | citado |
| PC-DASH-03 | CW-006, RL-003 | citado |
| PC-DASH-04 | CW-006, CV-001, CV-002, RL-003 | citado |
| PC-ONB-01 | IM-002 | citado |
| PC-ONB-02 | — | huérfano |
| PC-ONB-03 | IM-001, IM-002, IM-004 | citado |
