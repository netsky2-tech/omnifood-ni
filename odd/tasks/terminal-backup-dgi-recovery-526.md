# Feature: Terminal Encrypted Backup/Restore, DGI Counter Continuity & Audit Chain Reconciliation (#526)
- Branch: `feat/terminal-backup-dgi-recovery-526`
- Issue: `#526` (DT 09-2007 Ordinal SEGUNDO 1.4 — Respaldo de Soportes; B1/B2/B3/B4/B5/B6; AC-1..AC-11)

## Specs
- **S1 (`#526` B3 / AC-8 / AC-11 — Encrypted SQLite Backup & Staged Restore):**
  Operator-performable encrypted backup (`.nhilosbak`: AES-256 + HMAC-SHA256 Encrypt-then-MAC with PBKDF2-HMAC-SHA256 key derivation, `VACUUM INTO` atomic snapshot, SHA-256 payload digest, manifest with `schemaVersion`, `invoiceCount`, `highestInvoiceSequence`, `dgiPrefix`, `auditLogCount`). Staged restore validates MAC, SHA-256, `PRAGMA integrity_check`, `schemaVersion <= currentVersion`, and **B5 replay tripwire** (refuses restore in Spanish naming conflicting numbers if `cloudHighestSequence != null && backupHighestSequence < cloudHighestSequence` without writing to active DB or `dgi_current_number`). Atomic swap via `applyPendingRestoreIfPresent()` in `main.dart` before `AppDatabase` opens. Never deletes or edits issued invoices (`AC-11`).
- **S2 (`#526` B6 / AC-10 — Audit Hash Chain Verification & Non-Silent Reconciliation):**
  `AuditChainVerifier` verifies contiguity (`sequence_no == prev + 1`, `prev_hash == prev.entry_hash`, non-empty hashes) per `(tenant_id, device_id, user_id)` stream on any backup before restore. Records explicit `BACKUP_EXPORTED` on export and `DATABASE_RESTORED` after restore (including non-silent `BROKEN_STREAMS_DETECTED` report when any stream had a pre-existing break).
- **S3 (`#526` B3 UI — OWNER/MANAGER Terminal Backup & Restore Card):**
  Add `_TerminalBackupCard` in `TerminalIdentityView` gated by `ConfigPermission` (`OWNER` / `MANAGER` only; denied for `CASHIER`/`WAITER`) supporting Export Encrypted Backup and Restore from `.nhilosbak` via `file_picker` + passphrase dialog, with no `adb` or rebuild required.
- **S4 (`#526` B2/B5 / AC-4, AC-5, AC-6 — Prefix-Aware Cloud Watermark & Device-Loss / Double-Boot Regression Guards):**
  Support optional `prefix` filter in backend `readHighestInvoiceSequence` (`fiscal-sequence-watermark.ts`, backwards-compatible when omitted). Add POS tests proving device-loss recovery strictly `> max` (`AC-4`/`AC-5`) and double-boot monotonic cursor (`AC-6`).
- **S5 (`#526` B4 / AC-9 — Real Android Hardware E2E on Samsung Galaxy S23 & Procedure Evidence):**
  Execute Scenario A end-to-end on real Android hardware (`SM_S918B` / `R5CWB2LQJDJ`, ARM64): issue invoices → export encrypted `.nhilosbak` on real Android storage → simulate wipe/dead terminal → restore `.nhilosbak` → verify invoices, monotonic DGI counter, B5 replay refusal, and intact `audit_logs` chain. Record rehearsal evidence in `docs/operations/pilot-terminal-incident-procedure.md`.

## Tasks
- [x] **T1** (`S1, S2`) Implement `AuditChainVerifier` and `TerminalBackupService` (AES-256+HMAC-SHA256 `.nhilosbak`, `VACUUM INTO`, B5 tripwire, atomic pending-restore swap) with TDD — route: inline — commit: `163bc9a6`
- [x] **T2** (`S3`) Wire `applyPendingRestoreIfPresent()` in `main.dart` and add OWNER/MANAGER `_TerminalBackupCard` in `TerminalIdentityView` with widget tests — route: inline — commit: `05deb1ba`
- [x] **T3** (`S4`) Add optional prefix-scoped watermark in `fiscal-sequence-watermark.ts` + real PG test & POS device-loss/double-boot tests (`AC-4`/`AC-5`/`AC-6`) — route: inline — commit: `c34da4e2`
- [x] **T4** (`S5`) Build & run real Android hardware E2E (`#526` Scenario A) on Samsung Galaxy S23 (`R5CWB2LQJDJ`, 5/5 `ALL_TESTS_PASSED`), record evidence in `docs/operations/pilot-terminal-incident-procedure.md` — route: inline — commit: `pending`
- [ ] **T5** (`S1-S5`) Run independent `gentle-ai-verify`, push & open PR closing `#526` — route: verify — commit: pending

## Log
- **L1 (user):** "Si, procede y vamos con #526 (respaldo de terminal y contador DGI que hoy reinicia en 1 si muere la tablet). Recuerda siempre aplicar los test en dispositivo real para integrar con seguridad."
