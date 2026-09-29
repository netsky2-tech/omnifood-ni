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

  group('cost coverage (H10 zero-cost basis UX)', () {
    final uncostedInsumos = <Insumo>[
      const Insumo(
        id: 'ins-harina',
        name: 'Harina',
        consumptionUom: 'kg',
        stock: 5.0,
        averageCost: 0.0,
      ),
    ];

    final uncostedMovements = <InventoryMovement>[
      InventoryMovement(
        id: 'mov-u1',
        insumoId: 'ins-harina',
        type: MovementType.sale,
        quantity: -1.0,
        previousStock: 5.0,
        newStock: 4.0,
        timestamp: now,
      ),
    ];

    test('zero basis: all movements lack cost basis -> coverage zeroBasis, totals unchanged', () async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => uncostedInsumos);
      when(() => repository.getAllMovements()).thenAnswer((_) async => uncostedMovements);

      await viewModel.loadCogsReport();

      expect(viewModel.costCoverage, CogsCostCoverage.zeroBasis);
      expect(viewModel.hasCostCoverageWarning, isTrue);
      expect(viewModel.missingBasisCount, 1);
      expect(viewModel.totalMovementCount, 1);

      // Coverage is derived data only: the COGS math must stay untouched.
      expect(viewModel.totalCogsNio, 0.0);
      expect(viewModel.filteredItems, hasLength(1));
      expect(viewModel.filteredItems.single.totalCostNio, 0.0);
      // Item-level: every movement of this insumo lacks basis.
      expect(viewModel.isItemCostBasisMissing('ins-harina'), isTrue);
    });

    test('partial: mixed costed and uncosted movements -> coverage partial with counts', () async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => [...testInsumos, ...uncostedInsumos]);
      when(() => repository.getAllMovements()).thenAnswer((_) async => [...testMovements, ...uncostedMovements]);

      await viewModel.loadCogsReport();

      // 3 costed movements + 1 uncosted movement.
      expect(viewModel.costCoverage, CogsCostCoverage.partial);
      expect(viewModel.hasCostCoverageWarning, isTrue);
      expect(viewModel.missingBasisCount, 1);
      expect(viewModel.totalMovementCount, 4);

      // Math unchanged: costed totals must not absorb the uncosted movement.
      expect(viewModel.totalCogsNio, 215.0);
    });

    test('complete: all movements have cost basis -> no warning, zero missing', () async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
      when(() => repository.getAllMovements()).thenAnswer((_) async => testMovements);

      await viewModel.loadCogsReport();

      expect(viewModel.costCoverage, CogsCostCoverage.complete);
      expect(viewModel.hasCostCoverageWarning, isFalse);
      expect(viewModel.missingBasisCount, 0);
      expect(viewModel.totalMovementCount, 3);
      expect(viewModel.isItemCostBasisMissing('ins-coffee'), isFalse);
    });

    test('explicitly recorded unitCostNio of 0.0 is a real cost, not missing basis', () async {
      final recordedZeroMovements = <InventoryMovement>[
        InventoryMovement(
          id: 'mov-z1',
          insumoId: 'ins-harina',
          type: MovementType.sale,
          quantity: -1.0,
          previousStock: 5.0,
          newStock: 4.0,
          unitCostNio: 0.0,
          timestamp: now,
        ),
      ];
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => uncostedInsumos);
      when(() => repository.getAllMovements()).thenAnswer((_) async => recordedZeroMovements);

      await viewModel.loadCogsReport();

      expect(viewModel.costCoverage, CogsCostCoverage.complete);
      expect(viewModel.missingBasisCount, 0);
      expect(viewModel.isItemCostBasisMissing('ins-harina'), isFalse);
    });

    test('no movements: existing empty state keeps noMovements coverage', () async {
      when(() => repository.getActiveInsumos()).thenAnswer((_) async => testInsumos);
      when(() => repository.getAllMovements()).thenAnswer((_) async => <InventoryMovement>[]);

      await viewModel.loadCogsReport();

      expect(viewModel.costCoverage, CogsCostCoverage.noMovements);
      expect(viewModel.hasCostCoverageWarning, isFalse);
      expect(viewModel.missingBasisCount, 0);
      expect(viewModel.totalMovementCount, 0);
    });
  });
}
