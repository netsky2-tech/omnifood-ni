// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'kitchen_order.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$KitchenOrderImpl _$$KitchenOrderImplFromJson(Map<String, dynamic> json) =>
    _$KitchenOrderImpl(
      id: json['id'] as String,
      ticketId: json['ticketId'] as String,
      tableNumber: json['tableNumber'] as String?,
      tableName: json['tableName'] as String?,
      waiterName: json['waiterName'] as String?,
      station: json['station'] as String? ?? 'COCINA',
      status: json['status'] as String? ?? 'PENDIENTE',
      createdAt: DateTime.parse(json['createdAt'] as String),
      startedAt: json['startedAt'] == null
          ? null
          : DateTime.parse(json['startedAt'] as String),
      readyAt: json['readyAt'] == null
          ? null
          : DateTime.parse(json['readyAt'] as String),
      servedAt: json['servedAt'] == null
          ? null
          : DateTime.parse(json['servedAt'] as String),
      notes: json['notes'] as String?,
      items: (json['items'] as List<dynamic>?)
              ?.map((e) => KitchenOrderItem.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$$KitchenOrderImplToJson(_$KitchenOrderImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'ticketId': instance.ticketId,
      'tableNumber': instance.tableNumber,
      'tableName': instance.tableName,
      'waiterName': instance.waiterName,
      'station': instance.station,
      'status': instance.status,
      'createdAt': instance.createdAt.toIso8601String(),
      'startedAt': instance.startedAt?.toIso8601String(),
      'readyAt': instance.readyAt?.toIso8601String(),
      'servedAt': instance.servedAt?.toIso8601String(),
      'notes': instance.notes,
      'items': instance.items,
    };
