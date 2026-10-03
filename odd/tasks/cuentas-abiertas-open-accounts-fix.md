# Cuentas abiertas — re-park, nombre y abandono (fix)

**Branch:** `fix/open-account-lifecycle` (base `origin/main` 0b2630e2)
**Worktree:** `/home/octavio_morales/omnifood-ni-open-accounts`
**Surface:** `apps/pos_app` (Flutter POS, MVVM + Floor/SQLite + Freezed)
**Preceded by:** `odd/tasks/cuentas-abiertas-verificacion.md` (S23 rig verification, 0a21db66)
**Status:** in progress — T1 running

## Owner decisions (binding)

1. **Re-parking a recalled account REPLACES its contents in place and RENAMES it.**
   Recall loads the whole ticket into the cart (`sale_view_model.dart:990-999`), so the cart is
   already the account's complete state. Appending on top of it duplicates (C$440 → C$880 → C$1760).
   Replacement must be controlled: same `id`, `version + 1`, optimistic lock via `expectedVersion`.
2. **A4 and A5 are one defect, not two.** The typed name is discarded on the append branch, so a new
   name neither renames nor creates a second account. Fixing the branch fixes both.
3. **`appendItemsToOrder` is retired, not left latent.** It has exactly ONE call site in all of `lib/`
   — the buggy branch. Leaving the method in place invites the same wiring mistake again.
4. **F5 (close must block when open accounts exist) is decided but OUT of this slice.** Recorded below.

## Root-cause evidence (verified, not inferred)

| Fact | Evidence |
|---|---|
| Append branch is the duplication point | `sale_view_model.dart:966-971` calls `appendItemsToOrder` when `_activeLoadedHoldTicket != null` |
| Append adds by definition | `table_order_service.dart:106-137`: `combinedItems = current + newItems` (:126), `version+1` (:131) |
| `name` argument discarded on that branch | `holdCurrentTicket(name, …)` never forwards `name` to `appendItemsToOrder` |
| Wholesale replace already exists at DAO level | `HoldTicketDao.saveHoldTicket` (`hold_ticket_dao.dart:39-44`, `@transaction`): replace + `deleteHoldTicketItems` + reinsert |
| No test covered `holdCurrentTicket` | only generated `.mocks.dart` references |
| The e2e currently enshrines the buggy semantics | `restaurant_flow_e2e_test.dart:226,232-236` asserts items 2→3 |
| Abandon has no UI path | only destructor call site is checkout: `sale_view_model.dart:1558-1560` → `liquidateOrder` → `deleteHoldTicketWithItems` (`hold_ticket_dao.dart:46-50`); `cancelLoadedHoldTicket` (:1001) clears state only |
| Parking does NOT dispatch to kitchen | single kitchen call is `sendDirectSaleToKitchen` at counter checkout (:1565) → abandoning a ticket cannot orphan a comanda |
| Dialog never prefills | `sale_view.dart:46` builds an empty `TextEditingController`, never reads `vm.activeLoadedHoldTicket` |

## Tasks

### T1 — `TableOrderService.replaceOrderItems` + retire `appendItemsToOrder`
Add `replaceOrderItems({required String ticketId, required String name, required List<CartItem> items, required int expectedVersion})`:
load entity, throw `StateError` if missing, throw `OptimisticLockException` when
`entity.version != expectedVersion`, rebuild the ticket with the **cart as the whole contents**,
`name` replaced, `version + 1`, everything else (tableId, areaId, guestCount, waiter, tax exemption)
**preserved from the stored entity**, then `saveHoldTicket`.
Delete `appendItemsToOrder` and migrate its 7 test call sites (`table_order_service_test.dart:110,132,140`,
`restaurant_flow_e2e_test.dart:226,393,403`, `kitchen_restaurant_flow_e2e_test.dart:283`).
Core assertion: parking 3 lines / C$440, recalling, and parking again keeps **3 lines / C$440**, not 6 / C$880.

### T2 — Wire `SaleViewModel.holdCurrentTicket`
Replace the `_activeLoadedHoldTicket != null` branch (:966) with `replaceOrderItems`, forwarding `name`.
Add the first real VM-level regression test (park → recall → re-park keeps the exact total).
Keep `clearCart()` + `loadHoldTickets()` behaviour and the `_activeLoadedHoldTicket = null` reset (:985).

### T3 — Prefill the account name (F3)
`SaleView.showHoldTicketDialog` (`sale_view.dart:34`) seeds the controller with
`vm.activeLoadedHoldTicket?.name` and makes clear the save edits an existing account instead of
creating one. Widget test for prefill + rename.

### T4 — Abandon an account (F4)
Confirm-to-abandon affordance on the held-accounts list (`RecallTicketsDialog`, `sale_view.dart:855`),
reusing the existing safe deletion path (`liquidateOrder` → `deleteHoldTicketWithItems`, which also
frees the table). No DGI exposure: a hold ticket is pre-invoice local state and never emitted a
fiscal document. Tests: service-level (gone from `getAllOpenOrders`, table released) + UI-level
(cancelling the confirmation deletes nothing).

### T5 — Checks
`flutter analyze` on `apps/pos_app`, focused sales/cash suites, and `restaurant_flow_e2e_test.dart`.

## Deferred (decision taken, not built here)

- **F5 — block the close when open accounts exist (owner chose the Clover-style hard block).**
  Evidence of the gap: zero references to hold tickets anywhere in `lib/ui/features/cash`.
  `CloseBoxDialog` (`sale_view.dart:703-770`) shows only `viewModel.sessionExpected`, and
  `CashShiftViewModel.effectiveExpectedNio/Usd` (`cash_shift_view_model.dart:98-101`) = shift float +
  collected sales. A held account is never collected, so today it crosses the Z silently.
  Before building it, also settle the unconfirmed suspicion of **two close paths with different
  arithmetic** (⋮ Cerrar Caja vs Control de Caja → Corte Z).
- **F6 — expose `mergeOrders` / `transferOrder` / `splitOrderItems`** (implemented, no UI).
- Verification rows still open from the source doc: C3, C4, C5, D2, D3, D4, D5.
