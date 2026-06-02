import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:pos_app/domain/models/inventory/insumo.dart';
import 'package:pos_app/domain/repositories/inventory/inventory_repository.dart';
import 'package:pos_app/ui/features/inventory/production/production_order_view_model.dart';

class _MockInventoryRepository extends Mock implements InventoryRepository {}

void main() {
  late _MockInventoryRepository repository;
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

  setUp(() {
    repository = _MockInventoryRepository();
    when(() => repository.getActiveInsumos()).thenAnswer((_) async => insumos);

    viewModel = ProductionOrderViewModel(
      repository,
      createId: () => 'order-1',
      clock: () => DateTime(2026, 6, 1, 8, 30),
    );
  });

  test('loadInitialData exposes available insumos for the production form', () async {
    await viewModel.loadInitialData();

    expect(viewModel.availableInsumos, hasLength(1));
    expect(viewModel.availableInsumos.first.name, 'Base de Café');
    expect(viewModel.statusMessage, contains('Modo local'));
  });

  test('startLocalOrder stores a local-first placeholder order', () async {
    await viewModel.loadInitialData();

    await viewModel.startLocalOrder(
      producedInsumoId: 'coffee-base',
      recipeVersionId: 'rv-2026-06',
      orderQuantity: 4.5,
    );

    expect(viewModel.orders, hasLength(1));
    expect(viewModel.orders.first.id, 'order-1');
    expect(viewModel.orders.first.producedInsumoId, 'coffee-base');
    expect(viewModel.orders.first.recipeVersionId, 'rv-2026-06');
    expect(viewModel.orders.first.orderQuantity, 4.5);
    expect(viewModel.statusMessage, contains('registrada localmente'));
  });

  test('startLocalOrder rejects non-positive quantity', () async {
    await viewModel.loadInitialData();

    expect(
      () => viewModel.startLocalOrder(
        producedInsumoId: 'coffee-base',
        recipeVersionId: 'rv-2026-06',
        orderQuantity: 0,
      ),
      throwsArgumentError,
    );
  });
}
