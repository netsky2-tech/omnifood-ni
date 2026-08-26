import 'package:freezed_annotation/freezed_annotation.dart';

part 'printer_config.freezed.dart';
part 'printer_config.g.dart';

enum PrinterDriverType {
  @JsonValue('SUNMI_V2S')
  sunmiV2s,
  @JsonValue('ESCPOS_NETWORK')
  escPosNetwork,
  @JsonValue('MOCK')
  mock,
}

@freezed
class PrinterConfig with _$PrinterConfig {
  const factory PrinterConfig({
    @Default(PrinterDriverType.sunmiV2s) PrinterDriverType driverType,
    @Default(true) bool autoPrintInvoice,
    @Default(false) bool autoPrintKitchen,
    @Default(true) bool openDrawerOnCash,
    @Default(58) int paperWidthMm,
    String? networkIp,
    @Default(9100) int networkPort,
    @Default(1) int copies,
    @Default('OMNIFOOD NI') String headerBusinessName,
    String? headerRuc,
    String? headerAddress,
    String? headerPhone,
  }) = _PrinterConfig;

  factory PrinterConfig.fromJson(Map<String, dynamic> json) =>
      _$PrinterConfigFromJson(json);
}
