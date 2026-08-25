// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'restaurant_table.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$RestaurantTableImpl _$$RestaurantTableImplFromJson(
        Map<String, dynamic> json) =>
    _$RestaurantTableImpl(
      id: json['id'] as String,
      areaId: json['areaId'] as String,
      tableNumber: json['tableNumber'] as String,
      capacity: json['capacity'] as int? ?? 4,
      status: json['status'] as String? ?? 'DISPONIBLE',
      currentTicketId: json['currentTicketId'] as String?,
      activeGuests: json['activeGuests'] as int?,
      openedAt: json['openedAt'] == null
          ? null
          : DateTime.parse(json['openedAt'] as String),
    );

Map<String, dynamic> _$$RestaurantTableImplToJson(
        _$RestaurantTableImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'areaId': instance.areaId,
      'tableNumber': instance.tableNumber,
      'capacity': instance.capacity,
      'status': instance.status,
      'currentTicketId': instance.currentTicketId,
      'activeGuests': instance.activeGuests,
      'openedAt': instance.openedAt?.toIso8601String(),
    };
