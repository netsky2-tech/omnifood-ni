import 'dart:collection';
import 'validated_sale_inventory_authority.dart';
class SaleInventoryPlanningException implements Exception {
  const SaleInventoryPlanningException();
}

enum SaleLineClassification { simple, prepared, compound }
enum SaleLineDisposition { direct, recipe, noImpact, pendingRecipe }
enum InvoiceInventoryOutcome {
  applied,
  appliedNoInventoryImpact,
  appliedInventoryPending,
}

enum InvoiceInventoryReasonCode {
  noExplicitInsumoMapping,
  missingPublishedRecipe,
}

class SaleInventoryLine {
  const SaleInventoryLine({
    required this.id,
    required this.productId,
    required this.quantity,
  });
  final String id, productId;
  final double quantity;
}

class SaleInventoryLinePlan {
  const SaleInventoryLinePlan(this.line, this.classification, this.disposition);
  final SaleInventoryLine line;
  final SaleLineClassification classification;
  final SaleLineDisposition disposition;
}

class InvoiceInventoryReason {
  InvoiceInventoryReason({required this.code, required List<String> lineIds})
    : lineIds = UnmodifiableListView(List.of(lineIds)) {
    if (!_ordered(lineIds)) throw ArgumentError.value(lineIds);
  }
  final InvoiceInventoryReasonCode code;
  final List<String> lineIds;
}

class SaleInventoryOutcomePlan {
  SaleInventoryOutcomePlan({
    required List<SaleInventoryLinePlan> lines,
    required this.outcome,
    this.reason,
  }) : lines = UnmodifiableListView(List.of(lines)) {
    final expectedOutcome = _outcome(lines);
    final expectedReason = _reasonCode(expectedOutcome);
    final expectedIds = _reasonIds(lines, expectedOutcome);
    if (outcome != expectedOutcome ||
        reason?.code != expectedReason ||
        !_ordered(lines.map((line) => line.line.id).toList()) ||
        !_same(reason?.lineIds, expectedIds)) {
      throw ArgumentError('Ambiguous invoice inventory outcome/reason');
    }
  }
  final List<SaleInventoryLinePlan> lines;
  final InvoiceInventoryOutcome outcome;
  final InvoiceInventoryReason? reason;
}

class SaleInventoryOutcomePlanner {
  SaleInventoryOutcomePlan plan({
    required List<SaleInventoryLine> lines,
    required ValidatedSaleInventoryAuthority authority,
  }) {
    if (!_valid(lines.map((line) => line.id).toList())) {
      throw const SaleInventoryPlanningException();
    }
    final plans = lines.map((line) => _classify(line, authority)).toList()
      ..sort((a, b) => a.line.id.compareTo(b.line.id));
    final outcome = _outcome(plans);
    final code = _reasonCode(outcome);
    final reason = code == null
        ? null
        : InvoiceInventoryReason(
            code: code,
            lineIds: _reasonIds(plans, outcome)!,
          );
    return SaleInventoryOutcomePlan(
      lines: plans,
      outcome: outcome,
      reason: reason,
    );
  }

  SaleInventoryLinePlan _classify(
    SaleInventoryLine line,
    ValidatedSaleInventoryAuthority authority,
  ) {
    if (line.productId.trim().isEmpty ||
        !line.quantity.isFinite ||
        line.quantity <= 0) {
      throw const SaleInventoryPlanningException();
    }
    final product =
        authority.productsById[line.productId] ??
        (throw const SaleInventoryPlanningException());
    final recipe = authority.recipesByProductId[line.productId];
    final hasRecipe =
        recipe != null &&
        authority.componentsById.values.any(
          (component) => component.recipeId == recipe.id,
        );
    final disposition = switch (product.inventoryKind) {
      AuthorityInventoryKind.simple =>
        authority.mappingsByProductId.containsKey(line.productId)
            ? SaleLineDisposition.direct
            : SaleLineDisposition.noImpact,
      AuthorityInventoryKind.prepared || AuthorityInventoryKind.compound =>
        hasRecipe
            ? SaleLineDisposition.recipe
            : SaleLineDisposition.pendingRecipe,
    };
    final classification = switch (product.inventoryKind) {
      AuthorityInventoryKind.simple => SaleLineClassification.simple,
      AuthorityInventoryKind.prepared => SaleLineClassification.prepared,
      AuthorityInventoryKind.compound => SaleLineClassification.compound,
    };
    return SaleInventoryLinePlan(line, classification, disposition);
  }
}

InvoiceInventoryOutcome _outcome(List<SaleInventoryLinePlan> lines) =>
    lines.any((line) => line.disposition == SaleLineDisposition.pendingRecipe)
    ? InvoiceInventoryOutcome.appliedInventoryPending
    : lines.any(
        (line) =>
            line.disposition == SaleLineDisposition.direct ||
            line.disposition == SaleLineDisposition.recipe,
      )
    ? InvoiceInventoryOutcome.applied
    : InvoiceInventoryOutcome.appliedNoInventoryImpact;
InvoiceInventoryReasonCode? _reasonCode(InvoiceInventoryOutcome outcome) =>
    switch (outcome) {
      InvoiceInventoryOutcome.applied => null,
      InvoiceInventoryOutcome.appliedNoInventoryImpact =>
        InvoiceInventoryReasonCode.noExplicitInsumoMapping,
      InvoiceInventoryOutcome.appliedInventoryPending =>
        InvoiceInventoryReasonCode.missingPublishedRecipe,
    };
List<String>? _reasonIds(
  List<SaleInventoryLinePlan> lines,
  InvoiceInventoryOutcome outcome,
) => switch (outcome) {
  InvoiceInventoryOutcome.applied => null,
  InvoiceInventoryOutcome.appliedNoInventoryImpact => _ids(
    lines,
    SaleLineDisposition.noImpact,
  ),
  InvoiceInventoryOutcome.appliedInventoryPending => _ids(
    lines,
    SaleLineDisposition.pendingRecipe,
  ),
};
List<String> _ids(
  List<SaleInventoryLinePlan> lines,
  SaleLineDisposition disposition,
) => lines
    .where((line) => line.disposition == disposition)
    .map((line) => line.line.id)
    .toList();
bool _valid(List<String> values) =>
    values.isNotEmpty &&
    values.every((value) => value.trim().isNotEmpty) &&
    values.toSet().length == values.length;
bool _ordered(List<String> values) =>
    _valid(values) && _same(values, [...values]..sort());
bool _same(List<String>? a, List<String>? b) =>
    a?.length == b?.length &&
    a?.asMap().entries.every((e) => e.value == b![e.key]) != false;
