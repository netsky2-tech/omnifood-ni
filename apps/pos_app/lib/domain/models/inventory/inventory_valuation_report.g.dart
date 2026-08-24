// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'inventory_valuation_report.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InventoryValuationItemImpl _$$InventoryValuationItemImplFromJson(
        Map<String, dynamic> json) =>
    _$InventoryValuationItemImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      consumptionUom: json['consumptionUom'] as String,
      warehouseId: json['warehouseId'] as String?,
      isPerishable: json['isPerishable'] as bool? ?? false,
      stock: (json['stock'] as num).toDouble(),
      averageCostNio: (json['averageCostNio'] as num).toDouble(),
      totalValuationNio: (json['totalValuationNio'] as num).toDouble(),
      stockMin: (json['stockMin'] as num?)?.toDouble(),
      stockMax: (json['stockMax'] as num?)?.toDouble(),
      parLevel: (json['parLevel'] as num?)?.toDouble(),
      isLowStock: json['isLowStock'] as bool? ?? false,
      isNegativeStock: json['isNegativeStock'] as bool? ?? false,
    );

Map<String, dynamic> _$$InventoryValuationItemImplToJson(
        _$InventoryValuationItemImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'consumptionUom': instance.consumptionUom,
      'warehouseId': instance.warehouseId,
      'isPerishable': instance.isPerishable,
      'stock': instance.stock,
      'averageCostNio': instance.averageCostNio,
      'totalValuationNio': instance.totalValuationNio,
      'stockMin': instance.stockMin,
      'stockMax': instance.stockMax,
      'parLevel': instance.parLevel,
      'isLowStock': instance.isLowStock,
      'isNegativeStock': instance.isNegativeStock,
    };

_$InventoryValuationReportImpl _$$InventoryValuationReportImplFromJson(
        Map<String, dynamic> json) =>
    _$InventoryValuationReportImpl(
      totalValuationNio: (json['totalValuationNio'] as num).toDouble(),
      totalItemsCount: json['totalItemsCount'] as int,
      itemsWithStockCount: json['itemsWithStockCount'] as int,
      itemsLowStockCount: json['itemsLowStockCount'] as int,
      itemsNegativeStockCount: json['itemsNegativeStockCount'] as int,
      generatedAt: DateTime.parse(json['generatedAt'] as String),
      items: (json['items'] as List<dynamic>)
          .map(
              (e) => InventoryValuationItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$$InventoryValuationReportImplToJson(
        _$InventoryValuationReportImpl instance) =>
    <String, dynamic>{
      'totalValuationNio': instance.totalValuationNio,
      'totalItemsCount': instance.totalItemsCount,
      'itemsWithStockCount': instance.itemsWithStockCount,
      'itemsLowStockCount': instance.itemsLowStockCount,
      'itemsNegativeStockCount': instance.itemsNegativeStockCount,
      'generatedAt': instance.generatedAt.toIso8601String(),
      'items': instance.items,
    };
