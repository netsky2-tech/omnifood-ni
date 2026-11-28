import 'package:freezed_annotation/freezed_annotation.dart';

/// Defines the Nicaraguan Tax Regime (DGI / Ley 822) for the merchant.
///
/// - [controlInterno]: Control Interno (No inscrito en DGI). Modo no fiscal para
///   negocios pequeños aún no formalizados. Emite "NOTA DE VENTA" sin IVA (0%).
/// - [cuotaFija]: Régimen Simplificado de Cuota Fija (Art. 244 Ley 822). No traslada ni recauda IVA (15%).
///   Documento emitido bajo plantilla "COMPROBANTE DE VENTA" con IVA = 0.
/// - [regimenGeneral]: Régimen General. Emite comprobante con desglose de base imponible e IVA (15%),
///   salvo ventas o productos exentos.
enum TaxRegime {
  @JsonValue('CONTROL_INTERNO')
  controlInterno('CONTROL_INTERNO', 'Control Interno (No inscrito en DGI)'),

  @JsonValue('CUOTA_FIJA')
  cuotaFija('CUOTA_FIJA', 'Régimen Simplificado (Cuota Fija)'),

  @JsonValue('REGIMEN_GENERAL')
  regimenGeneral('REGIMEN_GENERAL', 'Régimen General');

  const TaxRegime(this.code, this.displayName);

  final String code;
  final String displayName;

  bool get isControlInterno => this == TaxRegime.controlInterno;
  bool get isCuotaFija => this == TaxRegime.cuotaFija;
  bool get isRegimenGeneral => this == TaxRegime.regimenGeneral;

  /// True for DGI-registered fiscal regimes (`CUOTA_FIJA`, `REGIMEN_GENERAL`),
  /// false for non-fiscal `CONTROL_INTERNO`.
  bool get isFiscal => !isControlInterno;

  /// True only for regimes that collect IVA (`REGIMEN_GENERAL`).
  bool get collectsIva => isRegimenGeneral;
  bool get isTaxable => isRegimenGeneral;

  /// Default document title according to standard receipt templates.
  String get defaultReceiptTitle {
    switch (this) {
      case TaxRegime.controlInterno:
        return 'NOTA DE VENTA';
      case TaxRegime.cuotaFija:
        return 'COMPROBANTE DE VENTA';
      case TaxRegime.regimenGeneral:
        return 'FACTURA DE VENTA';
    }
  }

  /// Regime header line for receipt display.
  String get receiptRegimeHeader {
    switch (this) {
      case TaxRegime.controlInterno:
        return '';
      case TaxRegime.cuotaFija:
        return 'REGIMEN: CUOTA FIJA';
      case TaxRegime.regimenGeneral:
        return 'REGIMEN: GENERAL';
    }
  }

  /// Standard informative notice displayed at receipt footer.
  String? get fiscalNotice {
    switch (this) {
      case TaxRegime.controlInterno:
        return 'DOCUMENTO NO FISCAL\nNO VALIDO COMO FACTURA\nSOLO CONTROL INTERNO';
      case TaxRegime.cuotaFija:
        return 'CONTRIBUYENTE DE CUOTA FIJA\nNO RECAUDA IVA';
      case TaxRegime.regimenGeneral:
        return null;
    }
  }

  static TaxRegime? fromCode(
    String? code, {
    TaxRegime? defaultRegime,
  }) =>
      fromString(code, defaultRegime: defaultRegime);

  /// Safe parsing of [TaxRegime].
  ///
  /// Returns `null` if [raw] is null, empty, or an unrecognized value,
  /// unless an explicit [defaultRegime] is provided.
  /// Never defaults silently to [regimenGeneral].
  static TaxRegime? fromString(
    String? raw, {
    TaxRegime? defaultRegime,
  }) {
    if (raw == null || raw.trim().isEmpty) return defaultRegime;
    final normalized = raw.trim().toUpperCase();
    for (final regime in TaxRegime.values) {
      if (regime.code == normalized || regime.name.toUpperCase() == normalized) {
        return regime;
      }
    }
    return defaultRegime;
  }
}
