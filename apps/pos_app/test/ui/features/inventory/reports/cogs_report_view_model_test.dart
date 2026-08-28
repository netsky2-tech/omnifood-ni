import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/reports/cogs_report_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late CogsReportViewModel viewModel;

  final now = DateTime.now();

  final testInsumos = <Insumo>[
    const Insumo(
      id: 'ins-coffee',
      name: 'Café Grano',
      consumptionUom: 'kg',
      stock: 10.0,
      averageCost: 120.0,
    ),
    const Insumo(
      id: 'ins-milk',
      name: 'Leche Entera',
      consumptionUom: 'lt',
      stock: 5.0,
      averageCost: 35.0,
    ),
  ];

  final testMovements = <InventoryMovement>[
    // 1. Sale: 2kg coffee at C$ 120 -> 240
    InventoryMovement(
      id: 'mov-1',
      insumoId: 'ins-coffee',
      type: MovementType.sale,
      quantity: -2.0,
      previousStock: 10.0,
      newStock: 8.0,
      unitCostNio: 120.0,
      timestamp: now,
    ),
    // 2. Reversal (Sale cancellation): 0.5kg coffee at C$ 120 -> -60
    InventoryMovement(
      id: 'mov-2',
      insumoId: 'ins-coffee',
      type: MovementType.reversal,
      quantity: 0.5,
      previousStock: 8.0,
      newStock: 8.5,
      unitCostNio: 120.0,
      timestamp: now,
    ),
    // 3. Shrinkage: 1lt milk at C$ 35 -> 35
    InventoryMovement(
      id: 'mov-3',
      insumoId: 'ins-milk',
      type: MovementType.shrinkage,
      quantity: -1.0,
      previousStock: 5.0,
      newStock: 4.0,
      unitCostNio: 35.0,
      timestamp: now,
    ),
  ];

  setUp(() {
    repository = _MockInventoryRepository();
    viewModel = CogsReportViewModel(repository);
  });

  test('loadCogsReport calculates sales, shrinkage, and total COGS with proper reversal deduction', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
    when(() => repository.getAllMovements()).thenAnswer((_) async => testMovements);

    await viewModel.loadCogsReport();

    expect(viewModel.isLoading, isFalse);
    expect(viewModel.errorMessage, isNull);

    // Sales COGS: Coffee 2 - 0.5 = 1.5kg * 120 = 180.0
    // Shrinkage COGS: Milk 1lt * 35 = 35.0
    // Total COGS = 180.0 + 35.0 = 215.0
    expect(viewModel.salesCogsNio, 180.0);
    expect(viewModel.shrinkageCogsNio, 35.0);
    expect(viewModel.totalCogsNio, 215.0);

    expect(viewModel.filteredItems, hasLength(2));
    expect(viewModel.filteredItems[0].insumoId, 'ins-coffee');
    expect(viewModel.filteredItems[0].totalCostNio, 180.0);
    expect(viewModel.filteredItems[1].insumoId, 'ins-milk');
    expect(viewModel.filteredItems[1].totalCostNio, 35.0);
  });

  test('filters items by search query', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
    when(() => repository.getAllMovements()).thenAnswer((_) async => testMovements);

    await viewModel.loadCogsReport();

    viewModel.setSearchQuery('leche');
    expect(viewModel.filteredItems, hasLength(1));
    expect(viewModel.filteredItems.first.insumoName, 'Leche Entera');
  });

  test('handles repository failure gracefully', () async {
    when(() => repository.getActiveInsumos()).thenThrow(Exception('Storage IO failure'));

    await viewModel.loadCogsReport();

    expect(viewModel.isLoading, isFalse);
    expect(viewModel.errorMessage, contains('Storage IO failure'));
    expect(viewModel.report, isNull);
  });
}
