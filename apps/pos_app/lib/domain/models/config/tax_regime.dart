import 'package:freezed_annotation/freezed_annotation.dart';

/// Defines the Nicaraguan Tax Regime (DGI / Ley 822) for the merchant.
///
/// - [cuotaFija]: Régimen Simplificado de Cuota Fija (Art. 244 Ley 822). No traslada ni recauda IVA (15%).
///   Documento emitido bajo plantilla "COMPROBANTE DE VENTA" con IVA = 0.
/// - [regimenGeneral]: Régimen General. Emite comprobante con desglose de base imponible e IVA (15%),
///   salvo ventas o productos exentos.
enum TaxRegime {
  @JsonValue('CUOTA_FIJA')
  cuotaFija('CUOTA_FIJA', 'Régimen Simplificado (Cuota Fija)'),

  @JsonValue('REGIMEN_GENERAL')
  regimenGeneral('REGIMEN_GENERAL', 'Régimen General');

  const TaxRegime(this.code, this.displayName);

  final String code;
  final String displayName;

  bool get isCuotaFija => this == TaxRegime.cuotaFija;
  bool get isRegimenGeneral => this == TaxRegime.regimenGeneral;

  /// Default document title according to standard receipt templates.
  String get defaultReceiptTitle => isCuotaFija ? 'COMPROBANTE DE VENTA' : 'FACTURA DE VENTA';

  /// Regime header line for receipt display.
  String get receiptRegimeHeader => isCuotaFija ? 'REGIMEN: CUOTA FIJA' : 'REGIMEN: GENERAL';

  /// Standard informative notice displayed at receipt footer for simplified regime.
  String? get fiscalNotice => isCuotaFija ? 'CONTRIBUYENTE DE CUOTA FIJA\nNO RECAUDA IVA' : null;

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
