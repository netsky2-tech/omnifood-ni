# B2e — D-3: the regime is the single source of IVA treatment

Status: IMPLEMENTED — full verification pending push · Branch: `fix/b2e-iva-regime-source` · Worktree: `b2e-iva-regime` · Base: main @ 1a67c616
Basis: D-3 + the "Litigation against D-3" section of the plan. Scout inventory 2026-09-25 (37 literal sites in POS lib, ~80 test sites, backend + dashboard).

## Ratified reading of D-3 (from the plan)

Implement as "regime is the single source of IVA treatment, no literal survives a regime check" — not "delete the 15% constants". The receipt layer already derives `effectiveTaxRate` correctly (`receipt_document.dart:77-78` forces 0.0 under CUOTA_FIJA); the defect is that **defaults, labels, and exports lie independently of that derivation**.

## Design decisions (binding for the units)

1. **Fail-closed defaults**: every `0.15` *fallback default* (freezed model, entity constructor, priming, sync, product editor) becomes `0.0`. A product without an explicit synced rate is treated as exempt, never silently taxed at an invented 15%. The backend payload is the rate's source of truth; activation priming writes regime before products, so the offline race window is bounded.
2. **Historical schema**: SQLite cannot ALTER COLUMN DEFAULT — the `0.15` DDL default is permanent and documented as historical. The application layer never trusts it over the regime. New migration: reconcile `invoice_items.original_tax_rate/applied_tax_rate` and `products.tax_rate` **only where the device regime is CUOTA_FIJA** (join `local_configs`) → set to 0.0. Backend column default stays (historical), no backfill of values.
3. **Labels lose the hardcoded percentage**: `'IVA (15%)'` / `'IVA 15%'` become regime-aware:
   - CUOTA_FIJA → the IVA amount line is **omitted** where the receipt layer already omits it; the X/Z report and audit dashboard print the existing `fiscalNotice` (`NO RECAUDA IVA`) instead of an IVA line that contradicts the tickets. The IVA **amount** row is not fabricated.
   - REGIMEN_GENERAL → label shows the actual configured rate when available, else plain `'IVA'`. Percentage strings are derived, never literal.
   - `split_bill_dialog.dart` `15%` tip chip is **NOT IVA** (scout-verified) — left untouched.
4. **Backend export labels** (`sales-export.service.ts` CSV/Excel/PDF) derive from the fiscal config (`taxRateIva` + regime) — a Cuota Fija sales book must not carry `IVA 15%` headers.
5. **Fixtures/demo/hardware-test samples** (`database_seeder`, `receipt_preview_dialog`, `hardware_settings_view_model`) derive from the active regime instead of literal 0.15.
6. Dashboard fiscal-setup labels are already regime-conditional — untouched.

## Work units

1. **U1 POS fail-closed defaults** — `product.dart @Default(0.0)` (+ build_runner regen), `product_entity.dart`, `activation_priming_service.dart`, `sync_service.dart`, `insumo_view_model.dart`; new SQLite migration per decision 2; CUOTA_FIJA-specific tests.
2. **U2 POS labels + plumbing** — `sale_view`, `sales_history_view` (plumb regime/rate), `dgi_report_view_model` + `dgi_report_view` (X/Z + audit cards), `receipt_layout_formatter` (4 sites); rework `receipt_preview_dialog_test` assertions.
3. **U3 backend export labels** — `sales-export.service.ts` derives from config; spec rework.
4. **U4 fixtures** — seeder, receipt preview sample, hardware test print derive from regime.

Verification: per-unit suites + full POS/backend pass + analyze; PR.

## Non-goals

- No changes to tip presets (2E).
- No new TAX_RATE_IVA projection to the POS in this batch (labels derive from what each surface already has; plumbing `taxRate` into the fiscal snapshot keys is a separate, optional follow-up if the owner wants percentage display).
- No DGI interpretation: the CF X/Z prints the notice, the data columns stay truthful; format questions go to the contadora.
