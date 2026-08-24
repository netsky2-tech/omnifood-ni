import 'package:freezed_annotation/freezed_annotation.dart';

part 'inventory_valuation_report.freezed.dart';
part 'inventory_valuation_report.g.dart';

@freezed
class InventoryValuationItem with _$InventoryValuationItem {
  const factory InventoryValuationItem({
    required String id,
    required String name,
    required String consumptionUom,
    String? warehouseId,
    @Default(false) bool isPerishable,
    required double stock,
    required double averageCostNio,
    required double totalValuationNio,
    double? stockMin,
    double? stockMax,
    double? parLevel,
    @Default(false) bool isLowStock,
    @Default(false) bool isNegativeStock,
  }) = _InventoryValuationItem;

  factory InventoryValuationItem.fromJson(Map<String, dynamic> json) =>
      _$InventoryValuationItemFromJson(json);
}

@freezed
class InventoryValuationReport with _$InventoryValuationReport {
  const factory InventoryValuationReport({
    required double totalValuationNio,
    required int totalItemsCount,
    required int itemsWithStockCount,
    required int itemsLowStockCount,
    required int itemsNegativeStockCount,
    required DateTime generatedAt,
    required List<InventoryValuationItem> items,
  }) = _InventoryValuationReport;

  factory InventoryValuationReport.fromJson(Map<String, dynamic> json) =>
      _$InventoryValuationReportFromJson(json);
}
