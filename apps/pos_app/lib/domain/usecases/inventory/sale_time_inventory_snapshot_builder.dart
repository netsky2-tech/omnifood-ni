import 'dart:collection';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:pos_app/domain/models/sales/sale_time_inventory_snapshot.dart';

import 'modifier_deviation_resolver.dart';
import 'sale_inventory_outcome_planner.dart';
import 'sub_recipe_bom_explosion.dart';
import 'validated_sale_inventory_authority.dart';

class SaleTimeInventorySnapshotBuildException implements Exception {
  const SaleTimeInventorySnapshotBuildException();
}

class SaleInventorySnapshotLine {
  SaleInventorySnapshotLine({required this.lineId, required this.snapshot});
  final String lineId;
  final SaleTimeInventorySnapshot snapshot;
}

/// Frozen inventory portion of a sale; it is input to, never, the final hash.
class SaleInventorySnapshotBuildResult {
  SaleInventorySnapshotBuildResult({
    required List<SaleInventorySnapshotLine> lines,
    required this.outcome,
    required this.reason,
  }) : lines = UnmodifiableListView(List.of(lines)),
       canonicalInventoryPayloadFragment = _canonical({
         'policyVersion': 'SALE_TIME_V1',
         'inventoryOutcome': _outcomeName(outcome),
         'inventoryOutcomeReason': reason == null
             ? null
             : {'code': _reasonName(reason.code), 'lines': reason.lineIds},
         'items': lines
             .map(
               (line) => {
                 'invoiceItemId': line.lineId,
                 'inventorySnapshotVersion': 'SALE_TIME_V1',
                 'inventorySnapshot': line.snapshot.toJson(),
               },
             )
             .toList(),
       });

  final UnmodifiableListView<SaleInventorySnapshotLine> lines;
  final InvoiceInventoryOutcome outcome;
  final InvoiceInventoryReason? reason;
  final String canonicalInventoryPayloadFragment;
}

class SaleTimeInventorySnapshotBuilder {
  SaleInventorySnapshotBuildResult build({
    required SaleInventoryOutcomePlan plan,
    required ValidatedSaleInventoryAuthority authority,
    required String terminalId,
    required String invoiceId,
    required String catalogRevision,
    required String movementKind,
  }) {
    if (!_nonEmpty(terminalId) ||
        !_nonEmpty(invoiceId) ||
        !_nonEmpty(catalogRevision) ||
        !_nonEmpty(movementKind)) {
      throw const SaleTimeInventorySnapshotBuildException();
    }
    final lines = plan.lines
        .map(
          (line) => SaleInventorySnapshotLine(
            lineId: line.line.id,
            snapshot: _snapshot(
              line,
              authority,
              terminalId,
              invoiceId,
              catalogRevision,
              movementKind,
            ),
          ),
        )
        .toList();
    final correlations = lines
        .expand((line) => line.snapshot.bindings)
        .map((binding) => binding.saleCorrelationId)
        .toSet();
    if (correlations.length !=
        lines.expand((line) => line.snapshot.bindings).length) {
      throw const SaleTimeInventorySnapshotBuildException();
    }
    return SaleInventorySnapshotBuildResult(
      lines: lines,
      outcome: plan.outcome,
      reason: plan.reason,
    );
  }

  SaleTimeInventorySnapshot _snapshot(
    SaleInventoryLinePlan line,
    ValidatedSaleInventoryAuthority authority,
    String terminalId,
    String invoiceId,
    String catalogRevision,
    String movementKind,
  ) {
    final classification = switch (line.classification) {
      SaleLineClassification.simple => SaleInventoryClassification.simple,
      SaleLineClassification.prepared => SaleInventoryClassification.prepared,
      SaleLineClassification.compound => SaleInventoryClassification.compound,
    };
    final bindings = switch (line.disposition) {
      SaleLineDisposition.direct => _directBindings(
        line,
        authority,
        terminalId,
        invoiceId,
        movementKind,
      ),
      SaleLineDisposition.recipe => _recipeBindings(
        line,
        authority,
        terminalId,
        invoiceId,
        movementKind,
      ),
      SaleLineDisposition.noImpact ||
      SaleLineDisposition.pendingRecipe => const <SaleTimeInventoryBinding>[],
    };
    return SaleTimeInventorySnapshot(
      classification: classification,
      disposition: _disposition(line.disposition),
      catalogRevision: catalogRevision,
      reasonCode: _reason(line.disposition),
      mappingVersionId: line.disposition == SaleLineDisposition.direct
          ? authority.mappingsByProductId[line.line.productId]!.id
          : null,
      recipeVersionId: line.disposition == SaleLineDisposition.recipe
          ? authority.recipesByProductId[line.line.productId]!.id
          : null,
      bindings: bindings,
    );
  }

  List<SaleTimeInventoryBinding> _directBindings(
    SaleInventoryLinePlan line,
    ValidatedSaleInventoryAuthority authority,
    String terminalId,
    String invoiceId,
    String movementKind,
  ) {
    final mapping = authority.mappingsByProductId[line.line.productId]!;
    return [
      _binding(
        0,
        mapping.insumoId,
        null,
        1,
        line.line.id,
        authority.context.provisionedTenantId,
        terminalId,
        invoiceId,
        movementKind,
      ),
    ];
  }

  List<SaleTimeInventoryBinding> _recipeBindings(
    SaleInventoryLinePlan line,
    ValidatedSaleInventoryAuthority authority,
    String terminalId,
    String invoiceId,
    String movementKind,
  ) {
    final recipe = authority.recipesByProductId[line.line.productId]!;
    // R21 / S18: one binding per LEAF insumo, not per root component. A
    // SUB_RECIPE component is expanded recursively (the POS mirror of the
    // backend's BomExplosionService, R11) and its leaves travel with
    // `recipeComponentId: null`, because the backend validates that id
    // against the ROOT recipe's details only.
    final leaves = const SubRecipeBomExplosion()
        .explode(
          authority: authority,
          recipeId: recipe.id,
          rootProductId: line.line.productId,
        )
        .values
        .toList(growable: false);

    // R28: the line's modifiers CORRECT the recipe's consumption. The
    // resolution is fail-soft by construction: an effect the company cannot
    // apply (an insumo it has not registered, a quantity whose unit does not
    // match) simply does not touch the stock, and the sale goes through.
    final resolution = const ModifierDeviationResolver().resolve(
      leaves: leaves,
      rootComponents: authority.componentsById.values
          .where((component) => component.recipeId == recipe.id)
          .toList(growable: false),
      modifiers: line.line.modifiers,
      insumosById: authority.insumosById,
    );

    final resolved = resolution.leaves;
    return [
      for (var i = 0; i < resolved.length; i++)
        _binding(
          i,
          resolved[i].insumoId,
          resolved[i].rootComponentId,
          resolved[i].quantityPerSaleUnit,
          line.line.id,
          authority.context.provisionedTenantId,
          terminalId,
          invoiceId,
          movementKind,
        ),
    ];
  }

  SaleTimeInventoryBinding _binding(
    int ordinal,
    String insumoId,
    String? componentId,
    double quantity,
    String invoiceItemId,
    String tenantId,
    String terminalId,
    String invoiceId,
    String movementKind,
  ) => SaleTimeInventoryBinding(
    bindingOrdinal: ordinal,
    insumoId: insumoId,
    recipeComponentId: componentId,
    quantityPerSaleUnit: quantity,
    saleCorrelationId: sha256
        .convert(
          utf8.encode(
            _canonical({
              'schema': 'sale-movement:v1',
              'tenantId': tenantId,
              'terminalId': terminalId,
              'invoiceId': invoiceId,
              'invoiceItemId': invoiceItemId,
              'bindingOrdinal': ordinal,
              'insumoId': insumoId,
              'movementKind': movementKind,
            }),
          ),
        )
        .toString(),
  );
}

SaleInventoryDisposition _disposition(SaleLineDisposition value) =>
    switch (value) {
      SaleLineDisposition.direct => SaleInventoryDisposition.direct,
      SaleLineDisposition.recipe => SaleInventoryDisposition.recipe,
      SaleLineDisposition.noImpact => SaleInventoryDisposition.noImpact,
      SaleLineDisposition.pendingRecipe =>
        SaleInventoryDisposition.pendingRecipe,
    };
String? _reason(SaleLineDisposition value) => switch (value) {
  SaleLineDisposition.noImpact => 'NO_EXPLICIT_INSUMO_MAPPING',
  SaleLineDisposition.pendingRecipe => 'MISSING_PUBLISHED_RECIPE',
  _ => null,
};
String _outcomeName(InvoiceInventoryOutcome value) => switch (value) {
  InvoiceInventoryOutcome.applied => 'APPLIED',
  InvoiceInventoryOutcome.appliedNoInventoryImpact =>
    'APPLIED_NO_INVENTORY_IMPACT',
  InvoiceInventoryOutcome.appliedInventoryPending =>
    'APPLIED_INVENTORY_PENDING',
};
String _reasonName(InvoiceInventoryReasonCode value) => switch (value) {
  InvoiceInventoryReasonCode.noExplicitInsumoMapping =>
    'NO_EXPLICIT_INSUMO_MAPPING',
  InvoiceInventoryReasonCode.missingPublishedRecipe =>
    'MISSING_PUBLISHED_RECIPE',
};
bool _nonEmpty(String value) => value.trim().isNotEmpty;
String _canonical(Object? value) {
  if (value is Map) {
    final keys = value.keys.cast<String>().toList()..sort();
    return '{${keys.map((key) => '${jsonEncode(key)}:${_canonical(value[key])}').join(',')}}';
  }
  if (value is Iterable) return '[${value.map(_canonical).join(',')}]';
  return jsonEncode(value);
}
