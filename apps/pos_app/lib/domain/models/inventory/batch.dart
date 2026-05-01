import 'package:freezed_annotation/freezed_annotation.dart';

part 'batch.freezed.dart';
part 'batch.g.dart';

@freezed
class Batch with _$Batch {
  const factory Batch({
    required String id,
    required String insumoId,
    required String batchNumber,
    required DateTime expirationDate,
    required double remainingStock,
    required double cost,
  }) = _Batch;

  factory Batch.fromJson(Map<String, dynamic> json) => _$BatchFromJson(json);
}
