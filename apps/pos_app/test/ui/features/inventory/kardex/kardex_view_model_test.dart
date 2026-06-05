import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/count_session_document.dart';
import 'package:pos_app/domain/models/inventory/forensic_alert.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/models/inventory/production_order_document.dart';
import 'package:pos_app/domain/models/inventory/purchase.dart';
import 'package:pos_app/domain/models/inventory/recipe_version_document.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/kardex/kardex_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late KardexViewModel viewModel;

  const insumos = <Insumo>[
    Insumo(
      id: 'milk',
      name: 'Leche Entera',
      consumptionUom: 'L',
      stock: 18,
      averageCost: 42.5,
    ),
    Insumo(
      id: 'coffee',
      name: 'Café Molido',
      consumptionUom: 'kg',
      stock: 6,
      averageCost: 130,
    ),
  ];

  final movements = <InventoryMovement>[
    InventoryMovement(
      id: 'move-1',
      insumoId: 'milk',
      type: MovementType.shrinkage,
      quantity: -2,
      previousStock: 20,
      newStock: 18,
      timestamp: DateTime(2026, 6, 2, 9, 30),
      reason: 'Derramada',
    ),
    InventoryMovement(
      id: 'move-2',
      insumoId: 'coffee',
      type: MovementType.purchase,
      quantity: 3,
      previousStock: 3,
      newStock: 6,
      timestamp: DateTime(2026, 6, 1, 8, 15),
      reason: 'Compra local',
    ),
  ];

  setUp(() {
    repository = _MockInventoryRepository();
    when(() => repository.getAllMovements()).thenAnswer((_) async => movements);
    when(() => repository.getInsumosByIds(any())).thenAnswer((invocation) async {
      final ids = invocation.positionalArguments.single as List<String>;
      return insumos.where((item) => ids.contains(item.id)).toList(growable: false);
    });
    when(() => repository.getPurchaseHistory()).thenAnswer((_) async => const <Purchase>[]);
    when(() => repository.getCountSessionDocuments()).thenAnswer((_) async => const <CountSessionDocument>[]);
    when(() => repository.getProductionOrderDocuments()).thenAnswer((_) async => const <ProductionOrderDocument>[]);
    when(() => repository.getForensicAlerts()).thenAnswer((_) async => const <ForensicAlert>[]);
    when(() => repository.getRecipeVersionDocuments(any())).thenAnswer((_) async => const <RecipeVersionDocument>[]);
    viewModel = KardexViewModel(repository);
  });

  test('loadInitialData exposes readable kardex rows from local movements', () async {
    await viewModel.loadInitialData();

    expect(viewModel.entries, hasLength(2));
    expect(viewModel.entries.first.referenceLabel, 'Leche Entera');
    expect(viewModel.entries.first.typeLabel, 'Merma');
    expect(viewModel.entries.first.stockAfterLabel, '18.00');
    expect(viewModel.entries.first.unitCostLabel, 'N/D');
  });

  test('search and type filters narrow the visible kardex history', () async {
    await viewModel.loadInitialData();

    viewModel.setSearchQuery('leche');
    expect(viewModel.visibleEntries, hasLength(1));
    expect(viewModel.visibleEntries.single.referenceLabel, 'Leche Entera');

    viewModel.clearSearch();
    viewModel.setTypeFilter(KardexTypeFilter.purchase);
    expect(viewModel.visibleEntries, hasLength(1));
    expect(viewModel.visibleEntries.single.typeLabel, 'Compra');
  });

  test('maps purchase source documents and related alert counts into kardex rows', () async {
    when(() => repository.getAllMovements()).thenAnswer(
      (_) async => [
        InventoryMovement(
          id: 'purchase-1',
          insumoId: 'coffee',
          type: MovementType.purchase,
          quantity: 3,
          previousStock: 3,
          newStock: 6,
          timestamp: DateTime(2026, 6, 1, 8, 15),
          reason: 'Purchase USD @ 365.0000 NIO',
        ),
      ],
    );
    when(() => repository.getPurchaseHistory()).thenAnswer(
      (_) async => [
        Purchase(
          id: 'purchase-1',
          insumoId: 'coffee',
          supplierId: 'supplier-1',
          quantity: 3,
          unitCost: 10,
          timestamp: DateTime(2026, 6, 1, 8, 15),
          invoiceDate: DateTime(2026, 6, 1),
          currency: 'USD',
          bcnRate: 36.5,
          unitCostNio: 365,
          projectedCppNio: 200,
        ),
      ],
    );
    when(() => repository.getForensicAlerts()).thenAnswer(
      (_) async => [
        ForensicAlert(
          id: 'alert-1',
          alertType: 'LOW_STOCK',
          severity: 'high',
          message: 'Stock bajo en café.',
          createdAt: DateTime(2026, 6, 1, 8, 20),
          sourceMovementId: 'purchase-1',
        ),
      ],
    );

    await viewModel.loadInitialData();

    expect(viewModel.entries.single.sourceDocumentLabel, 'PURCHASE · purchase-1');
    expect(viewModel.entries.single.totalValueLabel, '1095.00');
    expect(viewModel.entries.single.relatedAlertCount, 1);
  });
}
