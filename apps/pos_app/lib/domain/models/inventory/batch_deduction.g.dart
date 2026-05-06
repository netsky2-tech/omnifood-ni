// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'batch_deduction.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$BatchDeductionImpl _$$BatchDeductionImplFromJson(Map<String, dynamic> json) =>
    _$BatchDeductionImpl(
      batchId: json['batchId'] as String,
      quantity: (json['quantity'] as num).toDouble(),
    );

Map<String, dynamic> _$$BatchDeductionImplToJson(
        _$BatchDeductionImpl instance) =>
    <String, dynamic>{
      'batchId': instance.batchId,
      'quantity': instance.quantity,
    };
