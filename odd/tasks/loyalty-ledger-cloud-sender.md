# Loyalty ledger cloud sender (POS → cloud via LOYALTY_LEDGER flow)

- **Status:** EN CURSO — follow-up #1 of the loyalty gate arc (owner, 2026-10-12: work the follow-up table in order).
- **Branch:** `feat/loyalty-ledger-cloud-sender`, from `main` @ `8e2c67f9`.
- **Origin:** PR #876 landed the backend acceptance (B3/T6) and the per-movement REVERSAL contract (B5/T5); the POS still pushes ledger rows through the transitional parallel route `POST /loyalty/point-transactions/sync`. Arch §13.4: extend the existing batch envelope, no parallel transport.

## Specs

- S1: The POS pushes pending `customer_point_transactions` rows through `POST /v1/sync/batch` as `flowType: 'LOYALTY_LEDGER'` records (one record per event), never through `/loyalty/point-transactions/sync`.
- S2: Each event carries the canonical §2.3 state the row holds, including `reversalOfTransactionId` (required for B5 REVERSAL rows), `rewardId`, `reason`, `sourceEventId`, and the other optional canonical fields.
- S3: `sourceSequence` is durable per row before send (the `movement_sync_state` pattern, flow-scoped `LOYALTY_LEDGER`), so crashes between reserve and send replay the exact same record (DUPLICATE-safe), and no sequence gap can be minted by a crash.
- S4: ACK `ACCEPTED` / `DUPLICATE` marks the row `synced`; `REJECTED` and transport failures leave it `pending` for the next pass.
- S5: The backend `SyncLoyaltyLedgerTransactionDto` whitelists the canonical §2.3 fields and the dispatch passes them to the ledger append (esp. `reversalOfTransactionId`); unknown fields still fail closed (forbidNonWhitelisted).
- S6: The backend `LoyaltyLedgerService.appendTransaction` dedupe/integrity semantics stay the single write path (no new ledger write path).

## Tasks

- T1 (S5, S6): backend DTO + dispatch pass-through of canonical fields; DTO spec additions. Commit A.
- T2 (S1-S4): POS sender migration to the batch flow with durable per-row sequence metadata + ACK handling; tests for the new sender path. Commit B.
- T3: dual-side verification — backend probes + unit suites, POS suites, native RDD review over the candidate. Commit C (evidence) if needed.

## Log

- L1 (2026-10-12, owner): "Arranquemos en el orden de la tabla" — work the follow-up table in order; #1 = ledger cloud sender.
