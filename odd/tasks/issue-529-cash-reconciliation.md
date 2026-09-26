# Issue #529 — Blind Count Expected Cash Formula (Shift Reconciliation)

Status: IN PROGRESS · Branch: `fix/529-cash-expected-reconciliation` · Worktree: `issue-529-cash-reconciliation` · Base: main @ 2b0a61ec

## Problem & Context

In the POS app, the blind-count close shift compares the cashier's counted cash against `shift.expectedNio` and `shift.expectedUsd`.
Currently, `expectedNio` / `expectedUsd` is ONLY mutated by manual drawer movements (`CASH_IN` / `CASH_OUT`).
A sale does NOT register any cash movement, meaning an entire day of cash sales is completely invisible to the expected figure.
Furthermore, voiding a paid ticket leaves a physical cash refund that has no counterpart in the shift tracking.

## Solution / Target Design

The expected cash amount must be derived/computed as:

```
expected = openingFloat
         + Σ cash payments of NON-canceled invoices in the shift
         + Σ manual movements (CASH_IN - CASH_OUT)
```

With this formula:
1. Every cash sale automatically increases the expected drawer cash.
2. When an invoice is voided (`is_canceled = 1`), it automatically drops out of the sum, reducing the expected cash without requiring an explicit synthetic refund movement.
3. Manual movements (drops, petty cash, change additions) remain tracked independently.

## Units & Scope

- **U1**: DAO / Query support to compute the sum of cash payments by currency for non-canceled invoices in a shift (`shift_id`).
- **U2**: Integrate the computed sales cash into `CashShiftViewModel` when computing expected cash (or at close time / shift state load).
- **U3**: Tests verifying:
  - Opening float + manual movement + cash sale = expected.
  - Voided cash sale drops out of expected.
  - Separate currencies (NIO vs USD) handled cleanly.
