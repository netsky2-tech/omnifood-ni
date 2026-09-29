# NHILOS audit + fixes — Inventory surfaces (Insumos / Compras / Menu Import)

## Goal
Auditar con `docs/nhilos/nhilos_backoffice_module_audit_template_v2.1.md` los 3 componentes de UI
entregados en el go-live stack de SOHO y corregir TODOS los hallazgos REQUIRED/REFINEMENT antes de
seguir el go-live. Sin deuda técnica.

## Superficies en alcance
- `apps/owner_dashboard/src/features/inventory/insumos-tab.tsx`
- `apps/owner_dashboard/src/features/inventory/purchases-tab.tsx`
- `apps/owner_dashboard/src/features/settings/menu-import-wizard.tsx`
- (contexto: `inventory-page.tsx` tabs wiring)

## Hallazgos preliminares (pase manual, sin plantilla — confirmar/ampliar con auditoría formal)
1. REQUIRED §13.1/§14.2 — búsqueda sin botón de limpiar/reset en ambos tabs.
2. REQUIRED §15 — `purchases-tab` `limit: 200` silencioso, sin "Mostrando X de Z".
3. REQUIRED §20/§4.1 — dialog de insumos: Esc/click-fuera descarta lo tipeado sin warning (dirty state).
4. REQUIRED §18.2/AP-10 — `insumos-tab:175` usa `err.message` crudo en vez de `getApiErrorMessage`.
5. REFINEMENT §18.3 — sin focus/scroll al error de submit.
6. REFINEMENT §19.1 — ancho de botón no preservado ("Crear Insumo" → "Guardando...").
7. REFINEMENT §12.3/§42.6 — stat cards sin `tabular-nums`.
8. REFINEMENT §46 — botón icon-only de editar con `title` en vez de `aria-label`.

## Plan (evidencia separada de corrección)
- [ ] Slice A — Auditoría formal con plantilla v2.1 → `docs/audits/nhilos-inventory-surfaces-audit-v1.md` (read-only, subagente)
- [ ] Slice B — Corrección de todos los hallazgos + acceptance tests (writer, superficies acotadas)
- [ ] Slice C — Re-auditoría (§34) + verdict §36 + verificación suites (verify)
- [ ] Slice D — Commit + PR

## Evidence
- (pendiente)
