import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/batch_deduction.dart';

void main() {
  group('InventoryMovement', () {
    test('should support batchDeductions field', () {
      final movement = InventoryMovement(
        id: 'mv-1',
        insumoId: 'ins-1',
        type: MovementType.sale,
        quantity: -2.0,
        previousStock: 10.0,
        newStock: 8.0,
        timestamp: DateTime.now(),
        batchDeductions: [
          const BatchDeduction(batchId: 'b1', quantity: 2.0),
        ],
      );

      expect(movement.batchDeductions, isNotNull);
      expect(movement.batchDeductions!.length, 1);
      expect(movement.batchDeductions![0].batchId, 'b1');
    });

    test('should support JSON serialization with batchDeductions', () {
      final movement = InventoryMovement(
        id: 'mv-1',
        insumoId: 'ins-1',
        type: MovementType.sale,
        quantity: -2.0,
        previousStock: 10.0,
        newStock: 8.0,
        timestamp: DateTime.now(),
        batchDeductions: [
          const BatchDeduction(batchId: 'b1', quantity: 2.0),
        ],
      );

      final json = movement.toJson();
      expect(json['batchDeductions'], isNotNull);
      
      final fromJson = InventoryMovement.fromJson(json);
      expect(fromJson.batchDeductions, isNotNull);
      expect(fromJson.batchDeductions!.length, 1);
    });
  });
}
