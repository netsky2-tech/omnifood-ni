import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/sales/cash_movement_entity.dart';
import 'package:pos_app/ui/features/cash/widgets/x_report_dialog.dart';

CashMovementEntity _movement(String type, {double nio = 0, double usd = 0}) =>
    CashMovementEntity(
      id: 'mov-$type-$nio',
      shiftId: 'shift-1',
      terminalId: 'term-main',
      type: type,
      amountNio: nio,
      amountUsd: usd,
      reason: 'Reembolso administrativo',
      authorizedByUserId: 'user-owner-1',
      timestamp: 1716000000000,
      syncStatus: 'pending',
    );

/// Round-2 P6b: the owner decision routes a CUOTA_FIJA out-of-date
/// administrative refund through a petty-cash expense, so the Corte X must
/// subtract it from the expected cash.
void main() {
  group('splitMovementTotals (round-2 P6b)', () {
    test('a petty-cash administrative refund is an egreso, never an ingreso',
        () {
      final totals = splitMovementTotals([
        _movement('PETTY_CASH', nio: 250.75),
      ]);

      expect(totals.outNio, 250.75);
      expect(
        totals.inNio,
        0.0,
        reason: 'a refund leaves the drawer; counting it as an ingreso would '
            'inflate the blind-count expectation',
      );
    });

    test('cash-in is the only ingreso; cash-out and safe drop are egresos', () {
      final totals = splitMovementTotals([
        _movement('CASH_IN', nio: 100, usd: 5),
        _movement('CASH_OUT', nio: 40),
        _movement('SAFE_DROP', nio: 200, usd: 10),
        _movement('PETTY_CASH', nio: 60),
      ]);

      expect(totals.inNio, 100);
      expect(totals.inUsd, 5);
      expect(totals.outNio, 300);
      expect(totals.outUsd, 10);
    });

    test('no movements is all zeros', () {
      final totals = splitMovementTotals(const []);

      expect(totals.inNio, 0);
      expect(totals.inUsd, 0);
      expect(totals.outNio, 0);
      expect(totals.outUsd, 0);
    });
  });
}
