import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine_impl.dart';
import 'package:pos_app/domain/services/alerts/alert_service.dart';

// Mocking needed repositories and services
class MockInventoryRepository extends Mock implements InventoryRepository {}
class MockAlertService extends Mock implements AlertService {}

void main() {
  late MockInventoryRepository mockRepo;
  late MockAlertService mockAlerts;
  late MovementEngineImpl engine;

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockAlerts = MockAlertService();
    engine = MovementEngineImpl(mockRepo, mockAlerts);
  });

  group('FIFO Logic Tests', () {
    test('should consume oldest batch first (FIFO)', () async {
      // GIVEN
      const insumoId = 'milk-1';
      final batch1 = Batch(id: 'b1', insumoId: insumoId, batchNumber: '1', expirationDate: DateTime(2026, 5, 1), remainingStock: 5.0, cost: 1.0);
      final batch2 = Batch(id: 'b2', insumoId: insumoId, batchNumber: '2', expirationDate: DateTime(2026, 6, 1), remainingStock: 5.0, cost: 1.2);
      
      when(mockRepo.getBatchesByInsumoId(insumoId)).thenAnswer((_) async => [batch1, batch2]);

      // WHEN
      // Logic would be invoked through the engine's sale recording
      final batches = await engine.getBatchesForConsumption(insumoId, 7.0);

      // THEN
      expect(batches.length, 2);
      expect(batches[0].id, 'b1');
      expect(batches[0].deducted, 5.0);
      expect(batches[1].id, 'b2');
      expect(batches[1].deducted, 2.0);
    });
  });
}
