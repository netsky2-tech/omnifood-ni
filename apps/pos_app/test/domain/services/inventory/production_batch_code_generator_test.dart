import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/services/inventory/production_batch_code_generator.dart';

void main() {
  group('ProductionBatchCodeGenerator', () {
    test('generateCode formats standard LOTE-YYYYMMDD-XXX with 3-digit padding', () {
      final date = DateTime(2026, 8, 27);
      final code1 = ProductionBatchCodeGenerator.generateCode(date: date, sequence: 1);
      final code42 = ProductionBatchCodeGenerator.generateCode(date: date, sequence: 42);
      final code999 = ProductionBatchCodeGenerator.generateCode(date: date, sequence: 999);
      final code1000 = ProductionBatchCodeGenerator.generateCode(date: date, sequence: 1000);

      expect(code1, 'LOTE-20260827-001');
      expect(code42, 'LOTE-20260827-042');
      expect(code999, 'LOTE-20260827-999');
      expect(code1000, 'LOTE-20260827-1000');
    });

    test('generateNextCode returns sequence 001 when existing list is empty or has no matching date', () {
      final date = DateTime(2026, 8, 27);
      
      final nextFromEmpty = ProductionBatchCodeGenerator.generateNextCode(
        date: date,
        existingCodes: const [],
      );
      expect(nextFromEmpty, 'LOTE-20260827-001');

      final nextFromDifferentDay = ProductionBatchCodeGenerator.generateNextCode(
        date: date,
        existingCodes: const ['LOTE-20260826-001', 'LOTE-20260826-005', 'RANDOM-BATCH-1'],
      );
      expect(nextFromDifferentDay, 'LOTE-20260827-001');
    });

    test('generateNextCode increments the maximum existing sequence for the same date', () {
      final date = DateTime(2026, 8, 27);
      final existingCodes = [
        'LOTE-20260827-001',
        'LOTE-20260827-002',
        'LOTE-20260827-007',
        'LOTE-20260827-004',
        'LOTE-20260826-099',
      ];

      final nextCode = ProductionBatchCodeGenerator.generateNextCode(
        date: date,
        existingCodes: existingCodes,
      );

      expect(nextCode, 'LOTE-20260827-008');
    });

    test('generateNextCode handles malformed or non-numeric suffixes gracefully', () {
      final date = DateTime(2026, 8, 27);
      final existingCodes = [
        'LOTE-20260827-',
        'LOTE-20260827-ABC',
        'LOTE-20260827-003',
      ];

      final nextCode = ProductionBatchCodeGenerator.generateNextCode(
        date: date,
        existingCodes: existingCodes,
      );

      expect(nextCode, 'LOTE-20260827-004');
    });
  });
}
