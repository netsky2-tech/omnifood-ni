import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/inventory/batch_deduction.dart';

void main() {
  group('BatchDeduction', () {
    test('should create a BatchDeduction instance', () {
      const deduction = BatchDeduction(
        batchId: 'batch-123',
        quantity: 5.0,
      );

      expect(deduction.batchId, 'batch-123');
      expect(deduction.quantity, 5.0);
    });

    test('should support JSON serialization', () {
      const deduction = BatchDeduction(
        batchId: 'batch-123',
        quantity: 5.0,
      );

      final json = deduction.toJson();
      expect(json['batchId'], 'batch-123');
      expect(json['quantity'], 5.0);

      final fromJson = BatchDeduction.fromJson(json);
      expect(fromJson, deduction);
    });
  });
}
