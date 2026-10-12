# Loyalty gate blockers B2/B3/B5 (T6/T7/T5)

- **Status:** EN CURSO — decisiones del owner 2026-10-12: (1) B5 contract = per-movement REVERSAL (arch §4.3), no el net adjust actual; (2) B2 se cierra arreglando el fixture del probe (sembrar programa + reward vía path de producción) e implementando records taggeados §13.5 sobre filas reales — un tenant sin programas legítimamente tira un stream vacío; NO se inventa un programa default de plataforma.
- **Branch:** `feat/loyalty-gate-b2-b3-b5`, from `main` @ `0f665a4d`.
- **Origin:** handoff from the release-gate adoption session. Gate baseline on main is the scoreboard: `gate_held` with B2/B3/B5 FAIL, all other probes PASS.

## Tasks

### T6 — B3: LOYALTY_LEDGER flow dispatch through sync/batch (backend)
- Probe: `apps/admin_backend/test/loyalty/release-probes/sync-boundary-baseline.e2e.probe.spec.ts` `[B3]`.
- Acceptance: `POST /api/v1/sync/batch` (existing envelope, arch §13.4, no parallel transport)
  accepts `flowType: 'LOYALTY_LEDGER'` + documented `events[]` shape
  (`{ event_id, idempotency_key, transaction }` with canonical LoyaltyTransaction state §2.3),
  dispatches through production paths, answers per-record ACK `ACCEPTED` / valid-replay `DUPLICATE`.

### T7 — B2: loyalty config stream via generic inbound sync (backend)
- Probe: same spec, `[B2]`.
- Acceptance: `GET /api/v1/sync/inbound/deltas` (existing generic endpoint, arch §13.5 reuse rule)
  transports `PROGRAM_UPSERT` / `REWARD_UPSERT` records with payloads, tenant-scoped
  to the authenticated device principal. No literal /loyalty route.

### T5 — B5: per-movement reversal contract (POS)
- Probe: `apps/pos_app/test/e2e/loyalty_release_void_e2e_test.dart` `[B5]`.
- **Owner decision (2026-10-12): contract = arch §4.3 per-movement REVERSAL.**
- Acceptance: real void path appends exactly one compensating `REVERSAL` per original movement
  (EARN → `REVERSAL -units`, REDEEM → `REVERSAL +units`) each with `reversalOfTransactionId`,
  keeps original movements untouched (append-only, DGI-safe), writes `SALE_VOIDED` audit entry.

## Gate target

Once B2/B3/B5 close: re-run `bash scripts/loyalty-release-gate.sh baseline` → all blockers PASS;
then `final` mode (T10) may go all-green.

## Evidence log

- **T6/B3 CLOSED** — commits `8d60d0fe` (DTO + ledger core + dispatch), probe B3 GREEN
  (`ACCEPTED` ACK). Probe fixture fix commit `11324fd8` (real program/reward rows; the
  re-triage probe demanded tagged records and a program-less EARN from a bare tenant —
  impossible under §9.3's fail-closed `ck_loyalty_tx_type_semantics`; no-exemption owner
  decision, same fixture-fix class as the slug fix). Related env note: leftover
  `tenant-a`/`tenant-b` rows in public tenants from a crashed e2e run block the spec's
  fixed slug/name seeds (pre-existing; cleaned by renaming the orphans 2026-10-12).
- **T7/B2 CLOSED** — commit `f1a70e44` (tagged §13.5 records on the generic inbound
  endpoint, derived from real rows; legacy camelCase channel intact), probe B2 GREEN.
- Full backend probe run after both: 7/7 GREEN; fulfillment e2e real-App 7/7 GREEN.
- T5/B5: next (per-movement REVERSAL contract on the POS void path).
