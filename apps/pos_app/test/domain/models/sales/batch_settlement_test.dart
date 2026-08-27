import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/batch_settlement.dart';

void main() {
  group('BatchSettlement Domain Model Tests', () {
    test('instantiates with default and custom values', () {
      final now = DateTime.now();
      final settlement = BatchSettlement(
        id: 'settle-001',
        batchNumber: 'BATCH-100',
        terminalId: 'DATAFONO-BAC-01',
        bankPos: 'BAC Credomatic',
        totalTransactions: 15,
        totalAmountNio: 18500.50,
        totalAmountUsd: 120.00,
        status: 'OPEN',
        openedAt: now,
      );

      expect(settlement.id, 'settle-001');
      expect(settlement.batchNumber, 'BATCH-100');
      expect(settlement.isOpen, isTrue);
      expect(settlement.isSettled, isFalse);
      expect(settlement.totalTransactions, 15);
      expect(settlement.totalAmountNio, 18500.50);
      expect(settlement.totalAmountUsd, 120.00);
    });

    test('serializes to and from JSON correctly', () {
      final now = DateTime(2026, 8, 27, 10, 0, 0);
      final settlement = BatchSettlement(
        id: 'settle-002',
        batchNumber: 'BATCH-102',
        terminalId: 'DATAFONO-BANPRO-01',
        bankPos: 'BANPRO Grupo Promerica',
        totalTransactions: 5,
        totalAmountNio: 4500.0,
        totalAmountUsd: 0.0,
        status: 'SETTLED',
        openedAt: now,
        settledAt: now.add(const Duration(hours: 8)),
        sessionId: 'shift-99',
        settledByUserId: 'user-cajero-1',
      );

      final json = settlement.toJson();
      final fromJson = BatchSettlement.fromJson(json);

      expect(fromJson.id, settlement.id);
      expect(fromJson.batchNumber, 'BATCH-102');
      expect(fromJson.isSettled, isTrue);
      expect(fromJson.isOpen, isFalse);
      expect(fromJson.settledByUserId, 'user-cajero-1');
      expect(fromJson.sessionId, 'shift-99');
    });
  });
}
