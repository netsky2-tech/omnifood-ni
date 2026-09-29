# Soho Catalog Dashboard Management & Insumos Maintenance

## Goal
Enable full catalog & inventory maintenance from Owner Dashboard according to NHILOS standard (+1 experience), empowering the owner to manually create and edit insumos, products, and recipes, as well as providing an easy-to-use structured import template and automated seeder for SOHO's full menu.

## Context
- Insumos currently have no `POST` or `PUT` endpoints in `InsumoController` (only `GET /insumos`).
- Owner Dashboard has no UI to create or edit Insumos (only lists them inside recipe forms).
- SOHO has 37 products, ~30 insumos, and versioned recipes (coffee 8/12/16oz, brunch, desserts) detailed in `odd/plans/soho-integration-test-plan.md`.
- SOHO owner needs both:
  1. Manual maintenance from Dashboard (Insumos, Products, Recipes).
  2. Easy-to-use template & automated provisioning for the full SOHO menu.

## Slices
- **Slice 1 (Backend)**: Add `POST /insumos` and `PUT /insumos/:id` to `InsumoController` with DTOs, RLS tenant isolation, role guards (`OWNER`, `MANAGER`), and unit tests. ✅ DONE (8/8 tests green).
- **Slice 2 (Dashboard UI — Insumos)**: Insumos management tab in `inventory-page.tsx` with search, stats, empty state, and creation/editing dialog adhering to NHILOS backoffice experience standard.
- **Slice 3 (Dashboard UI — Compras)**: Purchases surface exists only in the POS today; the backend exposes `POST /inventory/purchases` but there is no `GET` listing and no web page. Add the read/list endpoint (date range, supplier, insumo filters, paginated, OWNER/MANAGER oversight) plus a "Compras" tab/page in the owner dashboard so the owner can review purchase history and costs from the office. (Recording new purchases from the web is a product decision: keep authoring on the POS for now, visibility + history on the web — flagged in `odd/plans/soho-integration-test-plan.md` §FASE 0.2.)
- **Slice 4 (SOHO Menu Seeder & Template)**: Complete SOHO menu data seeder (`seed-soho-catalog.ts`) and user-friendly CSV import template, both loadable and maintainable from the dashboard. ✅ DONE — seeder: commit `5a32a9c6`, comando `npm run seed:soho-catalog -- --tenant-id <uuid>`, cargas: 30 insumos / 36 productos / 32 recetas / 93 detalles de receta. Import de menú (Excel): DONE — backend preview/commit/template commit `739ae304`, wizard de dashboard commit `73e1cd66`.
  - **Advertencias de datos del plan (11) que el seeder surfacea** — corregir por el owner en la pestaña Insumos antes de registrar compras reales:
    1. Miel — factor de conversión defaulteado a 1.
    2. Yogurt griego — factor de conversión defaulteado a 1.
    3. Mermelada — factor de conversión defaulteado a 1.
    4. Sirope de chocolate — factor de conversión defaulteado a 1.
    5. Sirope de caramelo — factor de conversión defaulteado a 1.
    6. Matcha — factor de conversión defaulteado a 1.
    7. Mantequilla de maní — factor de conversión defaulteado a 1.
    8. Hielo omitido en Matcha Fresa.
    9. 4 galletas SIMPLE sin receta.
    10. Rangos ~10-12 usados como 10.
    11. "Qeso frito" normalizado.
- **Slice 5 (Verification)**: Test suite verification across backend and dashboard.

## Open items
- **ABIERTO**: las 11 advertencias de datos del seeder (ver Slice 4) deben corregirse por el owner en la pestaña Insumos antes de registrar compras reales.
