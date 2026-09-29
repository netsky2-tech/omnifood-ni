# POS ↔ Web Re-Audit v2 — post-remediation (2026-09-29)

Scope: full re-verification of the 2026-09-28 deep audit (6 BLOCKER / 10 HIGH / 11 MEDIUM)
after batches 1–8 merged to main via PRs #664–#675, plus a new-gap scan for regressions
introduced by the remediation itself. Read-only; 3 parallel explorers (POS, backend+dashboard,
cross-surface contracts).

## 1. Verdict on the original 27 findings — 22 FIXED / 3 DEFERRED / 2 OPEN

### ✅ FIXED (22) — evidence anchored to merged commits
| Finding | Fix commit | Evidence |
|---|---|---|
| B1 loyalty redeem silent | `5fffbda4` | `sale_view_model.dart` `_recordLoyaltyFailure('redeem')` |
| B2 loyalty earn silent | `5fffbda4` | `_recordLoyaltyFailure('earn')` |
| B6 cash sessions page | `3458d658` | `/cash` route + `GET /sales/shifts` (OWNER/MANAGER) + tests |
| H1 unsynced count | `94266f00` | 6 domain catches → `_logOutboxCountFailure` |
| H2 loyalty tx outbound | `4e3d50e3` | POS builder ↔ DTO field-perfect; idempotent ingestion |
| H3 cash shifts outbound | `446d1a49` | payload ↔ DTO match incl. status enums, epoch→timestamptz |
| H4 fabricated $0 print | `a987261c` | parser returns null → FAILED + `PRINT_PAYLOAD_CORRUPT` audit |
| H5 credit-note UI | `6efd1697` | `credit_note_button` + §23 dialog, returns id |
| H6 audit page | `68428e9a` | `/audit` + `GET /operations/audit/events`; deep links resolve |
| H7 kardex page | `8d0f156c` | `/kardex` + enriched pending; approve server-authoritative (thresholds intact) |
| H8 CN print path | `6efd1697` | own snapshot; `Doc. Origen:` = fiscal number only (never UUID) |
| H9 loyalty re-eval | `5fffbda4` | `_recordLoyaltyFailure('re-evaluate')` |
| H10 COGS $0 | `88c9b719` | coverage enum + banner (verbatim dashboard copy) + `—` |
| M1/M2/M3 inbound | `6ae6dac5` | delta keys + handlers; customer merge rules verified field-by-field |
| M5 regularization silent | `e338914a` | log + `INVENTORY_REGULARIZATION_FAILED` forensic alert |
| M6 inventory mapper ×3 | `e338914a` | warnings at 110/155/320 |
| M7 kitchen mapper | `e338914a` | parse failure logged with raw payload |
| M8 terminal offline conflated | `e338914a` | SocketException→offline, Timeout→error |
| M9 capability cache clear | `e338914a` | `_active` kept on persistence failure |
| M11 customer scanner | `24668ca0` | overlay + production `CustomerIdentificationService` wiring |

### ⏸️ DEFERRED by explicit user decision (3)
| Finding | Decision source | State |
|---|---|---|
| B4 email vendor | `docs/notifications-email-provider-contract.md` (user: post go-live cost planning) | Seam FIXED (`EMAIL_PROVIDER` config, fail-fast); vendor absent by design |
| B5 SMS | same doc | Console stub untouched; no half-wiring |
| M4 kitchen sync | `odd/tasks/sync-surface-expansion.md` (no backend entity exists) | Nothing partial; feature work required |

### 🔴 OPEN — never covered by any batch (2)
| Finding | Current state | Severity |
|---|---|---|
| **B3** activation port 5× `UnimplementedError` | `activation_sync_port.dart:38,49,61,69,81` unchanged. **Latent**: production `DioActivationSyncPort` overrides all 9 methods; throwing defaults only reachable via non-overriding subclass (tests). Callers: discovery service catches only `DioException` (an `Error` would propagate); bootstrap coordinator records+rethrows. | Low (latent) — but verify against latest main (`564c1813` touched activation messaging) |
| **M10** connectivity HTTP polling | `network_connectivity_service.dart:28-37` — `Timer.periodic(30s)` → `GET /v1/health`; no `connectivity_plus`; `catch(_)→offline` on line 77 | Medium — up to 30s stale online/offline state; design choice vs platform signal |

## 2. NEW GAPS found by this re-audit (ranked)

### Contract mismatches (POS ↔ Web)
1. **[Medium] Loyalty balance ping-pong** — inbound customer delta sources `pointsBalance` from `customers.points_balance`, a column **no sync path ever updates** (ledger writes only `customer_point_transactions` + projection; sole writer = manual admin adjust). Any backoffice edit that lands a customer in a later delta clobbers the POS local balance with a stale value → silent balance loss. Root: `sync_service.dart:448` (push) vs `:517` (pull) ordering + `inbound-sync.service.ts:1047`.
2. **[Low-Medium] Units rounding drift** — POS accumulates fractional points but push sends `units: tx.units ?? tx.points.round()` (`sync_service.dart:855`, no writer sets `units`) → cloud ledger drifts ≤0.5 pt/transaction from POS balance. No round-trip test.
3. **[Low] Pending badge never zero during DSI-6 hold** — `getPendingOutboxCount` counts held CN records (`sync_service.dart:298,330-336`) → permanent non-zero badge while hold active.
4. **[Low] Cash `status` doc vs behavior** — DTO says invalid status fails per-record; ingestion coerces ≠CLOSED → OPEN silently.
5. **[Low, latent] Whole-batch DTO 400** — one invalid value (e.g. empty `reason` from `cash_movement_dialog.dart`) 400s the entire envelope (per-record isolation starts only inside ingestion) → can stall unrelated rows.
6. **[Low] Dashboard cash `number` types vs PG decimal strings** — harmless today (`Number()` at render) but a latent typing trap.

### Backend/dashboard
7. **[Medium] Labels guard covers 8/12 families** — `auditSeverity/auditAction/auditTargetType/auditActorRef` families are live-rendered by `/audit` but NOT registered in `labels.test.ts` → new/typo'd backend codes render raw identifiers (template §22 risk).
8. **[Medium-High operational] Hardcoded notification recipients** — `low-stock.listener.ts:33,37` `owner@omnifood.ni` / `+50512345678`; no recipient config seam exists.

### POS
9. **[Medium] 30 literal `catch (_) {}` remain** — none on loyalty/print paths (census verified). Highest: `audit_repository_impl.dart:457,489` (audit-incident write failures), `inventory_repository_impl.dart:754` (BCN rate fallback `36.6241`), `sales_mapper.dart:161` (modifiers parse), `production_order/recipe_version_document` payload parses, `auth_repository_impl.dart:634` (legacy token revoke flag).
10. **[Low] `lastLoyaltyError` diagnostic-only** — observable in logs/tests, never surfaced in UI (dead-getter risk vs original "invisible drift" intent).
11. **[Low] Double `selectCustomer` persists** — scan/manual path calls select twice → loyalty re-eval runs twice (recorded follow-up, still open).
12. **[Low] Kitchen `_parseJson {}` fabricates `ticket-1` id** — non-fiscal (kitchen copy only), but same class as H4.

### Untested
13. Desktop (Windows/Linux) build with unconditional `mobile_scanner` import — no CI job; on-device scan, Escape binding, `errorBuilder` branch unverified.
14. No integration test covers POS push → inbound customer-delta ordering (root of gap #1).
15. ~~`npm run test:db` execution not confirmed~~ — RESUELTO (2026-09-29): confirmado en CI (.github/workflows/admin-backend-ci.yml) y ejecutado localmente en la rama feat/soho-go-live-readiness (48 suites / 277 tests, verdes).

### Minor hygiene
16. `sync:pull` scope on write-ack routes (`inbound-sync.controller.ts:124,144`) — confirm naming intent.
17. Two controllers share `sales/shifts` prefix (human + device) — safe today; watch if more device routes land.

## 3. Positive verifications
- Route-transport registry: exhaustive enforcement with failure cases; every new route declared + tested.
- Dashboard: all 4 drilldown targets (`/sales`,`/inventory`,`/fiscal`,`/audit`) registered — no dead links; 3 new pages handle loading/filtered-empty/first-use/error + role gating.
- Credit-note hold: excludes ONLY `CREDIT_NOTE`; fulfillment/sales unaffected; backoffice path untouched; both sides fail closed.
- Dashboard API contracts: zero path/param/shape mismatches across cash/audit/kardex.
- OPEN cash shifts ARE visible on dashboard (premise "closed-only" was false) — by design.

## 4. Proposed next batches
- **Batch 9** (small): labels guard 4 missing families + reflection test (#7).
- **Batch 10** (small): notification recipients config seam (#8) — keeps vendor decision separate.
- **Batch 11** (medium): loyalty balance/rounding contracts (#1 + #2 + round-trip test) — decide: cloud projection as source of truth vs POS-authoritative balance.
- **Batch 12** (medium): B3 cleanup (replace throwing defaults with explicit interface/abstract or fail-fast) + M10 platform connectivity (or formally accept HTTP polling as design).
- Hygiene batch: #3 badge semantics, #4 doc/behavior, #10 lastLoyaltyError surfacing, #11 double-select, census mediums (#9).
- ~~Decision needed from product: #5 batch-validation stance~~ — RESUELTO (2026-09-29): DECIDIDO — 400 de lote completo se mantiene como postura fail-closed para superficie fiscal; ver odd/tasks/go-live-decisions.md (DEC-2).
- Decision needed from product: #13 desktop CI job.

## 5. Environment note
`main` advanced during this audit (peer session merged activation UX commits `2a5a66f6`, `564c1813`). B3 re-confirmed against latest `origin/main` (564c1813): still OPEN at lines 38/49/61/69/81; the peer's commit touched `dio_activation_sync_port.dart` (+22) but not the throwing defaults.

## 6. ADDENDUM — R3-001 / R4-001 still OPEN in main (CRITICAL)
The peer session merged `feat/soho-activation-fixes` into main (`2a5a66f6`) **without applying** the handed-off fix (`odd/plans/r3-r4-activation-restoration-fix.md`). Verified on latest `origin/main`:
- Restoration block in `activation_session_view_model.prepare()` (lines 251-253) still sets only `_preOfflineChecksSucceeded` / `_controlledSaleSucceeded`.
- `_reconnectSyncSucceeded` is never restored (only written in `syncActivationEvidence()` at 301-302).
- Effect (native review, severity CRITICAL, deterministic): a resumed activation at `EVIDENCE_ACKED`/`ACTIVATED`/`ACTIVATED_WITH_WARNING` re-requires a reconnect-sync phase that already succeeded → local deadlock/brick.

**This outranks every other open item.** Fix plan ready in the handoff doc (~12 source lines + tests, correction budget was 64).
