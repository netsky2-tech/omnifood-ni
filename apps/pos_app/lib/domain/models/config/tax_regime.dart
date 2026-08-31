import 'package:freezed_annotation/freezed_annotation.dart';

/// Defines the Nicaraguan Tax Regime (DGI / Ley 822) for the merchant.
///
/// - [cuotaFija]: Régimen de Cuota Fija (Art. 244 Ley 822). Never charges/transfers IVA (15%). Receipts are titled "COMPROBANTE DE VENTA" and cannot disclose Subtotal or IVA.
/// - [regimenGeneral]: Régimen General (Responsable Inscripto). Invoices are titled "FACTURA DE VENTA" and disclose Subtotal, IVA (15%), and Totals (unless temporary tax-exempt policies apply).
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

  /// Returns the legal title of the sales receipt according to the regime.
  String get defaultReceiptTitle => isCuotaFija ? 'COMPROBANTE DE VENTA' : 'FACTURA DE VENTA';

  /// Safe parsing with fallback to regimenGeneral.
  static TaxRegime fromString(
    String? raw, {
    TaxRegime defaultRegime = TaxRegime.regimenGeneral,
  }) {
    if (raw == null) return defaultRegime;
    final normalized = raw.trim().toUpperCase();
    for (final regime in TaxRegime.values) {
      if (regime.code == normalized || regime.name.toUpperCase() == normalized) {
        return regime;
      }
    }
    return defaultRegime;
  }
}
