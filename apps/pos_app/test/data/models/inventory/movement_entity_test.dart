import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/data/models/inventory/movement_entity.dart';

void main() {
  group('MovementEntity', () {
    test('should support batch_deductions field', () {
      final entity = MovementEntity(
        id: 'mv-1',
        insumoId: 'ins-1',
        type: 'sale',
        quantity: -2.0,
        previousStock: 10.0,
        newStock: 8.0,
        timestamp: DateTime.now().toIso8601String(),
        batch_deductions: '[{"batchId":"b1","quantity":2.0}]',
      );

      expect(entity.batch_deductions, '[{"batchId":"b1","quantity":2.0}]');
    });
  });
}
