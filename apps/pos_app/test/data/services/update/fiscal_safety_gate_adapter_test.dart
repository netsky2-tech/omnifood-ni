import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/services/update/fiscal_safety_gate_adapter.dart';
import 'package:pos_app/domain/ports/fiscal_safety_gate_port.dart';

void main() {
  group('FiscalSafetyGateAdapter', () {
    test('returns FiscalGateClear when quiet (no cart, no sale, no shift)', () async {
      final gate = FiscalSafetyGateAdapter(
        hasActiveCart: () => false,
        isSaleInFlight: () => false,
        checkOpenShift: () async => false,
      );

      final verdict = await gate.evaluateSafety();

      expect(verdict, isA<FiscalGateClear>());
    });

    test('blocks when cart is not empty (Rule R7)', () async {
      final gate = FiscalSafetyGateAdapter(
        hasActiveCart: () => true,
        isSaleInFlight: () => false,
        checkOpenShift: () async => false,
      );

      final verdict = await gate.evaluateSafety();

      expect(verdict, isA<FiscalGateBlocked>());
      final blocked = verdict as FiscalGateBlocked;
      expect(blocked.reasons, [FiscalBlockReason.cartNotEmpty]);
      expect(blocked.summary, contains('carrito'));
    });

    test('blocks when sale is in flight', () async {
      final gate = FiscalSafetyGateAdapter(
        hasActiveCart: () => false,
        isSaleInFlight: () => true,
        checkOpenShift: () async => false,
      );

      final verdict = await gate.evaluateSafety();

      expect(verdict, isA<FiscalGateBlocked>());
      final blocked = verdict as FiscalGateBlocked;
      expect(blocked.reasons, [FiscalBlockReason.saleInFlight]);
      expect(blocked.summary, contains('transacción'));
    });

    test('blocks when shift is open', () async {
      final gate = FiscalSafetyGateAdapter(
        hasActiveCart: () => false,
        isSaleInFlight: () => false,
        checkOpenShift: () async => true,
      );

      final verdict = await gate.evaluateSafety();

      expect(verdict, isA<FiscalGateBlocked>());
      final blocked = verdict as FiscalGateBlocked;
      expect(blocked.reasons, [FiscalBlockReason.shiftOpen]);
      expect(blocked.summary, contains('caja'));
    });

    test('reports multiple concurrent blockers together', () async {
      final gate = FiscalSafetyGateAdapter(
        hasActiveCart: () => true,
        isSaleInFlight: () => true,
        checkOpenShift: () async => true,
      );

      final verdict = await gate.evaluateSafety();

      expect(verdict, isA<FiscalGateBlocked>());
      final blocked = verdict as FiscalGateBlocked;
      expect(blocked.reasons.length, 3);
      expect(blocked.reasons, contains(FiscalBlockReason.cartNotEmpty));
      expect(blocked.reasons, contains(FiscalBlockReason.saleInFlight));
      expect(blocked.reasons, contains(FiscalBlockReason.shiftOpen));
    });

    test('fails closed if checking shift throws an exception', () async {
      final gate = FiscalSafetyGateAdapter(
        hasActiveCart: () => false,
        isSaleInFlight: () => false,
        checkOpenShift: () async => throw Exception('Database locked'),
      );

      final verdict = await gate.evaluateSafety();

      expect(verdict, isA<FiscalGateBlocked>());
      final blocked = verdict as FiscalGateBlocked;
      expect(blocked.reasons, [FiscalBlockReason.shiftOpen]);
    });
  });
}
