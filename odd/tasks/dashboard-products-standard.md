# Feature: Dashboard Products Module — NHILoS Backoffice Standard & Form Sanitization (Batch 1)

- **Branch / Worktree:** `feat/dashboard-products-standard` @ `.worktrees/dashboard-products-standard` (off `main` 93c89c4d)
- **Authority:** NHILoS Backoffice Experience Standard v1.0 (`docs/nhilos/nhilos_backoffice_experience_standard_v1.0.md` §7, §18.2/18.3, §26, §30, §41, §46), User Directive (Batch 1: `/products` standard, Activo badge contrast, form sanitation, brand luxury +1).

## Specs

- **S1 (Status Badge Standard):** Product status badge renders with high contrast and dual-channel signaling (dot + text label per §46):
  - `Activo`: `bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`, dot `bg-emerald-500`.
  - `Inactivo`: `bg-muted text-muted-foreground`, dot `bg-muted-foreground`.
- **S2 (Form Sanitization & Validation):** Product create/edit forms adhere to §18.2/§18.3 and §30:
  - Form carries `noValidate` attribute to suppress native browser balloons.
  - Field errors render in Spanish directly beneath inputs with `aria-invalid` and `aria-describedby`.
  - Inputs sanitized on submit (trimmed strings, sanitized numbers via `toFiniteNumber`).
  - Submit button disabled with loading indicator during mutations.
- **S3 (NHILoS Backoffice Experience Layout & Luxury):**
  - Header establishes context ("¿Dónde estoy?" §7): "Productos" with clear operational description.
  - KPI summary cards above table: Total, Activos, Inactivos, Con Receta (§41 Summary -> Detail).
  - Search bar with clear action and item count summary.
  - Table columns formatted with `tabular-nums` for prices (`C$ XX.XX`) and stock.
  - Accessible, polished dialogs for product creation and edition.
- **S4 (Testing & Verification):** Unit, validation, and accessibility tests verifying S1-S3 without regression in existing product suites.

## Tasks

- [x] **T1:** Implement high-contrast `ProductStatusBadge` for product lifecycle state (S1). Commit: `4c1e171c`.
- [x] **T2:** Refactor `ProductDialog` with sanitized form validation, `noValidate`, accessible errors (`aria-invalid`, `aria-describedby`), and polished inputs (S2). Commit: `4c1e171c`.
- [x] **T3:** Enhance `ProductPage` layout with summary KPI cards, clear header hierarchy, and tabular data styling (S3). Commit: `4c1e171c`.
- [x] **T4:** Run and update test suites in `apps/owner_dashboard` to verify all standard requirements (S4). Verified: 47/47 tests passing across 5 suites (`products-standard-compliance`, `w5-products`, `product-type-create`, `product-type-edit`, `products-decimal-contract`).

## Log

- L1: User authorized Batch 1 (Dashboard `/products` standard, Activo badge contrast, form sanitation, luxury feel).
- L2: Implemented ProductStatusBadge with emerald dot + high-contrast label (§26, §46).
- L3: Wired accessible error messages and noValidate on ProductDialog form.
- L4: Added SummaryCards above product table and polished header per NHILoS §7 & §41.
- L5: Verified 47/47 tests passing and tsc --noEmit clean.
