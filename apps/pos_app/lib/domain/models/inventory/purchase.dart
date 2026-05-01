import 'package:freezed_annotation/freezed_annotation.dart';

part 'purchase.freezed.dart';
part 'purchase.g.dart';

@freezed
class Purchase with _$Purchase {
  const factory Purchase({
    required String id,
    required String insumoId,
    required String supplierId,
    required double quantity,
    required double unitCost,
    required DateTime timestamp,
  }) = _Purchase;

  factory Purchase.fromJson(Map<String, dynamic> json) => _$PurchaseFromJson(json);
}
