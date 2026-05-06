import 'package:freezed_annotation/freezed_annotation.dart';

part 'batch_deduction.freezed.dart';
part 'batch_deduction.g.dart';

@freezed
class BatchDeduction with _$BatchDeduction {
  const factory BatchDeduction({
    required String batchId,
    required double quantity,
  }) = _BatchDeduction;

  factory BatchDeduction.fromJson(Map<String, dynamic> json) => _$BatchDeductionFromJson(json);
}
