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
   `escPosNetwork` persisted, the screen must handle that value explicitly — a `SegmentedButton` whose
   `selected` value has no matching segment throws — and must show the profile as unsupported with the
   reason, forcing the operator to pick a real driver.
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

## Ledger

| Task | Status | Evidence |
|---|---|---|
| Recon + founder decisions | done | this document; adb and code evidence above |
| T1 (remove the lying driver) | in progress | — |
| Physical ticket test | **not proven** | no printer reachable (see above) |
