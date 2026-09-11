# Q80 Reconnect Auth and Inventory Outcome Runbook

## Overview
This runbook covers the exact physical and end-to-end verification gates required for the `q80-reconnect-auth-and-inventory-outcome` SDD change. It proves that the Q80 offline POS logic, cloud auth persistence, immutable snapshot, and idempotency ACKs work cohesively in an offline-first retail environment.

## 1. Physical Verification (Q80 Device)
Execute this sequence on a physical Q80 terminal with the new POS application build:

1. **Physical Restart**: Reboot the Q80 device.
2. **Offline PIN**: While Wi-Fi is disabled or the cloud is unreachable, enter the PIN to unlock the device. The local session should open successfully using SQLite credentials.
3. **Connectivity Restored / Expired Access**: Enable Wi-Fi. The device should seamlessly recover connectivity. If the access token is expired, the device must transparently perform a valid refresh using the stored credentials without requiring a new PIN/login prompt.
4. **Checkout & Replay Gate**: Process a sale transaction while connected.
   - Force a connection loss right after checkout, OR wait for the POS to attempt a sync.
   - Replay the sync of the invoice (e.g. `001-001-01-00000001`). The system should correctly process the initial payload and acknowledge the duplicates idempotently.

## 2. Automated Evidence (Backend)
Run the automated End-to-End test to verify tenant-scoped evidence.

```bash
cd apps/admin_backend
npm run test:e2e -- --runInBand test/q80-reconnect-inventory-outcome.e2e-spec.ts
```

**Success Criteria:**
- One invoice and one sale receipt are created.
- The immutable snapshot and outcome are processed and stored precisely.
- The exact ACK and Kardex sets are created.
- No generic sale movement is recorded outside the sale receipt provenance.
- The DGI sequence numbers remain unchanged and monotonically correct despite duplicate replays.

## 3. Generated-Code Handling Notes
- Floor ORM code generation (`.g.dart` files) was executed as part of this release.
- **Do not manually edit** any `.g.dart` files. If entities, DAOs, or migrations change in `apps/pos_app`, always run:
  ```bash
  flutter pub run build_runner build --delete-conflicting-outputs
  ```
- Generated code must remain checked in per project standard to guarantee deterministic builds.
