import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/product.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/auth_repository.dart';
import 'package:pos_app/data/adapters/printer/mock_printer_adapter.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

class _MockMovementEngine extends Mock implements MovementEngine {}

class _FakeProductionOrderDocument extends Fake
    implements ProductionOrderDocument {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late ProductionOrderViewModel viewModel;

  const insumos = <Insumo>[
    Insumo(
      id: 'coffee-base',
      name: 'Base de Café',
      consumptionUom: 'kg',
      stock: 12,
      averageCost: 90,
    ),
  ];

  final recipeVersion = RecipeVersionDocument(
    id: 'rv-2026-06',
    productId: 'prod-coffee',
    productName: 'Jarabe Casa',
    versionNumber: 3,
    yieldQuantity: 4,
    technicalShrinkPct: 5,
    createdAt: DateTime(2026, 6, 1),
    components: const [
      RecipeVersionComponentDocument(
        ingredientId: 'raw-1',
        ingredientName: 'Azúcar',
        ingredientType: 'INSUMO',
        grossQuantity: 2,
        netQuantity: 1.9,
        technicalShrinkPct: 5,
      ),
    ],
  );

  setUpAll(() {
    registerFallbackValue(_FakeProductionOrderDocument());
  });

  setUp(() {
    repository = _MockInventoryRepository();
    movementEngine = _MockMovementEngine();
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => insumos);
    when(() => repository.getActiveProducts()).thenAnswer(
      (_) async => const [
        Product(
          id: 'prod-coffee',
          name: 'Jarabe Casa',
          uom: 'lt',
          stock: 0,
          averageCost: 0,
          sellPrice: 0,
        ),
      ],
    );
    when(
      () => repository.getRecipeVersionDocuments(any()),
    ).thenAnswer((_) async => <RecipeVersionDocument>[]);
    when(
      () => repository.getProductionOrderDocuments(),
    ).thenAnswer((_) async => <ProductionOrderDocument>[]);
    when(
      () => repository.reserveProductionSourceSequence(any()),
    ).thenAnswer((_) async => 1);
    when(
      () => repository.saveProductionCloseTransaction(
        any(),
        any(),
        debugFailAfterWrites: any(named: 'debugFailAfterWrites'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => movementEngine.buildProductionClose(
        recipeProductId: any(named: 'recipeProductId'),
        producedInsumoId: any(named: 'producedInsumoId'),
        productionDocumentId: any(named: 'productionDocumentId'),
        recipeVersionId: any(named: 'recipeVersionId'),
        plannedQuantity: any(named: 'plannedQuantity'),
        actualQuantity: any(named: 'actualQuantity'),
        outcome: any(named: 'outcome'),
        reason: any(named: 'reason'),
      ),
    ).thenAnswer(
      (_) async => ProductionCloseResult(
        movements: [
          InventoryMovement(
            id: 'mov-1',
            insumoId: 'coffee-base',
            type: MovementType.production,
            quantity: 1,
            previousStock: 1,
            newStock: 2,
            timestamp: DateTime(2026, 6, 1, 8, 30),
          ),
        ],
        totalConsumedCostNio: 70,
        producedUnitCostNio: 20,
      ),
    );

    viewModel = ProductionOrderViewModel(
      repository,
      movementEngine,
      terminalIdProvider: () => 'pos-terminal-a',
      createId: () => 'order-1',
      clock: () => DateTime(2026, 6, 1, 8, 30),
    );
  });

  test('loadInitialData exposes insumos and persisted closures', () async {
    when(
      () => repository.getRecipeVersionDocuments(any()),
    ).thenAnswer((_) async => [recipeVersion]);
    await viewModel.loadInitialData();

    expect(viewModel.availableInsumos, hasLength(1));
    expect(viewModel.statusMessage, contains('Cerrá producción localmente'));
  });

  test(
    'closeOrderLocally persists a completed close document with idempotency metadata',
    () async {
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModel.loadInitialData();

      when(() => repository.getProductionOrderDocuments()).thenAnswer(
        (_) async => [
          ProductionOrderDocument(
            id: 'order-1',
            recipeVersionId: recipeVersion.id,
            recipeProductId: recipeVersion.productId,
            recipeProductName: recipeVersion.productName,
            producedInsumoId: 'coffee-base',
            producedInsumoName: 'Base de Café',
            plannedQuantity: 4,
            actualQuantity: 3.5,
            producedBatchNumber: 'PB-1',
            producedExpirationDate: DateTime(2026, 7, 1),
            operationDate: DateTime(2026, 6, 1, 8, 30),
            status: 'CLOSED_PENDING_SYNC',
            outcome: 'COMPLETED',
            terminalId: 'pos-terminal-a',
            sourceSequence: 1,
            idempotencyKey: 'production:pos-terminal-a:order-1',
            payloadHash: 'order-1:COMPLETED:4.0:3.5',
            totalConsumedCostNio: 70,
            producedUnitCostNio: 20,
            movementReferences: const ['mov-1'],
          ),
        ],
      );

      await viewModel.closeOrderLocally(
        recipeVersion: recipeVersion,
        producedInsumoId: 'coffee-base',
        plannedQuantity: 4,
        actualQuantity: 3.5,
        producedBatchNumber: 'PB-1',
        producedExpirationDate: DateTime(2026, 7, 1),
        varianceReason: 'Merma',
      );

      verify(
        () => movementEngine.buildProductionClose(
          recipeProductId: recipeVersion.productId,
          producedInsumoId: 'coffee-base',
          productionDocumentId: 'order-1',
          recipeVersionId: recipeVersion.id,
          plannedQuantity: 4,
          actualQuantity: 3.5,
          outcome: 'COMPLETED',
          reason: any(named: 'reason'),
        ),
      ).called(1);
      verify(
        () => repository.saveProductionCloseTransaction(
          any(
            that: predicate<ProductionOrderDocument>(
              (document) =>
                  document.outcome == 'COMPLETED' &&
                  document.terminalId == 'pos-terminal-a' &&
                  document.idempotencyKey ==
                      'production:pos-terminal-a:order-1' &&
                  document.payloadHash == 'order-1:COMPLETED:4.0:3.5' &&
                  document.totalConsumedCostNio == 70 &&
                  document.producedUnitCostNio == 20,
            ),
          ),
          any(
            that: predicate<List<InventoryMovement>>(
              (movements) =>
                  movements.map((movement) => movement.id).contains('mov-1'),
            ),
          ),
          debugFailAfterWrites: false,
        ),
      ).called(1);
      expect(viewModel.orders.single.movementReferences, contains('mov-1'));
      expect(viewModel.statusMessage, contains('pendientes de sync'));
    },
  );

  test(
    'closeOrderLocally leaves source sequence assignment inside the close transaction',
    () async {
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModel.loadInitialData();

      await viewModel.closeOrderLocally(
        recipeVersion: recipeVersion,
        producedInsumoId: 'coffee-base',
        plannedQuantity: 4,
        actualQuantity: 3.5,
        producedBatchNumber: 'PB-12',
        producedExpirationDate: DateTime(2026, 7, 1),
      );

      verifyNever(() => repository.reserveProductionSourceSequence(any()));
      verify(
        () => repository.saveProductionCloseTransaction(
          any(
            that: predicate<ProductionOrderDocument>(
              (document) =>
                  document.terminalId == 'pos-terminal-a' &&
                  document.sourceSequence == 0 &&
                  document.idempotencyKey ==
                      'production:pos-terminal-a:order-1',
            ),
          ),
          any(),
          debugFailAfterWrites: false,
        ),
      ).called(1);
    },
  );

  test(
    'closeOrderLocally requires an injected terminal identity provider for production closes',
    () async {
      final viewModelWithoutTerminalProvider = ProductionOrderViewModel(
        repository,
        movementEngine,
        createId: () => 'order-1',
        clock: () => DateTime(2026, 6, 1, 8, 30),
      );
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModelWithoutTerminalProvider.loadInitialData();

      expect(
        () => viewModelWithoutTerminalProvider.closeOrderLocally(
          recipeVersion: recipeVersion,
          producedInsumoId: 'coffee-base',
          plannedQuantity: 4,
          actualQuantity: 3.5,
          producedBatchNumber: 'PB-NO-TERMINAL',
          producedExpirationDate: DateTime(2026, 7, 1),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            contains('requires an explicit terminal identity provider'),
          ),
        ),
      );

      verifyNever(
        () => movementEngine.buildProductionClose(
          recipeProductId: any(named: 'recipeProductId'),
          producedInsumoId: any(named: 'producedInsumoId'),
          productionDocumentId: any(named: 'productionDocumentId'),
          recipeVersionId: any(named: 'recipeVersionId'),
          plannedQuantity: any(named: 'plannedQuantity'),
          actualQuantity: any(named: 'actualQuantity'),
          outcome: any(named: 'outcome'),
          reason: any(named: 'reason'),
        ),
      );
    },
  );

  test(
    'closeOrderLocally rejects completed close with zero planned and actual output before persistence',
    () async {
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModel.loadInitialData();

      expect(
        () => viewModel.closeOrderLocally(
          recipeVersion: recipeVersion,
          producedInsumoId: 'coffee-base',
          plannedQuantity: 0,
          actualQuantity: 0,
          producedBatchNumber: 'PB-COMPLETED-ZERO',
          producedExpirationDate: DateTime(2026, 7, 1),
          outcome: 'COMPLETED',
        ),
        throwsA(
          isA<ArgumentError>().having(
            (error) => error.message,
            'message',
            contains(
              'Completed production requires positive planned and actual quantities',
            ),
          ),
        ),
      );

      verifyNever(
        () => movementEngine.buildProductionClose(
          recipeProductId: any(named: 'recipeProductId'),
          producedInsumoId: any(named: 'producedInsumoId'),
          productionDocumentId: any(named: 'productionDocumentId'),
          recipeVersionId: any(named: 'recipeVersionId'),
          plannedQuantity: any(named: 'plannedQuantity'),
          actualQuantity: any(named: 'actualQuantity'),
          outcome: any(named: 'outcome'),
          reason: any(named: 'reason'),
        ),
      );
      verifyNever(
        () => repository.saveProductionCloseTransaction(
          any(),
          any(),
          debugFailAfterWrites: any(named: 'debugFailAfterWrites'),
        ),
      );
    },
  );

  test(
    'closeOrderLocally allows failed close with zero output and DESECHO_COCINA',
    () async {
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModel.loadInitialData();
      when(
        () => movementEngine.buildProductionClose(
          recipeProductId: any(named: 'recipeProductId'),
          producedInsumoId: any(named: 'producedInsumoId'),
          productionDocumentId: any(named: 'productionDocumentId'),
          recipeVersionId: any(named: 'recipeVersionId'),
          plannedQuantity: any(named: 'plannedQuantity'),
          actualQuantity: any(named: 'actualQuantity'),
          outcome: 'FAILED',
          reason: any(named: 'reason'),
        ),
      ).thenAnswer(
        (_) async => ProductionCloseResult(
          movements: [
            InventoryMovement(
              id: 'mov-1',
              insumoId: 'coffee-base',
              type: MovementType.production,
              quantity: -1,
              previousStock: 2,
              newStock: 1,
              timestamp: DateTime(2026, 6, 1, 8, 30),
            ),
          ],
          totalConsumedCostNio: 70,
          producedUnitCostNio: 0,
        ),
      );
      when(() => repository.getProductionOrderDocuments()).thenAnswer(
        (_) async => [
          ProductionOrderDocument(
            id: 'order-1',
            recipeVersionId: recipeVersion.id,
            recipeProductId: recipeVersion.productId,
            recipeProductName: recipeVersion.productName,
            producedInsumoId: 'coffee-base',
            producedInsumoName: 'Base de Café',
            plannedQuantity: 4,
            actualQuantity: 0,
            producedBatchNumber: 'PB-FAILED',
            producedExpirationDate: DateTime(2026, 7, 1),
            operationDate: DateTime(2026, 6, 1, 8, 30),
            status: 'CLOSED_PENDING_SYNC',
            outcome: 'FAILED',
            failureReason: 'DESECHO_COCINA',
            terminalId: 'pos-terminal-a',
            sourceSequence: 1,
            idempotencyKey: 'production:pos-terminal-a:order-1',
            payloadHash: 'order-1:FAILED:4.0:0.0',
            totalConsumedCostNio: 70,
            producedUnitCostNio: 0,
            movementReferences: const ['mov-1'],
          ),
        ],
      );

      await viewModel.closeOrderLocally(
        recipeVersion: recipeVersion,
        producedInsumoId: 'coffee-base',
        plannedQuantity: 4,
        actualQuantity: 0,
        producedBatchNumber: 'PB-FAILED',
        producedExpirationDate: DateTime(2026, 7, 1),
        outcome: 'FAILED',
      );

      verify(
        () => movementEngine.buildProductionClose(
          recipeProductId: recipeVersion.productId,
          producedInsumoId: 'coffee-base',
          productionDocumentId: 'order-1',
          recipeVersionId: recipeVersion.id,
          plannedQuantity: 4,
          actualQuantity: 0,
          outcome: 'FAILED',
          reason: any(named: 'reason'),
        ),
      ).called(1);
      verify(
        () => repository.saveProductionCloseTransaction(
          any(
            that: predicate<ProductionOrderDocument>(
              (document) =>
                  document.outcome == 'FAILED' &&
                  document.actualQuantity == 0 &&
                  document.failureReason == 'DESECHO_COCINA' &&
                  document.producedUnitCostNio == 0,
            ),
          ),
          any(
            that: predicate<List<InventoryMovement>>(
              (movements) => movements.single.id == 'mov-1',
            ),
          ),
          debugFailAfterWrites: false,
        ),
      ).called(1);
    },
  );

  test(
    'closeOrderLocally rejects failed close with nonzero output before persistence',
    () async {
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModel.loadInitialData();

      expect(
        () => viewModel.closeOrderLocally(
          recipeVersion: recipeVersion,
          producedInsumoId: 'coffee-base',
          plannedQuantity: 4,
          actualQuantity: 1,
          producedBatchNumber: 'PB-FAILED-NONZERO',
          producedExpirationDate: DateTime(2026, 7, 1),
          outcome: 'FAILED',
        ),
        throwsA(
          isA<ArgumentError>().having(
            (error) => error.message,
            'message',
            contains('failed or interrupted actual quantity must be zero'),
          ),
        ),
      );

      verifyNever(
        () => movementEngine.buildProductionClose(
          recipeProductId: any(named: 'recipeProductId'),
          producedInsumoId: any(named: 'producedInsumoId'),
          productionDocumentId: any(named: 'productionDocumentId'),
          recipeVersionId: any(named: 'recipeVersionId'),
          plannedQuantity: any(named: 'plannedQuantity'),
          actualQuantity: any(named: 'actualQuantity'),
          outcome: any(named: 'outcome'),
          reason: any(named: 'reason'),
        ),
      );
      verifyNever(
        () => repository.saveProductionCloseTransaction(
          any(),
          any(),
          debugFailAfterWrites: any(named: 'debugFailAfterWrites'),
        ),
      );
    },
  );

  test(
    'closeOrderLocally rejects interrupted close with nonzero output before persistence',
    () async {
      when(
        () => repository.getRecipeVersionDocuments(any()),
      ).thenAnswer((_) async => [recipeVersion]);
      await viewModel.loadInitialData();

      expect(
        () => viewModel.closeOrderLocally(
          recipeVersion: recipeVersion,
          producedInsumoId: 'coffee-base',
          plannedQuantity: 4,
          actualQuantity: 0.5,
          producedBatchNumber: 'PB-INTERRUPTED-NONZERO',
          producedExpirationDate: DateTime(2026, 7, 1),
          outcome: 'INTERRUPTED',
        ),
        throwsA(isA<ArgumentError>()),
      );

      verifyNever(
        () => repository.saveProductionCloseTransaction(
          any(),
          any(),
          debugFailAfterWrites: any(named: 'debugFailAfterWrites'),
        ),
      );
    },
  );

  test('generateNextBatchCode calculates next sequential batch code for given date', () async {
    when(() => repository.getProductionOrderDocuments()).thenAnswer(
      (_) async => [
        ProductionOrderDocument(
          id: 'order-1',
          recipeVersionId: recipeVersion.id,
          recipeProductId: recipeVersion.productId,
          recipeProductName: recipeVersion.productName,
          producedInsumoId: 'coffee-base',
          producedInsumoName: 'Base de Café',
          plannedQuantity: 4,
          actualQuantity: 3.5,
          producedBatchNumber: 'LOTE-20260601-001',
          producedExpirationDate: DateTime(2026, 6, 4),
          operationDate: DateTime(2026, 6, 1, 8, 30),
          status: 'CLOSED_PENDING_SYNC',
          outcome: 'COMPLETED',
          terminalId: 'pos-terminal-a',
          sourceSequence: 1,
          idempotencyKey: 'production:pos-terminal-a:order-1',
          payloadHash: 'hash',
          totalConsumedCostNio: 70,
          producedUnitCostNio: 20,
        ),
      ],
    );
    await viewModel.loadInitialData();

    final nextCode = viewModel.generateNextBatchCode(forDate: DateTime(2026, 6, 1));
    expect(nextCode, 'LOTE-20260601-002');

    final nextCodeOtherDate = viewModel.generateNextBatchCode(forDate: DateTime(2026, 6, 2));
    expect(nextCodeOtherDate, 'LOTE-20260602-001');
  });

  test('calculateExpirationDate derives expiration date from recipe diasVidaUtil', () {
    final customRecipeVersion = recipeVersion.copyWith(diasVidaUtil: 5);
    final now = DateTime(2026, 6, 1, 10, 0);

    final expiry = viewModel.calculateExpirationDate(customRecipeVersion, fromDate: now);
    expect(expiry, DateTime(2026, 6, 6, 10, 0));
  });

  test('closeOrderLocally forwards customIngredientConsumptions to movementEngine', () async {
    when(
      () => repository.getRecipeVersionDocuments(any()),
    ).thenAnswer((_) async => [recipeVersion]);
    await viewModel.loadInitialData();

    when(
      () => movementEngine.buildProductionClose(
        recipeProductId: any(named: 'recipeProductId'),
        producedInsumoId: any(named: 'producedInsumoId'),
        productionDocumentId: any(named: 'productionDocumentId'),
        recipeVersionId: any(named: 'recipeVersionId'),
        plannedQuantity: any(named: 'plannedQuantity'),
        actualQuantity: any(named: 'actualQuantity'),
        outcome: any(named: 'outcome'),
        reason: any(named: 'reason'),
        customIngredientConsumptions: any(named: 'customIngredientConsumptions'),
      ),
    ).thenAnswer(
      (_) async => ProductionCloseResult(
        movements: [
          InventoryMovement(
            id: 'mov-custom',
            insumoId: 'coffee-base',
            type: MovementType.production,
            quantity: -2.5,
            previousStock: 10,
            newStock: 7.5,
            timestamp: DateTime(2026, 6, 1, 8, 30),
          ),
        ],
        totalConsumedCostNio: 80,
        producedUnitCostNio: 20,
      ),
    );

    final customConsumptions = {'raw-1': 2.5};

    await viewModel.closeOrderLocally(
      recipeVersion: recipeVersion,
      producedInsumoId: 'coffee-base',
      plannedQuantity: 4,
      actualQuantity: 4,
      producedBatchNumber: 'LOTE-20260601-001',
      producedExpirationDate: DateTime(2026, 6, 4),
      customIngredientConsumptions: customConsumptions,
    );

    verify(
      () => movementEngine.buildProductionClose(
        recipeProductId: recipeVersion.productId,
        producedInsumoId: 'coffee-base',
        productionDocumentId: 'order-1',
        recipeVersionId: recipeVersion.id,
        plannedQuantity: 4,
        actualQuantity: 4,
        outcome: 'COMPLETED',
        reason: any(named: 'reason'),
        customIngredientConsumptions: customConsumptions,
      ),
    ).called(1);
  });

  test('evaluateVariance calculates deviation and flags supervisor requirement', () {
    final normalEvaluation = viewModel.evaluateVariance(
      recipeVersion: recipeVersion,
      plannedQuantity: 10,
      actualQuantity: 9.8, // 2% deviation <= 5%
    );
    expect(normalEvaluation.isWithinTolerance, isTrue);
    expect(normalEvaluation.requiresSupervisorOverride, isFalse);
    expect(normalEvaluation.status, 'COMPLETED_NORMAL');

    final highVarianceEvaluation = viewModel.evaluateVariance(
      recipeVersion: recipeVersion,
      plannedQuantity: 10,
      actualQuantity: 8.0, // 20% deviation > 5%
    );
    expect(highVarianceEvaluation.isWithinTolerance, isFalse);
    expect(highVarianceEvaluation.requiresSupervisorOverride, isTrue);
    expect(highVarianceEvaluation.status, 'COMPLETED_WITH_VARIANCE');

    final totalLossEvaluation = viewModel.evaluateVariance(
      recipeVersion: recipeVersion,
      plannedQuantity: 10,
      actualQuantity: 0.0,
    );
    expect(totalLossEvaluation.isTotalLoss, isTrue);
    expect(totalLossEvaluation.requiresSupervisorOverride, isTrue);
    expect(totalLossEvaluation.outcome, 'FAILED');
    expect(totalLossEvaluation.status, 'FAILED_TOTAL_LOSS');
  });

  test('closeOrderLocally requests supervisor authorization when deviation exceeds tolerance', () async {
    final mockAuthRepo = MockAuthRepository();
    when(() => mockAuthRepo.authorizeOverride(
      supervisorId: any(named: 'supervisorId'),
      pin: any(named: 'pin'),
      totpCode: any(named: 'totpCode'),
    )).thenAnswer((_) async => true);

    when(
      () => movementEngine.buildProductionClose(
        recipeProductId: any(named: 'recipeProductId'),
        producedInsumoId: any(named: 'producedInsumoId'),
        productionDocumentId: any(named: 'productionDocumentId'),
        recipeVersionId: any(named: 'recipeVersionId'),
        plannedQuantity: any(named: 'plannedQuantity'),
        actualQuantity: any(named: 'actualQuantity'),
        outcome: any(named: 'outcome'),
        reason: any(named: 'reason'),
        customIngredientConsumptions: any(named: 'customIngredientConsumptions'),
      ),
    ).thenAnswer(
      (_) async => const ProductionCloseResult(
        movements: [],
        totalConsumedCostNio: 100,
        producedUnitCostNio: 12.5,
      ),
    );

    await viewModel.loadInitialData();

    await viewModel.closeOrderLocally(
      recipeVersion: recipeVersion,
      producedInsumoId: 'coffee-base',
      plannedQuantity: 10,
      actualQuantity: 8, // 20% variance
      producedBatchNumber: 'LOTE-20260601-001',
      producedExpirationDate: DateTime(2026, 6, 4),
      varianceReason: 'Merma por temperatura irregular',
      supervisorId: 'sup-1',
      supervisorPin: '1234',
      authRepository: mockAuthRepo,
    );

    verify(() => mockAuthRepo.authorizeOverride(
      supervisorId: 'sup-1',
      pin: '1234',
      totpCode: null,
    )).called(1);
  });

  test('printBatchLabel invokes printer with order details and UOM', () async {
    final mockPrinter = MockPrinterAdapter();
    await viewModel.loadInitialData();

    final order = ProductionOrderDocument(
      id: 'doc-1',
      recipeVersionId: 'rv-1',
      recipeProductId: 'prod-coffee',
      recipeProductName: 'Jarabe Casa',
      producedInsumoId: 'coffee-base',
      producedInsumoName: 'Base de Café',
      plannedQuantity: 10,
      actualQuantity: 10,
      producedBatchNumber: 'LOTE-20260601-001',
      producedExpirationDate: DateTime(2026, 6, 4, 12, 0),
      operationDate: DateTime(2026, 6, 1, 8, 30),
      status: 'CLOSED_PENDING_SYNC',
      outcome: 'COMPLETED',
      terminalId: 'POS-01',
      sourceSequence: 1,
      idempotencyKey: 'key-1',
      payloadHash: 'hash-1',
      totalConsumedCostNio: 100,
      producedUnitCostNio: 10,
      closedAt: DateTime(2026, 6, 1, 8, 30),
      movementReferences: const ['mov-1'],
    );

    final result = await viewModel.printBatchLabel(
      order: order,
      printer: mockPrinter,
      operatorName: 'Chef Roberto',
      storageInstructions: 'Refrigerar 2C a 4C',
    );

    expect(result.isSuccess, isTrue);
    expect(mockPrinter.lastPrintedText, contains('ETIQUETA DE PRE-ELABORACION'));
    expect(mockPrinter.lastPrintedText, contains('Base de Café'));
    expect(mockPrinter.lastPrintedText, contains('LOTE-20260601-001'));
    expect(mockPrinter.lastPrintedText, contains('10 kg'));
    expect(mockPrinter.lastPrintedText, contains('Chef Roberto'));
  });
}
class MockAuthRepository extends Mock implements AuthRepository {}

