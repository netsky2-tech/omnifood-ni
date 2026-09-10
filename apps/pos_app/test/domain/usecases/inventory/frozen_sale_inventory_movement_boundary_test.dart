import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';
import 'package:pos_app/domain/usecases/inventory/frozen_sale_inventory_movement_boundary.dart';

void main() {
  final boundary = FrozenSaleInventoryMovementBoundary();
  test('derives direct and recipe movements only from frozen bindings', () {
    final result = boundary.derive([
      _line('direct-line', 2, _direct()),
      _line('recipe-line', 3, _recipe()),
    ]);
    expect(result.outcome, LocalSaleMovementOutcome.applied);
    expect(
      result.movements.map(
        (movement) => (
          movement.invoiceItemId,
          movement.bindingOrdinal,
          movement.insumoId,
          movement.recipeComponentId,
          movement.quantity,
          movement.saleCorrelationId,
        ),
      ),
      [
        ('direct-line', 0, 'insumo-direct', null, 2.5, 'correlation-direct'),
        ('recipe-line', 0, 'insumo-a', 'component-a', 4.5, 'correlation-a'),
        ('recipe-line', 1, 'insumo-b', 'component-b', 6.0, 'correlation-b'),
      ],
    );
  });
  test('rejects duplicate frozen correlations instead of collapsing movements', () {
    expect(
      () => boundary.derive([_line('first', 1, _direct()), _line('second', 1, _direct())]),
      throwsA(isA<FrozenSaleInventoryMovementBoundaryException>()),
    );
  });
  test('rejects invalid impacted bindings before pending suppression', () {
    for (final lines in [
      [_line('first', 1, _direct()), _line('second', 1, _direct()), _line('pending', 1, _pending())],
      [_line('overflow', 2, _direct(quantity: double.maxFinite))],
      [_line('blank', 1, _direct(insumoId: ' '))],
    ]) {
      expect(
        () => boundary.derive(lines),
        throwsA(isA<FrozenSaleInventoryMovementBoundaryException>()),
      );
    }
  });
  test('suppresses the whole invoice for pending and no-impact snapshots', () {
    final pending = boundary.derive([
      _line('direct-line', 2, _direct()),
      _line('pending-line', 1, _pending()),
    ]);
    final noImpact = boundary.derive([_line('no-impact-line', 1, _noImpact())]);
    expect(pending.outcome, LocalSaleMovementOutcome.suppressedInventoryPending);
    expect(pending.movements, isEmpty);
    expect(noImpact.outcome, LocalSaleMovementOutcome.suppressedNoInventoryImpact);
    expect(noImpact.movements, isEmpty);
  });
}

FrozenSaleInventoryMovementLine _line(
  String id,
  double quantity,
  SaleTimeInventorySnapshot snapshot,
) => FrozenSaleInventoryMovementLine(
  invoiceItemId: id,
  quantity: quantity,
  snapshot: snapshot,
);

SaleTimeInventorySnapshot _direct({
  double quantity = 1.25,
  String insumoId = 'insumo-direct',
}) => SaleTimeInventorySnapshot(
  classification: SaleInventoryClassification.simple,
  disposition: SaleInventoryDisposition.direct,
  catalogRevision: 'frozen-revision',
  mappingVersionId: 'mapping-1',
  bindings: [
    SaleTimeInventoryBinding(
      bindingOrdinal: 0,
      insumoId: insumoId,
      quantityPerSaleUnit: quantity,
      saleCorrelationId: 'correlation-direct',
    ),
  ],
);

SaleTimeInventorySnapshot _recipe() => SaleTimeInventorySnapshot(
  classification: SaleInventoryClassification.prepared,
  disposition: SaleInventoryDisposition.recipe,
  catalogRevision: 'frozen-revision',
  recipeVersionId: 'recipe-1',
  bindings: [
    SaleTimeInventoryBinding(
      bindingOrdinal: 0,
      insumoId: 'insumo-a',
      recipeComponentId: 'component-a',
      quantityPerSaleUnit: 1.5,
      saleCorrelationId: 'correlation-a',
    ),
    SaleTimeInventoryBinding(
      bindingOrdinal: 1,
      insumoId: 'insumo-b',
      recipeComponentId: 'component-b',
      quantityPerSaleUnit: 2,
      saleCorrelationId: 'correlation-b',
    ),
  ],
);

SaleTimeInventorySnapshot _pending() => SaleTimeInventorySnapshot(
  classification: SaleInventoryClassification.compound,
  disposition: SaleInventoryDisposition.pendingRecipe,
  catalogRevision: 'frozen-revision',
  reasonCode: 'MISSING_PUBLISHED_RECIPE',
);

SaleTimeInventorySnapshot _noImpact() => SaleTimeInventorySnapshot(
  classification: SaleInventoryClassification.simple,
  disposition: SaleInventoryDisposition.noImpact,
  catalogRevision: 'frozen-revision',
  reasonCode: 'NO_EXPLICIT_INSUMO_MAPPING',
);
