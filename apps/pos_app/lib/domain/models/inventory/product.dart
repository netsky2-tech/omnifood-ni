import 'package:freezed_annotation/freezed_annotation.dart';

part 'product.freezed.dart';
part 'product.g.dart';

@freezed
class Product with _$Product {
  const factory Product({
    required String id,
    required String name,
    required String uom,
    required double stock,
    required double averageCost,
    required double sellPrice,
    @Default(true) bool isActive,
    String? sku,
    String? barcode,
    @Default([]) List<ProductVariant> variants,
    @Default([]) List<Modifier> availableModifiers,
  }) = _Product;

  factory Product.fromJson(Map<String, dynamic> json) => _$ProductFromJson(json);
}

@freezed
class ProductVariant with _$ProductVariant {
  const factory ProductVariant({
    required String id,
    required String name, // e.g., "Grande", "Vainilla"
    required double priceAdjustment,
  }) = _ProductVariant;

  factory ProductVariant.fromJson(Map<String, dynamic> json) =>
      _$ProductVariantFromJson(json);
}

@freezed
class Modifier with _$Modifier {
  const factory Modifier({
    required String id,
    required String name,
    required double extraPrice,
  }) = _Modifier;

  factory Modifier.fromJson(Map<String, dynamic> json) =>
      _$ModifierFromJson(json);
}
