import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:pos_app/domain/models/inventory/batch.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
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
    when(mockRepo.getActiveInsumos()).thenAnswer(
      (_) async => [
        const Insumo(
          id: 'i1',
          name: 'Leche',
          consumptionUom: 'ml',
          stock: 100,
          averageCost: 2,
          isPerishable: true,
        ),
      ],
    );
    when(mockRepo.getActiveSuppliers()).thenAnswer((_) async => []);
    when(mockRepo.getBatchesByInsumoId('i1')).thenAnswer((_) async => []);
    when(mockRepo.getPurchaseHistory()).thenAnswer((_) async => const []);
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

      when(mockRepo.getActiveSuppliers()).thenAnswer((_) async => []);
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [conversion]);
      await viewModel.loadInitialData(insumoId: 'i1');

      when(
        mockEngine.recordPurchase(
          'i1',
          45360,
          0.1609,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).thenAnswer((_) async {});
      when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});
      when(mockRepo.saveBatch(any)).thenAnswer((_) async {});

      // Act
      await viewModel.recordPurchase(
        insumoId: 'i1',
        supplierId: 's1',
        invoiceNumber: 'INV-1001',
        uomConversionId: 'c1',
        quantity: 2,
        unitCost: 100,
        invoiceDate: DateTime(2026, 1, 10),
        currency: 'USD',
        bcnRate: 36.5,
        lotCode: 'LOT-1',
        receivedDate: DateTime(2026, 1, 10),
        expirationDate: DateTime(2026, 2, 10),
      );

      // Assert
      verify(
        mockEngine.recordPurchase(
          'i1',
          45360,
          0.1609,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).called(1);
      verify(mockRepo.queuePurchaseSync(any)).called(1);
      verify(mockRepo.saveBatch(any)).called(1);
      expect(viewModel.isLoading, false);
      expect(viewModel.errorMessage, isNull);
    });

    test('converts 50 lb purchase quantity, base unit cost, and total through review flow', () async {
      final lbToKg = UomConversion(
        id: 'lb-kg',
        insumoId: 'i1',
        unitName: 'lb',
        factor: 0.453592,
      );
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [lbToKg]);
      await viewModel.loadInitialData(insumoId: 'i1');

      when(
        mockEngine.recordPurchase(
          'i1',
          22.6796,
          22.0462,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).thenAnswer((_) async {});
      when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});
      when(mockRepo.saveBatch(any)).thenAnswer((_) async {});

      await viewModel.recordPurchase(
        insumoId: 'i1',
        supplierId: 's1',
        invoiceNumber: 'INV-1002',
        uomConversionId: 'lb-kg',
        quantity: 50,
        unitCost: 10,
        invoiceDate: DateTime(2026, 1, 10),
        currency: 'NIO',
        lotCode: 'LOT-LB',
        receivedDate: DateTime(2026, 1, 10),
        expirationDate: DateTime(2026, 2, 10),
      );

      verify(
        mockEngine.recordPurchase(
          'i1',
          22.6796,
          22.0462,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).called(1);
      final queuedPurchase = verify(
        mockRepo.queuePurchaseSync(captureAny),
      ).captured.single as Purchase;
      expect(queuedPurchase.quantity, 22.6796);
      expect(queuedPurchase.unitCostNio, 22.0462);
      expect(
        (queuedPurchase.quantity * queuedPurchase.unitCostNio!).toStringAsFixed(0),
        '500',
      );
      verify(mockRepo.saveBatch(any)).called(1);
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
          invoiceNumber: 'INV-1003',
          uomConversionId: 'invalid',
          quantity: 2,
          unitCost: 100,
          invoiceDate: DateTime(2026, 1, 10),
          currency: 'NIO',
        ),
        throwsArgumentError,
      );
    });

    test('rejects USD purchase without explicit bcnRate', () async {
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [conversion]);
      await viewModel.loadInitialData(insumoId: 'i1');

      await expectLater(
        () => viewModel.recordPurchase(
          insumoId: 'i1',
          supplierId: 's1',
          invoiceNumber: 'INV-USD-1',
          uomConversionId: 'c1',
          quantity: 2,
          unitCost: 100,
          invoiceDate: DateTime(2026, 1, 10),
          currency: 'USD',
          lotCode: 'LOT-1',
          receivedDate: DateTime(2026, 1, 10),
          expirationDate: DateTime(2026, 2, 10),
        ),
        throwsArgumentError,
      );
      verifyNever(
        mockEngine.recordPurchase(
          any,
          any,
          any,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      );
    });

    test('blocks duplicate supplier invoice before local stock mutation', () async {
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [conversion]);
      when(mockRepo.getPurchaseHistory()).thenAnswer(
        (_) async => [
          Purchase(
            id: 'existing-purchase',
            insumoId: 'i1',
            supplierId: 's1',
            invoiceNumber: 'INV-1001',
            quantity: 1,
            unitCost: 50,
            timestamp: DateTime(2026, 1, 9),
            invoiceDate: DateTime(2026, 1, 9),
            bcnRate: 1,
          ),
        ],
      );
      await viewModel.loadInitialData(insumoId: 'i1');

      await expectLater(
        () => viewModel.recordPurchase(
          insumoId: 'i1',
          supplierId: 's1',
          invoiceNumber: ' INV-1001 ',
          uomConversionId: 'c1',
          quantity: 2,
          unitCost: 100,
          invoiceDate: DateTime(2026, 1, 10),
          currency: 'NIO',
          lotCode: 'LOT-1',
          receivedDate: DateTime(2026, 1, 10),
          expirationDate: DateTime(2026, 2, 10),
        ),
        throwsArgumentError,
      );

      verifyNever(
        mockEngine.recordPurchase(
          any,
          any,
          any,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      );
      verifyNever(mockRepo.queuePurchaseSync(any));
    });

    test('allows the same invoice number for a different supplier', () async {
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [conversion]);
      when(mockRepo.getPurchaseHistory()).thenAnswer(
        (_) async => [
          Purchase(
            id: 'existing-purchase',
            insumoId: 'i1',
            supplierId: 'other-supplier',
            invoiceNumber: 'INV-1001',
            quantity: 1,
            unitCost: 50,
            timestamp: DateTime(2026, 1, 9),
            invoiceDate: DateTime(2026, 1, 9),
            bcnRate: 1,
          ),
        ],
      );
      await viewModel.loadInitialData(insumoId: 'i1');

      when(
        mockEngine.recordPurchase(
          'i1',
          45360,
          0.0044,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).thenAnswer((_) async {});
      when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});
      when(mockRepo.saveBatch(any)).thenAnswer((_) async {});

      await viewModel.recordPurchase(
        insumoId: 'i1',
        supplierId: 's1',
        invoiceNumber: 'INV-1001',
        uomConversionId: 'c1',
        quantity: 2,
        unitCost: 100,
        invoiceDate: DateTime(2026, 1, 10),
        currency: 'NIO',
        lotCode: 'LOT-1',
        receivedDate: DateTime(2026, 1, 10),
        expirationDate: DateTime(2026, 2, 10),
      );

      verify(
        mockEngine.recordPurchase(
          'i1',
          45360,
          0.0044,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).called(1);
      verify(mockRepo.queuePurchaseSync(any)).called(1);
    });

    test('builds FIFO state with near-expiry and expired batches', () async {
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [conversion]);
      when(mockRepo.getBatchesByInsumoId('i1')).thenAnswer(
        (_) async => [
          Batch(
            id: 'b1',
            insumoId: 'i1',
            batchNumber: 'EXP',
            expirationDate: DateTime.now().subtract(const Duration(days: 1)),
            remainingStock: 2,
            cost: 10,
          ),
          Batch(
            id: 'b2',
            insumoId: 'i1',
            batchNumber: 'NEAR',
            expirationDate: DateTime.now().add(const Duration(days: 3)),
            remainingStock: 3,
            cost: 10,
          ),
        ],
      );

      await viewModel.loadInitialData(insumoId: 'i1');

      expect(viewModel.fifoRows, hasLength(2));
      expect(viewModel.fifoRows.first.isExpired, true);
      expect(viewModel.fifoRows.last.isNearExpiry, true);
    });
  });
}
