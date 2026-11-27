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
    @Default('') String headerBusinessName,
    String? headerLegalName,

    /// Issuer fiscal RUC printed on fiscal documents (local_configs['ruc']).
    ///
    /// The DGI fiscal projection seeds it, and the operator may override it from
    /// the POS business profile (intentional, offline-first). This is the value
    /// the sale and reprint paths print; [headerRuc] must never shadow it.
    /// Never written by [PrinterConfigService.savePrinterConfig].
    String? fiscalRuc,

    /// D-17 (P0): fiscal authorization number printed at the bottom-right of
    /// the invoice (DT 09-2007 QUINTO). Read from local_configs
    /// ['dgi_authorization_code']; written by the operator from the business
    /// profile, like [fiscalRuc]. Never written by
    /// [PrinterConfigService.savePrinterConfig]. Null when unconfigured —
    /// absence on paper is the honest state, never a blank-looking value.
    String? dgiAuthorizationCode,

    /// #540 AC-2/AC-5: optional legal/courtesy footer configured in Business
    /// Profile (`local_configs['legal_footer']`). Null when blank/unconfigured.
    /// Never written by [PrinterConfigService.savePrinterConfig].
    String? legalFooter,

    /// #540 AC-4: optional configured legal basis for temporary VAT exoneration
    /// (e.g. MHCP-INTUR-DGI interinstitutional agreement for Semana Santa,
    /// Fiestas Patrias, or Navidad Sin IVA). Read from
    /// `local_configs['tax_exemption_reason']`. Null when blank/unconfigured.
    String? taxExemptionReason,

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
