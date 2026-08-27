// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'split_bill_engine.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$SplitBillShareImpl _$$SplitBillShareImplFromJson(Map<String, dynamic> json) =>
    _$SplitBillShareImpl(
      shareIndex: json['shareIndex'] as int,
      label: json['label'] as String,
      items: (json['items'] as List<dynamic>?)
              ?.map((e) => CartItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const <CartItem>[],
      subtotalNio: (json['subtotalNio'] as num).toDouble(),
      taxNio: (json['taxNio'] as num).toDouble(),
      tipNio: (json['tipNio'] as num).toDouble(),
      discountNio: (json['discountNio'] as num).toDouble(),
      totalNio: (json['totalNio'] as num).toDouble(),
      totalUsd: (json['totalUsd'] as num).toDouble(),
      isPaid: json['isPaid'] as bool? ?? false,
    );

Map<String, dynamic> _$$SplitBillShareImplToJson(
        _$SplitBillShareImpl instance) =>
    <String, dynamic>{
      'shareIndex': instance.shareIndex,
      'label': instance.label,
      'items': instance.items,
      'subtotalNio': instance.subtotalNio,
      'taxNio': instance.taxNio,
      'tipNio': instance.tipNio,
      'discountNio': instance.discountNio,
      'totalNio': instance.totalNio,
      'totalUsd': instance.totalUsd,
      'isPaid': instance.isPaid,
    };

_$SplitBillResultImpl _$$SplitBillResultImplFromJson(
        Map<String, dynamic> json) =>
    _$SplitBillResultImpl(
      shares: (json['shares'] as List<dynamic>)
          .map((e) => SplitBillShare.fromJson(e as Map<String, dynamic>))
          .toList(),
      totalDistributedNio: (json['totalDistributedNio'] as num).toDouble(),
      totalDistributedUsd: (json['totalDistributedUsd'] as num).toDouble(),
      commercialRate: (json['commercialRate'] as num).toDouble(),
    );

Map<String, dynamic> _$$SplitBillResultImplToJson(
        _$SplitBillResultImpl instance) =>
    <String, dynamic>{
      'shares': instance.shares,
      'totalDistributedNio': instance.totalDistributedNio,
      'totalDistributedUsd': instance.totalDistributedUsd,
      'commercialRate': instance.commercialRate,
    };
