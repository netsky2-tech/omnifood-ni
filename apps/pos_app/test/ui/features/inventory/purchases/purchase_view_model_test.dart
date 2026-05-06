import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/domain/models/inventory/uom_conversion.dart';
import 'package:pos_app/ui/features/inventory/purchases/purchase_view_model.dart';

import 'purchase_view_model_test.mocks.dart';

@GenerateMocks([InventoryRepository, MovementEngine])
void main() {
  late MockInventoryRepository mockRepo;
  late MockMovementEngine mockEngine;
  late PurchaseViewModel viewModel;

  setUp(() {
    mockRepo = MockInventoryRepository();
    mockEngine = MockMovementEngine();
    viewModel = PurchaseViewModel(mockRepo, mockEngine);
    // Default stubs needed by loadInitialData
    when(mockRepo.getActiveInsumos()).thenAnswer((_) async => []);
    when(mockRepo.getActiveSuppliers()).thenAnswer((_) async => []);
  });

  group('recordPurchase', () {
    final conversion = UomConversion(
      id: 'c1',
      insumoId: 'i1',
      unitName: 'Saco',
      factor: 22680,
    );

    test('successfully records a purchase with UOM conversion', () async {
      // Arrange
      viewModel.loadInitialData(); // Mock or set conversions manually
      // Since loadInitialData is async and sets private fields, we can't easily set conversions.
      // But we can use a trick: in the real app, conversions are loaded from repo.
      // For this test, let's assume loadInitialData was called and we mock the repo call.
      
      when(mockRepo.getActiveInsumos()).thenAnswer((_) async => []);
      when(mockRepo.getActiveSuppliers()).thenAnswer((_) async => []);
      when(mockRepo.getConversionsByInsumoId('i1')).thenAnswer((_) async => [conversion]);
      
      await viewModel.loadInitialData(insumoId: 'i1');

      when(mockEngine.recordPurchase('i1', 45360, 100)).thenAnswer((_) async {});
      when(mockRepo.savePurchase(any)).thenAnswer((_) async {});
      when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});

      // Act
      await viewModel.recordPurchase(
        insumoId: 'i1',
        supplierId: 's1',
        uomConversionId: 'c1',
        quantity: 2,
        unitCost: 100,
      );

      // Assert
      verify(mockEngine.recordPurchase('i1', 45360, 100)).called(1);
      verify(mockRepo.savePurchase(any)).called(1);
      verify(mockRepo.queuePurchaseSync(any)).called(1);
      expect(viewModel.isLoading, false);
      expect(viewModel.errorMessage, isNull);
    });

    test('throws error when conversion ID is invalid', () async {
      // Arrange
      when(mockRepo.getActiveInsumos()).thenAnswer((_) async => []);
      when(mockRepo.getActiveSuppliers()).thenAnswer((_) async => []);
      when(mockRepo.getConversionsByInsumoId('i1')).thenAnswer((_) async => []);
      
      await viewModel.loadInitialData(insumoId: 'i1');

      // Act & Assert
      expect(
        () => viewModel.recordPurchase(
          insumoId: 'i1',
          supplierId: 's1',
          uomConversionId: 'invalid',
          quantity: 2,
          unitCost: 100,
        ),
        throwsArgumentError,
      );
    });
  });
}
