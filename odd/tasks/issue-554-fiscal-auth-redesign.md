# #554 — Fiscal authorization redesign (D-21): no range, code + dates + consecutivos

Status: IN PROGRESS · Branch: `feat/554-fiscal-auth-redesign` · Worktree: `issue-554-fiscal-auth`
Blocked-on status: **UNBLOCKED by D-21** (2026-09-25 owner ruling relayed from the contadora). The letter was awaited to supply numbers; the ruling supplied a model — and the model retires the range.

## Why the design changed

The original issue said "load SOHO's real range". D-21 (see plan, Owner directives) rules there is **no range for sistemas computarizados** — only consecutive numbering. Rangos belong to manual/pre-printed invoices. What the authorization letter actually carries is a **code** (format unknown, e.g. `DGI-SFC-2024-00123`, `RES-SFC-145-2025`), **emission/expiry dates**, and the starting consecutivo.

Current-state findings (scout-verified, parent-confirmed):

- `dgi_authorization_code` is an **orphan**: saved by the POS form, zero consumers (not printed, not synced). Confirms the #540 definición≠feature class.
- No emission/expiry fields exist anywhere.
- Range fields (`dgi_range_start`, `dgi_range_end`) + the exhaustion gate (`isRangeExhausted`, `FISCAL_SEQUENCE_EXHAUSTED`) govern a concept D-21 retires.
- Backend `FiscalSetupDto` has no authorization fields; `dgi_*` keys are POS-local (`local_configs`), never leave the device.
- `dgi_prefix` is a single global config row; prefix is currently **required** by the form validator — D-21 makes it optional (single caja → purely numeric consecutive).
- `dgi_current_number` IS the cursor, shown as "Siguiente Factura a Emitir".

## Target model

| Field | Storage (POS) | Storage (server) | Rules |
|---|---|---|---|
| Authorization code | `dgi_authorization_code` (existing key) | `SystemParametersConfig` row `DGI_AUTHORIZATION_CODE` | string ≤50; charset `[A-Za-z0-9\-/]` only (guiones y barras); no mask; placeholder as help. Optional-until-letter, then required for go-live (D-4 gate unchanged). |
| Emission date | `dgi_authorization_issued_at` (new) | row `DGI_AUTHORIZATION_ISSUED_AT` | ISO-8601 date. |
| Expiry date | `dgi_authorization_expires_at` (new) | row `DGI_AUTHORIZATION_EXPIRES_AT` | ISO-8601 date. **Fixed 30-day warning** (owner decision): banner on POS config + dashboard when ≤30 days remain; expired → stronger warning, never a hard block (no DGI interpretation by the system). |
| Consecutivo inicial | `dgi_range_start` (existing key, **relabeled**, no rename/migration) | not server-managed | seeds the cursor at first config (existing `initializeRange` behavior). |
| Consecutivo actual | `dgi_current_number` (existing) | not server-managed | auto-incremental; stays editable in the form because it is the D-6 `FISCAL_SEQUENCE_RECOVERY_REQUIRED` human recovery entry — relabeled "Consecutivo actual (auto-incremental)". |
| Prefix/serie | `dgi_prefix` (existing) | not server-managed | **optional now**; empty → folio is the plain numeric consecutivo (no prefix, no padding). Editable data, never an enforced serie (D-2/D-21). |
| Range end | `dgi_range_end` — **RETIRED** | — | no UI input; no exhaustion gate; key ignored on read, deleted opportunistically. |

Sync: the three authorization fields ride the existing fiscal snapshot (`EffectiveFiscalPayload` + `FiscalConfigSnapshot` + `FiscalInboxHandler` projection), same pattern as `ruc`. POS form remains the offline master of its local keys; server revision still wins on apply (unchanged policy).

## Out of scope (deferred, recorded)

- **Per-terminal series** (2+ cajas → A-001…/B-001…): design note only, own issue. Today's tenant-wide sequence is correct for single-caja SOHO; the gap (two terminals would race on `dgi_current_number`) goes into that issue.
- #551 (remaining cloud projection) — untouched; this adds only the 3 authorization fields.
- B6c letter review — needs the physical letter; the model above is letter-ready.

## Work units (TDD, one commit each)

1. **U1 backend** — `FiscalSetupDto` + charset/length validation, 3 `SystemParametersConfig` rows, `EffectiveFiscalPayload`/snapshot extension, unit+db specs.
2. **U2 POS form** — remove range inputs; authorization code validation (≤50, charset) + placeholder; issued/expiry date fields; relabels; key retirement of `dgi_range_end`.
3. **U3 POS numbering** — prefix optional → plain numeric folio when empty; delete exhaustion gate + `FISCAL_SEQUENCE_EXHAUSTED` (UNCONFIGURED stays); D-18 tests updated: cursor-never-retreats remains, exhaustion tests die with the gate.
4. **U4 POS expiry warning** — 30-day banner (config surface + sale screen entry), tests.
5. **U5 dashboard** — 3 fields in `FiscalSetupForm` + expiry banner, vitest.

Verification: per-unit suites + final full pass (flutter analyze, POS suite `--concurrency=1`, backend jest incl. db specs + route-transport, dashboard vitest).
