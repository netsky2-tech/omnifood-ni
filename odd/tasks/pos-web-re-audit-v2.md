# pos-web-re-audit-v2

## Goal
Full POS ↔ Web re-audit after the 8-batch remediation: verify coverage of all 27 original findings, and detect NEW gaps introduced by the remediation itself (contracts, sync surfaces, dashboard pages, credit notes, scanner).

## Original findings reference (2026-09-28 audit)
- BLOCKERs: B1 loyalty redeem silent catch, B2 loyalty earn silent catch, B3 activation port UnimplementedError (5 methods), B4 email stub, B5 SMS stub, B6 no cash-session dashboard page.
- HIGH: H1 unsynced count silent catches, H2 loyalty tx outbound absent, H3 cash shifts outbound absent, H4 dummy $0 print, H5 credit-note TODO, H6 no audit page, H7 no kardex page, H8 no CN print path, H9 loyalty re-eval silent, H10 COGS $0.
- MEDIUM: M1 loyalty programs inbound, M2 promotions inbound, M3 customers inbound, M4 kitchen orders sync, M5 regularization silent, M6 inventory mapper catches, M7 kitchen mapper silent, M8 terminal offline conflation, M9 capability cache clear, M10 HTTP polling connectivity, M11 customer scanner TODO.

## Hypotheses to verify (from remediation records)
- Covered by merged batches: B1, B2, H9, H4, M5-M9, H1, H2, H3, M1-M3, B6, H6, H7, H10, H5, H8, M11.
- Deferred by user decision: B4 (contract only; vendor post go-live), B5 (vendor post go-live), M4 (no backend entity).
- Possibly NEVER COVERED (verify!): B3 (activation port), M10 (connectivity polling).
- Follow-ups recorded: DSI-6 CN sync hold, CN numbering parity, program-less loyalty rows, scan double-selectCustomer, on-device scan validation, R3/R4 activation handoff.

## Method
3 read-only explorers (POS regression, backend/dashboard regression, cross-surface contracts + new-gap scan). Verdicts per finding: FIXED / DEFERRED (with decision source) / OPEN. New gaps get proposed batch numbers.

## Estado (2026-09-29)
- Gap #5 batch-validation stance: RESUELTO — DECIDIDO, 400 de lote completo se mantiene como postura fail-closed para superficie fiscal. Detalle en `docs/audits/pos-web-re-audit-v2.md` (§4) y `odd/tasks/go-live-decisions.md` (DEC-2).
- Gap #15 `npm run test:db` execution: RESUELTO — confirmado en CI (`.github/workflows/admin-backend-ci.yml`) y ejecutado localmente en la rama `feat/soho-go-live-readiness`. Detalle en `docs/audits/pos-web-re-audit-v2.md` (§2, Untested).

## Status
- [ ] Explorer pass
- [ ] Report synthesis
- [ ] User decision
