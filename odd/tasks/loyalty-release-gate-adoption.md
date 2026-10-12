# Loyalty release gate — adoption (re-triage against main)

- **Status:** CERRADO — gate adoptado (PR #874): cherry-picks + re-triage + gate_held en baseline; CI verde; esperando merge del dueño.
- **Branch:** `feat/loyalty-release-gate`, from `main` = `1b12fb42`.
- **Origin:** owner decision (2026-10-12): adopt the T1b gate runner + probes now.
  Cherry-picked 11 commits from `feat/loyalty-v1-production-readiness` (clean), then
  re-triaged every probe against main @ b394df32.

## Re-triage verdicts (2026-10-12)

| Probe | Verdict | Basis |
|---|---|---|
| B1 device-tenant evaluation | **CLOSED → regression** | The device-tenant program lookup works on main (found + evaluated); fixture arithmetic bug fixed (comment said 350, cart built 200 — the assertion never ran at baseline because B1 failed earlier). |
| B4-pg / B4-sqlite idempotency | Already regression | Covered by the v71 ledger identity batch (#872). |
| B7-rls-enforcement / B7-cross-tenant-read | **CLOSED → regression** | RLS ENABLE+FORCE on the loyalty tables holds on main (#286/#512 work). |
| B9-customer-code | Already regression | Covered by #872 (ensureCustomerCodeSchema). |
| B2 config stream via inbound sync | **Blocker (FAIL)** — real gap | The loyalty configuration stream does not ride the generic inbound sync yet (T7). |
| B3 LOYALTY_LEDGER flow dispatch | **Blocker (FAIL)** — real gap | The sync/batch envelope does not accept/dispatch the ledger flow yet (T6). Design note: when it lands, the enum/CHECK must accept the reversal semantics. |
| B5 reversal contract | **Blocker (FAIL)** — contract delta | arch §4.3 wants per-movement REVERSAL rows; main implements D-15 (one net `adjust` referencing the first tx). Needs the T5 design call; under the v71 identities the per-movement form fits the reversal identity better. |

Gate result (baseline mode): **gate_held** — remaining blockers FAIL as documented,
every closed gap guarded as a regression, controls PASS.

## Fixture/contract fixes during re-triage

- Harness `currentSchemaVersion` 53 → 71.
- Probe fixtures: tenants now seed the NOT NULL `slug` (added to main post-09-20).
- Gate contract (`scripts/lib/loyalty-release-gate.mjs`): B1/B7 reclassified
  blocker → regression, with the repair history documented in the contract file.
- B5 stays RED as the honest scoreboard of the §4.3-vs-D-15 contract delta.

## How to run

`bash scripts/loyalty-release-gate.sh baseline` (backend Jest probes + POS Flutter
probes via the harness; machine docs converted and classified; exit code propagates).
Final mode (`final`) is the T10 target: everything PASS once B2/B3/B5 close.

Additional CI-integration fixes (commit 595e1fdc): the Flutter probes run ONLY
through the gate (LOYALTY_RELEASE_GATE marker exported by the runner; default CI
run registers a passing placeholder — an empty probe main exits 79 and fails CI).
Gate contract tests updated to the new classification: 64/64.
