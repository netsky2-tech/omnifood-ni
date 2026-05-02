import 'package:freezed_annotation/freezed_annotation.dart';
import '../inventory/product.dart'; // For Modifier

part 'invoice_item.freezed.dart';
part 'invoice_item.g.dart';

@freezed
class InvoiceItem with _$InvoiceItem {
  const factory InvoiceItem({
    required String id,
    required String invoiceId,
    required String productId,
    required String productName,
    required double quantity,
    required double unitPrice,
    required double originalTaxRate,
    required double appliedTaxRate,
    required double taxAmount,
    required double total,
    @Default(0.0) double discount,
    String? variantId,
    String? notes,
    @Default([]) List<Modifier> selectedModifiers,
  }) = _InvoiceItem;

  factory InvoiceItem.fromJson(Map<String, dynamic> json) =>
      _$InvoiceItemFromJson(json);
}
