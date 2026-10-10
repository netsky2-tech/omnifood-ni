import 'package:freezed_annotation/freezed_annotation.dart';
import '../inventory/product.dart'; // For Modifier
import 'sale_time_inventory_snapshot.dart';

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
    String? recipeVersionId,
    SaleTimeInventorySnapshot? inventorySnapshot,
    String? inventorySnapshotVersion,
    String? originInvoiceItemId,
    @Default([]) List<Modifier> selectedModifiers,
    // Optional per-line discount-origin breakdown over the line discount
    // (wire keys: promotion | manual | loyalty, positive amounts only).
    // Null means legacy/unknown and is NEVER fabricated as an empty map: the
    // two states are null and a populated map. Persistence + decode are this
    // unit's business; producing the breakdown and sending it on the wire is
    // the NEXT unit.
    Map<String, double>? discountOrigin,
  }) = _InvoiceItem;

  factory InvoiceItem.fromJson(Map<String, dynamic> json) =>
      _$InvoiceItemFromJson(json);
}
