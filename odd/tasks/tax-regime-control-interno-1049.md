# Feature: CONTROL_INTERNO Non-Fiscal Mode for Unregistered Small Businesses (#1049)

- Branch: `feat/tax-regime-control-interno-1049`
- Issue: `#1049`
- Normative context: Nicaragua Ley 822 (Cuota Fija arts. 245–259), Ley 562 (Código Tributario — prohibits unauthorized invoices or IVA collection by non-registered persons), DT 09-2007 (`docs/DGI/dgi_marco_normativo_dt09_2007.md`). `CONTROL_INTERNO` never weakens `REGIMEN_GENERAL` or `CUOTA_FIJA`; it provides a legally honest non-fiscal control mode until formalization.

## Specs

- **S1 — Backend `CONTROL_INTERNO` Fiscal Setup & Readiness:**
  - Add `CONTROL_INTERNO` to `FiscalRegime` enum (`fiscal-setup.dto.ts`, `fiscal-setup.service.ts`, `fiscal-readiness.adapter.ts`).
  - Under `CONTROL_INTERNO`: `ruc` is optional (`null` or blank allowed; if non-blank, still validated via `isValidRuc`), `TAX_RATE_IVA` is forced to `0`, and `evaluateFiscalReadiness` passes without requiring `ruc`.
  - Under `CUOTA_FIJA` and `REGIMEN_GENERAL`: existing `ruc` requirement and IVA rules remain 100% unchanged.
- **S2 — POS `TaxRegime.controlInterno`, 0% IVA, Auto-Numbering & Honest Receipt:**
  - Add `TaxRegime.controlInterno` (`'CONTROL_INTERNO'`).
  - `InvoiceFiscalCalculator` forces `appliedRate = 0.0` and `taxAmount = 0.0` for all lines under `CONTROL_INTERNO`.
  - `ReceiptDocument` & `ReceiptLayoutFormatter`: title **`NOTA DE VENTA`**, mandatory footer **`DOCUMENTO NO FISCAL`** / **`SOLO CONTROL INTERNO`**, omits `RUC:` when blank, omits `IVA:` / `VENTA EXENTA`, omits `Autorización DGI:`, and NEVER prints `FACTURA DE VENTA`, `REGIMEN: CUOTA FIJA`, or `CONTRIBUYENTE DE CUOTA FIJA`.
  - `BusinessProfileView` & `BusinessProfileViewModel`: 3-option selector (`Control Interno (No inscrito)`, `Cuota Fija`, `Régimen General`); under `CONTROL_INTERNO`, `ruc` is optional and saving auto-initializes `dgi_prefix = 'NV-'` and `dgi_current_number = 1` if unconfigured. Switching later to `CUOTA_FIJA` or `REGIMEN_GENERAL` requires valid `ruc` and preserves prior `NV-` history.
- **S3 — Owner Dashboard Fiscal Settings UI:**
  - Add `CONTROL_INTERNO` to `apps/owner_dashboard/src/features/settings/` (`types.ts` and fiscal setup form): 3-option selector, optional `ruc` when `CONTROL_INTERNO`, clear non-fiscal disclaimer, and unchanged validation for `CUOTA_FIJA`/`REGIMEN_GENERAL`.
- **S4 — Real Samsung Galaxy S23 Hardware E2E (Zero Mocks):**
  - `apps/pos_app/integration_test/control_interno_s23_hardware_e2e_test.dart` on real Samsung Galaxy S23 (`R5CWB2LQJDJ`, ARM64): verifies `CONTROL_INTERNO` setup without RUC, auto-init `NV-00000001`, 0% IVA on taxed items, honest `NOTA DE VENTA` + `DOCUMENTO NO FISCAL` receipt text, and clean upgrade to `REGIMEN_GENERAL` (`F-00000001`, 15% IVA) preserving prior `NV-` history.

## Tasks

- [x] `T1` (S1) [worker] Backend `CONTROL_INTERNO` regime in `FiscalSetupDto`, `FiscalSetupService`, `FiscalReadinessAdapter`, `FiscalConfigVersionService` + unit/controller tests — commits: `85d3c1cf`, `2757f2e9`
- [x] `T2` (S2) [worker] POS `TaxRegime.controlInterno`, `InvoiceFiscalCalculator`, `ReceiptLayoutFormatter`, `BusinessProfileView`/`ViewModel`, `DgiNumberingServiceImpl` + Flutter tests — commits: `ebb738a7`, `ad18e5e7`, `24b2c04b`
- [x] `T3` (S3) [worker] Owner Dashboard `CONTROL_INTERNO` fiscal settings UI + NHILOS Luxury +1 transition card + dashboard KPIs + Vitest & build — commits: `e59a499d`, `2757f2e9`, `ad18e5e7`
- [x] `T4` (S4) [worker + S23 hardware] Real Samsung Galaxy S23 (`SM_S918B`, `R5CWB2LQJDJ`, ARM64, zero mocks) hardware E2E (`control_interno_s23_hardware_e2e_test.dart`, real `invoiceDao` + `NV-00000027` isolation) — **3/3 `ALL_TESTS_PASSED`** — commits: `ad18e5e7`, `24b2c04b`
- [x] `T5` (S1–S4) [verify] Independent `gentle-ai-verify` (Risk: item 3; caught B1/B2/A1, all fixed & re-verified; byte-identical `CUOTA_FIJA` & `REGIMEN_GENERAL` receipts confirmed) — ready for PR closing `#1049`

## Log

- **L1 (User request verbatim):** `Antes de ir con otra issue, tengo una duda que se me despartó mientras trabajabamos en temas de consecutivos y DGI. Pasa que le ofrecemos el producto a negocios pequeños, como pulperias, ferreterias y demas. Si son negocios no inscritos todavía o que figuran bajo persona natural sin negocio formalizado, pero quieren llevar su control. Como estamos frente a ese escenario. Investiguemos y veamos como lo vamos a afrontar por que es un blocker real que nos vamos a encontrar frente a clientes que inicial o tienen negocios pequeños`
- **L2 (User decision):** Selected `Crear issue e implementarlo ahora mismo` -> opened `#1049`.
- **L3 (User refinement verbatim):** `Hay que ver bien el tema de lo que dirá el ticket para no romper las leyes, ni promoter contribuidor  o "Factura". y le evolucion de negocio informal a negocio inscrito como cuota fija o regimen general. Para que la transición sea natural, fluida y sin trabas y que el diseño del ticket respete toda reestricción y cumpla con las leyes. Sin alterar los 2 perfiles que ya funcionan bien.`
  - Strict ticket rules for `CONTROL_INTERNO`: title `NOTA DE VENTA`, mandatory lines `DOCUMENTO NO FISCAL`, `NO VALIDO COMO FACTURA`, `SOLO CONTROL INTERNO`; NEVER print `FACTURA`, `CONTRIBUYENTE`, `REGIMEN:`, `RUC:`, `IVA:`, `VENTA EXENTA`, or `Autorización DGI:`.
  - Smooth formalization transition: switching from `CONTROL_INTERNO` to `CUOTA_FIJA` or `REGIMEN_GENERAL` clears internal `NV-` prefix (never emits a fiscal invoice with `NV-`), prompts cleanly for RUC/cédula and initial DGI consecutive, and leaves prior `NV-` history untouched.
  - Zero changes to `CUOTA_FIJA` and `REGIMEN_GENERAL` receipt output.
