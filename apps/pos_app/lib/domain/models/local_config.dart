import 'package:freezed_annotation/freezed_annotation.dart';

part 'local_config.freezed.dart';
part 'local_config.g.dart';

@freezed
class LocalConfig with _$LocalConfig {
  const factory LocalConfig({
    required String key,
    required String value,
    String? description,
  }) = _LocalConfig;

  factory LocalConfig.fromJson(Map<String, dynamic> json) =>
      _$LocalConfigFromJson(json);
}
