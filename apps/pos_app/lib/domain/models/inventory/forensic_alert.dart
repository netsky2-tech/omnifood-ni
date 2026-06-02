import 'package:freezed_annotation/freezed_annotation.dart';

part 'forensic_alert.freezed.dart';
part 'forensic_alert.g.dart';

@freezed
class ForensicAlert with _$ForensicAlert {
  const factory ForensicAlert({
    required String id,
    required String alertType,
    required String severity,
    required String message,
    required DateTime createdAt,
    Map<String, dynamic>? metadata,
  }) = _ForensicAlert;

  factory ForensicAlert.fromJson(Map<String, dynamic> json) =>
      _$ForensicAlertFromJson(json);
}
