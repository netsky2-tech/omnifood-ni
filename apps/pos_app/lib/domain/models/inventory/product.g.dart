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
      variants: (json['variants'] as List<dynamic>?)
              ?.map((e) => ProductVariant.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
      availableModifiers: (json['availableModifiers'] as List<dynamic>?)
              ?.map((e) => Modifier.fromJson(e as Map<String, dynamic>))
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
      'variants': instance.variants,
      'availableModifiers': instance.availableModifiers,
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
