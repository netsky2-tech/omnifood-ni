import 'package:flutter_test/flutter_test.dart';
import 'package:pos_app/domain/ports/card_terminal_port.dart';

void main() {
  group('CardTerminalPort Domain Models & Enums Tests', () {
    test('AcquirerBank parsing and display names', () {
      expect(AcquirerBank.fromString('BAC'), AcquirerBank.bac);
      expect(AcquirerBank.fromString('BAC Credomatic'), AcquirerBank.bac);
      expect(AcquirerBank.fromString('BANPRO'), AcquirerBank.banpro);
      expect(AcquirerBank.fromString('LAFISE'), AcquirerBank.lafise);
      expect(AcquirerBank.fromString('BDF'), AcquirerBank.bdf);
      expect(AcquirerBank.fromString('FICOHSA'), AcquirerBank.ficohsa);
      expect(AcquirerBank.fromString('MIPOS'), AcquirerBank.mipos);
      expect(AcquirerBank.fromString('UNKNOWN'), AcquirerBank.generic);
      expect(AcquirerBank.fromString(null), AcquirerBank.generic);

      expect(AcquirerBank.bac.displayName, 'BAC Credomatic');
      expect(AcquirerBank.banpro.displayName, 'BANPRO Grupo Promerica');
      expect(AcquirerBank.lafise.displayName, 'LAFISE Bancentro');
    });

    test('TerminalConnectionMode parsing', () {
      expect(TerminalConnectionMode.fromString('LOCAL_NETWORK_TCP'), TerminalConnectionMode.localNetworkTcp);
      expect(TerminalConnectionMode.fromString('IP'), TerminalConnectionMode.localNetworkTcp);
      expect(TerminalConnectionMode.fromString('SMART_POS_AIDL'), TerminalConnectionMode.smartPosAidl);
      expect(TerminalConnectionMode.fromString('AIDL'), TerminalConnectionMode.smartPosAidl);
      expect(TerminalConnectionMode.fromString('MOCK_SIMULATOR'), TerminalConnectionMode.mockSimulator);
      expect(TerminalConnectionMode.fromString('MANUAL_STANDALONE'), TerminalConnectionMode.manualStandalone);
      expect(TerminalConnectionMode.fromString('AISLADO'), TerminalConnectionMode.manualStandalone);
      expect(TerminalConnectionMode.fromString(null), TerminalConnectionMode.manualStandalone);
    });

    test('CardBrand and CardType parsing', () {
      expect(CardBrand.fromString('VISA'), CardBrand.visa);
      expect(CardBrand.fromString('MASTERCARD'), CardBrand.mastercard);
      expect(CardBrand.fromString('MC'), CardBrand.mastercard);
      expect(CardBrand.fromString('AMEX'), CardBrand.amex);
      expect(CardBrand.fromString('DINERS'), CardBrand.diners);
      expect(CardBrand.fromString('DISCOVER'), CardBrand.discover);
      expect(CardBrand.fromString('OTRA'), CardBrand.other);

      expect(CardType.fromString('CREDITO'), CardType.credit);
      expect(CardType.fromString('DEBITO'), CardType.debit);
      expect(CardType.fromString(null), CardType.credit);
    });

    test('CardAuthorizationResult factories create expected states', () {
      final success = CardAuthorizationResult.success(
        authCode: '123456',
        batchNumber: '001',
        cardBrand: CardBrand.visa,
        cardType: CardType.credit,
        last4: '9988',
        terminalId: 'TERM-01',
        acquirer: AcquirerBank.bac,
      );
      expect(success.isSuccess, isTrue);
      expect(success.authCode, '123456');
      expect(success.reconciliationStatus, 'CONCILIADO');
      expect(success.acquirer, AcquirerBank.bac);

      final pending = CardAuthorizationResult.pending(
        batchNumber: '002',
        terminalId: 'TERM-02',
        acquirer: AcquirerBank.banpro,
      );
      expect(pending.isSuccess, isTrue);
      expect(pending.authCode, 'PENDIENTE');
      expect(pending.reconciliationStatus, 'PENDIENTE');

      final failure = CardAuthorizationResult.failure(
        errorMessage: 'Fondos insuficientes',
        errorCode: 'INSUFFICIENT_FUNDS',
        acquirer: AcquirerBank.lafise,
      );
      expect(failure.isSuccess, isFalse);
      expect(failure.reconciliationStatus, 'RECHAZADO');
      expect(failure.errorCode, 'INSUFFICIENT_FUNDS');
      expect(failure.errorMessage, 'Fondos insuficientes');
    });

    test('CardReversalResult and SettlementResult factories create expected results', () {
      final revSuccess = CardReversalResult.success(reversalCode: 'REV-999');
      expect(revSuccess.isSuccess, isTrue);
      expect(revSuccess.reversalCode, 'REV-999');

      final revFail = CardReversalResult.failure('Timeout al reversar');
      expect(revFail.isSuccess, isFalse);
      expect(revFail.message, 'Timeout al reversar');

      final settle = SettlementResult.success(
        batchNumber: '005',
        transactionCount: 10,
        totalAmountNio: 15000.0,
        totalAmountUsd: 250.0,
        acquirer: AcquirerBank.bac,
      );
      expect(settle.isSuccess, isTrue);
      expect(settle.transactionCount, 10);
      expect(settle.totalAmountNio, 15000.0);
      expect(settle.totalAmountUsd, 250.0);
    });
  });
}
