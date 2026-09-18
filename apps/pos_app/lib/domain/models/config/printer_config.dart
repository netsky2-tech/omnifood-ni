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
  @JsonValue('IPOS_Q80')
  iPosQ80,
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
    String? headerLegalName,

    /// Issuer fiscal RUC printed on fiscal documents (local_configs['ruc']).
    ///
    /// The DGI fiscal projection seeds it, and the operator may override it from
    /// the POS business profile (intentional, offline-first). This is the value
    /// the sale and reprint paths print; [headerRuc] must never shadow it.
    /// Never written by [PrinterConfigService.savePrinterConfig].
    String? fiscalRuc,

    /// Decorative printer header field (printer_header_ruc); must not shadow [fiscalRuc].
    String? headerRuc,
    String? headerAddress,
    String? headerPhone,
    String? taxRegime,
    String? logoBase64,
    int? logoWidth,
    int? logoHeight,
    @Default(false) bool isLogoEnabled,
  }) = _PrinterConfig;

  factory PrinterConfig.fromJson(Map<String, dynamic> json) =>
      _$PrinterConfigFromJson(json);
}
