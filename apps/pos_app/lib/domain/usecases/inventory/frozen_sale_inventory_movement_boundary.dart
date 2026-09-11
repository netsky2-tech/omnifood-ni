import 'dart:collection';

import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';

enum LocalSaleMovementOutcome {
  applied,
  suppressedNoInventoryImpact,
  suppressedInventoryPending,
}

class FrozenSaleInventoryMovementBoundaryException implements Exception {
  const FrozenSaleInventoryMovementBoundaryException();
}

class FrozenSaleInventoryMovementLine {
  const FrozenSaleInventoryMovementLine({
    required this.invoiceItemId,
    required this.quantity,
    required this.snapshot,
  });

  final String invoiceItemId;
  final double quantity;
  final SaleTimeInventorySnapshot snapshot;
}

class FrozenSaleInventoryMovement {
  const FrozenSaleInventoryMovement({
    required this.invoiceItemId,
    required this.bindingOrdinal,
    required this.insumoId,
    required this.recipeComponentId,
    required this.quantity,
    required this.saleCorrelationId,
  });

  final String invoiceItemId;
  final int bindingOrdinal;
  final String insumoId;
  final String? recipeComponentId;
  final double quantity;
  final String saleCorrelationId;
}

class FrozenSaleInventoryMovementResult {
  FrozenSaleInventoryMovementResult({
    required this.outcome,
    required List<FrozenSaleInventoryMovement> movements,
  }) : movements = UnmodifiableListView(List.of(movements));

  final LocalSaleMovementOutcome outcome;
  final UnmodifiableListView<FrozenSaleInventoryMovement> movements;
}

/// Converts only sale-time-frozen bindings into local movement intent.
class FrozenSaleInventoryMovementBoundary {
  FrozenSaleInventoryMovementResult derive(
    List<FrozenSaleInventoryMovementLine> lines,
  ) {
    if (lines.isEmpty || !_validLines(lines) || !_validBindings(lines)) {
      throw const FrozenSaleInventoryMovementBoundaryException();
    }
    if (lines.any(
      (line) =>
          line.snapshot.disposition == SaleInventoryDisposition.pendingRecipe,
    )) {
      return _suppressed(LocalSaleMovementOutcome.suppressedInventoryPending);
    }
    final movements = [
      for (final line in lines)
        if (line.snapshot.disposition == SaleInventoryDisposition.direct ||
            line.snapshot.disposition == SaleInventoryDisposition.recipe)
          for (final binding in line.snapshot.bindings)
            FrozenSaleInventoryMovement(
              invoiceItemId: line.invoiceItemId,
              bindingOrdinal: binding.bindingOrdinal,
              insumoId: binding.insumoId,
              recipeComponentId: binding.recipeComponentId,
              quantity: line.quantity * binding.quantityPerSaleUnit,
              saleCorrelationId: binding.saleCorrelationId,
            ),
    ];
    if (movements.isEmpty) {
      return _suppressed(LocalSaleMovementOutcome.suppressedNoInventoryImpact);
    }
    return FrozenSaleInventoryMovementResult(
      outcome: LocalSaleMovementOutcome.applied,
      movements: movements,
    );
  }

  FrozenSaleInventoryMovementResult _suppressed(
    LocalSaleMovementOutcome outcome,
  ) => FrozenSaleInventoryMovementResult(outcome: outcome, movements: const []);

  bool _validLines(List<FrozenSaleInventoryMovementLine> lines) {
    final ids = <String>{};
    return lines.every(
      (line) =>
          line.invoiceItemId.trim().isNotEmpty &&
          line.quantity.isFinite &&
          line.quantity > 0 &&
          ids.add(line.invoiceItemId),
    );
  }

  bool _validBindings(List<FrozenSaleInventoryMovementLine> lines) {
    final correlations = <String>{};
    for (final line in lines) {
      if (line.snapshot.disposition != SaleInventoryDisposition.direct &&
          line.snapshot.disposition != SaleInventoryDisposition.recipe) {
        continue;
      }
      for (final binding in line.snapshot.bindings) {
        final quantity = line.quantity * binding.quantityPerSaleUnit;
        if (binding.insumoId.trim().isEmpty ||
            binding.saleCorrelationId.trim().isEmpty ||
            binding.recipeComponentId?.trim().isEmpty == true ||
            !quantity.isFinite ||
            quantity <= 0 ||
            !correlations.add(binding.saleCorrelationId)) {
          return false;
        }
      }
    }
    return true;
  }
}
