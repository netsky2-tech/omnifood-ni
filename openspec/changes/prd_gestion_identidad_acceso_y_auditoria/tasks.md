# Tasks: Gestión de Identidad, Acceso y Auditoría

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 950–1300 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | SecurityProfile + auth isolation + migrations | PR 1 | Base branch per selected chain strategy; includes RED/GREEN/REFACTOR tests |
| 2 | ForensicAuditLog chain + identity audit API | PR 2 | Depends on PR 1; include drawer-open auditing and backend validation |
| 3 | Cash session `tipo_modelo` + UI override wiring + regression tests | PR 3 | Depends on PR 2; includes active-session default migration |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Create `apps/pos_app/lib/domain/models/security_profile.dart` and `apps/pos_app/lib/data/models/security_profile_entity.dart`; define `pin_hash`, `totp_secret_seed`, flags.
- [x] 1.2 Create `apps/pos_app/lib/data/daos/security_profile_dao.dart` and register in `apps/pos_app/lib/data/database/app_database.dart`; add Floor migration v11→v12.
- [x] 1.3 Create `apps/admin_backend/src/modules/identity/entities/security-profile.entity.ts`; add TypeORM migration for `security_profiles` and audit/cash-session columns.
- [x] 1.4 RED: Add failing tests for SecurityProfile isolation in POS sync and backend entity mapping (`apps/pos_app/test/...`, `apps/admin_backend/test/...`).

## Phase 2: Core Implementation

- [x] 2.1 Modify `apps/pos_app/lib/data/repositories/auth_repository_impl.dart` + `.../local_auth_service.dart` to validate supervisor override by PIN/TOTP fully offline.
- [x] 2.2 Modify `apps/pos_app/lib/domain/models/user.dart` to remove direct secrets and map credentials only through `SecurityProfile`.
- [x] 2.3 Modify `apps/pos_app/lib/domain/models/audit_log.dart`, `.../data/models/audit_log_entity.dart`, `.../data/repositories/audit_repository_impl.dart` to add `sequence_no`, `prev_hash`, `entry_hash`, `metodo_autorizacion`, `usuario_autorizador_id`.
- [x] 2.4 Modify `apps/admin_backend/src/modules/identity/entities/audit-log.entity.ts` + `controllers/audit.controller.ts` to accept forensic payload and enforce tenant/user/sequence/hash invariants.

## Phase 3: Integration / Wiring

- [x] 3.1 Create `apps/pos_app/lib/ui/features/identity/supervisor_override_modal.dart`; wire action callbacks to auth + forensic audit logging.
- [x] 3.2 Modify `apps/pos_app/lib/domain/models/sales/cashier_session.dart` and `.../data/models/sales/cashier_session_entity.dart` to persist `tipo_modelo` (`CAJA_CENTRAL`,`CARTERA_MESERO`).
- [x] 3.3 Modify `apps/pos_app/lib/presentation/features/sales/view_models/sale_view_model.dart` to route cash totals by model and default pre-existing active sessions to `CAJA_CENTRAL`.
- [x] 3.4 Modify `apps/admin_backend/src/modules/identity/services/auth.service.ts` to include profile-sync contract without exposing secrets to unauthorized contexts.

## Phase 4: Testing / Verification

- [x] 4.1 RED/GREEN/REFACTOR: Test identity scenarios from `specs/identity/spec.md` (PIN override, offline TOTP override, authorizer fields, drawer-open forensic log).
- [x] 4.2 RED/GREEN/REFACTOR: Test sales-core scenarios from `specs/sales-core/spec.md` (`CAJA_CENTRAL`, `CARTERA_MESERO`, active-shift default migration).
- [x] 4.3 Add integration tests for Floor migration + forensic hash chain continuity + backend `/identity/audit` persistence/rejection on malformed chain.

## Phase 5: Cleanup / Documentation

- [x] 5.1 Update `openspec/changes/prd_gestion_identidad_acceso_y_auditoria/design.md` implementation notes and module docs for offline-first + DGI audit immutability rationale.
- [x] 5.2 Remove temporary dual-write toggles only after tests pass; keep backward-compatible read path per rollout plan.

## Remediation Slice: Verify CRITICAL Findings

- [x] R1 Restore `flutter test` full-suite pass by fixing failing tests in `sync_service_test.dart`, `movement_engine_test.dart`, and `inventory_logic_verification_test.dart`.
- [x] R2 Wire `SupervisorOverrideModal` into a real restricted action flow (`Cerrar Caja`) and verify runtime behavior with widget tests.
- [x] R3 Add runtime drawer-open forensic trigger path and verify with widget test.

## Remediation Slice: Judgment Day Round 1 (Premium)

- [x] R4 Fix audit sync contract mismatch by introducing dedicated remote UUID reference for audit sync payloads (without overloading local SQLite PK).
- [x] R5 Complete credential isolation by removing runtime/business-path dependency on `users.pin_hash` and persisting PIN credentials only through `security_profiles`.
- [x] R6 Enforce supervisor PIN lockout policy (3 failures < 60s => 5-minute lock) while keeping TOTP fallback path available.
- [x] R7 Align drawer forensic semantics with PRD: manual open requires supervisor authorization + justification and logs standardized `DRAWER_OPENED_MANUALLY`.
- [x] R8 Implement at-rest mitigation for `totp_secret_seed` via encrypted persistence transformer and document key-management limitations for non hardware-bound keys.

## Remediation Slice: Judgment Day Round 2 (CRITICAL)

- [x] R9 Harden forensic audit sync metadata contract: guarantee JSON-object payload, normalize legacy/plain-text metadata, and prevent silent sync skip/data-loss paths.
- [x] R10 Remove hardcoded auth credential backdoors (`admin123`, `123456`) from POS auth repository runtime paths; keep secure offline auth via hashed `SecurityProfile` only.

## Remediation Slice: Premium Iteration 3 (Blocking)

- [x] R11 Fix forensic hash consistency end-to-end: canonicalize metadata identically at creation and verification, and keep legacy plain-text metadata sync-compatible without silent drops.
- [x] R12 Restore offline continuity by role for `/identity/staff`: scoped sensitive profile sync for cashier/waiter continuity with minimal exposure policy.
- [x] R13 Remove predictable encryption fallback in `totp-secret.transformer`: enforce explicit secure key configuration and fail-closed behavior.

## Remediation Slice: Premium Iteration 4 (CRITICAL)

- [x] R14 Fix backend forensic actor consistency: verify/persist forensic chain using payload log actor (`user_id`) instead of requester identity, preserving authenticated trust boundary.
- [x] R15 Enforce POS at-rest protection for `totp_secret_seed`: encrypt before SQLite persistence and preserve backward-compatible read for legacy plaintext rows.

## Remediation Slice: Premium Iteration 5 (Escalated)

- [x] R16 Harden POS local TOTP seed encryption: remove fallback/static key behavior, enforce per-record random IV/nonce, introduce fail-closed secure key provider contract, and preserve legacy plaintext/encrypted read compatibility.
- [x] R17 Enforce backend forensic continuity on persistence path: validate strict `sequence_no` continuity and `prev_hash` linkage against latest stored record; reject out-of-order or broken-chain logs with explicit errors.

## Remediation Slice: Premium Final Hardening

- [x] R18 Backend forensic continuity hardening under concurrency: enforce DB-level stream continuity constraints (`tenant_id + device_id + user_id + sequence_no`) and transactional append locking so concurrent inserts cannot create broken chains; preserve clear conflict/error semantics.
- [x] R19 POS encrypted-only seed policy: remove runtime plaintext fallback for `totp_secret_seed`, add legacy normalization strategy to rewrite plaintext seeds to encrypted format, and fail closed when encryption key material is unavailable.

## Remediation Slice: sdd-apply-premium Micro-fix

- [x] R20 Enforce backend audit persistence as insert-only/immutable: remove mutable save semantics, reject duplicate forensic row IDs and duplicate stream sequences with explicit conflict behavior, and ensure no update path exists for persisted forensic evidence.
- [x] R21 Harden forensic stream uniqueness migration with deterministic pre-index dedupe/remediation: preserve earliest authoritative row per `(tenant_id, device_id, user_id, sequence_no)` and document cleanup rule inline.

## Remediation Slice: sdd-apply-premium Final Forensic Adjustment

- [x] R22 Replace destructive migration dedupe with non-destructive forensic remediation: preserve all historical rows, quarantine duplicate stream-sequence rows from active continuity, and enforce active-only uniqueness.

## Remediation Slice: Verify Warning Follow-up (Credential Isolation)

- [x] R23 Remove backend runtime/provisioning writes to legacy `users.pin_hash`; keep `SecurityProfile.pin_hash` as the only credential write/read path for PIN provisioning and staff-sync continuity flows.

## Remediation Slice: POS Verify Blocker (Stale Floor Codegen)

- [x] R24 Regenerate Flutter codegen artifacts (`build_runner`/Floor) to match current DAO contracts and remove stale `app_database.g.dart` compile break.
- [x] R25 Fix minimal fallout uncovered by regeneration (DAO legacy-seed query parsing and `AuditLogEntity.remoteRefUuid` fixture usage) and re-green POS verification suites.

## Remediation Slice: Offline TOTP Runtime Proof (Micro-slice)

- [x] R26 Add/adjust widget proof for restricted-action supervisor override via offline TOTP in `SaleView`, asserting modal flow, continuation to close-box dialog, and forensic callback consistency (`metodo_autorizacion='TOTP'`).
