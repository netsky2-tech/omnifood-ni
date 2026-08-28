import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';
import 'package:pos_app/domain/services/inventory/kardex_recalculation_engine.dart';

void main() {
  late KardexRecalculationEngine engine;

  setUp(() {
    engine = KardexRecalculationEngine(
      autoApproveThresholdNio: 1500.0,
    );
  });

  group('KardexRecalculationEngine (Batch 6b Phase 2)', () {
    test('retrocalculates single provisional negative outflow upon replenishment', () {
      final provisionalMovement = MovementEntity(
        id: 'mov-outflow-1',
        insumoId: 'ins-cafe-1',
        type: 'SALE',
        quantity: -10.0,
        previousStock: 0.0,
        newStock: -10.0,
        unitCostNio: 50.0, // Historical provisional cost
        timestamp: '2026-08-21T10:00:00Z',
        estadoCosteo: 10, // PROVISIONAL
      );

      final triggerPurchase = MovementEntity(
        id: 'mov-purch-1',
        insumoId: 'ins-cafe-1',
        type: 'PURCHASE',
        quantity: 20.0,
        previousStock: -10.0,
        newStock: 10.0,
        unitCostNio: 65.0, // New real purchase cost
        timestamp: '2026-08-21T12:00:00Z',
        estadoCosteo: 30,
      );

      final result = engine.calculateRegularization(
        provisionalMovement: provisionalMovement,
        triggerMovement: triggerPurchase,
      );

      expect(result.isAutoApproved, isTrue);
      expect(result.recalculatedUnitCostNio, 65.0);
      expect(result.deltaUnitCostNio, 15.0); // 65.0 - 50.0
      expect(result.totalDeltaCostNio, 150.0); // 15.0 * 10.0
      expect(result.affectedQuantity, 10.0);
      expect(result.targetCostingState, 30); // REGULARIZED
      expect(result.lineageHash.isNotEmpty, isTrue);
    });

    test('blocks regularization when total delta cost exceeds auto-approve threshold (C\$1,500)', () {
      final provisionalMovement = MovementEntity(
        id: 'mov-outflow-big',
        insumoId: 'ins-carne-1',
        type: 'SALE',
        quantity: -100.0,
        previousStock: 0.0,
        newStock: -100.0,
        unitCostNio: 100.0,
        timestamp: '2026-08-21T09:00:00Z',
        estadoCosteo: 10,
      );

      final triggerPurchase = MovementEntity(
        id: 'mov-purch-big',
        insumoId: 'ins-carne-1',
        type: 'PURCHASE',
        quantity: 150.0,
        previousStock: -100.0,
        newStock: 50.0,
        unitCostNio: 125.0, // Delta = 25.0 NIO -> Total Delta = 25 * 100 = 2500 NIO (> 1500)
        timestamp: '2026-08-21T11:00:00Z',
        estadoCosteo: 30,
      );

      final result = engine.calculateRegularization(
        provisionalMovement: provisionalMovement,
        triggerMovement: triggerPurchase,
      );

      expect(result.isAutoApproved, isFalse);
      expect(result.totalDeltaCostNio, 2500.0);
      expect(result.targetCostingState, 40); // INTERVENTION_BLOCKED
      expect(result.bloqueoMotivo, 'UMBRAL_EXCEDIDO');
    });

    test('generates deterministic lineage hash for identical inputs', () {
      final mov1 = MovementEntity(
        id: 'mov-1',
        insumoId: 'ins-1',
        type: 'SALE',
        quantity: -5.0,
        previousStock: 0.0,
        newStock: -5.0,
        unitCostNio: 20.0,
        timestamp: '2026-08-21T10:00:00Z',
      );

      final purch = MovementEntity(
        id: 'purch-1',
        insumoId: 'ins-1',
        type: 'PURCHASE',
        quantity: 10.0,
        previousStock: -5.0,
        newStock: 5.0,
        unitCostNio: 25.0,
        timestamp: '2026-08-21T11:00:00Z',
      );

      final result1 = engine.calculateRegularization(
        provisionalMovement: mov1,
        triggerMovement: purch,
      );

      final result2 = engine.calculateRegularization(
        provisionalMovement: mov1,
        triggerMovement: purch,
      );

      expect(result1.lineageHash, result2.lineageHash);
    });
  });
}
