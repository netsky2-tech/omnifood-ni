// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cogs_report.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$CogsReportItemImpl _$$CogsReportItemImplFromJson(Map<String, dynamic> json) =>
    _$CogsReportItemImpl(
      insumoId: json['insumoId'] as String,
      insumoName: json['insumoName'] as String,
      consumptionUom: json['consumptionUom'] as String,
      salesQuantity: (json['salesQuantity'] as num).toDouble(),
      salesCostNio: (json['salesCostNio'] as num).toDouble(),
      shrinkageQuantity: (json['shrinkageQuantity'] as num).toDouble(),
      shrinkageCostNio: (json['shrinkageCostNio'] as num).toDouble(),
      totalQuantity: (json['totalQuantity'] as num).toDouble(),
      totalCostNio: (json['totalCostNio'] as num).toDouble(),
      costPercentage: (json['costPercentage'] as num).toDouble(),
    );

Map<String, dynamic> _$$CogsReportItemImplToJson(
        _$CogsReportItemImpl instance) =>
    <String, dynamic>{
      'insumoId': instance.insumoId,
      'insumoName': instance.insumoName,
      'consumptionUom': instance.consumptionUom,
      'salesQuantity': instance.salesQuantity,
      'salesCostNio': instance.salesCostNio,
      'shrinkageQuantity': instance.shrinkageQuantity,
      'shrinkageCostNio': instance.shrinkageCostNio,
      'totalQuantity': instance.totalQuantity,
      'totalCostNio': instance.totalCostNio,
      'costPercentage': instance.costPercentage,
    };

_$CogsReportImpl _$$CogsReportImplFromJson(Map<String, dynamic> json) =>
    _$CogsReportImpl(
      fromDate: DateTime.parse(json['fromDate'] as String),
      toDate: DateTime.parse(json['toDate'] as String),
      totalCogsNio: (json['totalCogsNio'] as num).toDouble(),
      salesCogsNio: (json['salesCogsNio'] as num).toDouble(),
      shrinkageCogsNio: (json['shrinkageCogsNio'] as num).toDouble(),
      generatedAt: DateTime.parse(json['generatedAt'] as String),
      items: (json['items'] as List<dynamic>)
          .map((e) => CogsReportItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$CogsReportImplToJson(_$CogsReportImpl instance) =>
    <String, dynamic>{
      'fromDate': instance.fromDate.toIso8601String(),
      'toDate': instance.toDate.toIso8601String(),
      'totalCogsNio': instance.totalCogsNio,
      'salesCogsNio': instance.salesCogsNio,
      'shrinkageCogsNio': instance.shrinkageCogsNio,
      'generatedAt': instance.generatedAt.toIso8601String(),
      'items': instance.items,
    };
