# printer-driver-honesty — #70

Branch: `fix/printer-driver-honesty` (worktree `/home/octavio_morales/omnifood-ni-p1`, base `origin/main` @ `328afd2a`)
Backlog item #70: "Impresión de ticket en papel y auto-print."

## What the item claimed, and what the code actually says

| Claim in the backlog | Verified state |
|---|---|
| "El flag de auto-impresión está en falso por defecto" | **Refuted three times.** `printer_config.dart:20` (`@Default(PrinterDriverType.sunmiV2s)` driver, `@Default(true) autoPrintInvoice`), `printer_config.g.dart:14` (`?? true`), and the read path `printer_config_service.dart:127-129` (`autoInvoiceEntity == null ? true : …`). No production writer of `false` exists — only three test fixtures. |
| "Nunca se completó una prueba de ticket físico en impresora real" | **True, and it cannot be done on the available hardware** (see "Not proven" below). |

## The real defect found while reframing the item

`PrinterResolver.resolve` (`lib/domain/services/printer/printer_resolver.dart:13-23`) has no default
branch and maps **two** drivers to the mock:

```dart
case PrinterDriverType.mock:
case PrinterDriverType.escPosNetwork:
  return _sharedMock;
```

`MockPrinterAdapter` reports `PrinterStatus.ready` and records the job in its history, so every
operation **succeeds**. Meanwhile the settings screen offers `PrinterDriverType.escPosNetwork` as
`'Red TCP/IP'` (`hardware_settings_view.dart:86-90`) — presented as a real printer, not as a
simulator — and **nothing in `lib/` reads or writes `networkIpKey` / `networkPortKey`**, so the IP and
port can never be entered.

Consequence: an operator can select "Red TCP/IP", the terminal accepts the profile, reports success,
and **prints nothing, with no error anywhere**. `_lastPrintError` stays null because the mock never
fails. This is the same defect family as the rest of this session's work: an unknown state converted
into a false success.

The client's own day-1 plan already requires the opposite — Fase 8, check **8.6**: *"Si la impresora no
imprime, el sistema **lo dice** en vez de mentir con un éxito"*
(`docs/plans/sales/prueba_integral_dia_1_soho.md:203`).

## Founder decisions (this session)

1. **No printer is available now**, so the physical ticket test is declared **NOT PROVEN** rather than
   claimed. It is not "done with a caveat"; it is not done.
2. **Remove the dishonest option and fail explicitly.** The `escPosNetwork` driver must never again
   route work to something that reports success.

## T1 — stop the network driver lying

1. `PrinterResolver.resolve` must not return the mock for `escPosNetwork`. Return a dedicated adapter
   that fails **every** operation with
   `PrinterResult(isSuccess: false, status: PrinterStatus.error, message: <Spanish reason>)` and a
   not-ready status. No false success, and no crash: a thrown exception at port construction would take
   down the hardware screen and the sale path.
2. Remove the `'Red TCP/IP'` segment from the driver selector. Because a terminal may already have
   `escPosNetwork` persisted, the screen must handle that value explicitly and show the profile as
   unsupported with the reason, forcing the operator to pick a real driver.

   *Correction after verification.* This spec originally justified the point by claiming that a
   `SegmentedButton` whose `selected` value has no matching segment **throws**. It does not: Flutter
   3.41.8 asserts only `segments.length > 0`, `selected.length > 0 || emptySelectionAllowed` and the
   multi-selection bound (`segmented_button.dart:146-148`), and it renders membership per segment, so an
   unmatched value simply renders nothing selected. The load-bearing part of the guard is
   `emptySelectionAllowed`: passing `selected: <PrinterDriverType>{}` without it would trip its own
   assert. The `selected`-subset check is defensive and no test would catch its removal.
3. The failure must reach the operator through the paths that already exist: the sale path records it
   in `SaleViewModel.lastPrintError` (printing stays non-blocking after the sale is committed), and the
   hardware test print shows the reason.
4. Leave `mock` (honestly labelled `'Simulador'`), `sunmiV2s` and `iPosQ80` untouched.

### Checks for T1

- RED first, then GREEN, on: an `escPosNetwork` profile produces a failed print result with a Spanish
  reason and never a success; the sale path records the failure in `lastPrintError`; the hardware
  screen does not offer the removed option and renders a persisted `escPosNetwork` profile as
  unsupported without throwing; `mock`, `sunmiV2s` and `iPosQ80` keep their current behaviour.
- `flutter analyze` clean; focused suites for the touched surfaces green.

## Not proven (declared, must not be read as verified)

The **physical ticket on paper** is not verified, and this branch does not claim it. Evidence that no
printer was reachable at the time:

- the connected rig is `SM-S918B` (Samsung S23 Ultra), which has no integrated printer;
- `dumpsys bluetooth_manager` shows 7 bonded devices, all audio/wearable (Galaxy Buds Pro, Watch6,
  WH-CH520, SRS-XB20, two MEMO-S3) — no printer, and there is no Bluetooth driver in
  `PrinterDriverType` anyway;
- the only drivers backed by real native SDKs are `sunmiV2s` and `iPosQ80`
  (`MethodChannel`-based), both dedicated terminals with a built-in printer;
- the network ESC/POS path is a mock (this work unit) and its IP/port fields do not exist in the UI.

To close the physical test, one of these is needed: a Sunmi V2s or an iPOS Q80 device online and
reachable over adb, or a real ESC/POS network adapter implemented and an actual printer on the LAN.

## Accepted boundaries

1. **`mock` stays selectable.** It is labelled `'Simulador'`, so it does not pretend to be a printer; it
   is used for demos and by tests (`PrinterResolver.sharedMock`).
2. **No Bluetooth driver exists** and none is added here: it is a feature, not a bug fix, and it cannot
   be verified without hardware.
3. The last reviewed receipt-row check for printing (`odd/tasks/issue-561-verification-autoprint.md`)
   covers the activation verification sale's auto-print gate, not hardware output.

## T1 — outcome

Committed as **`ebccc06b`** (4 files under `lib/`, 4 test files — 2 new; 176 insertions, 10 deletions).

Shipped: `UnavailablePrinterAdapter` (`lib/data/adapters/printer/unavailable_printer_adapter.dart`)
fails all nine `PrinterPort` operations with `PrinterStatus.error` and an actionable Spanish reason, and
never throws; `escPosNetwork` resolves to it instead of the mock; the selector no longer offers the
option and a persisted `escPosNetwork` profile renders an explicit unsupported-driver card and is
recoverable by picking a real driver; the failure reaches the operator through
`SaleViewModel.lastPrintError` while the sale still completes.

### Evidence for T1

- Red observed with numbers: `Expected: false / Actual: <true>` on the print result and
  `Actual: PrinterStatus:<PrinterStatus.ready>` on the status check — the mock reporting success.
- Independent verification enumerated all nine port methods and confirmed **every** one returns a
  failure, including the only method with a default implementation (`printReceiptDocument`, whose
  default was already a failure). Construction is inert.
- Focused: 67/67 across four suites. Full suite: 2979 passed with an **empty real-failure set**
  (4 load-time `WebSocketException` flakes, each passing in isolation). `flutter analyze` clean.
- `mock`, `sunmiV2s` and `iPosQ80` resolution unchanged, asserted by identity regression tests; both
  modified test files are pure additions with no expectation edited.
- The `mock` driver stays selectable: it is labelled `'Simulador'`, so it does not pretend to be a
  printer.

## Follow-up findings raised by the verification

Same defect class as this work unit (a false success where the hardware cannot deliver), found while
verifying it, deliberately **not** fixed here because T1's scope was the printer driver and the founder
approved exactly that decision.

1. **`openCashDrawer()` reports success with no hardware.** `sunmi_printer_adapter.dart` and
   `ipos_printer_adapter.dart` both do, on `MissingPluginException`:
   `debugPrint('… openDrawer fallback simulation.'); return PrinterResult.success();`
   Trigger: the default `driverType` is `sunmiV2s` (`printer_config.dart:20`) and the default
   `openDrawerOnCash` is `true`, so on a device without the native service a cash payment calls
   `openCashDrawer()` and **ignores the result**: no drawer opens, nothing opens it, and no error
   surfaces to the cashier — who needs the drawer to give change. `HardwareSettingsViewModel.testOpenDrawer()`
   would likewise report `'Pulso de apertura de gaveta enviado'`.
   Note: the day-1 plan has **no** cash-drawer check (grep for `gaveta` returns nothing; Fase 4 is the
   shift opening), so this is a latent defect rather than a failed client criterion — which is why it is
   recorded instead of escalated.
2. **`checkStatus()` keeps a ready status on missing hardware.** Both adapters set
   `_isHardwareDetected = false` and then still `return PrinterStatus.ready;` on `MissingPluginException`,
   with a test pinning that behaviour (`checkStatus falls back gracefully when MissingPluginException
   occurs`). It does not by itself produce a print success, but it is the same lie one level down.
3. **Minor and not reachable:** `printRawEscPos('')` on either adapter returns success without touching
   the channel; production always sends non-empty bytes (`dgi_report_view.dart`).

## Ledger

| Task | Status | Evidence |
|---|---|---|
| Recon + founder decisions | done | this document; adb and code evidence above |
| T1 (remove the lying driver) | done | `ebccc06b` — 4 lib + 4 test files; 67/67 focused; full suite with an empty real-failure set; every port operation verified to fail honestly |
| Physical ticket test | **not proven** | no printer reachable (see above) |
