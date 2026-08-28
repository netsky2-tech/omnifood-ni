// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'kitchen_order_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$KitchenOrderItemImpl _$$KitchenOrderItemImplFromJson(
        Map<String, dynamic> json) =>
    _$KitchenOrderItemImpl(
      id: json['id'] as String,
      kitchenOrderId: json['kitchenOrderId'] as String,
      productId: json['productId'] as String,
      productName: json['productName'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      status: json['status'] as String? ?? 'PENDIENTE',
      notes: json['notes'] as String?,
      modifiers: (json['modifiers'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          const [],
    );

Map<String, dynamic> _$$KitchenOrderItemImplToJson(
        _$KitchenOrderItemImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kitchenOrderId': instance.kitchenOrderId,
      'productId': instance.productId,
      'productName': instance.productName,
      'quantity': instance.quantity,
      'status': instance.status,
      'notes': instance.notes,
      'modifiers': instance.modifiers,
    };
