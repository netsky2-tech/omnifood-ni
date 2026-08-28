import 'package:freezed_annotation/freezed_annotation.dart';

part 'cogs_report.freezed.dart';
part 'cogs_report.g.dart';

@freezed
class CogsReportItem with _$CogsReportItem {
  const factory CogsReportItem({
    required String insumoId,
    required String insumoName,
    required String consumptionUom,
    required double salesQuantity,
    required double salesCostNio,
    required double shrinkageQuantity,
    required double shrinkageCostNio,
    required double totalQuantity,
    required double totalCostNio,
    required double costPercentage,
  }) = _CogsReportItem;

  factory CogsReportItem.fromJson(Map<String, dynamic> json) =>
      _$CogsReportItemFromJson(json);
}

@freezed
class CogsReport with _$CogsReport {
  const factory CogsReport({
    required DateTime fromDate,
    required DateTime toDate,
    required double totalCogsNio,
    required double salesCogsNio,
    required double shrinkageCogsNio,
    required DateTime generatedAt,
    required List<CogsReportItem> items,
  }) = _CogsReport;

  factory CogsReport.fromJson(Map<String, dynamic> json) =>
      _$CogsReportFromJson(json);
}
