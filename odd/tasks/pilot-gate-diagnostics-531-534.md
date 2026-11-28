# Feature: #531 (Gate G0–G6 30-Day Operability) & #534 (Pilot Field Diagnostics)

- Issues: `#531`, `#534`
- Branch: `feat/pilot-gate-diagnostics-531-534`
- Scope: Approved `full_measurable_gate_and_diagnostics` — build read-only `#534` diagnostic CLI (`Q-A1..Q-A6` + `Q-B1..Q-B2`), run real PG 16 30-day volume benchmark (`G4.5` + `Q-B1/Q-B2`), run real Samsung Galaxy S23 hardware benchmarks (`G1.5`, `G2.2/G2.5`, `G5.3`, `Q-A1..Q-A6`), update `odd/tasks/founder-pilot-30day-gate.md` separating technical PASS from the 6 field/accountant sign-offs, and post verified evidence to `#531`/`#534`.

## Specs

- **S1 — Read-Only Pilot Field Diagnostics CLI (`scripts/pilot/pilot_field_diagnostics.sh`):**
  - Strictly read-only: MUST NEVER run `UPDATE`, `DELETE`, `INSERT`, `DROP`, `TRUNCATE`, or `pm clear`.
  - Supports `--sqlite <db_path>` (or `--adb <serial> [--package com.nhilos.pos_app]`) executing `#534` `Q-A1`..`Q-A6` against the real Floor SQLite schema (`invoices`, `inventory_movements`, `local_configs`, `audit_logs`) — note actual schema uses `invoices.invoice_number`, `invoices.sync_status` / `is_canceled`, `local_configs['dgi_current_number']`.
  - Supports `--pg-tenant <tenant_uuid>` executing `#534` `Q-B1` (duplicate `invoice_number` check) and `Q-B2` (sequence gap check) against PostgreSQL using `psql` / `PG*` or `DB_*` env vars.
  - Emits clear structured summary (and `--json` option) and exits non-zero if `Q-B1` detects duplicates or `Q-A2` detects un-deducted non-canceled invoices (fail-loud diagnostic).

- **S2 — Real PostgreSQL 16 30-Day Volume Benchmark & `#534` `Q-B1`/`Q-B2` Proof (`apps/admin_backend/src/modules/sales/services/pilot-30day-volume-gate.db.spec.ts`):**
  - Uses isolated temporary schema on local PostgreSQL 16 (`CREATE SCHEMA` / `DROP SCHEMA ... CASCADE`).
  - Seeds 30 days of realistic café/retail volume (**3,000 invoices + 9,000 invoice items** across 30 days).
  - Measures **`G4.5`** query timings + `EXPLAIN ANALYZE` for daily sales summary, top products, and monthly fiscal summary (asserting sub-second execution and index usage).
  - Executes **`Q-B1`** (duplicate detection) and **`Q-B2`** (sequence gap detection) verifying both clean 0-duplicate/0-gap state and positive detection when a duplicate or gap is injected.

- **S3 — Real Samsung Galaxy S23 Hardware E2E Gate Suite (`apps/pos_app/integration_test/pilot_30day_gate_s23_hardware_e2e_test.dart`):**
  - Runs on physical Samsung Galaxy S23 (`SM_S918B`, `R5CWB2LQJDJ`, ARM64) with real Floor SQLite on disk:
    - **`[1/4]` `G1.5` Checkout Latency (`< 1000ms`):** 10 real checkouts measured with `Stopwatch` (`p50`, `p95`, `max`, all `< 1000ms`).
    - **`[2/4]` `G2.2` / `G2.5` + `Q-A1` / `Q-A2`:** real purchase receipt → sale → Kardex movement + raw SQLite `Q-A1` & `Q-A2` assertions (`0` invoices missing movement).
    - **`[3/4]` `G5.3` Mid-Shift Close/Reopen Persistence:** open shift + unsynced sales → close & reopen SQLite `AppDatabase` from disk → verify open shift, catalog, pending queue (`Q-A4`), and `dgi_current_number` (`Q-A3`) intact.
    - **`[4/4]` `G5.5` / `Q-A3..Q-A6` Device Capacity Telemetry:** read real SQLite file size on disk (`Q-A6`), unsynced depth (`Q-A4`), daily volume (`Q-A5`), and DGI cursor (`Q-A3`), printing `[S23_E2E_PILOT_GATE] E2E_RESULT: 4/4 ALL_TESTS_PASSED`.

- **S4 — Honest Gate Verdict Update (`odd/tasks/founder-pilot-30day-gate.md`):**
  - Record exact measured numbers (`G1.5` ms, `G4.5` ms on 3,000 invoices, `Q-A1..Q-A6` S23 measurements, `Q-B1/Q-B2` PG 16 proof) and per-item verdict (`pass` vs `pending_field_signoff` for the 6 real-client/accountant items: `G1.3`, `G3.1`, `G3.5`, `G4.4`, `G5.4` preprinted book, prod `Q-B1/Q-B2`). Never fabricate field/accountant sign-offs.

## Tasks

- [x] `T1` (S1–S2) [worker A] Create `scripts/pilot/pilot_field_diagnostics.sh` (read-only `Q-A1..Q-A6` + `Q-B1..Q-B2`) and `pilot-30day-volume-gate.db.spec.ts` (PG 16 30-day 3,000-invoice `G4.5` `1.17–3.54ms` + `Q-B1/Q-B2` proof) — commit: `a1c0610d`
- [x] `T2` (S3) [worker B] Author `apps/pos_app/integration_test/pilot_30day_gate_s23_hardware_e2e_test.dart` (`G1.5`, `G2.2/G2.5`, `G5.3`, `Q-A1..Q-A6`) — commit: `a1c0610d`
- [x] `T3` (S3–S4) [parent] Run `pilot_30day_gate_s23_hardware_e2e_test.dart` on physical S23 (`R5CWB2LQJDJ`) — **4/4 `ALL_TESTS_PASSED`** (`G1.5` `p50=32ms`, `max=151ms`; `Q-A2=0`; `G5.3` intact; `Q-A6=784.0KB`), harden `--adb` SQLite header check, update `odd/tasks/founder-pilot-30day-gate.md` — commit: `HEAD`
- [ ] `T4` (S1–S4) [verify] Independent `gentle-ai-verify`, PR + CI green, then post verified evidence to `#531` and `#534` — commit: pending

## Log

- **L1 (Original user request):** "- #531 (Gate G0–G6 de operabilidad 30 días) · #534 (mediciones de piloto)" + user choice `full_measurable_gate_and_diagnostics`.
