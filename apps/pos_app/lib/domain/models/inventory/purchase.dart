import 'package:freezed_annotation/freezed_annotation.dart';

part 'purchase.freezed.dart';
part 'purchase.g.dart';

const purchaseFxRateModeExplicit = 'explicit';
const purchaseFxRateModeOfficial = 'official';

@freezed
class Purchase with _$Purchase {
  const factory Purchase({
    required String id,
    required String insumoId,
    required String supplierId,
    required String invoiceNumber,
    String? fiscalAuthorizationCode,
    required double quantity,
    required double unitCost,
    required DateTime timestamp,
    required DateTime invoiceDate,
    @Default('NIO') String currency,
    @Default(1) double bcnRate,
    String? fxRateMode,
    @JsonKey(name: 'unit_cost_nio') double? unitCostNio,
    @JsonKey(name: 'cpp_before_nio') double? cppBeforeNio,
    @JsonKey(name: 'projected_cpp_nio') double? projectedCppNio,
    @JsonKey(name: 'lot_code') String? lotCode,
    @JsonKey(name: 'received_date') DateTime? receivedDate,
    @JsonKey(name: 'expiration_date') DateTime? expirationDate,
    @JsonKey(name: 'requires_batch_tracking')
    @Default(false)
    bool requiresBatchTracking,
  }) = _Purchase;

  factory Purchase.fromJson(Map<String, dynamic> json) =>
      _$PurchaseFromJson(json);
}
