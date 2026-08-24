import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/reports/inventory_valuation_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
  late InventoryValuationViewModel viewModel;

  final testInsumos = <Insumo>[
    const Insumo(
      id: 'ins-1',
      name: 'Café Molido',
      consumptionUom: 'kg',
      stock: 5.0,
      averageCost: 100.0,
      stockMin: 2.0,
    ),
    const Insumo(
      id: 'ins-2',
      name: 'Leche Descremada',
      consumptionUom: 'lt',
      stock: 1.0,
      averageCost: 30.0,
      stockMin: 3.0, // Low stock
    ),
    const Insumo(
      id: 'ins-3',
      name: 'Azúcar Morena',
      consumptionUom: 'kg',
      stock: -1.0, // Negative stock
      averageCost: 20.0,
      stockMin: 1.0,
    ),
    const Insumo(
      id: 'ins-4',
      name: 'Servilletas',
      consumptionUom: 'pack',
      stock: 0.0, // Zero stock
      averageCost: 15.0,
    ),
  ];

  setUp(() {
    repository = _MockInventoryRepository();
    viewModel = InventoryValuationViewModel(repository);
  });

  test('loadValuationReport calculates metrics and item valuations accurately', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);

    await viewModel.loadValuationReport();

    expect(viewModel.isLoading, isFalse);
    expect(viewModel.errorMessage, isNull);
    expect(viewModel.totalItemsCount, 4);
    expect(viewModel.itemsWithStockCount, 2); // ins-1 (5) and ins-2 (1)
    expect(viewModel.itemsLowStockCount, 2); // ins-2 (1 <= 3) and ins-3 (-1 <= 1)
    expect(viewModel.itemsNegativeStockCount, 1); // ins-3 (-1 < 0)

    // Total valuation = (5 * 100 = 500) + (1 * 30 = 30) = 530.0
    expect(viewModel.totalValuationNio, 530.0);
    expect(viewModel.filteredItems, hasLength(4));
  });

  test('filters items by search query matching name or UOM', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
    await viewModel.loadValuationReport();

    viewModel.setSearchQuery('café');
    expect(viewModel.filteredItems, hasLength(1));
    expect(viewModel.filteredItems.first.name, 'Café Molido');

    viewModel.setSearchQuery('kg');
    expect(viewModel.filteredItems, hasLength(2)); // Café and Azúcar
  });

  test('filters items by filter mode (withStock, lowStock, negativeStock)', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
    await viewModel.loadValuationReport();

    viewModel.setFilterMode(ValuationFilterMode.withStock);
    expect(viewModel.filteredItems, hasLength(2));

    viewModel.setFilterMode(ValuationFilterMode.lowStock);
    expect(viewModel.filteredItems, hasLength(2));
    expect(viewModel.filteredItems.every((item) => item.isLowStock), isTrue);

    viewModel.setFilterMode(ValuationFilterMode.negativeStock);
    expect(viewModel.filteredItems, hasLength(1));
    expect(viewModel.filteredItems.first.id, 'ins-3');
  });

  test('handles repository error gracefully', () async {
    when(() => repository.getActiveInsumos()).thenThrow(Exception('Database disk error'));

    await viewModel.loadValuationReport();

    expect(viewModel.isLoading, isFalse);
    expect(viewModel.errorMessage, contains('Database disk error'));
    expect(viewModel.report, isNull);
  });
}
