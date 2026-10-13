# Feature: Zona E Fixes (Cold Start Linking Retry + Shrinkage Author UserId)

- **Branch / Worktree:** `feat/zone-e-fixes` @ `.worktrees/zone-e-fixes` (off `main` 52aedbcc)
- **Authority:** Issue #653 (Railway cold start on linking claim), Issue #535 Q6 / `odd/tasks/founder-pilot-30day-gate.md` (Shrinkage audit trail author `userId`).

## Specs

- **S1:** Linking code claim auto-retry on 500/502/503/504 / timeout to mitigate Railway cold start. If retry fails with 5xx/timeout, distinguish server starting from network error with user-facing message ("El servidor está iniciando o temporalmente no disponible. Intente de nuevo en unos momentos.").
- **S2:** Insumos & Products shrinkage recording (`MovementEngine.recordShrinkage` and `MovementEngine.recordProductShrinkage`) accepts and stamps `userId` on `InventoryMovement` kardex rows.
- **S3:** `ShrinkageViewModel` captures active `userId` from `AuthRepository` (or parameter) and forwards it to `MovementEngine`.

## Tasks

- [x] **T1:** Implement linking code claim auto-retry and distinguished server starting message in `AuthRepositoryImpl` with dedicated unit tests (S1, Issue #653). Commit: `25262392`.
- [x] **T2:** Implement `userId` support in `MovementEngine`, `MovementEngineImpl`, `ShrinkageViewModel`, and UI for insumo/product shrinkage (S2, S3, Issue #535). Commit: `0f77021c`.
- [x] **T3:** Run test suites and verify deterministic coverage for both features (S1, S2, S3). Verified: 74/74 tests passing across repositories, domain engines, view models, and views.

## Log

- L1: User requested addressing both Zone E items in an isolated worktree and branch.
- L2: Completed T1 (Issue #653 cold-start mitigation with 1s backoff retry and 500/502/503/504 server starting message).
- L3: Completed T2 (Issue #535 Q6 kardex shrinkage authorship with authenticated userId).
- L4: Verified 74/74 unit and integration tests passing cleanly.
