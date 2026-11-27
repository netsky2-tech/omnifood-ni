# Feature: DGI Field Inventory & Primary-Source Normative Framework (#540 & #533)
- Branch: `feat/dgi-540-533-compliance-inventory`
- Issues: `#540` (field inventory T1–T4 & zero hardcoded fiscal literals) · `#533` (DGI primary sources & `AGENTS.md` article-level citations)

## Specs
- **S1 (`#540` AC-4 — Remove unverified `'** VENTA EXENTA DE IVA - POLITICA TEMPORAL **'`):**
  "The \"temporary policy\" exemption line is either removed or replaced with the actual legal basis confirmed in writing by the accountant (#535 Q3c) — we do not print a legal characterization we have not had anyone verify."
  Since `#535 Q3c` has no written accountant confirmation, remove `'** VENTA EXENTA DE IVA - POLITICA TEMPORAL **'` from `ReceiptLayoutFormatter` (both 58mm/80mm text and ESC/POS builders).
- **S2 (`#540` AC-2 & AC-5 — Wire `legal_footer` & explicit `customerRuc`):**
  "No DGI-required datum is client-editable without a consumer — an input that saves and is ignored is a defect in its own right." / "`legal_footer` is wired or deleted; a config key with no reader is the same defect class as AC-2."
  Wire `local_configs['legal_footer']` → `PrinterConfigService` → `PrinterConfig.legalFooter` → `PrinterPort.printInvoice(..., footerMessage:)` / all adapters (`MockPrinterAdapter`, `SunmiPrinterAdapter`, `IposPrinterAdapter`, `UnavailablePrinterAdapter`) → `SaleViewModel` → `ReceiptDocument.footerMessage`. Also pass `customerRuc: invoice.customerTaxId` explicitly from `SaleViewModel` to `PrinterPort.printInvoice` and `ReceiptDocument.fromInvoice`.
- **S3 (`#540` AC-3 — Eliminate hardcoded `'OMNIFOOD NI'` fiscal fallbacks):**
  "Zero hardcoded fiscal literals remain in print or numbering paths: every one is either a configuration read or a loud failure."
  Remove `'OMNIFOOD NI'` fallbacks in `PrinterConfig` (`@Default('')`), `PrinterConfigService` (`''` when unconfigured), `ReceiptDocument.fromInvoice` (preserve `''`, never substitute `'OMNIFOOD NI'`), `InvoiceFiscalCalculator` (never substitute `'OMNIFOOD NI'`), and `DgiReportViewModel` (read configured `business_name`, never print hardcoded `"OMNIFOOD NI - REPORTE X/Z"`). Do not print blank business-name header lines when unconfigured.
- **S4 (`#540` AC-1 & `#533` D5 — Canonical DGI normative doc + updated T1–T4 inventory + `AGENTS.md` citations):**
  Create `docs/DGI/dgi_marco_normativo_dt09_2007.md` separating NORMA (verbatim DT 09-2007 *La Gaceta No. 134, 16-Jul-2007*, LCT Arts. 124/143.3/148, Reglamento Arts. 100.1/g & 101, CTr Arts. 103/127/129/137, Ley Monetaria Arts. 1 & 3), PRACTICE, OUR DECISION, open `#535` accountant items, and the re-verified `#540` T1–T4 inventory table (`a`–`l`). Update `AGENTS.md` to replace the bare DT 09-2007 mention with article-level citations and mandatory reference to `docs/DGI/dgi_marco_normativo_dt09_2007.md`.
- **S5 (User follow-up — Configurable temporary VAT exoneration legal basis for MHCP–INTUR–DGI holiday decrees):**
  Add editable `tax_exemption_reason` (`local_configs['tax_exemption_reason']`, Business Profile UI → `PrinterConfig.taxExemptionReason` → `PrinterPort` / adapters → `SaleViewModel` → `ReceiptDocument.taxExemptionReason` → `ReceiptLayoutFormatter` 58mm/80mm text & ESC/POS on exempt Régimen General receipts; blank omits line, never fabricates `'POLITICA TEMPORAL'`). Document MHCP–INTUR–DGI agreements (`AVISO-148-08-2025` / `dgi.gob.ni/getDoc/1050`) in `docs/DGI/dgi_marco_normativo_dt09_2007.md` and open a Stage 1 GitHub issue for date-scheduled automatic VAT-free windows + VET exportable report in Owner Dashboard.

## Tasks
- [x] **T1** (`S1, S3`) Remove `'** VENTA EXENTA DE IVA - POLITICA TEMPORAL **'` and `'OMNIFOOD NI'` fiscal fallbacks with TDD (RED→GREEN) — route: inline — commit: `ae8bd0c3`
- [x] **T2** (`S2`) Wire `legal_footer` end-to-end (`local_configs` → `PrinterConfig` → `PrinterPort` → adapters → `SaleViewModel` → `ReceiptDocument`) and pass `customerRuc` explicitly with TDD — route: inline — commit: `ae8bd0c3`
- [x] **T3** (`S4`) Author `docs/DGI/dgi_marco_normativo_dt09_2007.md` (with re-verified `#540` T1–T4 table and `#533` primary sources) and update `AGENTS.md` article-level citations — route: inline — commit: `ae8bd0c3`
- [x] **T4** (`S5`) Wire configurable `tax_exemption_reason` (T1–T4) for MHCP–INTUR–DGI holiday VAT exonerations + open Stage 1 GitHub issue (`#1042`) for scheduled windows & VET report — route: inline — commit: `ae8bd0c3`
- [x] **T5** (`S1-S5`) Run targeted Flutter test suites (140/140 + 15/15 independent probes + `flutter analyze` clean) + independent `gentle-ai-verify` + open PR closing `#540` and `#533` — route: verify — commit: `pending`

## Log
- **L1 (user):** "· #540 (inventario de campos DGI) · #533 (fuentes primarias DGI)"
- **L2 (user):** "Perfecto, pero algo importante con el \"venta exente de IVA\", y acá debes detenerte a investigar. El gobierno a veces lanza comunicados de ventas sin IVA por un tiempo determinado, por ejemplo este año lo hicieron para las fiestas patrias, también lo suelen hacer para semana santa por las vacaciones. Entonces la app debe estar preparada para estos escenarios, busca bien acerca de ello." -> User selected: `field_now_schedule_later` (configurable `tax_exemption_reason` now + Stage 1 issue for scheduled date windows & VET export).
