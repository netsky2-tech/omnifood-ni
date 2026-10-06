// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'product.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$ProductImpl _$$ProductImplFromJson(Map<String, dynamic> json) =>
    _$ProductImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      uom: json['uom'] as String,
      stock: (json['stock'] as num).toDouble(),
      averageCost: (json['averageCost'] as num).toDouble(),
      sellPrice: (json['sellPrice'] as num).toDouble(),
      isActive: json['isActive'] as bool? ?? true,
      sku: json['sku'] as String?,
      barcode: json['barcode'] as String?,
      category: json['category'] as String?,
      categoryId: json['categoryId'] as String?,
      isPrepared: json['isPrepared'] as bool? ?? false,
      productType: json['productType'] as String? ?? 'SIMPLE',
      mappingVersionId: json['mappingVersionId'] as String?,
      insumoId: json['insumoId'] as String?,
      createdAt: json['createdAt'] as String?,
      inventoryPolicy: $enumDecodeNullable(
          _$InventoryPolicyEnumMap, json['inventoryPolicy']),
      directStockInsumoId: json['directStockInsumoId'] as String?,
      taxRate: (json['taxRate'] as num?)?.toDouble() ?? 0.0,
      isTaxExempt: json['isTaxExempt'] as bool? ?? false,
      variants: (json['variants'] as List<dynamic>?)
              ?.map((e) => ProductVariant.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      availableModifiers: (json['availableModifiers'] as List<dynamic>?)
              ?.map((e) => Modifier.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      availableModifierGroups: (json['availableModifierGroups']
                  as List<dynamic>?)
              ?.map((e) =>
                  EffectiveModifierGroup.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$$ProductImplToJson(_$ProductImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'uom': instance.uom,
      'stock': instance.stock,
      'averageCost': instance.averageCost,
      'sellPrice': instance.sellPrice,
      'isActive': instance.isActive,
      'sku': instance.sku,
      'barcode': instance.barcode,
      'category': instance.category,
      'categoryId': instance.categoryId,
      'isPrepared': instance.isPrepared,
      'productType': instance.productType,
      'mappingVersionId': instance.mappingVersionId,
      'insumoId': instance.insumoId,
      'createdAt': instance.createdAt,
      'inventoryPolicy': _$InventoryPolicyEnumMap[instance.inventoryPolicy],
      'directStockInsumoId': instance.directStockInsumoId,
      'taxRate': instance.taxRate,
      'isTaxExempt': instance.isTaxExempt,
      'variants': instance.variants,
      'availableModifiers': instance.availableModifiers,
      'availableModifierGroups': instance.availableModifierGroups,
    };

const _$InventoryPolicyEnumMap = {
  InventoryPolicy.recipeBom: 'recipeBom',
  InventoryPolicy.directStock: 'directStock',
  InventoryPolicy.notTracked: 'notTracked',
};

_$ProductVariantImpl _$$ProductVariantImplFromJson(Map<String, dynamic> json) =>
    _$ProductVariantImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      priceAdjustment: (json['priceAdjustment'] as num).toDouble(),
    );

Map<String, dynamic> _$$ProductVariantImplToJson(
        _$ProductVariantImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'priceAdjustment': instance.priceAdjustment,
    };

_$ModifierImpl _$$ModifierImplFromJson(Map<String, dynamic> json) =>
    _$ModifierImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      extraPrice: (json['extraPrice'] as num).toDouble(),
    );

Map<String, dynamic> _$$ModifierImplToJson(_$ModifierImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'extraPrice': instance.extraPrice,
    };

_$EffectiveModifierOptionImpl _$$EffectiveModifierOptionImplFromJson(
        Map<String, dynamic> json) =>
    _$EffectiveModifierOptionImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      priceDelta: (json['priceDelta'] as num).toDouble(),
      isDefault: json['isDefault'] as bool,
    );

Map<String, dynamic> _$$EffectiveModifierOptionImplToJson(
        _$EffectiveModifierOptionImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'priceDelta': instance.priceDelta,
      'isDefault': instance.isDefault,
    };

_$EffectiveModifierGroupImpl _$$EffectiveModifierGroupImplFromJson(
        Map<String, dynamic> json) =>
    _$EffectiveModifierGroupImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      minSelected: json['minSelected'] as int,
      maxSelected: json['maxSelected'] as int,
      allowQuantities: json['allowQuantities'] as bool,
      source: json['source'] as String,
      options: (json['options'] as List<dynamic>?)
              ?.map((e) =>
                  EffectiveModifierOption.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$$EffectiveModifierGroupImplToJson(
        _$EffectiveModifierGroupImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'minSelected': instance.minSelected,
      'maxSelected': instance.maxSelected,
      'allowQuantities': instance.allowQuantities,
      'source': instance.source,
      'options': instance.options,
    };
