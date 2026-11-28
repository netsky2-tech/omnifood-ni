import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/models/config/tax_regime.dart';

void main() {
  group('TaxRegime.controlInterno', () {
    test('has expected code, displayName, title, and classification flags', () {
      const regime = TaxRegime.controlInterno;

      expect(regime.code, 'CONTROL_INTERNO');
      expect(regime.displayName, 'Control Interno (No inscrito en DGI)');
      expect(regime.defaultReceiptTitle, 'NOTA DE VENTA');
      expect(regime.isControlInterno, isTrue);
      expect(regime.isFiscal, isFalse);
      expect(regime.isTaxable, isFalse);
      expect(regime.collectsIva, isFalse);
      expect(regime.isCuotaFija, isFalse);
      expect(regime.isRegimenGeneral, isFalse);
      expect(regime.receiptRegimeHeader, isEmpty);
      expect(
        regime.fiscalNotice,
        'DOCUMENTO NO FISCAL\nNO VALIDO COMO FACTURA\nSOLO CONTROL INTERNO',
      );
    });

    test('fromString and fromCode resolve CONTROL_INTERNO case-insensitively', () {
      expect(TaxRegime.fromString('CONTROL_INTERNO'), TaxRegime.controlInterno);
      expect(TaxRegime.fromString('control_interno'), TaxRegime.controlInterno);
      expect(TaxRegime.fromCode('CONTROL_INTERNO'), TaxRegime.controlInterno);
      expect(TaxRegime.fromCode('control_interno'), TaxRegime.controlInterno);
      expect(TaxRegime.fromCode('CUOTA_FIJA'), TaxRegime.cuotaFija);
      expect(TaxRegime.fromCode('REGIMEN_GENERAL'), TaxRegime.regimenGeneral);
      expect(TaxRegime.fromCode('UNKNOWN'), isNull);
    });

    test('CUOTA_FIJA and REGIMEN_GENERAL keep exact existing metadata', () {
      expect(TaxRegime.cuotaFija.isFiscal, isTrue);
      expect(TaxRegime.cuotaFija.isTaxable, isFalse);
      expect(TaxRegime.cuotaFija.collectsIva, isFalse);
      expect(TaxRegime.cuotaFija.defaultReceiptTitle, 'COMPROBANTE DE VENTA');
      expect(TaxRegime.cuotaFija.receiptRegimeHeader, 'REGIMEN: CUOTA FIJA');
      expect(
        TaxRegime.cuotaFija.fiscalNotice,
        'CONTRIBUYENTE DE CUOTA FIJA\nNO RECAUDA IVA',
      );

      expect(TaxRegime.regimenGeneral.isFiscal, isTrue);
      expect(TaxRegime.regimenGeneral.isTaxable, isTrue);
      expect(TaxRegime.regimenGeneral.collectsIva, isTrue);
      expect(TaxRegime.regimenGeneral.defaultReceiptTitle, 'FACTURA DE VENTA');
      expect(TaxRegime.regimenGeneral.receiptRegimeHeader, 'REGIMEN: GENERAL');
      expect(TaxRegime.regimenGeneral.fiscalNotice, isNull);
    });
  });
}
