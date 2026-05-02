// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'invoice_item.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

_$InvoiceItemImpl _$$InvoiceItemImplFromJson(Map<String, dynamic> json) =>
    _$InvoiceItemImpl(
      id: json['id'] as String,
      invoiceId: json['invoiceId'] as String,
      productId: json['productId'] as String,
      productName: json['productName'] as String,
      quantity: (json['quantity'] as num).toDouble(),
      unitPrice: (json['unitPrice'] as num).toDouble(),
      originalTaxRate: (json['originalTaxRate'] as num).toDouble(),
      appliedTaxRate: (json['appliedTaxRate'] as num).toDouble(),
      taxAmount: (json['taxAmount'] as num).toDouble(),
      total: (json['total'] as num).toDouble(),
      discount: (json['discount'] as num?)?.toDouble() ?? 0.0,
      variantId: json['variantId'] as String?,
      notes: json['notes'] as String?,
      selectedModifiers: (json['selectedModifiers'] as List<dynamic>?)
              ?.map((e) => Modifier.fromJson(e as Map<String, dynamic>))
              .toList() ??
          const [],
    );

Map<String, dynamic> _$$InvoiceItemImplToJson(_$InvoiceItemImpl instance) =>
    <String, dynamic>{
      'id': instance.id,
      'invoiceId': instance.invoiceId,
      'productId': instance.productId,
      'productName': instance.productName,
      'quantity': instance.quantity,
      'unitPrice': instance.unitPrice,
      'originalTaxRate': instance.originalTaxRate,
      'appliedTaxRate': instance.appliedTaxRate,
      'taxAmount': instance.taxAmount,
      'total': instance.total,
      'discount': instance.discount,
      'variantId': instance.variantId,
      'notes': instance.notes,
      'selectedModifiers': instance.selectedModifiers,
    };
