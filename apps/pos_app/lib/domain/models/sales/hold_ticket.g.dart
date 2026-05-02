// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hold_ticket.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$HoldTicketImpl _$$HoldTicketImplFromJson(Map<String, dynamic> json) =>
    _$HoldTicketImpl(
      id: json['id'] as String,
      name: json['name'] as String,
      items: (json['items'] as List<dynamic>)
          .map((e) => CartItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      isGlobalTaxExempt: json['isGlobalTaxExempt'] as bool? ?? false,
    );

Map<String, dynamic> _$$HoldTicketImplToJson(_$HoldTicketImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'items': instance.items,
      'createdAt': instance.createdAt.toIso8601String(),
      'isGlobalTaxExempt': instance.isGlobalTaxExempt,
    };
