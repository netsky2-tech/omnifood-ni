# Cuentas abiertas — re-park, nombre y abandono (fix)

**Branch:** `fix/open-account-lifecycle` (base `origin/main` 0b2630e2)
**Worktree:** `/home/octavio_morales/omnifood-ni-open-accounts`
**Surface:** `apps/pos_app` (Flutter POS, MVVM + Floor/SQLite + Freezed)
**Preceded by:** `odd/tasks/cuentas-abiertas-verificacion.md` (S23 rig verification, 0a21db66)
**Status:** T1-T5 landed and verified — closing

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

### T1 — `TableOrderService.replaceOrderItems` + retire `appendItemsToOrder` — DONE
Add `replaceOrderItems({required String ticketId, required String name, required List<CartItem> items, required int expectedVersion})`:
load entity, throw `StateError` if missing, throw `OptimisticLockException` when
`entity.version != expectedVersion`, rebuild the ticket with the **cart as the whole contents**,
`name` replaced, `version + 1`, everything else (tableId, areaId, guestCount, waiter, tax exemption)
**preserved from the stored entity**, then `saveHoldTicket`.
Delete `appendItemsToOrder` and migrate its 7 test call sites (`table_order_service_test.dart:110,132,140`,
`restaurant_flow_e2e_test.dart:226,393,403`, `kitchen_restaurant_flow_e2e_test.dart:283`).
Core assertion: parking 3 lines / C$440, recalling, and parking again keeps **3 lines / C$440**, not 6 / C$880.

### T2 — Wire `SaleViewModel.holdCurrentTicket` — DONE
Replace the `_activeLoadedHoldTicket != null` branch (:966) with `replaceOrderItems`, forwarding `name`.
Add the first real VM-level regression test (park → recall → re-park keeps the exact total).
Keep `clearCart()` + `loadHoldTickets()` behaviour and the `_activeLoadedHoldTicket = null` reset (:985).

### T3 — Prefill the account name (F3) — DONE
`SaleView.showHoldTicketDialog` (`sale_view.dart:34`) seeds the controller with
`vm.activeLoadedHoldTicket?.name` and makes clear the save edits an existing account instead of
creating one. Widget test for prefill + rename.

### T4 — Abandon an account (F4) — DONE
Confirm-to-abandon affordance on the held-accounts list (`RecallTicketsDialog`, `sale_view.dart:855`),
reusing the existing safe deletion path (`liquidateOrder` → `deleteHoldTicketWithItems`, which also
frees the table). No DGI exposure: a hold ticket is pre-invoice local state and never emitted a
fiscal document. Tests: service-level (gone from `getAllOpenOrders`, table released) + UI-level
(cancelling the confirmation deletes nothing).

### T5 — Checks — DONE
`flutter analyze` on `apps/pos_app`, focused sales/cash suites, and `restaurant_flow_e2e_test.dart`.

Broad run (delegated verifier, 7 executions of the affected area):

| Check | Result |
|---|---|
| `flutter test` over `test/domain/services/sales test/presentation/features/sales test/ui/features/sales test/ui/features/kitchen test/data/daos/sales test/domain/services/kitchen` | **571 passed / 0 failed** in 4 of 7 runs; 3 runs died on a `flutter_tester` WebSocket load error naming a DIFFERENT file each time (`promotions_integration_flow_test.dart`, `restaurant_flow_e2e_test.dart`, `post_paid_feedback_widget_test.dart`), each of which is green when re-run alone. Runner flake, not a regression. |
| Live references to the deleted `appendItemsToOrder` | 0 (2 remaining hits are prose comments) |
| Tests pinning the old dialog copy | none — no test asserted `Poner Venta en Espera` / `puesta en espera`; those strings still exist as the new-account branch |
| DGI audit of the diff | no invoice delete/cancel path exists in `InvoiceDao` at all; `deleteHoldTicketWithItems` touches only `hold_ticket_items` + `hold_tickets`; `HoldTicket` has no invoice linkage; no new sync/network line in `lib/` |
| Invoice numbering vs the `version` bump | independent — `version` is written to `hold_tickets` and read only as the optimistic-lock token; `DgiNumberingService` and `getLastInvoiceNumber()` never read it |
| Mock drift (warning) | `sale_view_security_flows_test.mocks.dart` predates `abandonHoldTicket`; the new widget test hand-writes the override. A future `build_runner` will widen the param to nullable exactly as mockito does for `holdCurrentTicket`, so the override becomes redundant rather than breaking. Regenerate to retire it. |

## Newly found defect (F7): the recall dialog could not render a non-empty list in debug

While wiring T4 the writer replaced `RecallTicketsDialog`'s `shrinkWrap: true`
`ListView.builder` with a bounded `SingleChildScrollView`/`Column` and claimed a pre-existing crash.
That claim was tested rather than trusted — an executable probe reproduced the pre-fix structure:

```text
PROBE_ERROR_COUNT=15
PROBE_ERROR=RenderShrinkWrappingViewport does not support returning intrinsic dimensions.
PROBE_ERROR='package:flutter/src/rendering/box.dart': Failed assertion: line 2251 ... 'hasSize':
             RenderBox was not laid out: RenderIntrinsicWidth#08394
```

Mechanism: `AlertDialog` wraps its content in `IntrinsicWidth` (flutter `dialog.dart:929`) and
`RenderShrinkWrappingViewport` refuses to compute intrinsics (`viewport.dart:562`). So the held-accounts
list threw in **debug** as soon as it had ≥1 ticket, and mis-sized silently in release — which is why the
S23 verification run never saw it: the rig APK was a release build.

Fixed as part of T4 (the abandon affordance cannot exist on a list that cannot render). No prior test
pumped `RecallTicketsDialog`, so nothing guarded it.

## Evidence recorded

T1+T2 verified independently (verifier did not trust the writer's own GREEN):

| Check | Result |
|---|---|
| `flutter analyze` (apps/pos_app) | No issues found |
| `table_order_service_test.dart` | 8 passed / 0 failed |
| `sale_view_model_test.dart` | 37 passed / 0 failed |
| `restaurant_flow_e2e_test.dart` | 3 passed / 0 failed |
| `kitchen_restaurant_flow_e2e_test.dart` | 1 passed / 0 failed |
| Broad sales/kitchen/daos run | 554 passed / 1 loaded — the one failure was `sunmi_v2s_responsive_sale_view_test.dart` failing to LOAD (WebSocket handshake to `flutter_tester`), unrelated to hold tickets, and **green in isolation (3/3)**: runner flake under parallel load, not a regression |
| `appendItemsToOrder` references remaining | 2, both prose comments (`sale_view_model.dart:969`, `restaurant_flow_e2e_test.dart:219`); zero code, mock or generated references |
| e2e migration integrity | no `expect(` deleted in either e2e file; assertions re-expressed under the replace contract, not weakened |
| RED observed | pre-fix VM test failed on the discarded name (`Expected: 'Cuenta 2' / Actual: 'Cuenta 1'`) on the branch that also doubled 3→6 lines / C$440→C$880 |

The guard test that fails if append is restored — `sale_view_model_test.dart:1610-1613`:

```dart
expect(reparked.items, hasLength(3),
    reason: 'A5 device bug: each recover+park cycle doubled 3 -> 6 lines');
final gross = reparked.items.fold<double>(0, (sum, item) => sum + item.grossAmount);
expect(gross, 440.0,
    reason: 'A5 device bug: each recover+park cycle doubled C$440 -> C$880');
```

## Known limitation left standing (concurrency)

`replaceOrderItems` is check-then-write, not compare-and-swap: it reads the entity, compares
`entity.version != expectedVersion`, then saves, as three separate awaits. `saveHoldTicket` is atomic
only for its own replace+reinsert. Two terminals that both load version N can both pass the guard and
the second write silently wins — a **lost update**, not a duplication, so it cannot resurrect the A5
doubling. `mergeOrders`, `splitOrderItems` and `transferOrder` share the same pattern. Making the
version check part of the write transaction is a separate hardening task.

Empty-cart edge: `holdCurrentTicket` returns early when the cart is empty, so recalling an account,
removing every line and re-parking leaves the stored account unchanged instead of emptying it.
Un-addressed UX edge, not a duplication path.

T3+T4 verified by the parent, not trusted from the writer:

| Check | Result |
|---|---|
| `flutter analyze` (apps/pos_app) | No issues found (2.4s) |
| `sale_view_model_test.dart` + `table_order_service_test.dart` | 47 passed / 0 failed |
| `open_account_hold_and_abandon_test.dart` + restaurant e2e + kitchen e2e + sunmi responsive | 12 passed / 0 failed |
| Deleted assertions in the VM test | zero (`git diff` shows additions only) |

Abandon shipped behind an explicit confirmation that names the account, its line count and its total,
states nothing was invoiced and that it cannot be undone, with `CANCELAR` autofocused as the safe
default and the destructive verb styled with the error colour. Deletion reuses `liquidateOrder` →
`deleteHoldTicketWithItems`; no new DAO surface.

Note for the next `build_runner` run: `test/ui/features/sales/open_account_hold_and_abandon_test.dart`
extends the checked-in `MockSaleViewModel` with a hand-written `abandonHoldTicket` override that mirrors
codegen output, because regenerating every `.mocks.dart` in the package was out of scope. Codegen will
absorb it.

## Follow-up opened by the verifier (not built here)

**F8 — already-corrupted open accounts are not repaired.** The fix stops the duplication going
forward, but a device that persisted a doubled cart under the old append still RECALLS the doubled
items, and charging that account still emits an inflated invoice. This is the only remaining path by
which the original symptom reaches a fiscal document. Needs a decision: detect-and-warn on recall, a
one-time local repair, or operator guidance. Unreviewed pilot devices make the blast radius unknown.

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

## Native review receipt

Lineage `review-4a3cb2d9edd0de15` · tier **medium** · 1180 changed lines · lens `review-reliability` ·
correction budget 200 (unused, no correction opened) · consumed revision
`sha256:1f4ad463544d6241010e4a519301337ce77df6c78685a3be7ee9b0f6f6b36e93` · authority **burned** by the
exact provider acknowledgement (`native-approved-acknowledgement-completed`). Outcome: **approved** on
the last admitted event; delivery follows ordinary repository policy.

Five advisory findings were attached. They are non-blocking, they did not reopen the review, and the
provider emitted only id + location + severity (no body), so they are recorded verbatim without
inventing reviewer prose:

| ID | Severity | Location | What lives there (parent's own reading, not reviewer prose) |
|---|---|---|---|
| R3-001 | WARNING | `sale_view_model.dart:1020` | `await _tableOrderService.liquidateOrder(ticket.id);` — the first await of `abandonHoldTicket`, i.e. the delete happens before the local-state cleanup and with no try/catch |
| R3-002 | WARNING | `sale_view_model_test.dart:1679-1684` | the abandon assertions: `holdTickets` empty + table `DISPONIBLE` + `currentTicketId` null |
| R3-003 | WARNING | `sale_view_model.dart:1024` | `_activeLoadedHoldTicket = null; clearCart();` inside the `if (_activeLoadedHoldTicket?.id == ticket.id)` guard |
| R3-004 | SUGGESTION | `table_order_service.dart:133` | `version: entity.version + 1` in the `copyWith` of `replaceOrderItems` |
| R3-005 | SUGGESTION | `sale_view.dart:913-915` | the rewritten recall list: `Column(mainAxisSize: MainAxisSize.min)` built with a `for` over `viewModel.holdTickets` inside a bounded `SingleChildScrollView` |

These are follow-up work for a later slice, not reasons to re-run review on this candidate. R3-001 and
R3-003 sit on the same statement (`abandonHoldTicket` deletes, then clears, then reloads with no error
handling — a failure between them leaves the cart pointing at a deleted account), so they are worth
reading together.

---

# Slice F5 — the close must not pass open accounts (and the two-arithmetic bug)

**Owner decisions (this slice):** gate in **both** close paths + list them in the Corte X ·
**hard block, no supervisor override** · **unify the close on the Corte Z path now**.

## Confirmed evidence for this slice

| Fact | Evidence |
|---|---|
| Two close paths write **the same** `cashier_sessions` row | same lookup `getActiveSessionForUserAndTerminal` (`sale_view_model.dart:1040-1044` vs `cash_shift_view_model.dart:167-174`), same DAO (`:1127` vs `:421`) |
| Their arithmetic differs — the device suspicion is **TRUE** | Path A expected = in-memory `_sessionExpected`, NIO only, no movements, no USD, no Z seq, no voucher gate (`sale_view_model.dart:1114-1129`). Path B = DB float + movements + `getCashPaymentsForShift`, dual currency, voucher gate, Z seq (`cash_shift_view_model.dart:371-397`) |
| Correction to the original wording | Path A does count fresh cash sales (`:1577-1579`); what it omits is movements, USD, and anything before a `checkActiveSession` reset (`:1046-1051`). So: "different arithmetic" TRUE, "omits the shift's cash sales" only partially true |
| If only the Z blocks, ⋮ becomes the side door | ⋮ closes the same row and skips the pending-voucher gate entirely |
| `SaleViewModel.closeSession` has exactly **one** caller | `sale_view.dart:805` — same shape as the retired `appendItemsToOrder` |
| A block dialog pattern already exists | "Bloqueo de Corte Z Fiscal" for pending vouchers (`cash_shift_view.dart:418-440`) |
| Cash VM can reach open accounts | root provider `CashShiftViewModel` (`main.dart:631`); `fromDatabase` already receives `AppDatabase` (`cash_shift_view_model.dart:54-70`) and `database.holdTicketDao` exists (`app_database.dart:210`) |
| **Open accounts never cross the wire** | zero `hold_ticket` references in `lib/data/services/sync_service.dart`. This kills the "blocked by another terminal's accounts" risk AND answers matrix row **D4**: held accounts do not reach the cloud, so the owner cannot see them in the dashboard |
| The domain already models this block | `OpenTablesPendingException` + `WaiterSettlementReport.canCloseShift` + `closeWaiterShift` throwing on `hasOpenTables` (`waiter_settlement_service.dart:9-16, :36-38, :117-119`) — for WAITER shifts, and the whole service has **zero callers**: fifth instance of "complete service, no wiring" |

## Design forks settled by exploration (before writing code)

| Question | Answer | Evidence |
|---|---|---|
| Would unifying drop the ⋮ arqueo record? | **No — the Z close writes a strict superset.** | The weak path writes `isClosed`, `closedAt`, `closingCountedNio`, `expectedNio` (`sale_view_model.dart:1119-1126`). The Z path writes all four plus `closingCountedUsd`, `expectedUsd`, `differenceNio/Usd`, `zReportSequence`, `supervisorId`, `syncStatus` (`cash_shift_view_model.dart:399-421`). `closingBalance`/`totalExpected` are aliases of `closingCountedNio`/`expectedNio` (`cashier_session_entity.dart:45-46,73-75`) and **`totalSales` is not a column at all** — it is `double? get totalSales => null;` (`:47`), so the weak path's `totalSales:` write goes nowhere. |
| Can the ⋮ reach the Z ViewModel? | Yes, no rewiring. | `CashShiftViewModel` is a root provider built by `fromDatabase(database: …)` (`main.dart:664-675`) and `cash_shift_view.dart:444` already opens `CloseShiftDialog` via `ChangeNotifierProvider<CashShiftViewModel>.value`. |
| Do other terminals' open accounts block this one? | No. | Hold tickets never sync (zero references in `sync_service.dart`) and local SQLite is per-terminal, so `getAllOpenOrders()` is this device's own accounts. |
| Does a hard block conflict with the existing Z gates? | No, it joins them. | The Z close already blocks on pending card vouchers (`cash_shift_view_model.dart:371-381`) and the UI blocks before opening the dialog (`cash_shift_view.dart:418-440`) — precedent for a hard fiscal gate. |

**Terminal-id caveat found in passing:** the weak path defaults the terminal to `'TERM-01'`
(`sale_view_model.dart:1042`) while the cash VM defaults to `'term-main'`
(`cash_shift_view_model.dart:51`), and `main.dart` injects the real `deviceId` for the cash VM (FC-1
note, `:671-674`). If the sale path is not injected with the same value, the two paths may not resolve
the same session row on a real multi-terminal deployment. **Not asserted; needs its own check.**

F5 reuses the existing `OpenTablesPendingException` vocabulary instead of inventing a new exception
type.

## Tasks

### T7 — Unify the close on the Corte Z path — DONE
⋮ Cerrar Caja keeps its existing supervisor-override pre-gate (`sale_view.dart:636`,
`_requestSupervisorOverrideForCloseBox`, audit `SUPERVISOR_OVERRIDE_CLOSE_SESSION`), then opens
`CloseShiftDialog` instead of `CloseBoxDialog`. `CloseBoxDialog` and `SaleViewModel.closeSession` are
retired (one caller each), together with `_sessionExpected` (`sale_view_model.dart:656-661`, seeded
:1046-1051/:1103-1108, incremented :1577-1579) whose ONLY reader was the retired dialog — leaving that
counter behind re-arms the same landmine. The field-superset invariant is proven above; re-verify it
still holds after the change.
**Invariant the writer must prove before deleting anything:** every field the ⋮ path wrote on the
session row (`isClosed`, `closedAt`, `closingBalance`, `closingCountedNio`, `totalSales`,
`totalExpected`, `expectedNio`) must be written by the Z path too, or the unified flow must write the
missing ones. Unifying must not silently drop the arqueo record.

### T8 — Hard block on open accounts, enforced at the ViewModel — DONE
Gate in `CashShiftViewModel.closeShiftWithBlindCount`, next to the existing voucher gate. Hard block:
no override, no supervisor bypass. The message names each open account with its line count and total.
Enforce in the VM, not only in the dialog, so no future entry point can bypass it. The dependency must
default to "no open accounts" when unwired, otherwise the existing cash tests (which mock DAOs and seed
no hold tickets) break for the wrong reason.

### T9 — Corte X lists them, without blocking — DONE
`XReportDialog` is read-only (no DAO write, `x_report_dialog.dart`, e2e proves the shift stays open,
`cash_shift_e2e_flow_test.dart:86-88`). Add "Cuentas abiertas: N · C$ X" as information for the
mid-shift print. Matrix row D3 gets its answer here.

### T10 — Checks — DONE (independent verifier, slice F5)

| Check | Result |
|---|---|
| `flutter analyze` | No issues found (4.2s) |
| `flutter test test/ui/features/cash test/ui/features/sales test/presentation/features/sales test/domain/services/sales test/data/daos/sales test/ui/features/kitchen` | **623 passed / 0 failed**. One run lost a file to the known `flutter_tester` load flake (`loyalty_reward_interaction_service_v2_test.dart`), green alone 17/17. **Zero assertion failures attributable to F5** |
| Retired API (`closeSession` / `sessionExpected` / `CloseBoxDialog`) | zero live `lib/` references; the 3 hand-edited mocks converge on the next `build_runner` instead of conflicting |
| Single entry / bypass | `CloseShiftDialog` is constructed only inside `showCloseShiftFlow`; both entries run accounts→vouchers in VM (`:418`/`:447`) and dialog (`:36`/`:54`); the VM re-queries and throws independently, so a future caller cannot bypass the gate |
| Blocked close burns no Z | `zSequence` computed at `:457-458` after both gates; test asserts `countClosedSessions() == 0` after a block and `zReportSequence == 1` on the later resolved close |
| Fail closed | `:422-428` aborts with "No se pudieron verificar las cuentas abiertas" — never assumes zero |
| Waiter path | `closeWaiterShift` still throws names-only, `toString()` unchanged → byte-identical; `WaiterSettlementService` still has zero `lib/` callers |
| DGI / offline | no invoice delete or mutation anywhere in the diff; the gate is local SQLite with no network dependency; the closed row keeps `syncStatus: 'pending'` so an offline close still syncs |

### Two warnings carried out of verification

1. **`init()` is not fail-closed the way the close is.** Its loader call sits in the outer `try`
   (`cash_shift_view_model.dart:217-221`) and the `catch` sets an error message **without clearing
   `_openAccounts`**, so after a failed `init()` the UI pre-gate can act on a stale (possibly empty)
   list. Acceptable as designed — the close re-queries and fail-closes, so no close can slip through —
   but the pre-gate can be skipped cosmetically, which is a real inconsistency worth a follow-up.
2. **The block copy names both exits but warns about only one.** It says "cobrar o abandonar" without
   echoing that abandoning is irreversible; that warning currently lives only in the abandon
   confirmation (`sale_view.dart:895-896`). The destructive route is itself gated, so this is a UX
   follow-up, not a blocker — but it is exactly the spot where an operator at 23:00 decides what to
   discard.

## T7 evidence (unified close)

`showCloseShiftFlow(context, vm)` (`lib/ui/features/cash/widgets/close_shift_dialog.dart:20`) is now the
single Z entry: `vm.init()` (fresh DB state) → pending-voucher fiscal gate → `CloseShiftDialog`. Both
callers go through it: Control de Caja (`cash_shift_view.dart:415`) and ⋮ Cerrar Caja
(`sale_view.dart:678`, `_openUnifiedZClose`), with the supervisor-override pre-gate and the
`SUPERVISOR_OVERRIDE_CLOSE_SESSION` forensic audit left byte-identical (`sale_view.dart:657`).

| Check | Result |
|---|---|
| Retired symbols `sessionExpected` / `closeSession` / `CloseBoxDialog` | zero live `lib/` references — only explanatory comments remain |
| `flutter analyze` | No issues found (3.2s) |
| `sale_view_security_flows_test.dart` | 10 passed (RED before: 7 passed / 3 failed — the override tests found the weak dialog, and the new voucher-gate test found no "Bloqueo de Corte Z Fiscal") |
| `sale_view_model_test.dart` | 39 passed |
| `multi_currency_checkout_e2e_test.dart` | 5 passed |
| `test/ui/features/cash` | 50 passed |
| `test/presentation/features/sales` | 142 passed |
| `test/ui/features/sales` | 183 passed / 1 load-flake (`tabular_nums_and_haptics_test.dart`, green alone 3/3) — same runner-flake class as before |

Unification also exposed how wrong the weak figure was: a card sale plus a USD tender that the in-memory
counter collapsed into a single "500 NIO" is now recorded honestly as `effectiveExpectedUsd 20.00` /
`effectiveExpectedNio -230.00`.

**Nuance to carry into the waiter path:** the deleted per-payment loop held the only `carteraMesero`
non-cash skip. `getCashPaymentsForShift` counts cash rows regardless of session model. No exposure today
(the waiter close path is still unwired), but it must be stated when that path gets wired.

**terminalId check (reported, not a defect):** `main.dart:647` and `:674` inject the SAME `deviceId` into
both VMs, so production resolves one terminal. The `'TERM-01'` vs `'term-main'` divergence is reachable
only through the direct constructor in tests, and the cash VM does not trim the value the way the sale
path does. Not asserted as a live bug.

## T8+T9 evidence (the close gate)

| Requirement | Where | Proof |
|---|---|---|
| Hard block, no override | `close_shift_dialog.dart:41-47` — the only action is `ENTENDIDO` | no confirm/continue path exists in either entry |
| Enforced in the VM, not only the UI | `cash_shift_view_model.dart:418-440` | the UI dialog and `_submit` both handle the throw |
| Gate order: accounts **before** vouchers | VM `:418` vs `:445`; dialog `:41` vs `:54` | deliberate — settling a tab by card creates the voucher that must be reconciled afterwards |
| Fresh re-query at close time | `:421` re-loads instead of trusting `:217`/`init()` | test: account parked after `init()` still blocks |
| Blocked close writes nothing and burns no Z | Z computed at `:457-458`, after both gates; `updateSession` at `:493` | test asserts the resolved close gets `zReportSequence == 1` after a blocked attempt, not 2 |
| Fail closed | `:422-428` — a loader error aborts the close with a message | a close that cannot verify accounts is a close that does not happen |
| Unwired dependency stays inert | `openAccountsLoader == null` skips the gate | the 50 pre-existing cash tests pass unchanged |
| Corte X informs, never blocks | `x_report_dialog.dart` row rendered only when count > 0 | shift stays open (read-only report, `cash_shift_e2e_flow_test.dart:86-88`) |
| Message names the ACCOUNT | `close_shift_dialog.dart:98` uses `a.name`, with line count and total | not the table, so a "Sin mesa (Para llevar)" tab is still identifiable |

Reused the existing domain exception (`OpenTablesPendingException`, `INV-16.5`) with an added optional
`openAccounts` field; the waiter path still throws names-only and is byte-identical. The loader is wired
in `fromDatabase` through `TableOrderService(database).getAllOpenOrders()`, one source of truth for gate,
dialog and X, with no DAO change.

Deferred by the writer for a good reason: the optional "take me to the list" button, because
`RecallTicketsDialog` watches `SaleViewModel` and Control de Caja's context cannot guarantee that
provider — inventing a cross-provider dependency would have exceeded the slice.

Focused runs: `flutter analyze` clean; `open_accounts_close_gate_test.dart` 4/4; `open_accounts_close_gate_ui_test.dart` 3/3; `sale_view_security_flows_test.dart` 11/11; `test/ui/features/cash` 57/57; `sale_view_model_test.dart` 39/39.

## Native review receipt — slice F5

Lineage `review-c6a8248ec46c7c10` · tier **high** · 20 files · 1363 changed lines · correction budget
200 (unused) · consumed revision `sha256:81476176ca3161bc8f11853a2b1ab93d7b0a181c42cd91e5fcf97e977b36f8f8`
· authority **burned** (`native-approved-acknowledgement-completed`). Outcome: **approved** on the last
admitted event. The candidate was scoped to the F5 range (`baseRef f049a381`, committed-only) instead of
the accumulated branch, because F1-F4 (`review-4a3cb2d9edd0de15`) had already been approved and burned —
re-freezing it would have re-reviewed approved code. All four lenses ran as host-relay reviewer runs
(~109.6 KB prompt each).

Nine advisory findings, all non-blocking, recorded with only the id/location/severity the provider
emitted. Two clusters, both about the same seam I flagged during verification:

| Cluster | Findings | Why it matters |
|---|---|---|
| `init()` leaves a stale open-accounts list | `R1-stale-open-accounts-init` (`cash_shift_view_model.dart:216-217`), `R3-002` (`:217-218`), `R4-001` (`:214-218`) | **three independent lenses landed on the same line.** This is warning 1 above: the close fail-closes, but the UI pre-gate can render from a stale list, so the block can be skipped cosmetically before reaching the VM. Convergence across risk, reliability and resilience makes it the strongest follow-up in this slice. |
| The gate depends on its wiring | `R1-open-gate-default` (`:418`), `R2-001` (`:418`) | when `openAccountsLoader == null` the gate is skipped — the deliberate choice that kept 50 existing cash tests honest. Production always wires it via `fromDatabase`, but a fiscal gate whose enforcement depends on a constructor argument is weaker than one that fails closed. |
| Naming and copy | `R2-002` (`sale_view.dart:634`), `R2-003` (`waiter_settlement_service.dart:17`), `R2-004` (`close_shift_dialog.dart:96`) | readability suggestions: the `_requestSupervisorOverrideForCloseBox` name now overstates "close box", `OpenTablesPendingException` carries two meanings (names + accounts), and the block copy offers "abandonar" without repeating that it is irreversible — the same point the verifier raised independently. |

# Slice F8 decision + review follow-ups

## F8 — owner decision: visibility, no auto-repair

An already-duplicated account on a device is still recalled inflated. The owner decided **not to repair
it automatically**: collapsing "duplicate" lines would change real balances, because a legitimate tab
with 2× the same product is indistinguishable from one the defect doubled. Nobody watching from outside
can decide whether C$880 was meant to be 440 or 880 — that is the operator's judgement with the customer
in front of them.

Complication that stays true: **open accounts never sync** (proven in this slice), so the owner cannot
inspect terminals remotely at all. Detecting inflated accounts requires holding the device. What F5 does
contribute is visibility: the Z block now puts every open account, with its line count and total, in
front of the operator at the moment of closing — which is where a doubled tab becomes visible.

## T12 — the three review findings, taken now instead of deferred — DONE

| Finding | Fix |
|---|---|
| `init()` left a stale open-accounts list on failure (three lenses converged) | `_openAccounts` is now nullable where **null means UNVERIFIED**; `init()` clears it *before* its `try`, so a failed read can never report "no open accounts". `openAccountsVerified` is true only after a successful read |
| The gate was skipped when the loader was unwired | the close now **refuses** when the state is unverifiable or unwired, with an explicit message. "There are no open accounts" is only ever an explicit loader answer — three existing tests were changed to *declare* that instead of inheriting it, and no assertion was deleted or relaxed |
| The block copy offered "abandonar" without its consequence | final paragraph now reads `Abandonar la descarta definitivamente: no se puede deshacer.` |

Found while landing it: the Corte X had the same defect in read-only form. It rendered its row only when
`openAccountsCount > 0`, and an unverified state reads as 0 — so the printed X implied "no open accounts"
exactly when the app did not know (`x_report_dialog.dart:126`). It now takes `openAccountsVerified`,
defaults to **unverified** so a call site that forgets the flag fails toward honesty rather than a clean
report, and prints `Cuentas abiertas · No se pudieron verificar`. Verified-with-zero keeps the previous
silent behaviour: with the flag present, silence can only mean a successful empty read. The X remains
strictly read-only.

Checks: `flutter analyze` clean; `test/ui/features/cash` 65 passed; broad run over
`test/ui/features/cash test/ui/features/sales test/presentation/features/sales test/domain/services/sales test/data/daos/sales test/ui/features/kitchen` = **631 passed / 0 failed** in a single run.

## Deferred from this slice

- **F8** (already-duplicated accounts on a device are still recalled inflated) — unchanged, still open.
- **Waiter settlement / `carteraMesero`** (`WaiterSettlementService`) is still unwired. The Z close and
  the waiter close are two different shifts; making the waiter path actually use its existing
  `OpenTablesPendingException` is its own slice.
- D4 is now answered as "does not sync". Whether open accounts SHOULD reach the owner dashboard is a
  product decision this slice does not take.
