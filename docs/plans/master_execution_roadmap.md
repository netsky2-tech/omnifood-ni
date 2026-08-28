# OmniFood NI — Master Execution Roadmap

This document serves as the single source of truth for the platform implementation milestones, tracking completed batches and detailing upcoming work blocks.

---

## 🏆 Completed Batches Summary

| Batch | Module / Capability | Target Surface | Test Evidence | Status |
|---|---|---|---|---|
| **Batch 1** | Turnos de Caja, Control de Efectivo & Cortes X/Z | POS + Backend | `cash_shift_voucher_guard_test.dart` + Backend Specs | **COMPLETADO ✅** |
| **Batch 2** | Multi-Currency & Decoupled FX Checkout (BCN vs Comercial) | POS + Backend | `multi_currency_checkout_e2e_test.dart` | **COMPLETADO ✅** |
| **Batch 3** | Pagos Divididos & Conciliación de Vouchers en 2 Capas | POS + Backend | `card_voucher_reconciliation_dialog_test.dart` | **COMPLETADO ✅** |
| **Batch 4** | Cuentas Abiertas, Mesas & Retención de Tickets (Hold) | POS (FOH) | `restaurant_flow_e2e_test.dart` | **COMPLETADO ✅** |
| **Batch 5** | Kitchen Display System (KDS) & Comandas Digitales | POS (FOH) | `kitchen_restaurant_flow_e2e_test.dart` | **COMPLETADO ✅** |
| **Batch 6** | Multi-Tenant Operation Modes (QSR Food Park vs Restaurant) | POS + Backend | `foodpark_qsr_flow_e2e_test.dart` | **COMPLETADO ✅** |
| **Batch 6a-c**| Inventario Avanzado, Kardex Inmutable, CPP, Mermas & BOH Reports | POS + Backend | 450+ Backend specs & BOH integration tests | **COMPLETADO ✅** |
| **Batch 7** | Hardware Sunmi V2s & Impresión Térmica ESC/POS (58mm/80mm) | POS (Mobile) | `sunmi_v2s_responsive_sale_view_test.dart` | **COMPLETADO ✅** |
| **Batch 8** | Sincronización Cloud Offline-First Bidireccional & Inbound Master Data | POS + Backend | `bidirectional_cloud_sync_e2e_test.dart` | **COMPLETADO ✅** |
| **Batch 9** | Reportes Administrativos, Analítica de Ventas, Conciliación Fiscal DGI & Exportación Multiformato (JSON/CSV/XLSX/PDF) | Backend | `sales-reports.e2e-spec.ts` (15 E2E tests) + 139 Sales Tests | **COMPLETADO ✅** |
| **Batch 10** | Permisos Granulares de Supervisor, Matriz RBAC, Autorización Dual (PIN & RFC 6238 TOTP), Bitácora Forense & Drawer Logs | Backend | `permissions.e2e-spec.ts`, `supervisor-override.e2e-spec.ts`, `audit-query.e2e-spec.ts` (26 E2E tests) + 131 Identity Tests | **COMPLETADO ✅** |
| **Batch 11** | Automatización de Onboarding, Plantillas de Industria & Carga Masiva (Pre-BOMs, Fiscal Wizard, Chunked Staging) | Backend | `industry-template.e2e-spec.ts`, `fiscal-setup.e2e-spec.ts`, `import-staging.e2e-spec.ts` (29 E2E tests) + 27 Unit Tests | **COMPLETADO ✅** |
| **Batch 12** | Despliegue, Driver AIDL Nativo & Packaging Release Candidate APK para Sunmi V2s (ARM/Universal, ProGuard R8, Checksums SHA-256) | POS (Android) | `test_packaging_pipeline.sh` (5 pipeline tests) + 4 APKs generados en `dist/release_candidate/` | **COMPLETADO ✅** |
| **Batch 13.1**| Abstracción Hexagonal de Pasarelas de Pago, Catálogo de Datáfonos (`datafonos_equipos`) & Adaptadores Mock/Manual | POS + Backend | `card_terminal_port_test.dart` (5 tests) + `manual_standalone_terminal_adapter_test.dart` (5 tests) + `mock_simulator_terminal_adapter_test.dart` (7 tests) + `datafono-equipo.entity.spec.ts` | **COMPLETADO ✅** |
| **Batch 13.2**| Orquestador de Pagos Asíncronos (`CardPaymentOrchestrator`), Idempotencia, Timeouts, Auto-Reversos & Cierre de Lotes (`BatchSettlement`) | POS (FOH/Domain) | `card_payment_orchestrator_test.dart` (7 tests) + `batch_settlement_test.dart` (2 tests) + `card_payment_e2e_integration_test.dart` (3 E2E flows) | **COMPLETADO ✅** |
| **Batch 13.3**| Bridge de Comunicación Local TCP/IP (`LocalNetworkTerminalAdapter`) & UI Modal Interactiva de Datáfono con Fallback Manual en 1 Tap | POS (UI/Hardware) | `local_network_terminal_adapter_test.dart` (6 tests) + `card_terminal_processing_dialog_test.dart` (5 widget tests) | **COMPLETADO ✅** |
| **Batch 14.1**| Motor de Promociones Avanzado y Descuentos Automáticos (2x1, Happy Hour, Categorías, DGI Fiscal Rules) | POS + Backend | `promotions_engine_test.dart` (14 tests) + `promotion_dao_test.dart` (3 tests) + `promotions_integration_flow_test.dart` (4 tests) + `promotions.e2e-spec.ts` (5 E2E tests) + Backend Unit specs | **COMPLETADO ✅** |
| **Batch 14.2**| Directorio Offline de Clientes Frecuentes, Validación Fiscal Cédula/RUC & Vinculación a Factura FOH/DGI | POS + Backend | `nicaragua_fiscal_validator_test.dart` (12 tests) + `customer_dao_test.dart` (3 tests) + `customer_selection_flow_test.dart` (5 widget/flow tests) + `customers.e2e-spec.ts` (6 E2E tests) + Backend Unit specs | **COMPLETADO ✅** |
| **Batch 14.3**| Sistema de Puntos de Lealtad Offline-First, Ledger Inmutable, Redención en Checkout & Sync Cloud | POS + Backend | `loyalty_service_test.dart` (12 tests) + `customer_point_transaction_dao_test.dart` (3 tests) + `loyalty_flow_integration_test.dart` (3 tests) + `loyalty-points.e2e-spec.ts` (3 E2E tests) + Backend Unit specs | **COMPLETADO ✅** |
| **Batch 15.1**| Trazabilidad de Lotes Determinista (`ProductionBatchCodeGenerator`), Vida Útil (`diasVidaUtil`) & Ajuste de Líneas en MovementEngine | POS (Domain/Data) | `production_batch_code_generator_test.dart` (4 tests) + `movement_engine_test.dart` + Freezed models | **COMPLETADO ✅** |
| **Batch 15.2**| Control de Rendimiento (`ProductionVarianceGuard`), Mermas a Cocina (`DESECHO_COCINA`) & Autorización de Supervisor (PIN/TOTP) | POS (Domain/UI) | `production_variance_guard_test.dart` (11 tests) + `production_order_view_model_test.dart` + UI tolerance badges | **COMPLETADO ✅** |
| **Batch 15.3**| Impresión Térmica de Viñeta FIFO 58mm (Sunmi V2s / ESC-POS), Botón de Re-impresión & Flujo Integral E2E de Producción BOH | POS + Hardware | `receipt_58mm_formatter_test.dart` + `sunmi_printer_adapter_test.dart` + `mock_printer_adapter_test.dart` + `production_flow_e2e_test.dart` | **COMPLETADO ✅** |
| **Batch 16.1**| Motores de Cálculo de Split Bills (Partes Iguales + Por Ítems), Propina Voluntaria (10% DGI Non-Taxable) & Evaluador de Modo Operativo (FoodPark QSR vs Restaurant vs Hybrid) | POS (Domain/Core) | `tip_engine_test.dart` (7 tests) + `split_bill_engine_test.dart` (7 tests) + `business_mode_evaluator_test.dart` (4 tests) + `split_bill_integration_flow_test.dart` (3 tests) + `salon_split_bill_responsive_e2e_test.dart` (3 tests) | **COMPLETADO ✅** |
| **Batch 16.2**| Diálogo y Flujo Táctico de Split Bill Responsive (Sunmi V2s <500dp / Tablet >=500dp), Asignación de Ítems & Selector de Propina | POS (UI/Presentation) | `split_bill_dialog_test.dart` (5 tests) + `responsive_split_checkout_test.dart` (2 tests) | **COMPLETADO ✅** |
| **Batch 16.3**| Liquidación de Mesero (`carteraMesero`), Transferencia/Fusión de Mesas con Recálculo y Auditoría Forense FOH + E2E Suite | POS (Domain/UI/E2E) | `waiter_settlement_service_test.dart` (3 tests) + `table_transfer_merge_test.dart` (3 tests) + `restaurant_split_tip_e2e_test.dart` (1 complete flow) | **COMPLETADO ✅** |

---

## ⏳ Prioritized Pending Blocks

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Bloque 17: Multi-Kiosco / Food Park Hub & Ruteo Centralizado de Comandas          │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Bloque 18: Red Local (LAN Broker), Comandas Satélite & KDS Multi-Dispositivo       │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Bloque 19: Facturación Electrónica DGI Nicaragua & Firma Digital XML             │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Bloque 17: Multi-Kiosco / Food Park Hub & Ruteo Centralizado de Comandas
- **PRD Reference**: [`docs/PRDs/Product_Requirement_Document_v2.md`](file:///home/octavio_morales/omnifood-ni/docs/PRDs/Product_Requirement_Document_v2.md)
- **Alcance**: Caja central multi-tenant, ruteo inteligente de comanda por kiosco/cocina y liquidación de locatarios.

### 4. Bloque 18: Red Local (LAN Broker), Comandas Satélite & KDS Multi-Dispositivo Offline
- **PRD Reference**: [`docs/PRDs/Product_Requirement_Document_v2.md`](file:///home/octavio_morales/omnifood-ni/docs/PRDs/Product_Requirement_Document_v2.md) (Sección 2.C)
- **Alcance**: Broker WebSocket/HTTP local embebido, descubrimiento mDNS y sincronización en tiempo real sin internet.

### 5. Bloque 19: Facturación Electrónica DGI Nicaragua & Firma Digital XML
- **PRD Reference**: [`docs/PRDs/prd_modulo_ventas.md`](file:///home/octavio_morales/omnifood-ni/docs/PRDs/prd_modulo_ventas.md)
- **Alcance**: Estructura XML, firma digital PKCS#12, CUFE, código QR y transmisión asíncrona a la DGI.
