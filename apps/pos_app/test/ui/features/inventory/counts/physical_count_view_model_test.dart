import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/models/inventory/inventory_movement.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/domain/services/inventory/movement_engine.dart';
import 'package:pos_app/ui/features/inventory/counts/physical_count_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

class _MockMovementEngine extends Mock implements MovementEngine {}

void main() {
  late _MockInventoryRepository repository;
  late _MockMovementEngine movementEngine;
  late PhysicalCountViewModel viewModel;

  const milk = Insumo(
    id: 'milk',
    name: 'Leche Entera',
    consumptionUom: 'L',
    stock: 10,
    averageCost: 42,
    parLevel: 3,
  );

  setUp(() {
    repository = _MockInventoryRepository();
    movementEngine = _MockMovementEngine();
    viewModel = PhysicalCountViewModel(
      repository,
      movementEngine,
      clock: () => DateTime(2026, 6, 2, 10, 30),
    );
  });

  test('loadInitialData exposes local adjustment history for the screen', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
    when(() => repository.getAllMovements()).thenAnswer(
      (_) async => <InventoryMovement>[
        InventoryMovement(
          id: 'adj-1',
          insumoId: 'milk',
          type: MovementType.adjustment,
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          timestamp: DateTime(2026, 6, 2, 9),
          reason: 'Conteo físico | Motivo: Diferencia de apertura | Notas: Jarra incompleta',
        ),
      ],
    );

    await viewModel.loadInitialData();

    expect(viewModel.availableInsumos, hasLength(1));
    expect(viewModel.history, hasLength(1));
    expect(viewModel.history.first.insumoName, 'Leche Entera');
    expect(viewModel.history.first.expectedQuantity, 10);
    expect(viewModel.history.first.countedQuantity, 8);
    expect(viewModel.history.first.variance, -2);
  });

  test('applyPhysicalCount posts a compensating local adjustment and refreshes history', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
    when(() => repository.getInsumoById('milk')).thenAnswer((_) async => milk);
    when(() => movementEngine.recordAdjustment('milk', -2, any())).thenAnswer((_) async {});
    when(() => repository.getAllMovements()).thenAnswer(
      (_) async => <InventoryMovement>[
        InventoryMovement(
          id: 'adj-2',
          insumoId: 'milk',
          type: MovementType.adjustment,
          quantity: -2,
          previousStock: 10,
          newStock: 8,
          timestamp: DateTime(2026, 6, 2, 10, 30),
          reason: 'Conteo físico | Motivo: Diferencia de cierre | Notas: Quedó menos producto del esperado',
        ),
      ],
    );

    await viewModel.loadInitialData();
    await viewModel.applyPhysicalCount(
      insumoId: 'milk',
      countedQuantity: 8,
      reason: 'Diferencia de cierre',
      notes: 'Quedó menos producto del esperado',
    );

    verify(
      () => movementEngine.recordAdjustment(
        'milk',
        -2,
        'Conteo físico | Motivo: Diferencia de cierre | Notas: Quedó menos producto del esperado',
      ),
    ).called(1);
    expect(viewModel.history, hasLength(1));
    expect(viewModel.history.first.countedQuantity, 8);
    expect(viewModel.statusMessage, contains('aplicado localmente'));
  });

  test('applyPhysicalCount rejects a count without variance', () async {
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => const <Insumo>[milk]);
    when(() => repository.getInsumoById('milk')).thenAnswer((_) async => milk);
    when(() => repository.getAllMovements()).thenAnswer((_) async => const <InventoryMovement>[]);

    await viewModel.loadInitialData();

    expect(
      () => viewModel.applyPhysicalCount(
        insumoId: 'milk',
        countedQuantity: 10,
        reason: 'Sin diferencia',
      ),
      throwsArgumentError,
    );
  });
}
