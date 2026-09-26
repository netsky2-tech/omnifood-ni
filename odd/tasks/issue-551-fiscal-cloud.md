# #551 — Fiscal facts reach the cloud (+ D-17→D-21 consolidation)

Status: IMPLEMENTED — full verification pending push · Branch: `feat/551-fiscal-cloud-projection` · Worktree: `issue-551-fiscal-cloud` · Base: main @ a90e6630 (includes #554/D-21)

## Decision recorded (owner, 2026-09-25): CONSOLIDATE on D-21

The D-17 legacy pair (`dgi_authorization_date` "Fecha de Respaldo", `dgi_authorization_document` "Documento de Respaldo") is **deprecated and removed** from the POS form. The D-21 model — code + emission + expiry, backend-canonical — is the single authorization model. Rationale: the contadora's D-21 ruling defined exactly those three facts; the resolution reference already lives inside the code format (e.g. `RES-SFC-145-2025`); two parallel date schemas would be a definición≠feature defect. Legacy keys in existing `local_configs` rows are simply ignored on read (no destructive migration).

## Scope (from the issue + scout evidence)

Five fields never reached the cloud. After #554, the remaining gaps:

| Field | Fix |
|---|---|
| `shift_id` (POS invoice column, populated at checkout) | POS `SalesMapper.toSyncJson` adds it; backend `SyncInvoiceDto` whitelists `shift_id`; backend `invoices` gains a nullable column (RLS-safe, **no backfill** — D-9: the data never existed server-side) |
| `local_issue_date` (POS invoice column, fixed at issuance) | same path |
| `fiscal_header_snapshot` | **stays excluded** (intentional per issue: immutable on-device snapshot, not a cloud fact) |
| D-17 pair | **removed from the POS form** (consolidation above); no cloud pathway needed anymore |
| D-21 trio cloud→POS | already shipped in #554 (FiscalProjectionKeys mirrors + backend params) |

## Why it matters (from the issue)

The D-15 void guard ("own invoice + open current shift + same local calendar date") is structurally impossible server-side without `shift_id` + `local_issue_date` traveling. The cloud mirror diverges by design until this ships.

## Work units (TDD)

1. **U1 POS consolidation** — remove the D-17 form inputs + printer-config model fields (grep consumers first: `printer_config_service.dart`, `printer_config.dart`, form, tests); legacy keys ignored on read; tests updated.
2. **U2 POS sync payload** — `toSyncJson` emits `shiftId` + `localIssueDate`; tripwire-style tests (payload contains the fields; cross-check the #548 full-column pattern).
3. **U3 backend receipt** — `invoices` entity + migration (nullable `shift_id`, `local_issue_date`), `SyncInvoiceDto` whitelist, persistence through the existing upsert, unit + db specs, route-transport untouched (no new routes).
4. **Verification**: POS + backend full suites, analyze; PR closing #551.

Non-goals (from the issue): no backfill; no server-side D-15 guard implementation here (separate decision).
