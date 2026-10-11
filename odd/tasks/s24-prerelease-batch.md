# S24 pre-release batch — F-10f + B1b, then client release

- **Status:** EN CURSO — T1 cerrada (`a92b0f35`), T2 cerrada (`00699294`).
- **Branch:** `fix/s24-prerelease-batch`, from `main` = `3c531232`.
- **Owner decisions (2026-10-11):**
  - Release to the client ships AFTER this batch, from the post-merge main. F-10f and B1b ride in this APK; **F-10g is deferred to the next APK** (design decision still open: inherit the sequence counter vs a dedicated series for the verification sale).
  - Formal release version: **`1.1.0+19030`** (above every build seen on the rig; last committed bump was `1.1.0+9020` at `05829ca8`).
- **Origin:** the five carry-over items of session 2026-10-10 night (memory `soho/s23-revalidation`). Items 4 (contador constancia) and 5 (DSI-6 roadmap) are external/roadmap — not in this batch.

## T1 · F-10f — the activation Fase 3 tells rejection apart from transport failure

- **What:** the `Delivery unacknowledged` branch of `friendlyError` blames the connection ("No se pudo confirmar la entrega... Verifique su conexión") even when the server sent a DETERMINISTIC, non-retryable rejection (`CRITICAL_SEQUENCE_PAYLOAD_MISMATCH` on re-linking a terminal with fiscal history). It fired twice during revalidation (two envelopes).
- **Where:** POS activation phase 3 delivery/error surface; `FriendlyError` map in `apps/pos_app/lib/core/localization/label_map.dart`.
- **Expected:** a deterministic server rejection renders as a distinct, honest message (what was rejected, that retrying will not fix it), while a genuine transport failure keeps the connection copy. Test-first: a test that fails with the current conflated copy.
- **In this release:** yes.

## T2 · B1b — formal backfill surface for loyalty rows without a program

- **What:** rows pushed before the B1 fix keep `loyalty_program_id NULL` and are invisible to the projection (rig showed 1481 vs 186). The rig was repaired by hand SQL; production needs a real surface. The existing `classify-legacy` endpoint attributes rows to a "legacy" program, NOT to the resolver's answer — the correct backfill must reuse the resolver logic: exactly 1 ACTIVE program → attribute to it; ambiguous → fail loudly, attribute nothing.
- **Where:** `apps/admin_backend` loyalty module (ingestion resolver `loyalty-sync-ingestion.service.ts` holds the logic to reuse); new admin/backfill endpoint + operation runbook note.
- **Expected:** a scoped, idempotent backfill operation with a dry-run report (rows matched, rows attributed, rows refused as ambiguous), the same program-resolution rules as the forward path, and an audit trail. Test-first at the service level.
- **In this release:** yes (backend only; no APK impact).

## T3 · Client release — formal bump + signed publish

- **What:** after T1+T2 merge to main: formal bump `1.1.0+19030` (commit convention: `chore(pos): bump version 1.1.0+19030 for SOHO OTA release`), then the release sequence already supported by the repo:
  1. `scripts/build_pos_apk.sh` (signed; keystore live at `apps/pos_app/android/key.properties`, runbook `docs/operations/release-signing-runbook.md`).
  2. `scripts/publish_pos_release.sh` → R2 (`nhilos-pos`) + `app_releases` catalog.
- **Owner decisions still due at publish time:** channel (`pilot` vs `production`), `--min-from`, notes, mandatory flag. Publishing mutates the release catalog — confirm before running.
- **In this release:** yes.

## Restricciones

- Un ítem por vez, test-first donde hay RED real, commit convencional por unidad de trabajo.
- Suites focales; nunca suite completa en paralelo con un build (techo WSL2, `AGENTS.md`).
- El `pubspec.yaml` entra SOLO en el commit de bump formal de T3 (convention: never committed alone mid-batch).
- Artifact language: English. Conversation: español rioplatense.

## Evidence log

| Task | Commit | Evidence |
|---|---|---|
| T1 | `a92b0f35` | RED observado en los 3 archivos; GREEN 22/12/26 tests (port/runner/VM); corrección adicional del orquestador: el replay 2b queda fail-closed con la excepción tipada (test propio RED→GREEN, runner 13 passing); `flutter analyze` limpio. |
| T2 | `00699294` | DB spec RED 10/10 → GREEN 10/10 (Postgres local); controller spec RED (compile) → GREEN 14/14. Independently re-run by the orchestrator: 10/10 + 14/14. Known follow-ups: preview report omits per-customer row counts; AuditLog unique-index (sequence_no default 0) collides for two commits by the same owner — same exposure as the remediation precedent, schema change out of scope. |
| T3 | — | — |
