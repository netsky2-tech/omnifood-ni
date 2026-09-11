import 'dart:collection';

enum SaleTimeInventorySnapshotVersion { saleTimeV1 }
enum SaleInventoryClassification { simple, prepared, compound }
enum SaleInventoryDisposition { direct, recipe, noImpact, pendingRecipe }

class SaleTimeInventoryBinding {
  SaleTimeInventoryBinding({required this.bindingOrdinal, required this.insumoId, required this.quantityPerSaleUnit, required this.saleCorrelationId, this.recipeComponentId}) {
    if (bindingOrdinal < 0 || insumoId.isEmpty || saleCorrelationId.isEmpty || !quantityPerSaleUnit.isFinite || quantityPerSaleUnit <= 0) throw ArgumentError('Invalid sale-time inventory binding');
  }
  final int bindingOrdinal;
  final String insumoId;
  final String? recipeComponentId;
  final double quantityPerSaleUnit;
  final String saleCorrelationId;
  Map<String, dynamic> toJson() => {'bindingOrdinal': bindingOrdinal, 'insumoId': insumoId, 'recipeComponentId': recipeComponentId, 'quantityPerSaleUnit': quantityPerSaleUnit, 'saleCorrelationId': saleCorrelationId};
  factory SaleTimeInventoryBinding.fromJson(Map<String, dynamic> json) {
    const keys = {'bindingOrdinal', 'insumoId', 'recipeComponentId', 'quantityPerSaleUnit', 'saleCorrelationId'};
    final ordinal = json['bindingOrdinal']; final quantity = json['quantityPerSaleUnit'];
    if (json.length != keys.length || !json.keys.toSet().containsAll(keys) || ordinal is! int || quantity is! num || json['insumoId'] is! String || json['saleCorrelationId'] is! String || (json['recipeComponentId'] != null && json['recipeComponentId'] is! String)) throw const FormatException('Invalid sale-time inventory binding');
    try { return SaleTimeInventoryBinding(bindingOrdinal: ordinal, insumoId: json['insumoId'] as String, recipeComponentId: json['recipeComponentId'] as String?, quantityPerSaleUnit: quantity.toDouble(), saleCorrelationId: json['saleCorrelationId'] as String); } on ArgumentError { throw const FormatException('Invalid sale-time inventory binding'); }
  }
}

/// Immutable inventory facts frozen with an invoice item at sale time.
class SaleTimeInventorySnapshot {
  SaleTimeInventorySnapshot({required this.classification, required this.disposition, required this.catalogRevision, List<SaleTimeInventoryBinding> bindings = const [], this.reasonCode, this.mappingVersionId, this.recipeVersionId}) : bindings = UnmodifiableListView(List<SaleTimeInventoryBinding>.of(bindings)) {
    if (catalogRevision.isEmpty || !_stable(bindings) || !_valid()) throw ArgumentError('Invalid sale-time inventory snapshot');
  }
  final SaleInventoryClassification classification;
  final SaleInventoryDisposition disposition;
  final String? reasonCode;
  final String catalogRevision;
  final String? mappingVersionId;
  final String? recipeVersionId;
  final UnmodifiableListView<SaleTimeInventoryBinding> bindings;
  bool _valid() => switch (disposition) {
    SaleInventoryDisposition.direct => classification == SaleInventoryClassification.simple && mappingVersionId?.isNotEmpty == true && recipeVersionId == null && bindings.length == 1 && bindings.single.recipeComponentId == null && reasonCode == null,
    SaleInventoryDisposition.recipe => (classification == SaleInventoryClassification.prepared || classification == SaleInventoryClassification.compound) && recipeVersionId?.isNotEmpty == true && mappingVersionId == null && bindings.isNotEmpty && bindings.every((binding) => binding.recipeComponentId?.isNotEmpty == true) && reasonCode == null,
    SaleInventoryDisposition.noImpact => classification == SaleInventoryClassification.simple && mappingVersionId == null && recipeVersionId == null && bindings.isEmpty && reasonCode == 'NO_EXPLICIT_INSUMO_MAPPING',
    SaleInventoryDisposition.pendingRecipe => (classification == SaleInventoryClassification.prepared || classification == SaleInventoryClassification.compound) && mappingVersionId == null && recipeVersionId == null && bindings.isEmpty && reasonCode == 'MISSING_PUBLISHED_RECIPE',
  };
  static bool _stable(List<SaleTimeInventoryBinding> values) {
    for (var i = 0; i < values.length; i++) {
      if (values[i].bindingOrdinal != i || (i > 0 && _compare(values[i - 1], values[i]) > 0)) return false;
    }
    return true;
  }
  Map<String, dynamic> toJson() => {'classification': _name(classification), 'disposition': _name(disposition), 'reasonCode': reasonCode, 'catalogRevision': catalogRevision, 'mappingVersionId': mappingVersionId, 'recipeVersionId': recipeVersionId, 'bindings': bindings.map((binding) => binding.toJson()).toList()};
  factory SaleTimeInventorySnapshot.fromJson(Map<String, dynamic> json) {
    const keys = {'classification', 'disposition', 'reasonCode', 'catalogRevision', 'mappingVersionId', 'recipeVersionId', 'bindings'};
    final raw = json['bindings'];
    if (json.length != keys.length || !json.keys.toSet().containsAll(keys) || raw is! List || json['catalogRevision'] is! String || (json['reasonCode'] != null && json['reasonCode'] is! String) || (json['mappingVersionId'] != null && json['mappingVersionId'] is! String) || (json['recipeVersionId'] != null && json['recipeVersionId'] is! String)) throw const FormatException('Invalid sale-time inventory snapshot');
    try { return SaleTimeInventorySnapshot(classification: _parse(json['classification'], SaleInventoryClassification.values), disposition: _parse(json['disposition'], SaleInventoryDisposition.values), catalogRevision: json['catalogRevision'] as String, reasonCode: json['reasonCode'] as String?, mappingVersionId: json['mappingVersionId'] as String?, recipeVersionId: json['recipeVersionId'] as String?, bindings: raw.map((value) => SaleTimeInventoryBinding.fromJson(Map<String, dynamic>.from(value as Map))).toList()); } on ArgumentError { throw const FormatException('Invalid sale-time inventory snapshot'); }
  }
  static int _compare(SaleTimeInventoryBinding a, SaleTimeInventoryBinding b) { final insumo = a.insumoId.compareTo(b.insumoId); return insumo != 0 ? insumo : (a.recipeComponentId ?? '').compareTo(b.recipeComponentId ?? ''); }
}
T _parse<T extends Enum>(Object? value, List<T> values) { if (value is! String) throw const FormatException('Invalid sale-time enum'); return values.firstWhere((item) => _name(item) == value, orElse: () => throw const FormatException('Invalid sale-time enum')); }
String _name(Enum value) => switch (value.name) { 'noImpact' => 'NO_IMPACT', 'pendingRecipe' => 'PENDING_RECIPE', _ => value.name.toUpperCase() };
