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

---

## ⏳ Prioritized Pending Blocks

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Bloque 10: Permisos Granulares de Supervisor, Roles & Auditoría Avanzada (RBAC)   │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Bloque 11: Automatización de Onboarding, Plantillas de Industria & Carga Masiva   │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Bloque 12: Packaging & Release Candidate APK para Hardware Físico Sunmi V2s       │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Bloque 10: Permisos Granulares de Supervisor, Roles & Auditoría Avanzada (RBAC)
- **Slice 10.1**: Matriz de permisos específicos (`sales:void_invoice`, `sales:discount_override`, `cash:manual_drawer_open`, etc.).
- **Slice 10.2**: Trazabilidad y bitácora forense de autorizaciones remotas TOTP y PIN presencial con alertas ante discrepancias de arqueo.

### 2. Bloque 11: Automatización de Onboarding, Plantillas de Industria & Carga Masiva
- **Slice 11.1**: Plantillas de catálogo por industria (Cafetería, Bar/Restaurante, Retail) con Pre-BOMs estructurados.
- **Slice 11.2**: Asistente de configuración fiscal guiada (Régimen Cuota Fija vs General, spread cambiario sugerido).
- **Slice 11.3**: Motor de importación masiva Excel/CSV con tabla de staging, validación previa, resolución de errores y detección inteligente de duplicados.

### 3. Bloque 12: Despliegue / Release Candidate APK para Sunmi V2s
- **Slice 12.1**: Build profiles de producción ARM/ARM64 para hardware Sunmi V2s (360x720dp).
- **Slice 12.2**: Script de empaquetado release candidate y checklist de verificación física en hardware real (impresora 58mm, gaveta RJ11, escáner).
