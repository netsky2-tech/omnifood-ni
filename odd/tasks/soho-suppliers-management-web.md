# SOHO — Gestión de Proveedores en Web (BXW-001)

## Goal
Implementar la gestión completa de proveedores en el backoffice web (Owner Dashboard) para el go-live de SOHO:
1. Backend: endpoint `PUT /inventory/suppliers/:id` (actualización de datos y estado `is_active`) + soporte de `includeInactive` en `GET /inventory/suppliers`.
2. Frontend: pestaña "Proveedores" en `/inventory` con tabla, búsqueda, filtro activo/inactivo, modal de alta/edición y acciones de activación/desactivación bajo el estándar NHILOS v1.0.

## Criterio de Alcance (Office vs Floor)
- Proveedores es 100% master data y gestión comercial de oficina.
- No se replica en web la operación de piso (mesas, comandeo, órdenes vivas) conforme a la definición del fundador.

## Tasks
- [x] Task 1: Backend DTOs y lógica de servicio (`UpdateSupplierDto`, `includeInactive` en `listSuppliers`, `updateSupplier` con RLS y chequeo de duplicados + unit tests)
- [x] Task 2: Backend Controller y tests E2E (`PUT /inventory/suppliers/:id` con guards OWNER/MANAGER + tests de integración)
- [x] Task 3: Dashboard API client y hooks (`UpdateSupplierInput`, `updateSupplier`, `useSuppliers` con `includeInactive`, `useUpdateSupplier`)
- [x] Task 4: Dashboard UI componente `SuppliersTab` y registro en `inventory-page.tsx` (estándar NHILOS: badges neutros §26, validaciones §17/§40, acciones accesibles)
- [x] Task 5: Testing integral de UI y Backend (vitest para `suppliers-tab`, jest e2e para suppliers, verificación de tipos y lint)

## Evidence & Verification
- Backend tests:
  - `src/modules/inventory/inventory-purchase.service.spec.ts` (39/39 passing)
  - `src/modules/inventory/inventory-movement.controller.spec.ts` (41/41 passing)
  - `test/inventory/purchase-routes.e2e-spec.ts` (27/27 passing)
  - `src/core/http/route-transport-registry.spec.ts` (15/15 passing)
  - `nest build` limpio
- Dashboard tests:
  - `src/__tests__/suppliers-tab.test.tsx` (11/11 passing)
  - `src/__tests__/purchases-tab.test.tsx` (27/27 passing)
  - `src/__tests__/insumos-manage.test.tsx` (27/27 passing)
  - `typecheck` (`tsc -b --noEmit`) limpio
  - `oxlint` limpio
