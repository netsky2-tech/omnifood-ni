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
    when(mockRepo.getCachedOfficialBcnRate()).thenAnswer((_) async => 36.6241);
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
        fiscalAuthorizationCode: '  CAE-ABC-123  ',
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
      final queuedPurchase =
          verify(mockRepo.queuePurchaseSync(captureAny)).captured.single
              as Purchase;
      expect(queuedPurchase.fxRateMode, purchaseFxRateModeExplicit);
      expect(queuedPurchase.fiscalAuthorizationCode, 'CAE-ABC-123');
      verify(mockRepo.saveBatch(any)).called(1);
      expect(viewModel.isLoading, false);
      expect(viewModel.errorMessage, isNull);
    });

    test(
      'stores official fxRateMode after a successful official lookup',
      () async {
        when(
          mockRepo.getConversionsByInsumoId('i1'),
        ).thenAnswer((_) async => [conversion]);
        when(
          mockRepo.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
        ).thenAnswer((_) async => 36.7123);
        await viewModel.loadInitialData(insumoId: 'i1');
        await viewModel.fetchOfficialBcnRate(DateTime(2026, 1, 10));

        when(
          mockEngine.recordPurchase(
            any,
            any,
            any,
            movementId: anyNamed('movementId'),
            reason: anyNamed('reason'),
          ),
        ).thenAnswer((_) async {});
        when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});
        when(mockRepo.saveBatch(any)).thenAnswer((_) async {});

        await viewModel.recordPurchase(
          insumoId: 'i1',
          supplierId: 's1',
          invoiceNumber: 'INV-OFFICIAL-1',
          uomConversionId: 'c1',
          quantity: 2,
          unitCost: 100,
          invoiceDate: DateTime(2026, 1, 10),
          currency: 'USD',
          bcnRate: 36.7123,
          lotCode: 'LOT-1',
          receivedDate: DateTime(2026, 1, 10),
          expirationDate: DateTime(2026, 2, 10),
        );

        final queuedPurchase =
            verify(mockRepo.queuePurchaseSync(captureAny)).captured.single
                as Purchase;
        expect(queuedPurchase.fxRateMode, purchaseFxRateModeOfficial);
        expect(queuedPurchase.bcnRate, 36.7123);
      },
    );

    test('falls back to explicit fxRateMode after a manual override', () async {
      when(
        mockRepo.getConversionsByInsumoId('i1'),
      ).thenAnswer((_) async => [conversion]);
      when(
        mockRepo.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
      ).thenAnswer((_) async => 36.7123);
      await viewModel.loadInitialData(insumoId: 'i1');
      await viewModel.fetchOfficialBcnRate(DateTime(2026, 1, 10));
      viewModel.markOfficialBcnRateOverriddenManually();

      when(
        mockEngine.recordPurchase(
          any,
          any,
          any,
          movementId: anyNamed('movementId'),
          reason: anyNamed('reason'),
        ),
      ).thenAnswer((_) async {});
      when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});
      when(mockRepo.saveBatch(any)).thenAnswer((_) async {});

      await viewModel.recordPurchase(
        insumoId: 'i1',
        supplierId: 's1',
        invoiceNumber: 'INV-MANUAL-1',
        uomConversionId: 'c1',
        quantity: 2,
        unitCost: 100,
        invoiceDate: DateTime(2026, 1, 10),
        currency: 'USD',
        bcnRate: 36.9,
        lotCode: 'LOT-1',
        receivedDate: DateTime(2026, 1, 10),
        expirationDate: DateTime(2026, 2, 10),
      );

      final queuedPurchase =
          verify(mockRepo.queuePurchaseSync(captureAny)).captured.single
              as Purchase;
      expect(queuedPurchase.fxRateMode, purchaseFxRateModeExplicit);
      expect(queuedPurchase.bcnRate, 36.9);
    });

    test(
      'converts 50 lb purchase quantity, base unit cost, and total through review flow',
      () async {
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
        final queuedPurchase =
            verify(mockRepo.queuePurchaseSync(captureAny)).captured.single
                as Purchase;
        expect(queuedPurchase.quantity, 22.6796);
        expect(queuedPurchase.unitCostNio, 22.0462);
        expect(
          (queuedPurchase.quantity * queuedPurchase.unitCostNio!)
              .toStringAsFixed(0),
          '500',
        );
        verify(mockRepo.saveBatch(any)).called(1);
      },
    );

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

    test(
      'blocks duplicate supplier invoice before local stock mutation',
      () async {
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
      },
    );

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

  group('fetchOfficialBcnRate', () {
    test('stores the official source state when the lookup succeeds', () async {
      when(
        mockRepo.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
      ).thenAnswer((_) async => 36.7123);

      final result = await viewModel.fetchOfficialBcnRate(
        DateTime(2026, 1, 10),
      );

      expect(result, 36.7123);
      expect(viewModel.hasOfficialBcnRate, true);
      expect(viewModel.bcnRateLookupMessage, officialBcnRateLoadedMessage);

      viewModel.markOfficialBcnRateStaleForInvoiceDateChange();

      expect(viewModel.hasOfficialBcnRate, false);
      expect(viewModel.bcnRateLookupMessage, officialBcnRateDateChangedMessage);
    });

    test(
      'switches to manual source when the cashier edits the BCN rate',
      () async {
        when(
          mockRepo.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
        ).thenAnswer((_) async => 36.7123);

        await viewModel.fetchOfficialBcnRate(DateTime(2026, 1, 10));

        viewModel.markOfficialBcnRateOverriddenManually();

        expect(viewModel.hasOfficialBcnRate, false);
        expect(
          viewModel.bcnRateLookupMessage,
          officialBcnRateManualOverrideMessage,
        );
      },
    );

    test('keeps the flow manual-first when the lookup fails', () async {
      when(
        mockRepo.fetchOfficialBcnRateByInvoiceDate(DateTime(2026, 1, 10)),
      ).thenThrow(
        const OfficialBcnRateLookupException(
          'Official BCN lookup is unavailable offline. Enter the BCN rate manually to continue.',
        ),
      );

      final result = await viewModel.fetchOfficialBcnRate(
        DateTime(2026, 1, 10),
      );

      expect(result, isNull);
      expect(viewModel.hasOfficialBcnRate, false);
      expect(viewModel.bcnRateLookupMessage, contains('manually'));
      expect(viewModel.errorMessage, isNull);
    });
  });

  group('guard de lote (#938 S1, S3)', () {
    const nonPerishableInsumo = Insumo(
      id: 'i-non-perishable',
      name: 'Arroz',
      consumptionUom: 'g',
      stock: 50,
      averageCost: 1.5,
      isPerishable: false,
    );
    const perishableInsumo = Insumo(
      id: 'i-perishable',
      name: 'Yogurt',
      consumptionUom: 'ml',
      stock: 100,
      averageCost: 2.0,
      isPerishable: true,
    );
    final existingBatch = Batch(
      id: 'b-existing',
      insumoId: 'i-non-perishable',
      batchNumber: 'LOT-OLD-1',
      receivedDate: DateTime(2026, 1, 1),
      expirationDate: DateTime(2026, 6, 1),
      remainingStock: 50,
      cost: 1.5,
    );
    final conversion = UomConversion(
      id: 'c-base',
      insumoId: 'i-non-perishable',
      unitName: 'g',
      factor: 1,
      isDefault: true,
    );

    test(
      'buildPurchaseReview reports requiresBatchTracking == true and trackedByExistingBatches == true for non-perishable insumo that already has a batch',
      () async {
        when(mockRepo.getActiveInsumos()).thenAnswer(
          (_) async => [nonPerishableInsumo],
        );
        when(
          mockRepo.getConversionsByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [conversion]);
        when(
          mockRepo.getBatchesByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [existingBatch]);

        await viewModel.loadInitialData(insumoId: 'i-non-perishable');

        final review = viewModel.buildPurchaseReview(
          insumoId: 'i-non-perishable',
          uomConversionId: 'c-base',
          quantity: 10,
          unitCost: 20,
          currency: 'NIO',
        );

        expect(review.requiresBatchTracking, isTrue);
        expect(review.trackedByExistingBatches, isTrue);
      },
    );

    test(
      'buildPurchaseReview reports requiresBatchTracking == true and trackedByExistingBatches == false for perishable insumo with no batches',
      () async {
        final perishableConversion = UomConversion(
          id: 'c-perishable',
          insumoId: 'i-perishable',
          unitName: 'ml',
          factor: 1,
          isDefault: true,
        );
        when(mockRepo.getActiveInsumos()).thenAnswer(
          (_) async => [perishableInsumo],
        );
        when(
          mockRepo.getConversionsByInsumoId('i-perishable'),
        ).thenAnswer((_) async => [perishableConversion]);
        when(
          mockRepo.getBatchesByInsumoId('i-perishable'),
        ).thenAnswer((_) async => []);

        await viewModel.loadInitialData(insumoId: 'i-perishable');

        final review = viewModel.buildPurchaseReview(
          insumoId: 'i-perishable',
          uomConversionId: 'c-perishable',
          quantity: 10,
          unitCost: 20,
          currency: 'NIO',
        );

        expect(review.requiresBatchTracking, isTrue);
        expect(review.trackedByExistingBatches, isFalse);
      },
    );

    test(
      'buildPurchaseReview reports requiresBatchTracking == false for non-perishable insumo with no batches',
      () async {
        when(mockRepo.getActiveInsumos()).thenAnswer(
          (_) async => [nonPerishableInsumo],
        );
        when(
          mockRepo.getConversionsByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [conversion]);
        when(
          mockRepo.getBatchesByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => []);

        await viewModel.loadInitialData(insumoId: 'i-non-perishable');

        final review = viewModel.buildPurchaseReview(
          insumoId: 'i-non-perishable',
          uomConversionId: 'c-base',
          quantity: 10,
          unitCost: 20,
          currency: 'NIO',
        );

        expect(review.requiresBatchTracking, isFalse);
        expect(review.trackedByExistingBatches, isFalse);
      },
    );

    test(
      'recordPurchase on non-perishable insumo that already has a batch without lot metadata throws ArgumentError containing "already tracked by lot" and never calls recordPurchase or queuePurchaseSync',
      () async {
        when(mockRepo.getActiveInsumos()).thenAnswer(
          (_) async => [nonPerishableInsumo],
        );
        when(
          mockRepo.getConversionsByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [conversion]);
        when(
          mockRepo.getBatchesByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [existingBatch]);

        await viewModel.loadInitialData(insumoId: 'i-non-perishable');

        // `expectLater` awaits the future, so the negative verifications below
        // are meaningful: the refusal happens after two async reads.
        await expectLater(
          viewModel.recordPurchase(
            insumoId: 'i-non-perishable',
            supplierId: 's1',
            invoiceNumber: 'INV-BATCH-1',
            uomConversionId: 'c-base',
            quantity: 10,
            unitCost: 20,
            invoiceDate: DateTime(2026, 1, 10),
            currency: 'NIO',
            // lotCode, receivedDate, expirationDate omitted
          ),
          throwsA(
            isA<ArgumentError>().having(
              (e) => e.message,
              'message',
              contains('already tracked by lot'),
            ),
          ),
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
        verifyNever(mockRepo.saveBatch(any));
      },
    );

    test(
      'recordPurchase on non-perishable insumo that already has a batch WITH complete lot metadata succeeds, calls saveBatch once, and persists requiresBatchTracking == true',
      () async {
        when(mockRepo.getActiveInsumos()).thenAnswer(
          (_) async => [nonPerishableInsumo],
        );
        when(
          mockRepo.getConversionsByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [conversion]);
        when(
          mockRepo.getBatchesByInsumoId('i-non-perishable'),
        ).thenAnswer((_) async => [existingBatch]);
        when(
          mockEngine.recordPurchase(
            any,
            any,
            any,
            movementId: anyNamed('movementId'),
            reason: anyNamed('reason'),
          ),
        ).thenAnswer((_) async {});
        when(mockRepo.queuePurchaseSync(any)).thenAnswer((_) async {});
        when(mockRepo.saveBatch(any)).thenAnswer((_) async {});

        await viewModel.loadInitialData(insumoId: 'i-non-perishable');

        await viewModel.recordPurchase(
          insumoId: 'i-non-perishable',
          supplierId: 's1',
          invoiceNumber: 'INV-BATCH-2',
          uomConversionId: 'c-base',
          quantity: 10,
          unitCost: 20,
          invoiceDate: DateTime(2026, 1, 10),
          currency: 'NIO',
          lotCode: 'LOT-NEW-1',
          receivedDate: DateTime(2026, 1, 10),
          expirationDate: DateTime(2026, 7, 10),
        );

        verify(
          mockEngine.recordPurchase(
            'i-non-perishable',
            10.0,
            20.0,
            movementId: anyNamed('movementId'),
            reason: anyNamed('reason'),
          ),
        ).called(1);

        final queuedPurchase =
            verify(mockRepo.queuePurchaseSync(captureAny)).captured.single
                as Purchase;
        expect(queuedPurchase.requiresBatchTracking, isTrue);
        expect(queuedPurchase.lotCode, 'LOT-NEW-1');

        final savedBatch =
            verify(mockRepo.saveBatch(captureAny)).captured.single as Batch;
        expect(savedBatch.insumoId, 'i-non-perishable');
        expect(savedBatch.batchNumber, 'LOT-NEW-1');
        expect(savedBatch.remainingStock, 10.0);
      },
    );
  });
}
