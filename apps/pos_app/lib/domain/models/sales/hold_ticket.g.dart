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
      updatedAt: json['updatedAt'] == null
          ? null
          : DateTime.parse(json['updatedAt'] as String),
      tableId: json['tableId'] as String?,
      areaId: json['areaId'] as String?,
      waiterId: json['waiterId'] as String?,
      waiterName: json['waiterName'] as String?,
      guestCount: json['guestCount'] as int? ?? 1,
      isGlobalTaxExempt: json['isGlobalTaxExempt'] as bool? ?? false,
      version: json['version'] as int? ?? 1,
    );

Map<String, dynamic> _$$HoldTicketImplToJson(_$HoldTicketImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': instance.name,
      'items': instance.items,
      'createdAt': instance.createdAt.toIso8601String(),
      'updatedAt': instance.updatedAt?.toIso8601String(),
      'tableId': instance.tableId,
      'areaId': instance.areaId,
      'waiterId': instance.waiterId,
      'waiterName': instance.waiterName,
      'guestCount': instance.guestCount,
      'isGlobalTaxExempt': instance.isGlobalTaxExempt,
      'version': instance.version,
    };
