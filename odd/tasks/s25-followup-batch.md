# S25 follow-up batch — F-10g decision, B1b refinements, build-script hygiene

- **Status:** CERRADO — T1–T4 implementadas en `fix/s25-followup-batch`; PR abierto para revisión del dueño.
- **Branch:** `fix/s25-followup-batch`, from `main` = `5bbd769c`.
- **Owner decisions (2026-10-12):**
  - **F-10g: INHERIT the tenant fiscal counter.** The verification sale is a real fiscal document; a dedicated series for it is DGI-disputable. The D-6 machinery already implements inheritance (priming records tenant-wide MAX; the runner seeds a fresh terminal at cloudHighest+1 and refuses a lagging cursor). Remaining work: document the decision for support and verify chain coverage; add tests only for real gaps.
  - **AuditLog sequence collision: fix BOTH writers** (loyalty backfill + inventory remediation) — same defect class, near-identical fix.

## T1 · B1b-A — preview report exposes per-customer row counts

- **What:** `previewBackfill` scans `tx_count` per customer but the report only carries aggregate counts; the operator cannot judge per-customer impact before committing.
- **Where:** `apps/admin_backend/src/modules/loyalty/services/loyalty-program-backfill.service.ts` (report interface + preview assembly).
- **Expected:** the preview (and commit) report includes per-customer entries with their unassigned row counts, bounded by the batch. Test-first at the DB-spec level.
- **In this batch:** yes.

## T2 · B1b-B — AuditLog sequence allocation for BACKOFFICE audit writers

- **What:** `uq_audit_stream_sequence_active` on `(tenant_id, device_id, user_id, sequence_no)` where `forensic_status='ACTIVE'`; both the loyalty backfill writer and the inventory remediation writer insert with the DB default (0), so a SECOND commit by the same owner actor collides with the first row.
- **Where:** `loyalty-program-backfill.service.ts` (`writeAuditLog`) and `sale-inventory-remediation.service.ts` (audit row); the allocation pattern already exists in `audit-trail.service.ts` / `user.service.ts` (read last log for the stream, +1).
- **Expected:** both writers allocate the next sequence inside their transaction (same pattern as the existing services), so repeated commits by the same actor never collide. Test-first.
- **In this batch:** yes.

## T3 · F-10g — record the inherit-counter decision, verify the replacement chain

- **What:** the owner chose inheritance. The code path exists and is tested (lag → `FISCAL_SEQUENCE_RECOVERY_REQUIRED` refusal with untouched cursor; fresh/replacement device → seeds at cloudHighest+1; pass-through advances only by issuance). Remaining: a support-facing decision doc and a check that the priming→runner chain (priming writes `dgi_cloud_highest_sequence`, runner consumes it) is covered; add a test only if a real gap appears.
- **Where:** `docs/operations/` (new decision note); POS tests only if a gap shows.
- **In this batch:** yes (docs-first; no behavior change expected).

## T4 · build script hygiene — stale artifacts leak into the release manifest

- **What:** `scripts/build_pos_apk.sh` does not clean or guard its `out-dir`; during the S24 release a stale `app-universal-release.apk` from a previous run was enumerated into `release_manifest.json` and nearly shipped in the evidence.
- **Where:** `scripts/build_pos_apk.sh`.
- **Expected:** the manifest enumerates only artifacts produced by THIS run (clean the out-dir first, or verify listing against the build outputs), with a comment explaining why. Behavior change is script-only; verify by running the manifest-generation path against a planted stale file (no full APK build needed for the check if the script structure allows it).
- **In this batch:** yes.

## Out of scope (unchanged)

- **Constancia del contador** (#535 Q4c) — external, with the accountant; no action.
- **DSI-6 (B5)** + `offline-human-authorization-credential` — roadmap, when the first client is stable.
- Preview row counts: expose counts only; no CSV/aggregate format work beyond the report shape.

## Evidence log

| Task | Commit | Evidence |
|---|---|---|
| T1 | `30abeae3` | RED (compile: `customers` missing) → GREEN: DB spec 12/12, controller spec 14/14, `tsc --noEmit` clean. `customers[]` bounded by the batch in both preview and commit; aggregates stay the write authority. |
| T2 | `f48e79a2` (see `git log`) | RED real: the backfill DB-spec schema gained the production partial unique index, exposing that the suite had silently accepted two sequence-0 rows production rejects (`duplicate key` on the second commit). GREEN: backfill DB 13/13, remediation unit 7/7, remediation controller 3/3, `tsc` clean. Both writers allocate the next stream sequence like `audit-trail.service`. |
| T3 | (docs + test commit) | Owner decision recorded in `docs/operations/replacement-terminal-fiscal-sequence-decision.md` (support flow for `FISCAL_SEQUENCE_RECOVERY_REQUIRED`). New test: priming writes `dgi_cloud_highest_sequence` from the payload (13/13, was uncovered). `flutter analyze` clean. |
| T4 | (script commit) | Stale-artifact guard: the out-dir is cleaned up front; verified by planting 4 stale files (removed) plus an unrelated file (kept); `bash -n` clean; `--plan` mode unaffected. |
