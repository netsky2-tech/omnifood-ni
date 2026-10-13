# Feature: Products UX Hardening — Prefill, Validators, Badge Contrast, Reactivate

- **Branch / Worktree:** `fix/products-ux-hardening` @ `.worktrees/products-ux-hardening` (off `main` f8a9fa4d)
- **Authority:** NHILoS Backoffice Experience Standard v1.0 (§18 form sanitation, §26 statuses, §34 honest display, §30 error handling), User report (4 defects), backend DTO contracts.

## Specs

- **S1 (Edit prefill — honest display):** The UOM and Categoría selects in `ProductDialog` must always DISPLAY the saved value when editing, even when the catalog options load asynchronously or the saved code is missing from the catalog (synthetic "(valor actual)" option, never fabricated — §34).
- **S2 (Validators aligned with backend DTO):** `productFormSchema.uom` gains `.max(32)` matching `CreateProductDto @MaxLength(32)`; name 200 and sellPrice rules unchanged.
- **S3 (Active badge contrast):** Active badge uses the app's strong lifecycle pattern `bg-emerald-100 text-emerald-800 border-emerald-300` (dark: `dark:bg-emerald-900/50 dark:text-emerald-300 dark:border-emerald-800`); dot `bg-emerald-600`. Inactive unchanged.
- **S4 (Reactivate action):** Inactive product rows show a "Reactivar" action calling `useUpdateProduct` with `{ is_active: true }`; toast confirms; audit trail rides the existing update path.

## Tasks

- [x] **T1+T2:** Controlled uom select + synthetic "(valor actual)" option for UOM and Categoría (S1). Commit: see below.
- [x] **T3:** Schema `uom.max(32)` aligned with backend DTO (S2).
- [x] **T4:** Badge palette `bg-emerald-100 text-emerald-800 border-emerald-300`, dot `bg-emerald-600` (S3).
- [x] **T5:** Reactivate action for inactive rows via `PATCH is_active: true` (S4).
- [x] **T6:** Verified: RED (5 new failing tests) → GREEN **66/66** across 6 product suites, `tsc -b --noEmit` clean.

## Log

- L1: User reported: edit dialog shows empty UOM/Categoría selects; saves despite empty-looking selects; badge background reads gray with emerald letters (bad contrast); no way to reactivate a deactivated product.
- L2: Diagnosis: uncontrolled select + async React Query options reset DOM value to "" after mount (edit kept the saved RHF value and "saved while displaying empty"); schema lacked uom max(32) enforced by backend DTO; bg-emerald-50 too pale; reactivation had no control though backend PATCH accepts is_active.
